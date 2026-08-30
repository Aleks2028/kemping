import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { PLATFORM_FEE_PERCENT } from "../config";
import { UserModel } from "./user";
import type { Task, TaskCompletion, TaskType } from "./types";

function rowToTask(row: any): Task {
  return {
    id: row.id,
    advertiserId: row.advertiser_id,
    title: row.title,
    description: row.description,
    type: row.type as TaskType,
    url: row.url,
    reward: row.reward,
    userReward: row.user_reward,
    platformFee: row.platform_fee,
    totalSlots: row.total_slots,
    remainingSlots: row.remaining_slots,
    requiresProof: !!row.requires_proof,
    proofInstructions: row.proof_instructions ?? undefined,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at ?? undefined,
  };
}

function rowToCompletion(row: any): TaskCompletion {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    proofText: row.proof_text ?? undefined,
    proofImage: row.proof_image ?? undefined,
    reward: row.reward,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewNote: row.review_note ?? undefined,
  };
}

export const TaskModel = {
  create(data: {
    advertiserId: string;
    title: string;
    description: string;
    type: TaskType;
    url: string;
    reward: number;            // cents — advertiser price (backward compat)
    userReward?: number;       // cents — user reward (NEW: if set, overrides computed)
    totalSlots: number;
    requiresProof: boolean;
    proofInstructions?: string;
    expiresAt?: number;
  }): Task {
    const id = uuidv4();
    // NEW: userReward is the input; advertiser pays more (with platform fee)
    // advertiser_price = userReward / (1 - fee%)
    const userReward = data.userReward ?? (data.reward - Math.floor(data.reward * PLATFORM_FEE_PERCENT / 100));
    const platformFee = data.userReward
      ? Math.floor(data.userReward * PLATFORM_FEE_PERCENT / (100 - PLATFORM_FEE_PERCENT))
      : Math.floor(data.reward * PLATFORM_FEE_PERCENT / 100);
    const reward = data.userReward
      ? userReward + platformFee
      : data.reward;
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO tasks (
        id, advertiser_id, title, description, type, url,
        reward, user_reward, platform_fee, total_slots, remaining_slots,
        requires_proof, proof_instructions, status, created_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)
    `).run(
      id, data.advertiserId, data.title, data.description, data.type, data.url,
      reward, userReward, platformFee, data.totalSlots, data.totalSlots,
      data.requiresProof ? 1 : 0, data.proofInstructions ?? null,
      now, data.expiresAt ?? null
    );

    return this.getById(id)!;
  },

  getById(id: string): Task | null {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as any;
    return row ? rowToTask(row) : null;
  },

  listActive(limit = 50, offset = 0): Task[] {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE status = 'active' AND remaining_slots > 0
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(Math.floor(Date.now() / 1000), limit, offset) as any[];
    return rows.map(rowToTask);
  },

  listByAdvertiser(advertiserId: string): Task[] {
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE advertiser_id = ? ORDER BY created_at DESC
    `).all(advertiserId) as any[];
    return rows.map(rowToTask);
  },

  listPendingReview(): Task[] {
    const rows = db.prepare(`
      SELECT * FROM tasks WHERE status = 'pending_review' ORDER BY created_at ASC
    `).all() as any[];
    return rows.map(rowToTask);
  },

  approve(id: string): void {
    db.prepare(`UPDATE tasks SET status = 'active' WHERE id = ?`).run(id);
  },

  reject(id: string, reason: string): void {
    db.prepare(`
      UPDATE tasks SET status = 'rejected' WHERE id = ?
    `).run(id);
  },

  pause(id: string): void {
    db.prepare(`UPDATE tasks SET status = 'paused' WHERE id = ?`).run(id);
  },

  // Попытка выполнения задания пользователем
  startCompletion(taskId: string, userId: string): TaskCompletion {
    const task = this.getById(taskId);
    if (!task) throw new Error("task not found");
    if (task.status !== "active") throw new Error("task is not active");
    if (task.remainingSlots <= 0) throw new Error("no slots remaining");

    // Проверяем, не выполнял ли уже
    const existing = db.prepare(`
      SELECT * FROM task_completions WHERE task_id = ? AND user_id = ?
    `).get(taskId, userId) as any;
    if (existing) throw new Error("already started");

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const status = task.requiresProof ? "pending" : "pending"; // Оба требуют модерации, если proof, иначе approve

    db.prepare(`
      INSERT INTO task_completions (id, task_id, user_id, status, reward, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, taskId, userId, "pending", task.userReward, now);

    // Захватываем слот
    db.prepare(`
      UPDATE tasks SET remaining_slots = remaining_slots - 1 WHERE id = ?
    `).run(taskId);

    return this.getCompletionById(id)!;
  },

  submitCompletion(id: string, proofText?: string, proofImage?: string): void {
    db.prepare(`
      UPDATE task_completions SET proof_text = ?, proof_image = ? WHERE id = ?
    `).run(proofText ?? null, proofImage ?? null, id);
  },

  // Модерация: одобрить
  approveCompletion(id: string, reviewerId: string): TaskCompletion {
    const comp = this.getCompletionById(id);
    if (!comp) throw new Error("completion not found");
    if (comp.status !== "pending") throw new Error("already reviewed");

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE task_completions
      SET status = 'approved', reviewed_at = ?
      WHERE id = ?
    `).run(now, id);

    // Начислить пользователю
    UserModel.creditBalance(comp.userId, comp.reward);
    // Реферальный бонус
    UserModel.payReferralBonus(comp.userId, comp.reward);

    return this.getCompletionById(id)!;
  },

  rejectCompletion(id: string, reviewerId: string, reason: string): TaskCompletion {
    const comp = this.getCompletionById(id);
    if (!comp) throw new Error("completion not found");
    if (comp.status !== "pending") throw new Error("already reviewed");

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE task_completions
      SET status = 'rejected', reviewed_at = ?, review_note = ?
      WHERE id = ?
    `).run(now, reason, id);

    // Возвращаем слот
    db.prepare(`
      UPDATE tasks SET remaining_slots = remaining_slots + 1 WHERE id = ?
    `).run(comp.taskId);

    return this.getCompletionById(id)!;
  },

  getCompletionById(id: string): TaskCompletion | null {
    const row = db.prepare(`
      SELECT * FROM task_completions WHERE id = ?
    `).get(id) as any;
    return row ? rowToCompletion(row) : null;
  },

  listCompletionsByUser(userId: string, limit = 50): TaskCompletion[] {
    const rows = db.prepare(`
      SELECT * FROM task_completions WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit) as any[];
    return rows.map(rowToCompletion);
  },

  listPendingCompletions(limit = 100): TaskCompletion[] {
    const rows = db.prepare(`
      SELECT * FROM task_completions WHERE status = 'pending'
      ORDER BY created_at ASC LIMIT ?
    `).all(limit) as any[];
    return rows.map(rowToCompletion);
  },
};
