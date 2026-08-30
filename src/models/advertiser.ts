import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { UserModel } from "./user";
import { PLATFORM_FEE_PERCENT } from "../config";

interface Advertiser {
  id: string;
  userId: string;
  companyName: string;
  contact: string;
  balance: number;    // cents
  totalSpent: number;
  createdAt: number;
}

function rowToAdvertiser(row: any): Advertiser {
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.company_name,
    contact: row.contact,
    balance: row.balance,
    totalSpent: row.total_spent,
    createdAt: row.created_at,
  };
}

export const AdvertiserModel = {
  create(data: { userId: string; companyName: string; contact: string }): Advertiser {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO advertisers (id, user_id, company_name, contact, balance, total_spent, created_at)
      VALUES (?, ?, ?, ?, 0, 0, ?)
    `).run(id, data.userId, data.companyName, data.contact, now);

    // Отмечаем пользователя как рекламодателя
    db.prepare(`UPDATE users SET is_advertiser = 1 WHERE id = ?`).run(data.userId);

    return this.getByUserId(data.userId)!;
  },

  getById(id: string): Advertiser | null {
    const row = db.prepare("SELECT * FROM advertisers WHERE id = ?").get(id) as any;
    return row ? rowToAdvertiser(row) : null;
  },

  getByUserId(userId: string): Advertiser | null {
    const row = db.prepare("SELECT * FROM advertisers WHERE user_id = ?").get(userId) as any;
    return row ? rowToAdvertiser(row) : null;
  },

  exists(userId: string): boolean {
    const row = db.prepare("SELECT 1 FROM advertisers WHERE user_id = ?").get(userId);
    return !!row;
  },

  // Пополнение баланса рекламодателя
  deposit(advertiserId: string, amountCents: number): void {
    if (amountCents <= 0) throw new Error("amount must be positive");
    db.prepare(`
      UPDATE advertisers SET balance = balance + ? WHERE id = ?
    `).run(amountCents, advertiserId);
  },

  // Списание за создание задания или VIP-услуги
  chargeTask(advertiserId: string, costCents: number): void {
    const adv = this.getById(advertiserId);
    if (!adv) throw new Error("advertiser not found");
    if (adv.balance < costCents) throw new Error("insufficient balance");
    db.prepare(`
      UPDATE advertisers SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?
    `).run(costCents, costCents, advertiserId);
  },

  // То же что chargeTask, просто алиас для удобства
  debitBalance(advertiserId: string, amountCents: number): void {
    this.chargeTask(advertiserId, amountCents);
  },

  // Сколько стоит задание (budget)
  calculateTaskCost(rewardCents: number, totalSlots: number): number {
    return rewardCents * totalSlots;
  },

  getStats(advertiserId: string) {
    const taskRows = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished
      FROM tasks WHERE advertiser_id = ?
    `).get(advertiserId) as any;

    const completionRows = db.prepare(`
      SELECT
        COUNT(*) as total_completions,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM task_completions tc
      JOIN tasks t ON t.id = tc.task_id
      WHERE t.advertiser_id = ?
    `).get(advertiserId) as any;

    return {
      totalTasks: taskRows.total ?? 0,
      activeTasks: taskRows.active ?? 0,
      pendingTasks: taskRows.pending ?? 0,
      finishedTasks: taskRows.finished ?? 0,
      totalCompletions: completionRows.total_completions ?? 0,
      approvedCompletions: completionRows.approved ?? 0,
      pendingCompletions: completionRows.pending ?? 0,
    };
  },
};
