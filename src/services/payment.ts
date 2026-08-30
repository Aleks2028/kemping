/**
 * Payment Service — единая точка для всех платежей
 * Поддерживает: ЮKassa (карты), USDT TRC20, BTC, ETH, TON, ЮMoney
 */

import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";
import {
  TRONGRID_API_KEY, USDT_TRC20_WALLET,
  BTC_ADDRESS, ETH_ADDRESS,
  YOOMONEY_WALLET, YOOMONEY_NOTIFICATION_SECRET,
  YOOKASSA_SHOP_ID, YOOKASSA_SECRET_KEY, YOOKASSA_RETURN_URL,
  CRYPTO_RATES,
} from "../config";
import { db } from "../models/database";
import { AdvertiserModel } from "../models/advertiser";

// ─── ЮKassa (банковские карты) ──────────────────────────────────────────────

interface YooKassaPayment {
  id: string;
  status: "pending" | "succeeded" | "canceled";
  amount: { value: string; currency: string };
  confirmation: { type: string; confirmation_url: string };
  metadata?: { orderId?: string; advertiserId?: string };
}

export async function createYooKassaPayment(
  advertiserId: string,
  amountUsd: number,
  orderId: string
): Promise<{ paymentId: string; confirmationUrl: string } | null> {
  if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) {
    console.warn("⚠️ YooKassa не настроена");
    return null;
  }

  try {
    const idempotenceKey = uuidv4();
    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotence-Key": idempotenceKey,
        "Authorization": "Basic " + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64"),
      },
      body: JSON.stringify({
        amount: { value: amountUsd.toFixed(2), currency: "RUB" },
        confirmation: { type: "redirect", return_url: YOOKASSA_RETURN_URL },
        description: `Kemping: пополнение баланса рекламодателя ${advertiserId}`,
        metadata: { orderId, advertiserId },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("YooKassa error:", err);
      return null;
    }

    const payment = (await response.json()) as YooKassaPayment;
    return { paymentId: payment.id, confirmationUrl: payment.confirmation.confirmation_url };
  } catch (e) {
    console.error("YooKassa exception:", e);
    return null;
  }
}

export async function checkYooKassaPayment(paymentId: string): Promise<boolean> {
  if (!YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY) return false;
  try {
    const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      headers: {
        "Authorization": "Basic " + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64"),
      },
    });
    if (!response.ok) return false;
    const payment = (await response.json()) as YooKassaPayment;
    return payment.status === "succeeded";
  } catch {
    return false;
  }
}

// ─── USDT TRC20 ─────────────────────────────────────────────────────────────

interface TronDepositRecord {
  txHash: string;
  advertiserId: string;
  amountCents: number;
  status: "pending" | "confirmed";
  createdAt: number;
}

const pendingTronDeposits = new Map<string, TronDepositRecord>();

export function createUsdtDeposit(advertiserId: string, amountCents: number): { depositId: string; address: string; amountUsdt: string } {
  const depositId = uuidv4();
  // Генерируем уникальный memo (он же deposit ID) для идентификации платежа
  const deposit: TronDepositRecord = {
    txHash: depositId,
    advertiserId,
    amountCents,
    status: "pending",
    createdAt: Math.floor(Date.now() / 1000),
  };
  pendingTronDeposits.set(depositId, deposit);

  return {
    depositId,
    address: USDT_TRC20_WALLET,
    amountUsdt: (amountCents / 100 / CRYPTO_RATES.USDT).toFixed(6),
  };
}

/**
 * Проверка USDT-переводов через TronGrid API.
 * Вызывается периодически (например, каждые 30 секунд) для поиска новых зачислений.
 */
export async function checkUsdtDeposits(): Promise<void> {
  if (!USDT_TRC20_WALLET || !TRONGRID_API_KEY) return;

  try {
    // Получаем транзакции ToC за последние 5 минут
    const now = Math.floor(Date.now() / 1000);
    const from = now - 300;

    const response = await fetch(
      `https://api.trongrid.io/v1/accounts/${USDT_TRC20_WALLET}/transactions/trc20?only_confirmed=true&min_timestamp=${from * 1000}&limit=50`,
      { headers: { "TRON-PRO-API-KEY": TRONGRID_API_KEY } }
    );

    if (!response.ok) return;
    const data = await response.json() as any;

    for (const tx of data.data || []) {
      const txHash = tx.transaction_id;
      const toAddress = tx.to_address;
      if (toAddress?.toLowerCase() !== USDT_TRC20_WALLET.toLowerCase()) continue;

      // Ищем USDT (TRC20 contract)
      for (const token of tx.token_transfers || []) {
        if (token.token_info?.symbol !== "USDT") continue;
        const amountUsdt = parseFloat(token.amount_str || token.amount) / 1e6; // USDT decimals = 6
        if (amountUsdt <= 0) continue;

        // Проверяем, есть ли pending-депозит с соответствующим memo в tx_data
        const depositId = tx.raw_data?.data || tx.raw_data?.contract?.[0]?.parameter?.value?.data;
        if (depositId && pendingTronDeposits.has(depositId)) {
          const deposit = pendingTronDeposits.get(depositId)!;
          if (deposit.status === "pending") {
            const amountCents = Math.round(amountUsdt * CRYPTO_RATES.USDT * 100);
            AdvertiserModel.deposit(deposit.advertiserId, amountCents);
            deposit.status = "confirmed";
            db.prepare("INSERT OR IGNORE INTO crypto_deposits (tx_hash, advertiser_id, amount_cents, currency, status, created_at) VALUES (?, ?, ?, 'USDT', 'confirmed', ?)")
              .run(txHash, deposit.advertiserId, amountCents, deposit.createdAt);
            console.log(`✅ USDT deposit confirmed: ${amountUsdt} USDT to advertiser ${deposit.advertiserId}`);
          }
        }
      }
    }
  } catch (e) {
    console.warn("⚠️ TronGrid check failed:", e);
  }
}

