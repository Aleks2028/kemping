import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { UserModel } from "./user";
import { MIN_WITHDRAWAL_USD } from "../config";
import type { Withdrawal } from "./types";

function rowToWithdrawal(row: any): Withdrawal {
  return {
    id: row.id,
    userId: row.user_id,
    method: row.method,
    amount: row.amount,
    fee: row.fee,
    finalAmount: row.final_amount,
    wallet: row.wallet,
    status: row.status,
    createdAt: row.created_at,
    processedAt: row.processed_at ?? undefined,
    txHash: row.tx_hash ?? undefined,
    rejectReason: row.reject_reason ?? undefined,
  };
}

const FEES: Record<string, number> = {
  usdt_trc20: 100,    // 1 USD
  yoomoney: 50,        // 0.5 USD
  card: 200,           // 2 USD
};

export const WithdrawalModel = {
  create(data: {
    userId: string;
    method: "usdt_trc20" | "yoomoney" | "card";
    amount: number;     // cents
    wallet: string;
  }): Withdrawal {
    const fee = FEES[data.method] ?? 0;
    const finalAmount = data.amount - fee;
    if (finalAmount <= 0) throw new Error("amount too small after fee");
    if (data.amount < MIN_WITHDRAWAL_USD * 100) {
      throw new Error(`minimum withdrawal is $${MIN_WITHDRAWAL_USD}`);
    }

    const user = UserModel.getById(data.userId);
    if (!user) throw new Error("user not found");
    if (user.balance < data.amount) throw new Error("insufficient balance");

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    // Списываем с баланса сразу (защита от двойной выплаты)
    UserModel.debitBalance(data.userId, data.amount);

    db.prepare(`
      INSERT INTO withdrawals (id, user_id, method, amount, fee, final_amount, wallet, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, data.userId, data.method, data.amount, fee, finalAmount, data.wallet, now);

    return this.getById(id)!;
  },

  getById(id: string): Withdrawal | null {
    const row = db.prepare("SELECT * FROM withdrawals WHERE id = ?").get(id) as any;
    return row ? rowToWithdrawal(row) : null;
  },

  listByUser(userId: string, limit = 50): Withdrawal[] {
    const rows = db.prepare(`
      SELECT * FROM withdrawals WHERE user_id = ?
      ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit) as any[];
    return rows.map(rowToWithdrawal);
  },

  listPending(limit = 100): Withdrawal[] {
    const rows = db.prepare(`
      SELECT * FROM withdrawals WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
    `).all(limit) as any[];
    return rows.map(rowToWithdrawal);
  },

  listAll(limit = 200): Withdrawal[] {
    const rows = db.prepare(`
      SELECT * FROM withdrawals ORDER BY created_at DESC LIMIT ?
    `).all(limit) as any[];
    return rows.map(rowToWithdrawal);
  },

  approve(id: string, txHash?: string): Withdrawal {
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE withdrawals SET status = 'paid', processed_at = ?, tx_hash = ?
      WHERE id = ?
    `).run(now, txHash ?? null, id);

    const w = this.getById(id)!;
    // Учитываем в общей сумме выведенных
    db.prepare(`
      UPDATE users SET total_withdrawn = total_withdrawn + ? WHERE id = ?
    `).run(w.amount, w.userId);
    return w;
  },

  reject(id: string, reason: string): Withdrawal {
    const w = this.getById(id);
    if (!w) throw new Error("withdrawal not found");
    if (w.status !== "pending") throw new Error("already processed");

    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      UPDATE withdrawals SET status = 'rejected', processed_at = ?, reject_reason = ?
      WHERE id = ?
    `).run(now, reason, id);

    // Возвращаем деньги на баланс
    db.prepare(`
      UPDATE users SET balance = balance + ? WHERE id = ?
    `).run(w.amount, w.userId);

    return this.getById(id)!;
  },
};
