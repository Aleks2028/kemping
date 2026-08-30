import "dotenv/config";

export const PORT = Number(process.env.PORT ?? "3000");
export const NODE_ENV = process.env.NODE_ENV ?? "development";

export const JWT_SECRET = process.env.JWT_SECRET ?? "";
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";
export const BCRYPT_ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? "12");

export const DATABASE_URL = process.env.DATABASE_URL ?? "./data/earn2surf.db";

export const ADMIN_TELEGRAM_IDS: number[] = (process.env.ADMIN_TELEGRAM_IDS ?? "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => !isNaN(n));

export const MIN_WITHDRAWAL_USD = Number(process.env.MIN_WITHDRAWAL_USD ?? "10");
export const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? "70");
export const REFERRAL_BONUS_PERCENT = Number(process.env.REFERRAL_BONUS_PERCENT ?? "10");

// Платёжные системы
export const TRONGRID_API_KEY = process.env.TRONGRID_API_KEY ?? "";
export const USDT_TRC20_WALLET = process.env.USDT_TRC20_WALLET ?? "";
export const BTC_ADDRESS = process.env.BTC_ADDRESS ?? "";
export const BTC_FEE_PERCENT = Number(process.env.BTC_FEE_PERCENT ?? "2");
export const ETH_ADDRESS = process.env.ETH_ADDRESS ?? "";
export const ETH_FEE_PERCENT = Number(process.env.ETH_FEE_PERCENT ?? "2");
export const YOOMONEY_WALLET = process.env.YOOMONEY_WALLET ?? "";
export const YOOMONEY_NOTIFICATION_SECRET = process.env.YOOMONEY_NOTIFICATION_SECRET ?? "";
export const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID ?? "";
export const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY ?? "";
export const YOOKASSA_RETURN_URL = process.env.YOOKASSA_RETURN_URL ?? "http://localhost:3000/advertiser";
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const TELEGRAM_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID ?? "";

// Курсы крипты (хардкод, обновлять вручную или через API)
export const CRYPTO_RATES = {
  USDT: 1,        // 1 USDT ≈ $1
  BTC: 65000,     // 1 BTC ≈ $65,000
  ETH: 3500,      // 1 ETH ≈ $3,500
  TON: 2.5,       // 1 TON ≈ $2.5
};

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn("⚠️  JWT_SECRET must be set and at least 32 characters long");
}