// ─── BTC / ETH ─────────────────────────────────────────────────────────────────

interface CryptoDepositRecord {
  txHash: string;
  advertiserId: string;
  amountCents: number;
  currency: "BTC" | "ETH";
  status: "pending" | "confirmed";
  createdAt: number;
}

const pendingCryptoDeposits = new Map<string, CryptoDepositRecord>();

export function createCryptoDeposit(
  advertiserId: string,
  amountCents: number,
  currency: "BTC" | "ETH"
): { depositId: string; address: string; amountCrypto: string; rate: number } {
  const depositId = uuidv4();
  const deposit: CryptoDepositRecord = {
    txHash: depositId,
    advertiserId,
    amountCents,
    currency,
    status: "pending",
    createdAt: Math.floor(Date.now() / 1000),
  };
  pendingCryptoDeposits.set(depositId, deposit);

  const rate = CRYPTO_RATES[currency];
  const amountCrypto = (amountCents / 100 / rate).toFixed(8);

  return {
    depositId,
    address: currency === "BTC" ? BTC_ADDRESS : ETH_ADDRESS,
    amountCrypto,
    rate,
  };
}

export async function checkCryptoDeposits(): Promise<void> {
  // BTC и ETH проверяются через webhook-нотификации от кошельков
  // Эта функция — заглушка для ручной проверки
  // В продакшене настройте webhook от Binance, Kraken, CoinGate и т.д.
  // Пока просто логируем ожидающие депозиты
  for (const [id, dep] of pendingCryptoDeposits) {
    if (dep.status === "pending") {
      console.log(`⏳ Pending ${dep.currency} deposit for ${dep.advertiserId}: ${(dep.amountCents / 100).toFixed(2)} USD`);
    }
  }
}

// ─── ЮMoney ────────────────────────────────────────────────────────────────────

export function createYooMoneyInvoice(
  advertiserId: string,
  amountUsd: number
): { invoiceUrl: string; label: string } | null {
  if (!YOOMONEY_WALLET) return null;

  const amountRubles = amountUsd * 90; // Примерный курс, можно использовать реальный API
  const label = `kemping_${advertiserId}_${Date.now()}`;

  return {
    invoiceUrl: `https://yoomoney.ru/transfer/quickpay?account=${YOOMONEY_WALLET}&sum=${amountRubles.toFixed(0)}&comment=${label}&label=${label}`,
    label,
  };
}

/**
 * Проверка ЮMoney переводов.
 * ЮMoney присылает webhook на /api/payments/yoomoney-notify
 */
export function verifyYooMoneyNotification(params: Record<string, string>): boolean {
  if (!YOOMONEY_NOTIFICATION_SECRET) return false;
  const { notification_type, operation_id, amount, currency, datetime, sender, codepro, label, hash } = params;

  // Формируем строку для проверки
  const str = [notification_type, operation_id, amount, currency, datetime, sender, codepro, YOOMONEY_NOTIFICATION_SECRET, label]
    .join("&");
  const expectedHash = crypto.createHash("sha1").update(str).digest("hex");

  return hash === expectedHash;
}

// ─── Order helpers ─────────────────────────────────────────────────────────────

export function savePaymentOrder(orderId: string, advertiserId: string, amountCents: number, method: string, extra?: string) {
  db.prepare(`
    INSERT OR REPLACE INTO payment_orders (id, advertiser_id, amount_cents, method, extra, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(orderId, advertiserId, amountCents, method, extra ?? null, Math.floor(Date.now() / 1000));
}

export function confirmPaymentOrder(orderId: string) {
  db.prepare("UPDATE payment_orders SET status = 'confirmed' WHERE id = ?").run(orderId);
}

export function getPaymentOrder(orderId: string) {
  return db.prepare("SELECT * FROM payment_orders WHERE id = ?").get(orderId) as any;
}
