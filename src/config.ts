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

export const MIN_WITHDRAWAL_USD = Number(process.env.MIN_WITHDRAWAL_USD ?? "5");
export const PLATFORM_FEE_PERCENT = Number(process.env.PLATFORM_FEE_PERCENT ?? "20");
export const REFERRAL_BONUS_PERCENT = Number(process.env.REFERRAL_BONUS_PERCENT ?? "10");

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.warn("⚠️  JWT_SECRET must be set and at least 32 characters long");
}
