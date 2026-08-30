import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { BCRYPT_ROUNDS, REFERRAL_BONUS_PERCENT } from "../config";
import type { User } from "./types";

// Хелперы для безопасных SQL-запросов
function rowToUser(row: any): User {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    passwordHash: row.password_hash,
    telegramId: row.telegram_id ?? undefined,
    balance: row.balance,
    pendingBalance: row.pending_balance,
    totalEarned: row.total_earned,
    totalWithdrawn: row.total_withdrawn,
    totalDeposited: row.total_deposited ?? 0,
    deposited: !!row.deposited,
    referredBy: row.referred_by ?? undefined,
    isAdvertiser: !!row.is_advertiser,
    isAdmin: !!row.is_admin,
    banned: !!row.banned,
    createdAt: row.created_at,
  };
}

export const UserModel = {
  create(data: {
    username: string;
    email: string;
    password: string;
    referredBy?: string;
    telegramId?: number;
  }): User {
    const id = uuidv4();
    const hash = bcrypt.hashSync(data.password, BCRYPT_ROUNDS);
    const now = Math.floor(Date.now() / 1000);

    db.prepare(`
      INSERT INTO users (id, username, email, password_hash, telegram_id, referred_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.username, data.email, hash, data.telegramId ?? null, data.referredBy ?? null, now);

    if (data.referredBy) {
      db.prepare(`
        INSERT INTO referrals (referrer_id, referred_id, created_at)
        VALUES (?, ?, ?)
      `).run(data.referredBy, id, now);
    }

    return this.getById(id)!;
  },

  getById(id: string): User | null {
    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
    return row ? rowToUser(row) : null;
  },

  getByEmail(email: string): User | null {
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as any;
    return row ? rowToUser(row) : null;
  },

  getByUsername(username: string): User | null {
    const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
    return row ? rowToUser(row) : null;
  },

  verifyPassword(user: User, password: string): boolean {
    return bcrypt.compareSync(password, user.passwordHash);
  },

  // Атомарное начисление баланса (в центах)
  creditBalance(userId: string, amountCents: number): void {
    if (amountCents <= 0) throw new Error("amount must be positive");
    db.prepare(`
      UPDATE users
      SET balance = balance + ?,
          total_earned = total_earned + ?
      WHERE id = ?
    `).run(amountCents, amountCents, userId);
  },

  // Списание с баланса
  debitBalance(userId: string, amountCents: number): void {
    const user = this.getById(userId);
    if (!user) throw new Error("user not found");
    if (user.balance < amountCents) throw new Error("insufficient balance");
    db.prepare(`
      UPDATE users SET balance = balance - ? WHERE id = ?
    `).run(amountCents, userId);
  },

  // Реферальный бонус
  payReferralBonus(referredId: string, earnedCents: number): void {
    const ref = db.prepare(`
      SELECT * FROM referrals WHERE referred_id = ?
    `).get(referredId) as any;
    if (!ref) return;

    const bonus = Math.floor(earnedCents * REFERRAL_BONUS_PERCENT / 100);
    if (bonus <= 0) return;

    db.prepare(`
      UPDATE users SET balance = balance + ? WHERE id = ?
    `).run(bonus, ref.referrer_id);

    db.prepare(`
      UPDATE referrals SET bonus_paid = bonus_paid + ? WHERE referred_id = ?
    `).run(bonus, referredId);
  },

  list(limit = 100, offset = 0): User[] {
    const rows = db.prepare(`
      SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as any[];
    return rows.map(rowToUser);
  },

  count(): number {
    const row = db.prepare("SELECT COUNT(*) as c FROM users").get() as any;
    return row.c;
  },
};
