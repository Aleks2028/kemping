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
  getAllPackages(): VipPackage[] {
    const rows = db.prepare("SELECT * FROM vip_packages ORDER BY sort_order, price_cents").all() as any[];
    return rows.map(rowToVipPackage);
  },

  getPackageById(id: string): VipPackage | null {
    const row = db.prepare("SELECT * FROM vip_packages WHERE id = ?").get(id) as any;
    return row ? rowToVipPackage(row) : null;
  },

  getUserActiveVip(userId: string): { package: VipPackage; purchase: VipPurchase } | null {
    const row = db.prepare(
      "SELECT vp.*, vpur.id as p_id, vpur.user_id as p_user_id, vpur.package_id as p_package_id, " +
      "vpur.price_cents as p_price_cents, vpur.status as p_status, vpur.started_at as p_started_at, " +
      "vpur.expires_at as p_expires_at, vpur.created_at as p_created_at " +
      "FROM vip_packages vp JOIN vip_purchases vpur ON vpur.package_id = vp.id " +
      "WHERE vpur.user_id = ? AND vpur.status = 'active' AND vpur.expires_at > ? " +
      "ORDER BY vpur.started_at DESC LIMIT 1"
    ).get(userId, Math.floor(Date.now() / 1000)) as any;

    if (!row) return null;

    const purchase: VipPurchase = {
      id: row.p_id,
      userId: row.p_user_id,
      packageId: row.p_package_id,
      priceCents: row.p_price_cents,
      status: row.p_status,
      startedAt: row.p_started_at,
      expiresAt: row.p_expires_at,
      createdAt: row.p_created_at,
    };

    return {
      package: rowToVipPackage(row),
      purchase,
    };
  },

  purchaseVip(userId: string, packageId: string, durationDays: number = 30): { success: boolean; error?: string; purchase?: VipPurchase } {
    const pkg = this.getPackageById(packageId);
    if (!pkg) return { success: false, error: "Пакет не найден" };

    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(userId) as any;
    if (!user) return { success: false, error: "Пользователь не найден" };
    if (user.balance < pkg.priceCents) return { success: false, error: "Недостаточно средств на балансе" };

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + durationDays * 86400;
    const purchaseId = uuidv4();

    const doTx = db.transaction(() => {
      db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(pkg.priceCents, userId);
      db.prepare(
        "INSERT INTO vip_purchases (id, user_id, package_id, price_cents, status, started_at, expires_at, created_at) " +
        "VALUES (?, ?, ?, ?, 'active', ?, ?, ?)"
      ).run(purchaseId, userId, packageId, pkg.priceCents, now, expiresAt, now);
    });

    try {
      doTx();
      const purchase = this.getPurchaseById(purchaseId);
      return { success: true, purchase: purchase || undefined };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  getPurchaseById(id: string): VipPurchase | null {
    const row = db.prepare("SELECT * FROM vip_purchases WHERE id = ?").get(id) as any;
    return row ? rowToVipPurchase(row) : null;
  },

  getReferralBonusPercent(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip) return vip.package.referralBonusPercent;
    return 10;
  },

  getDailyTasksBonus(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip) return vip.package.dailyTasksBonus;
    return 0;
  },

  getMinWithdrawalCents(userId: string): number {
    const vip = this.getUserActiveVip(userId);
    if (vip && vip.package.minWithdrawalCents) return vip.package.minWithdrawalCents;
    return 1000;
  },

  buyVipBadge(advertiserId: string, data: { pricePerMonthCents: number; months: number }): any {
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.months * 30 * 86400;
    const id = uuidv4();
    db.prepare(
      "INSERT INTO vip_badges (id, advertiser_id, price_per_month_cents, months, start_date, end_date, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'active', ?)"
    ).run(id, advertiserId, data.pricePerMonthCents, data.months, now, endDate, now);
    return { id, advertiserId, months: data.months, endDate };
  },

  buyImpressionSlot(advertiserId: string, data: { title: string; link: string; impressions: number; priceCents: number }): any {
    const now = Math.floor(Date.now() / 1000);
    const id = uuidv4();
    db.prepare(
      "INSERT INTO banner_slots (id, advertiser_id, title, link, impressions_purchased, price_cents, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, 'active', ?)"
    ).run(id, advertiserId, data.title, data.link, data.impressions, data.priceCents, now);
    return { id, advertiserId, impressions: data.impressions };
  },

  isVipAdvertiser(advertiserId: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare(
      "SELECT id FROM vip_badges WHERE advertiser_id = ? AND status = 'active' AND end_date > ? LIMIT 1"
    ).get(advertiserId, now);
    return !!row;
  },

  pinTask(taskId: string, advertiserId: string, data: { pricePerDayCents: number; days: number }): any {
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.days * 86400;
    const id = uuidv4();
    db.prepare(
      "INSERT INTO vip_task_pins (id, task_id, advertiser_id, price_per_day_cents, days, start_date, end_date, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)"
    ).run(id, taskId, advertiserId, data.pricePerDayCents, data.days, now, endDate, now);
    return { id, taskId, days: data.days, endDate };
  },

  createBanner(advertiserId: string, data: { title: string; text: string; link: string; color: string; pricePerDayCents: number; days: number }): any {
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.days * 86400;
    const id = uuidv4();
    db.prepare(
      "INSERT INTO vip_banners (id, advertiser_id, title, text, link, color, price_per_day_cents, days, start_date, end_date, status, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)"
    ).run(id, advertiserId, data.title, data.text, data.link, data.color, data.pricePerDayCents, data.days, now, endDate, now);
    return { id, advertiserId, days: data.days, endDate };
  },

  listActiveBanners(): any[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = db.prepare(
      "SELECT vb.*, a.company_name FROM vip_banners vb " +
      "JOIN advertisers a ON a.id = vb.advertiser_id " +
      "WHERE vb.status = 'active' AND vb.end_date > ? ORDER BY vb.created_at DESC"
    ).all(now) as any[];
    return rows;
  },
};

