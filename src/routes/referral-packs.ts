import { Router } from "express";
import { ReferralPurchaseModel } from "../models/referral-purchase";
import { requireAuth } from "../middleware/auth";
import type { Request, Response } from "express";

const router = Router();

// GET /api/referral-packs — список пакетов
router.get("/", (req: Request, res: Response) => {
  const packs = ReferralPurchaseModel.getPacks();
  return res.json({ packs });
});

// POST /api/referral-packs/purchase — купить пакет
router.post("/purchase", requireAuth, (req: Request, res: Response) => {
  const { packId } = req.body;
  if (!packId) return res.status(400).json({ error: "packId required" });

  try {
    const result = ReferralPurchaseModel.purchase(req.user!.id, packId);
    return res.json({ success: true, ...result });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// GET /api/referral-packs/my — мои покупки
router.get("/my", requireAuth, (req: Request, res: Response) => {
  const purchases = ReferralPurchaseModel.listMyPurchases(req.user!.id);
  return res.json({ purchases });
});

export default router;
