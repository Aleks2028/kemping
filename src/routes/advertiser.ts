import { Router } from "express";
import { AdvertiserModel } from "../models/advertiser";
import { TaskModel } from "../models/task";
import { requireAuth } from "../middleware/auth";
import { db } from "../models/database";
import type { Request, Response } from "express";

const router = Router();

// GET /api/advertiser/me — получить профиль рекламодателя
router.get("/me", requireAuth, (req: Request, res: Response) => {
  let advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) {
    return res.json({ isAdvertiser: false, advertiser: null });
  }
  const stats = AdvertiserModel.getStats(advertiser.id);
  return res.json({ isAdvertiser: true, advertiser, stats });
});

// POST /api/advertiser/register — стать рекламодателем
router.post("/register", requireAuth, (req: Request, res: Response) => {
  if (AdvertiserModel.exists(req.user!.id)) {
    return res.status(400).json({ error: "Вы уже рекламодатель" });
  }
  const { companyName, contact } = req.body;
  if (!companyName || !contact) {
    return res.status(400).json({ error: "companyName и contact обязательны" });
  }
  const advertiser = AdvertiserModel.create({
    userId: req.user!.id,
    companyName,
    contact,
  });
  return res.status(201).json({ advertiser });
});

// POST /api/advertiser/deposit — пополнить баланс (симуляция)
router.post("/deposit", requireAuth, (req: Request, res: Response) => {
  let advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) {
    return res.status(400).json({ error: "Сначала станьте рекламодателем" });
  }
  const { amount, paymentMethod } = req.body;
  if (!amount || Number(amount) < 1) {
    return res.status(400).json({ error: "Минимальное пополнение $1" });
  }
  const amountCents = Math.round(Number(amount) * 100);

  // В реальной системе здесь был бы запрос к платёжному шлюзу
  // Сейчас — симуляция: просто начисляем баланс
  // TODO: подключить ЮKassa, Stripe, Crypto API
  AdvertiserModel.deposit(advertiser.id, amountCents);

  advertiser = AdvertiserModel.getByUserId(req.user!.id);
  return res.json({
    success: true,
    message: `Баланс пополнен на $${amount}`,
    balance: advertiser!.balance,
  });
});

// GET /api/advertiser/tasks — мои задания
router.get("/tasks", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) {
    return res.status(400).json({ error: "Вы не рекламодатель" });
  }
  const tasks = TaskModel.listByAdvertiser(advertiser.id);
  return res.json({ tasks });
});

// GET /api/advertiser/stats — статистика
router.get("/stats", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) {
    return res.status(400).json({ error: "Вы не рекламодатель" });
  }
  const stats = AdvertiserModel.getStats(advertiser.id);
  return res.json({ advertiser, stats });
});

// POST /api/advertiser/tasks — создать задание
router.post("/tasks", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) {
    return res.status(400).json({ error: "Вы не рекламодатель" });
  }

  const { title, description, type, url, userReward, totalSlots, requiresProof, proofInstructions, expiresAt } = req.body;

  if (!title || !url || !userReward || !totalSlots) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const userRewardCents = Math.round(Number(userReward) * 100);
  const slots = Number(totalSlots);

  if (userRewardCents < 2) {
    return res.status(400).json({ error: "Минимальная награда исполнителю — $0.02" });
  }

  // Комиссия платформы: рекламодатель платит userReward + fee, где fee = userReward * fee% / (1 - fee%)
  // При 70% комиссии: userReward=2c → fee=4c, рекламодатель платит 6c
  const { PLATFORM_FEE_PERCENT } = require("../config");
  const platformFee = Math.floor(userRewardCents * PLATFORM_FEE_PERCENT / (100 - PLATFORM_FEE_PERCENT));
  const advertiserPriceCents = userRewardCents + platformFee;
  const totalCost = advertiserPriceCents * slots;

  if (advertiser.balance < totalCost) {
    return res.status(400).json({
      error: `Недостаточно баланса. Нужно $${(totalCost / 100).toFixed(2)}, доступно $${(advertiser.balance / 100).toFixed(2)}`,
    });
  }

  // Создаём задание
  const task = TaskModel.create({
    advertiserId: advertiser.id,
    title,
    description: description || "",
    type: type ?? "custom",
    url,
    reward: advertiserPriceCents,
    userReward: userRewardCents,
    totalSlots: slots,
    requiresProof: !!requiresProof,
    proofInstructions,
    expiresAt: expiresAt ? Number(expiresAt) : undefined,
  });

  // Списываем стоимость с баланса рекламодателя
  AdvertiserModel.chargeTask(advertiser.id, totalCost);

  return res.status(201).json({
    task,
    message: `Задание создано! Списано $${(totalCost / 100).toFixed(2)} с баланса`,
  });
});

// POST /api/advertiser/tasks/:id/pause
router.post("/tasks/:id/pause", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Не рекламодатель" });
  const task = TaskModel.getById(req.params.id);
  if (!task || task.advertiserId !== advertiser.id) {
    return res.status(404).json({ error: "Задание не найдено" });
  }
  TaskModel.pause(task.id);
  return res.json({ ok: true });
});

export default router;
