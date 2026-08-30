import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth";
import { AdvertiserModel } from "../models/advertiser";
import {
  createYooKassaPayment, checkYooKassaPayment,
  createUsdtDeposit, checkUsdtDeposits,
  createCryptoDeposit,
  createYooMoneyInvoice, verifyYooMoneyNotification,
  savePaymentOrder, confirmPaymentOrder, getPaymentOrder,
} from "../services/payment";
import type { Request, Response } from "express";

const router = Router();

// POST /api/payments/deposit — создать платёж
router.post("/deposit", requireAuth, async (req: Request, res: Response) => {
  const advertiser = AdvertiserModel.getByUserId(req.user!.id);
  if (!advertiser) return res.status(400).json({ error: "Сначала станьте рекламодателем" });

  const { amount, paymentMethod } = req.body;
  const amountUsd = Number(amount);
  const amountCents = Math.round(amountUsd * 100);

  if (!amountUsd || amountUsd < 1) {
    return res.status(400).json({ error: "Минимальное пополнение $1" });
  }

  const orderId = uuidv4();
  savePaymentOrder(orderId, advertiser.id, amountCents, paymentMethod);

  try {
    switch (paymentMethod) {
      case "card": {
        // ЮKassa — банковские карты
        const result = await createYooKassaPayment(advertiser.id, amountUsd, orderId);
        if (result) {
          return res.json({
            method: "card",
            orderId,
            paymentId: result.paymentId,
            confirmationUrl: result.confirmationUrl,
            amount: amountUsd,
          });
        }
        return res.status(503).json({ error: "ЮKassa временно недоступна. Используйте другой способ." });
      }

      case "usdt_trc20": {
        const result = createUsdtDeposit(advertiser.id, amountCents);
        return res.json({
          method: "usdt_trc20",
          orderId,
          depositId: result.depositId,
          address: result.address,
          amountUsdt: result.amountUsdt,
          memo: result.depositId,
          amount: amountUsd,
        });
      }

      case "btc": {
        const result = createCryptoDeposit(advertiser.id, amountCents, "BTC");
        return res.json({
          method: "btc",
          orderId,
          address: result.address,
          amountBtc: result.amountCrypto,
          rate: result.rate,
          amount: amountUsd,
        });
      }

      case "eth": {
        const result = createCryptoDeposit(advertiser.id, amountCents, "ETH");
        return res.json({
          method: "eth",
          orderId,
          address: result.address,
          amountEth: result.amountCrypto,
          rate: result.rate,
          amount: amountUsd,
        });
      }

      case "ton": {
        const result = createCryptoDeposit(advertiser.id, amountCents, "TON");
        return res.json({
          method: "ton",
          orderId,
          address: result.address,
          amountTon: result.amountCrypto,
          rate: result.rate,
          amount: amountUsd,
        });
      }

      case "sol": {
        const result = createCryptoDeposit(advertiser.id, amountCents, "SOL");
        return res.json({
          method: "sol",
          orderId,
          address: result.address,
          amountSol: result.amountCrypto,
          rate: result.rate,
          amount: amountUsd,
        });
      }

      case "bnbsc": {
        const result = createCryptoDeposit(advertiser.id, amountCents, "BNB");
        return res.json({
          method: "bnbsc",
          orderId,
          address: result.address,
          amountBnb: result.amountCrypto,
          rate: result.rate,
          amount: amountUsd,
        });
      }

      case "yoomoney": {
        const result = createYooMoneyInvoice(advertiser.id, amountUsd);
        if (result) {
          return res.json({
            method: "yoomoney",
            orderId,
            invoiceUrl: result.invoiceUrl,
            label: result.label,
            amount: amountUsd,
          });
        }
        return res.status(503).json({ error: "ЮMoney временно недоступна" });
      }

      default:
        return res.status(400).json({ error: "Неизвестный способ оплаты" });
    }
  } catch (e: any) {
    console.error("Payment error:", e);
    return res.status(500).json({ error: e.message });
  }
});

// GET /api/payments/check/:orderId — проверить статус платежа
router.get("/check/:orderId", requireAuth, async (req: Request, res: Response) => {
  const order = getPaymentOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  if (order.status === "confirmed") {
    return res.json({ status: "confirmed", amount: order.amount_cents });
  }

  // Для ЮKassa — проверяем статус на стороне ЮKassa
  if (order.method === "card" && order.extra) {
    const succeeded = await checkYooKassaPayment(order.extra);
    if (succeeded) {
      const advertiser = AdvertiserModel.getById(order.advertiser_id);
      if (advertiser) {
        AdvertiserModel.deposit(advertiser.id, order.amount_cents);
        confirmPaymentOrder(order.id);
        // Активируем депозит для пользователя
        db.prepare("UPDATE users SET deposited = 1, total_deposited = COALESCE(total_deposited, 0) + ? WHERE id = ?")
          .run(order.amount_cents, advertiser.userId);
        return res.json({ status: "confirmed", amount: order.amount_cents });
      }
    }
  }

  return res.json({ status: "pending" });
});

// POST /api/payments/yoomoney-notify — webhook от ЮMoney
router.post("/yoomoney-notify", (req: Request, res: Response) => {
  if (!verifyYooMoneyNotification(req.body as Record<string, string>)) {
    return res.status(403).json({ error: "invalid signature" });
  }

  const { label, amount, codepro } = req.body;
  if (codepro === "true") return res.json({ ok: true }); // код протекции — пропускаем

  // label: kemping_<advertiserId>_<timestamp>
  const parts = (label as string)?.split("_");
  if (parts?.length !== 3) return res.status(400).json({ error: "bad label" });

  const advertiserId = parts[1];
  const amountRubles = Number(amount);
  const amountUsd = amountRubles / 90; // примерный курс

  const advertiser = AdvertiserModel.getById(advertiserId);
  if (advertiser) {
    AdvertiserModel.deposit(advertiser.id, Math.round(amountUsd * 100));
    console.log(`✅ ЮMoney deposit: ${amountRubles} RUB → advertiser ${advertiserId}`);
  }

  res.json({ ok: true });
});

// POST /api/payments/confirm — ручное подтверждение (для тестов и крипты)
router.post("/confirm/:orderId", requireAuth, (req: Request, res: Response) => {
  const order = getPaymentOrder(req.params.orderId);
  if (!order) return res.status(404).json({ error: "Заказ не найден" });

  if (order.status === "confirmed") {
    return res.json({ status: "already confirmed" });
  }

  // В реальной системе — только через webhook/web3
  // Это для ручной модерации или тестов
  AdvertiserModel.deposit(order.advertiser_id, order.amount_cents);
  confirmPaymentOrder(order.id);

  // Активируем депозит для пользователя
  const adv = AdvertiserModel.getById(order.advertiser_id);
  if (adv) {
    db.prepare("UPDATE users SET deposited = 1, total_deposited = COALESCE(total_deposited, 0) + ? WHERE id = ?")
      .run(order.amount_cents, adv.userId);
  }

  return res.json({ status: "confirmed", amount: order.amount_cents });
});

// POST /api/payments/check-crypto — ручная проверка (admin)
router.post("/check-crypto", async (req: Request, res: Response) => {
  await checkUsdtDeposits();
  return res.json({ ok: true });
});

export default router;
