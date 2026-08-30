import { db } from "../models/database";
import { AdvertiserModel } from "../models/advertiser";
import { TaskModel } from "../models/task";
import { UserModel } from "../models/user";

/**
 * Сидер: заполняет БД демо-рекламодателями и заданиями.
 * Если VERSION изменился — удаляет старые задания и создаёт новые с актуальными ценами.
 * Вызывается при старте.
 */

const SEED_VERSION = 4; // увеличивай при изменении демо-данных

const DEMO_USERS = [
  { username: "telegram_promo", email: "tg@demo.com", password: "demo123" },
  { username: "youtube_grow", email: "yt@demo.com", password: "demo123" },
  { username: "app_installs", email: "apps@demo.com", password: "demo123" },
  { username: "social_boost", email: "social@demo.com", password: "demo123" },
  { username: "news_subs", email: "news@demo.com", password: "demo123" },
];

const ADVERTISERS = [
  {
    username: "telegram_promo",
    companyName: "Крипто Новости",
    contact: "@cryptonews_daily",
    budget: 5000,
    tasks: [
      { title: "Подписаться на Telegram-канал", description: "Подпишитесь на канал @cryptonews_daily. После подписки сделайте скриншот.", type: "subscribe", url: "https://t.me/cryptonews_daily", userReward: 2, slots: 100, requiresProof: true, proofInstructions: "Пришлите скриншот подписки" },
      { title: "Подписаться на канал «Сигналы»", description: "Подписка на канал с торговыми сигналами.", type: "subscribe", url: "https://t.me/trading_signals_2025", userReward: 3, slots: 50, requiresProof: true, proofInstructions: "Скриншот с подпиской" },
      { title: "Вступить в чат трейдеров", description: "Вступите в общий чат крипто-трейдеров.", type: "subscribe", url: "https://t.me/crypto_traders_chat", userReward: 2, slots: 100, requiresProof: false },
    ],
  },
  {
    username: "youtube_grow",
    companyName: "Обзоры техники",
    contact: "tech@demo.com",
    budget: 8000,
    tasks: [
      { title: "Подписаться на YouTube-канал", description: "Подпишитесь на канал и нажмите колокольчик, чтобы не пропустить новые видео.", type: "subscribe", url: "https://www.youtube.com/@ixbttv", userReward: 3, slots: 80, requiresProof: false },
      { title: "Посмотреть видео до конца", description: "Посмотрите обзор нового iPhone 16 Pro. Видео длится 15 минут — досмотрите до конца.", type: "view", url: "https://www.youtube.com/watch?v=KpVDoFh2K3w", userReward: 2, slots: 100, requiresProof: false },
      { title: "Поставить лайк видео", description: "Поставьте лайк под обзором нового MacBook Pro.", type: "like", url: "https://www.youtube.com/watch?v=KpVDoFh2K3w", userReward: 2, slots: 200, requiresProof: false },
    ],
  },
  {
    username: "app_installs",
    companyName: "Приложения и софт",
    contact: "@mobile_apps",
    budget: 15000,
    tasks: [
      { title: "Установить и открыть приложение", description: "Скачайте приложение Кинопоиск из Google Play и откройте его.", type: "register", url: "https://play.google.com/store/apps/details?id=ru.kinopoisk", userReward: 8, slots: 50, requiresProof: true, proofInstructions: "Скриншот открытого приложения" },
      { title: "Регистрация в приложении", description: "Зарегистрируйтесь в приложении VK (ВКонтакте).", type: "register", url: "https://play.google.com/store/apps/details?id=com.vkontakte.android", userReward: 10, slots: 30, requiresProof: true, proofInstructions: "Скриншот профиля" },
      { title: "Оставить отзыв в Google Play", description: "Поставьте 5 звёзд и напишите короткий отзыв приложению.", type: "custom", url: "https://play.google.com/store/apps/details?id=ru.kinopoisk", userReward: 10, slots: 25, requiresProof: true, proofInstructions: "Ссылка на ваш отзыв или скриншот" },
    ],
  },
  {
    username: "social_boost",
    companyName: "Социальные сети",
    contact: "@ig_growth",
    budget: 6000,
    tasks: [
      { title: "Подписаться на Instagram", description: "Подпишитесь на @travel_with_us — канал о путешествиях.", type: "subscribe", url: "https://instagram.com/travel_with_us", userReward: 3, slots: 100, requiresProof: true },
      { title: "Лайк и комментарий", description: "Поставьте лайк и напишите комментарий под последним постом.", type: "like", url: "https://instagram.com/p/DH8xXXXXX", userReward: 2, slots: 80, requiresProof: true, proofInstructions: "Скриншот комментария" },
      { title: "Подписаться на Telegram-канал", description: "Подпишитесь на канал о нейросетях и ИИ.", type: "subscribe", url: "https://t.me/neuro_ai_news", userReward: 3, slots: 60, requiresProof: false },
    ],
  },
  {
    username: "news_subs",
    companyName: "Новости и медиа",
    contact: "news@demo.com",
    budget: 4000,
    tasks: [
      { title: "Подписаться на канал новостей", description: "Подпишитесь на канал Лента.ру — последние новости.", type: "subscribe", url: "https://t.me/lentaru", userReward: 3, slots: 50, requiresProof: false },
      { title: "Подписаться на YouTube-канал", description: "Подпишитесь на канал Популярная механика — наука и технологии.", type: "subscribe", url: "https://www.youtube.com/@popmech", userReward: 3, slots: 40, requiresProof: false },
      { title: "Посмотреть видео-новость", description: "Посмотрите последний выпуск новостей технологий.", type: "view", url: "https://www.youtube.com/watch?v=livestream1", userReward: 2, slots: 100, requiresProof: false },
    ],
  },
];

