import { Router } from "express";
import { WithdrawalModel } from "../models/withdrawal";
import { UserModel } from "../models/user";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { db } from "../models/database";
import type { Request, Response } from "express";

const router = Router();

// GET /withdraw/methods — доступные способы вывода
router.get("/methods", (_req: Request, res: Response) => {
  return res.json({
    methods: [
      { id: "usdt_trc20", name: "USDT (TRC20)", fee: 1, currency: "USDT" },
      { id: "yoomoney", name: "ЮMoney", fee: 0.5, currency: "USD" },
      { id: "card", name: "Банковская карта", fee: 2, currency: "USD" },
    ],
  });
});

// POST /withdraw — запросить вывод
router.post("/", requireAuth, (req: Request, res: Response) => {
  const { method, amount, wallet } = req.body;

  // Проверяем — вносил ли пользователь депозит
  const row = db.prepare("SELECT deposited FROM users WHERE id = ?").get(req.user!.id) as any;
  if (!row?.deposited) {
    return res.status(403).json({
      error: "Сначала пополните баланс рекламодателя от $10 для активации вывода",
      needsDeposit: true,
    });
  }

  if (!method || !amount || !wallet) {
    return res.status(400).json({ error: "method, amount, wallet обязательны" });
  }

  const allowed = ["usdt_trc20", "yoomoney", "card"];
  if (!allowed.includes(method)) {
    return res.status(400).json({ error: "Неизвестный способ вывода" });
  }

  try {
    const withdrawal = WithdrawalModel.create({
      userId: req.user!.id,
      method,
      amount: Math.round(Number(amount) * 100), // конвертируем USD в центы
      wallet,
    });
    return res.status(201).json({ withdrawal });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// GET /withdraw/history — история выводов
router.get("/history", requireAuth, (req: Request, res: Response) => {
  const withdrawals = WithdrawalModel.listByUser(req.user!.id);
  return res.json({ withdrawals });
});

// GET /withdraw/pending — список ожидающих (для админов)
router.get("/pending", requireAdmin, (_req: Request, res: Response) => {
  const pending = WithdrawalModel.listPending();
  return res.json({ withdrawals: pending });
});

// POST /withdraw/:id/approve — одобрить вывод (админ)
router.post("/:id/approve", requireAdmin, (req: Request, res: Response) => {
  const { txHash } = req.body;
  try {
    const withdrawal = WithdrawalModel.approve(req.params.id, txHash);
    return res.json({ withdrawal });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// POST /withdraw/:id/reject — отклонить вывод (админ)
router.post("/:id/reject", requireAdmin, (req: Request, res: Response) => {
  const { reason } = req.body;
  try {
    const withdrawal = WithdrawalModel.reject(req.params.id, reason ?? "Отклонено администратором");
    return res.json({ withdrawal });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

export default router;
