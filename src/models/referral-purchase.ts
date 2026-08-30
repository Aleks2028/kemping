import { v4 as uuidv4 } from "uuid";
import { db } from "./database";
import { UserModel } from "./user";
import { AdvertiserModel } from "./advertiser";

/**
 * Покупка рефералов (обычных и VIP).
 * Создаёт запись referrals без реального referred_id — это "виртуальные рефералы",
 * которые приписываются к покупателю. Они имитируют активность для его статистики.
 */

const REFERRAL_PACKS = [
  { id: "pack_5", name: "Стартовый", description: "5 обычных рефералов", count: 5, price: 100, isVip: false },
  { id: "pack_20", name: "Базовый", description: "20 обычных рефералов", count: 20, price: 350, isVip: false },
  { id: "pack_50", name: "Стандарт", description: "50 обычных рефералов", count: 50, price: 750, isVip: false },
  { id: "pack_100", name: "Оптимальный", description: "100 обычных рефералов", count: 100, price: 1300, isVip: false },
  { id: "vip_10", name: "VIP Старт", description: "10 VIP-рефералов с повышенным бонусом", count: 10, price: 500, isVip: true },
  { id: "vip_30", name: "VIP Про", description: "30 VIP-рефералов с повышенным бонусом", count: 30, price: 1200, isVip: true },
  { id: "vip_100", name: "VIP Премиум", description: "100 VIP-рефералов с повышенным бонусом", count: 100, price: 3500, isVip: true },
];

export const ReferralPurchaseModel = {
  getPacks() {
    return REFERRAL_PACKS;
  },

  getPackById(packId: string) {
    return REFERRAL_PACKS.find(p => p.id === packId);
  },

  /**
   * Покупка пакета рефералов. Списывает с баланса рекламодателя.
   * VIP-рефералы добавляют покупателю VIP-статус на 30 дней.
   */
  purchase(userId: string, packId: string): { purchase: any; pack: any; vipUntil?: number } {
    const pack = this.getPackById(packId);
    if (!pack) throw new Error("pack not found");

    const user = UserModel.getById(userId);
    if (!user) throw new Error("user not found");

    // Списываем с баланса пользователя
    if (user.balance < pack.price) {
      throw new Error(`insufficient balance: need $${(pack.price / 100).toFixed(2)}, have $${(user.balance / 100).toFixed(2)}`);
    }
    UserModel.debitBalance(userId, pack.price);

    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(`
      INSERT INTO referral_purchases (id, user_id, pack_id, referrals_assigned, price_cents, status, created_at)
      VALUES (?, ?, ?, 0, ?, 'completed', ?)
    `).run(id, userId, packId, pack.price, now);

    // Назначаем VIP-рефералов
    let vipUntil: number | undefined;
    if (pack.isVip) {
      vipUntil = now + 30 * 24 * 60 * 60; // 30 дней
      // Обновляем или создаём VIP-статус
      const existing = db.prepare("SELECT vip_expires_at FROM users WHERE id = ?").get(userId) as any;
      const newUntil = Math.max(existing?.vip_expires_at ?? 0, vipUntil);
      db.prepare("UPDATE users SET is_vip = 1, vip_expires_at = ? WHERE id = ?").run(newUntil, userId);
    }

    // Создаём виртуальных рефералов
    const virtualReferrals = pack.isVip ? 0 : pack.count; // обычные — без бонусов, просто для статистики
    if (virtualReferrals > 0) {
      // Создаём фейковых user-ов (без логина, но со ссылкой на покупателя)
      for (let i = 0; i < virtualReferrals; i++) {
        const refUserId = "ref_" + uuidv4().substring(0, 8);
        const refUsername = "user_" + Math.random().toString(36).substring(2, 10);
        const refEmail = refUsername + "@virtual.kemping";
        try {
          db.prepare(`
            INSERT INTO users (id, username, email, password_hash, referred_by, balance, is_vip, created_at)
            VALUES (?, ?, ?, 'virtual', ?, 0, 0, ?)
          `).run(refUserId, refUsername, refEmail, userId, now);
          db.prepare(`
            INSERT OR IGNORE INTO referrals (referrer_id, referred_id, bonus_paid, created_at)
            VALUES (?, ?, 0, ?)
          `).run(userId, refUserId, now);
        } catch (e) {
          // дубликаты — игнорируем
        }
      }
    }

    return {
      purchase: { id, userId, packId, price: pack.price, createdAt: now },
      pack,
      vipUntil,
    };
  },

  listMyPurchases(userId: string) {
    return db.prepare(`
      SELECT * FROM referral_purchases WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId) as any[];
  },
};
