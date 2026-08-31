import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import type { VipPackage, VipPurchase, FaucetClaim, FaucetSettings } from "./types";

function rowToVipPackage(row: any): VipPackage {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    priceCents: row.price_cents,
    referralBonusPercent: row.referral_bonus_percent,
    dailyTasksBonus: row.daily_tasks_bonus ?? 0,
    minWithdrawalCents: row.min_withdrawal_cents,
    color: row.color,
    icon: row.icon,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

function rowToVipPurchase(row: any): VipPurchase {
  return {
    id: row.id,
    userId: row.user_id,
    packageId: row.package_id,
    priceCents: row.price_cents,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function rowToFaucetClaim(row: any): FaucetClaim {
  return {
    id: row.id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  };
}

function rowToFaucetSettings(row: any): FaucetSettings {
  return {
    id: row.id,
    minAmountCents: row.min_amount_cents,
    maxAmountCents: row.max_amount_cents,
    cooldownSeconds: row.cooldown_seconds,
    isActive: !!row.is_active,
    createdAt: row.created_at,
  };
}

export const VipModel = {
  // Получить все VIP-пакеты
  getAllPackages(): VipPackage[] {
    return db.prepare("SELECT * FROM vip_packages ORDER BY sort_order, price_cents").all() as any[]
      .map(rowToVipPackage);
  },

  // Получить пакет по ID
  getPackageById(id: string): VipPackage | null {
    const row = db.prepare("SELECT * FROM vip_packages WHERE id = ?").get(id) as any;
    return row ? rowToVipPackage(row) : null;
  },

  // Получить активный VIP-пакет пользователя
  getUserActiveVip(userId: string): { package: VipPackage; purchase: VipPurchase } | null {
    const row = db.prepare(`
      SELECT vp.*, vpur.*
      FROM vip_packages vp
      JOIN vip_purchases vpur ON vpur.package_id = vp.id
      WHERE vpur.user_id = ? AND vpur.status = 'active' AND vpur.expires_at > ?
      ORDER BY vpur.started_at DESC
      LIMIT 1
    `).get(userId, Math.floor(Date.now() / 1000)) as any;

    if (!row) return null;

    return {
      package: rowToVipPackage(row),
      purchase: rowToVipPurchase(row),
    };
  },

  // Купить VIP-пакет (списание с баланса пользователя)
  purchaseVip(userId: string, packageId: string, durationDays: number = 30): { success: boolean; error?: string; purchase?: VipPurchase } {
    const pkg = this.getPackageById(packageId);
    if (!pkg) return { success: false, error: "Пакет не найден" };

    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(userId) as any;
    if (!user) return { success: false, error: "Пользователь не найден" };
    if (user.balance < pkg.priceCents) return { success: false, error: "Недостаточно средств на балансе" };

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + durationDays * 86400;

    const tx = db.transaction(() => {
      // Списываем с баланса
      db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(pkg.priceCents, userId);

      // Создаём покупку
      const purchaseId = uuidv4();
      db.prepare(`
        INSERT INTO vip_purchases (id, user_id, package_id, price_cents, status, started_at, expires_at, created_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(purchaseId, userId, packageId, pkg.priceCents, now, expiresAt, now);

      return purchaseId;
    });

    try {
      const purchaseId = tx();
      const purchase = this.getPurchaseById(purchaseId)!;
      return { success: true, purchase };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  getPurchaseById(id: string): VipPurchase | null {
    const row = db.prepare("SELECT * FROM vip_purchases WHERE id = ?").get(id) as any;
    return row ? rowToVipPurchase(row) : null;
  },

  // Получить реферальный бонус пользователя (с учетом VIP)
  getReferralBonusPercent(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip) return vip.package.referralBonusPercent;
    return 10; // дефолт
  },

  // Получить бонус к заданиям
  getDailyTasksBonus(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip) return vip.package.dailyTasksBonus;
    return 0;
  },

  // Получить минимальный вывод для пользователя
  getMinWithdrawalCents(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip?.package?.minWithdrawalCents) return vip.package.minWithdrawalCents;
    return 1000; // $10 default
  },
};

export const FaucetModel = {
  // Получить настройки крана
  getSettings(): FaucetSettings {
    let row = db.prepare("SELECT * FROM faucet_settings WHERE id = 'main'").get() as any;
    if (!row) {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(`
        INSERT INTO faucet_settings (id, min_amount_cents, max_amount_cents, cooldown_seconds, is_active, created_at)
        VALUES ('main', 1, 100, 3600, 1, ?)
      `).run(now);
      row = db.prepare("SELECT * FROM faucet_settings WHERE id = 'main'").get() as any;
    }
    return rowToFaucetSettings(row);
  },

  // Получить последний клейм пользователя
  getLastClaim(userId: string): FaucetClaim | null {
    const row = db.prepare(`
      SELECT * FROM faucet_claims
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(userId) as any;
    return row ? rowToFaucetClaim(row) : null;
  },

  // Проверить, можно ли клеймить
  canClaim(userId: string): { can: boolean; waitSeconds?: number } {
    const settings = this.getSettings();
    if (!settings.isActive) return { can: false, waitSeconds: 0 };

    const lastClaim = this.getLastClaim(userId);
    if (!lastClaim) return { can: true };

    const now = Math.floor(Date.now() / 1000);
    const elapsed = now - lastClaim.createdAt;
    if (elapsed >= settings.cooldownSeconds) return { can: true };

    return { can: false, waitSeconds: settings.cooldownSeconds - elapsed };
  },

  // Выполнить клейм
  claim(userId: string, ipAddress: string): { success: boolean; amount?: number; waitSeconds?: number; error?: string } {
    const check = this.canClaim(userId);
    if (!check.can) return { success: false, waitSeconds: check.waitSeconds };

    const settings = this.getSettings();
    // Случайная сумма от min до max
    const amountCents = Math.floor(Math.random() * (settings.maxAmountCents - settings.minAmountCents + 1)) + settings.minAmountCents;

    const now = Math.floor(Date.now() / 1000);
    const claimId = uuidv4();

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO faucet_claims (id, user_id, amount_cents, ip_address, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(claimId, userId, amountCents, ipAddress, now);

      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amountCents, userId);
    });

    try {
      tx();
      return { success: true, amount: amountCents };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // Получить историю клеймов пользователя
  getUserClaims(userId: string, limit = 20): FaucetClaim[] {
    return (db.prepare(`
      SELECT * FROM faucet_claims
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(userId, limit) as any[]).map(rowToFaucetClaim);
  },

  // Статистика крана для админа
  getStats(): { totalClaims: number; totalPaid: number; uniqueUsers: number } {
    const totalClaims = (db.prepare("SELECT COUNT(*) as c FROM faucet_claims").get() as any).c;
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as s FROM faucet_claims").get() as any).s;
    const uniqueUsers = (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM faucet_claims").get() as any).c;
    return { totalClaims, totalPaid, uniqueUsers };
  },
};