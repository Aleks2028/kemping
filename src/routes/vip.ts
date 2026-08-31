import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { VipModel, FaucetModel } from "../models/vip";
import { UserModel } from "../models/user";
import { db } from "../models/database";
import type { Request, Response } from "express";

const router = Router();

// GET /api/vip/packages — список всех VIP-пакетов
router.get("/packages", (req: Request, res: Response) => {
  const packages = VipModel.getAllPackages();
  res.json({ packages });
});

// GET /api/vip/my — текущий VIP пользователя
router.get("/my", requireAuth, (req: Request, res: Response) => {
  const vip = VipModel.getUserActiveVip(req.user!.id);
  res.json({ vip });
});

// POST /api/vip/purchase — купить VIP-пакет
router.post("/purchase", requireAuth, (req: Request, res: Response) => {
  const { packageId } = req.body;
  if (!packageId) return res.status(400).json({ error: "Не выбран пакет" });

  const result = VipModel.purchaseVip(req.user!.id, packageId);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }

  res.json({ success: true, purchase: result.purchase });
});

// GET /api/faucet/info — информация о кране
router.get("/faucet/info", (req: Request, res: Response) => {
  const settings = FaucetModel.getSettings();
  res.json({ settings });
});

// POST /api/faucet/claim — собрать с крана
router.post("/faucet/claim", requireAuth, (req: Request, res: Response) => {
  const ip = req.ip || req.socket.remoteAddress || "0.0.0.0";
  const result = FaucetModel.claim(req.user!.id, ip);

  if (!result.success) {
    if (result.waitSeconds !== undefined) {
      return res.status(429).json({
        error: "Кран уже был собран недавно",
        waitSeconds: result.waitSeconds,
      });
    }
    return res.status(400).json({ error: result.error });
  }

  // Получаем обновленный баланс
  const user = UserModel.getById(req.user!.id);
  res.json({
    success: true,
    amount: result.amount,
    newBalance: user?.balance ?? 0,
  });
});

// GET /api/faucet/status — статус крана для текущего пользователя
router.get("/faucet/status", requireAuth, (req: Request, res: Response) => {
  const canClaim = FaucetModel.canClaim(req.user!.id);
  const settings = FaucetModel.getSettings();
  const lastClaim = FaucetModel.getLastClaim(req.user!.id);

  res.json({
    canClaim: canClaim.can,
    waitSeconds: canClaim.waitSeconds ?? 0,
    settings,
    lastClaim,
  });
});

// GET /api/faucet/history — история клеймов
router.get("/faucet/history", requireAuth, (req: Request, res: Response) => {
  const history = FaucetModel.getUserClaims(req.user!.id);
  res.json({ history });
});

export default router;