export const FaucetModel = {
  getSettings(): FaucetSettings {
    let row = db.prepare("SELECT * FROM faucet_settings WHERE id = 'main'").get() as any;
    if (!row) {
      const now = Math.floor(Date.now() / 1000);
      db.prepare(
        "INSERT INTO faucet_settings (id, min_amount_cents, max_amount_cents, cooldown_seconds, is_active, created_at) " +
        "VALUES ('main', 1, 100, 3600, 1, ?)"
      ).run(now);
      row = db.prepare("SELECT * FROM faucet_settings WHERE id = 'main'").get() as any;
    }
    return rowToFaucetSettings(row);
  },

  getLastClaim(userId: string): FaucetClaim | null {
    const row = db.prepare(
      "SELECT * FROM faucet_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(userId) as any;
    return row ? rowToFaucetClaim(row) : null;
  },

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

  claim(userId: string, ipAddress: string): { success: boolean; amount?: number; waitSeconds?: number; error?: string } {
    const check = this.canClaim(userId);
    if (!check.can) return { success: false, waitSeconds: check.waitSeconds };

    const settings = this.getSettings();
    const amountCents = Math.floor(Math.random() * (settings.maxAmountCents - settings.minAmountCents + 1)) + settings.minAmountCents;

    const now = Math.floor(Date.now() / 1000);
    const claimId = uuidv4();

    const doTx = db.transaction(() => {
      db.prepare(
        "INSERT INTO faucet_claims (id, user_id, amount_cents, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(claimId, userId, amountCents, ipAddress, now);
      db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amountCents, userId);
    });

    try {
      doTx();
      return { success: true, amount: amountCents };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  getUserClaims(userId: string, limit: number = 20): FaucetClaim[] {
    const rows = db.prepare(
      "SELECT * FROM faucet_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT ?"
    ).all(userId, limit) as any[];
    return rows.map(rowToFaucetClaim);
  },

  getStats(): { totalClaims: number; totalPaid: number; uniqueUsers: number } {
    const totalClaims = (db.prepare("SELECT COUNT(*) as c FROM faucet_claims").get() as any).c || 0;
    const totalPaid = (db.prepare("SELECT COALESCE(SUM(amount_cents), 0) as s FROM faucet_claims").get() as any).s || 0;
    const uniqueUsers = (db.prepare("SELECT COUNT(DISTINCT user_id) as c FROM faucet_claims").get() as any).c || 0;
    return { totalClaims, totalPaid, uniqueUsers };
  },
};
