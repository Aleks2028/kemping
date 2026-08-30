import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { UserModel } from "./user";

/**
 * VIP-реклама:
 * - 🏆 VIP-баннер на главной (топовый слайдер)
 * - 📌 Закрепление задания в топе
 * - 👑 VIP-бейдж у рекламодателя
 * - 👁 Баннер-слот (показы 1000 раз)
 */

export const VipModel = {
  // ========== VIP БАННЕРЫ ==========
  createBanner(advertiserId: string, data: {
    title: string; text?: string; link: string; color?: string;
    pricePerDayCents: number; days: number;
  }): { id: string; totalPrice: number; endDate: number } {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.days * 86400;
    const totalPrice = data.pricePerDayCents * data.days;
    db.prepare(`
      INSERT INTO vip_banners (id, advertiser_id, title, text, link, color, price_per_day_cents, days, start_date, end_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, advertiserId, data.title, data.text ?? null, data.link, data.color ?? '#ec4899', data.pricePerDayCents, data.days, now, endDate, now);
    return { id, totalPrice, endDate };
  },

  listActiveBanners() {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare(`
      SELECT * FROM vip_banners
      WHERE status = 'active' AND end_date > ? AND start_date <= ?
      ORDER BY RANDOM() LIMIT 5
    `).all(now, now) as any[];
  },

  approveBanner(id: string) {
    db.prepare("UPDATE vip_banners SET status = 'active' WHERE id = ?").run(id);
  },

  // ========== VIP ЗАКРЕПЛЕНИЯ ЗАДАНИЙ ==========
  pinTask(taskId: string, advertiserId: string, data: {
    pricePerDayCents: number; days: number;
  }): { id: string; totalPrice: number; endDate: number } {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.days * 86400;
    const totalPrice = data.pricePerDayCents * data.days;
    db.prepare(`
      INSERT INTO vip_task_pins (id, task_id, advertiser_id, price_per_day_cents, days, start_date, end_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(id, taskId, advertiserId, data.pricePerDayCents, data.days, now, endDate, now);
    return { id, totalPrice, endDate };
  },

  listActivePinnedTaskIds(): string[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = db.prepare(`
      SELECT task_id FROM vip_task_pins
      WHERE status = 'active' AND end_date > ? AND start_date <= ?
    `).all(now, now) as any[];
    return rows.map(r => r.task_id);
  },

  // ========== VIP БЕЙДЖ ==========
  buyVipBadge(advertiserId: string, data: {
    pricePerMonthCents: number; months: number;
  }): { id: string; totalPrice: number; endDate: number } {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const endDate = now + data.months * 30 * 86400;
    const totalPrice = data.pricePerMonthCents * data.months;
    const existing = db.prepare("SELECT end_date FROM vip_badges WHERE advertiser_id = ?").get(advertiserId) as any;
    if (existing && existing.end_date > now) {
      const newEnd = existing.end_date + data.months * 30 * 86400;
      db.prepare("UPDATE vip_badges SET end_date = ?, price_per_month_cents = ?, months = months + ? WHERE advertiser_id = ?")
        .run(newEnd, data.pricePerMonthCents, data.months, advertiserId);
      return { id, totalPrice, endDate: newEnd };
    }
    db.prepare(`
      INSERT INTO vip_badges (id, advertiser_id, price_per_month_cents, months, start_date, end_date, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(id, advertiserId, data.pricePerMonthCents, data.months, now, endDate, now);
    return { id, totalPrice, endDate };
  },

  isVipAdvertiser(advertiserId: string): boolean {
    const now = Math.floor(Date.now() / 1000);
    const row = db.prepare(`
      SELECT 1 FROM vip_badges WHERE advertiser_id = ? AND status = 'active' AND end_date > ?
    `).get(advertiserId, now);
    return !!row;
  },

  // ========== БАННЕР-СЛОТЫ (показы) ==========
  buyImpressionSlot(advertiserId: string, data: {
    title: string; link: string;
    impressions: number; priceCents: number;
  }): { id: string; totalPrice: number } {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO banner_slots (id, advertiser_id, title, link, impressions_purchased, price_cents, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(id, advertiserId, data.title, data.link, data.impressions, data.priceCents, now);
    return { id, totalPrice: data.priceCents };
  },

  pickRandomSlot() {
    const now = Math.floor(Date.now() / 1000);
    const rows = db.prepare(`
      SELECT * FROM banner_slots
      WHERE status = 'active' AND impressions_delivered < impressions_purchased
      ORDER BY RANDOM() LIMIT 1
    `).get() as any;
    if (rows) {
      db.prepare("UPDATE banner_slots SET impressions_delivered = impressions_delivered + 1 WHERE id = ?").run(rows.id);
    }
    return rows;
  },
};
