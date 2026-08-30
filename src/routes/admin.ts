import { Router } from "express";
import { TaskModel } from "../models/task";
import { WithdrawalModel } from "../models/withdrawal";
import { UserModel } from "../models/user";
import { requireAdmin } from "../middleware/auth";
import type { Request, Response } from "express";

const router = Router();

// GET /admin/stats — общая статистика
router.get("/stats", requireAdmin, (_req: Request, res: Response) => {
  const totalUsers = UserModel.count();
  const allUsers = UserModel.list(1, 0);
  const pendingTasks = TaskModel.listPendingReview();
  const pendingCompletions = TaskModel.listPendingCompletions();
  const pendingWithdrawals = WithdrawalModel.listPending();

  // Подсчёт балансов
  const balanceRows = require("../models/database").db.prepare(`
    SELECT
      SUM(balance) as total_balance,
      SUM(total_earned) as total_earned
    FROM users
  `).get() as any;

  return res.json({
    totalUsers,
    pendingTasks: pendingTasks.length,
    pendingCompletions: pendingCompletions.length,
    pendingWithdrawals: pendingWithdrawals.length,
    totalPlatformBalance: balanceRows.total_balance ?? 0,
    totalEarned: balanceRows.total_earned ?? 0,
  });
});

// GET /admin/tasks/pending — задания на модерацию
router.get("/tasks/pending", requireAdmin, (_req: Request, res: Response) => {
  return res.json({ tasks: TaskModel.listPendingReview() });
});

// POST /admin/tasks/:id/approve
router.post("/tasks/:id/approve", requireAdmin, (req: Request, res: Response) => {
  TaskModel.approve(req.params.id);
  return res.json({ ok: true });
});

// POST /admin/tasks/:id/reject
router.post("/tasks/:id/reject", requireAdmin, (req: Request, res: Response) => {
  const { reason } = req.body;
  TaskModel.reject(req.params.id, reason ?? "Отклонено");
  return res.json({ ok: true });
});

// GET /admin/completions/pending — ожидающие модерации выполнения
router.get("/completions/pending", requireAdmin, (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  return res.json({ completions: TaskModel.listPendingCompletions(limit) });
});

// POST /admin/completions/:id/approve
router.post("/completions/:id/approve", requireAdmin, (req: Request, res: Response) => {
  try {
    const completion = TaskModel.approveCompletion(req.params.id, req.user!.id);
    return res.json({ completion });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// POST /admin/completions/:id/reject
router.post("/completions/:id/reject", requireAdmin, (req: Request, res: Response) => {
  const { reason } = req.body;
  try {
    const completion = TaskModel.rejectCompletion(req.params.id, req.user!.id, reason ?? "Отклонено");
    return res.json({ completion });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// GET /admin/users — список пользователей
router.get("/users", requireAdmin, (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const limit = 50;
  const offset = (page - 1) * limit;
  const users = UserModel.list(limit, offset);
  return res.json({ users, page, total: UserModel.count() });
});

// POST /admin/users/:id/ban
router.post("/users/:id/ban", requireAdmin, (req: Request, res: Response) => {
  require("../models/database").db.prepare(`
    UPDATE users SET banned = 1 WHERE id = ?
  `).run(req.params.id);
  return res.json({ ok: true });
});

export default router;
