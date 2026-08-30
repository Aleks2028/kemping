import { Router } from "express";
import { VipModel } from "../models/vip";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { AdvertiserModel } from "../models/advertiser";
import type { Request, Response } from "express";

const router = Router();

// GET /api/vip/banners — активные баннеры (публичный)
router.get("/banners", (req: Request, res: Response) => {
  const banners = VipModel.listActiveBanners();
  return res.json({ banners });
});

// POST /api/vip/banner — создать VIP-баннер (рекламодатель)
router.post("/banner", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Вы не рекламодатель" });

  const { title, text, link, color, pricePerDay, days } = req.body;
  if (!title || !link || !pricePerDay || !days) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const priceCents = Math.round(Number(pricePerDay) * 100);
  const total = priceCents * Number(days);

  if (advertiser.balance < total) {
    return res.status(400).json({ error: `Недостаточно баланса. Нужно $${(total / 100).toFixed(2)}` });
  }

  AdvertiserModel.debitBalance(advertiser.id, total);
  const result = VipModel.createBanner(advertiser.id, {
    title, text, link, color,
    pricePerDayCents: priceCents, days: Number(days),
  });

  return res.status(201).json({ success: true, banner: result });
});

// POST /api/vip/pin-task — закрепить задание
router.post("/pin-task", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Вы не рекламодатель" });

  const { taskId, pricePerDay, days } = req.body;
  if (!taskId || !pricePerDay || !days) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const priceCents = Math.round(Number(pricePerDay) * 100);
  const total = priceCents * Number(days);

  if (advertiser.balance < total) {
    return res.status(400).json({ error: `Недостаточно баланса. Нужно $${(total / 100).toFixed(2)}` });
  }

  AdvertiserModel.debitBalance(advertiser.id, total);
  const result = VipModel.pinTask(taskId, advertiser.id, {
    pricePerDayCents: priceCents, days: Number(days),
  });

  return res.status(201).json({ success: true, pin: result });
});

// POST /api/vip/badge — купить VIP-бейдж
router.post("/badge", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Вы не рекламодатель" });

  const { pricePerMonth, months } = req.body;
  if (!pricePerMonth || !months) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const priceCents = Math.round(Number(pricePerMonth) * 100);
  const total = priceCents * Number(months);

  if (advertiser.balance < total) {
    return res.status(400).json({ error: `Недостаточно баланса. Нужно $${(total / 100).toFixed(2)}` });
  }

  AdvertiserModel.debitBalance(advertiser.id, total);
  const result = VipModel.buyVipBadge(advertiser.id, {
    pricePerMonthCents: priceCents, months: Number(months),
  });

  return res.status(201).json({ success: true, badge: result });
});

// POST /api/vip/impression — купить показы баннера
router.post("/impression", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Вы не рекламодатель" });

  const { title, link, impressions, pricePer1000 } = req.body;
  if (!title || !link || !impressions || !pricePer1000) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  const priceCents = Math.round(Number(pricePer1000) * 100 * Number(impressions) / 1000);

  if (advertiser.balance < priceCents) {
    return res.status(400).json({ error: `Недостаточно баланса. Нужно $${(priceCents / 100).toFixed(2)}` });
  }

  AdvertiserModel.debitBalance(advertiser.id, priceCents);
  const result = VipModel.buyImpressionSlot(advertiser.id, {
    title, link, impressions: Number(impressions), priceCents,
  });

  return res.status(201).json({ success: true, slot: result });
});

// GET /api/vip/is-vip — проверить VIP статус
router.get("/is-vip", requireAuth, (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  const isVip = advertiser ? VipModel.isVipAdvertiser(advertiser.id) : false;
  return res.json({ isVip });
});

export default router;