export function seedDemoData() {
  // Проверяем версию сида
  let currentVersion = 0;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'seed_version'").get() as any;
    currentVersion = row ? Number(row.value) : 0;
  } catch (e) {
    // Таблицы meta нет — создаём
    db.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)");
  }

  const existing = db.prepare("SELECT COUNT(*) as c FROM advertisers").get() as any;

  // Если версия актуальна и рекламодатели есть — не трогаем
  if (currentVersion >= SEED_VERSION && existing.c > 0) {
    return { seeded: false, reason: `seed version ${currentVersion} up to date` };
  }

  // Если версия устарела — удаляем старые демо-задания и пересоздаём
  if (existing.c > 0) {
    console.log(`🔄 Seed version ${currentVersion} → ${SEED_VERSION}, refreshing demo tasks…`);
    // Удаляем только демо-задания (по user_referrer)
    db.prepare(`
      DELETE FROM task_completions WHERE task_id IN (
        SELECT id FROM tasks WHERE advertiser_id IN (
          SELECT id FROM advertisers WHERE contact LIKE '@%' OR contact LIKE '%demo%' OR contact LIKE '%@demo%'
        )
      )
    `).run();
    db.prepare(`
      DELETE FROM tasks WHERE advertiser_id IN (
        SELECT id FROM advertisers WHERE contact LIKE '@%' OR contact LIKE '%demo%' OR contact LIKE '%@demo%'
      )
    `).run();
  } else {
    console.log("🌱 Seeding demo advertisers and tasks…");
  }

  for (const userData of DEMO_USERS) {
    if (UserModel.getByEmail(userData.email)) continue;

    const user = UserModel.create(userData);
    AdvertiserModel.create({
      userId: user.id,
      companyName: ADVERTISERS.find(a => a.username === userData.username)!.companyName,
      contact: ADVERTISERS.find(a => a.username === userData.username)!.contact,
    });
  }

  // Создаём задания
  let taskCount = 0;
  for (const adv of ADVERTISERS) {
    const user = UserModel.getByUsername(adv.username);
    if (!user) continue;
    const advertiser = AdvertiserModel.getByUserId(user.id);
    if (!advertiser) continue;

    // Пополняем баланс
    AdvertiserModel.deposit(advertiser.id, adv.budget);

    // Сначала считаем суммарную стоимость всех заданий рекламодателя
    // (userReward + platform fee) * slots
    const { PLATFORM_FEE_PERCENT } = require("../config");
    const totalCost = adv.tasks.reduce(
      (sum, t) => {
        const fee = Math.floor(t.userReward * PLATFORM_FEE_PERCENT / (100 - PLATFORM_FEE_PERCENT));
        const advPrice = t.userReward + fee;
        return sum + advPrice * t.slots;
      },
      0,
    );

    for (const taskData of adv.tasks) {
      const task = TaskModel.create({
        advertiserId: advertiser.id,
        title: taskData.title,
        description: taskData.description,
        type: taskData.type as any,
        url: taskData.url,
        userReward: taskData.userReward,
        reward: taskData.userReward,
        totalSlots: taskData.slots,
        requiresProof: taskData.requiresProof,
        proofInstructions: taskData.proofInstructions,
      });

      // Сразу одобряем (без модерации), чтобы пользователи видели демо
      TaskModel.approve(task.id);

      taskCount++;
    }

    // Списываем суммарную стоимость один раз
    if (totalCost > 0) {
      try {
        AdvertiserModel.chargeTask(advertiser.id, totalCost);
      } catch (e) {
        // Если бюджета не хватает — докладываем демо-средства
        AdvertiserModel.deposit(advertiser.id, totalCost);
        AdvertiserModel.chargeTask(advertiser.id, totalCost);
      }
    }
  }

  console.log(`✅ Seeded ${ADVERTISERS.length} advertisers and ${taskCount} tasks`);

  // Сохраняем версию сида
  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seed_version', ?)").run(String(SEED_VERSION));

  return { seeded: true, advertisers: ADVERTISERS.length, tasks: taskCount, version: SEED_VERSION };
}

// Запуск как скрипт
if (require.main === module) {
  seedDemoData();
}
