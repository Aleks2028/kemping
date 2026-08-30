import { db } from "../models/database";
import { AdvertiserModel } from "../models/advertiser";
import { TaskModel } from "../models/task";
import { UserModel } from "../models/user";

/**
 * Сидер: заполняет БД демо-рекламодателями и заданиями.
 * Вызывается при старте, если в БД нет ни одного рекламодателя.
 */

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
    companyName: "CryptoNews Daily",
    contact: "@cryptonews_daily",
    budget: 5000, // cents
    tasks: [
      { title: "Подписаться на наш Telegram-канал", description: "Подпишитесь на @cryptonews_daily. После подписки сделайте скриншот.", type: "subscribe", url: "https://t.me/cryptonews_daily", reward: 30, slots: 100, requiresProof: true, proofInstructions: "Пришлите скриншот подписки или username в Telegram" },
      { title: "Подписаться на премиум-канал", description: "Подписка на закрытый канал с сигналами.", type: "subscribe", url: "https://t.me/cryptonews_premium", reward: 80, slots: 30, requiresProof: true, proofInstructions: "Скриншот с подпиской" },
      { title: "Вступить в чат", description: "Вступите в наш общий чат трейдеров.", type: "subscribe", url: "https://t.me/cryptonews_chat", reward: 25, slots: 200, requiresProof: false },
    ],
  },
  {
    username: "youtube_grow",
    companyName: "TechReview Channel",
    contact: "tech@demo.com",
    budget: 8000,
    tasks: [
      { title: "Подписаться на YouTube-канал", description: "Подпишитесь и нажмите колокольчик.", type: "subscribe", url: "https://youtube.com/@techreview", reward: 50, slots: 80, requiresProof: true },
      { title: "Посмотреть видео до конца", description: "Посмотрите наш новый обзор iPhone 17.", type: "view", url: "https://youtube.com/watch?v=demo1", reward: 40, slots: 100, requiresProof: false },
      { title: "Поставить лайк под видео", description: "Поставьте лайк под роликом «Топ-10 нейросетей 2026».", type: "like", url: "https://youtube.com/watch?v=demo2", reward: 20, slots: 200, requiresProof: false },
    ],
  },
  {
    username: "app_installs",
    companyName: "MobileApps Promo",
    contact: "@mobile_apps",
    budget: 15000,
    tasks: [
      { title: "Установить приложение", description: "Скачайте наше приложение из Google Play и откройте его.", type: "register", url: "https://play.google.com/store/apps/details?id=demo.app", reward: 150, slots: 50, requiresProof: true, proofInstructions: "Скриншот главного экрана приложения" },
      { title: "Регистрация в приложении", description: "Создайте аккаунт в нашем приложении.", type: "register", url: "https://demo.app/register", reward: 200, slots: 30, requiresProof: true, proofInstructions: "Скриншот профиля" },
      { title: "Оставить отзыв в Google Play", description: "Поставьте 5 звёзд и напишите отзыв.", type: "custom", url: "https://play.google.com/store/apps/details?id=demo.app", reward: 100, slots: 25, requiresProof: true, proofInstructions: "Ссылка на отзыв или скриншот" },
    ],
  },
  {
    username: "social_boost",
    companyName: "Instagram Growth",
    contact: "@ig_growth",
    budget: 6000,
    tasks: [
      { title: "Подписаться на Instagram", description: "Подпишитесь на @travel_with_us.", type: "subscribe", url: "https://instagram.com/travel_with_us", reward: 35, slots: 100, requiresProof: true },
      { title: "Лайк + комментарий", description: "Поставьте лайк и напишите комментарий к последнему посту.", type: "like", url: "https://instagram.com/p/demo", reward: 30, slots: 80, requiresProof: true, proofInstructions: "Скриншот комментария" },
      { title: "Репост сторис", description: "Сделайте репост нашей сторис в свою ленту.", type: "custom", url: "https://instagram.com/stories/demo", reward: 45, slots: 60, requiresProof: true },
    ],
  },
  {
    username: "news_subs",
    companyName: "Daily News Aggregator",
    contact: "news@demo.com",
    budget: 4000,
    tasks: [
      { title: "Подписаться на email-рассылку", description: "Подпишитесь на нашу ежедневную рассылку.", type: "register", url: "https://news.demo.com/subscribe", reward: 60, slots: 50, requiresProof: true, proofInstructions: "Скриншот подтверждения email" },
      { title: "Поделиться статьёй в соцсетях", description: "Поделитесь любой нашей статьёй в Facebook/Twitter.", type: "custom", url: "https://news.demo.com/article-1", reward: 25, slots: 100, requiresProof: true },
      { title: "Регистрация на сайте", description: "Создайте аккаунт на нашем новостном портале.", type: "register", url: "https://news.demo.com/register", reward: 70, slots: 40, requiresProof: true },
    ],
  },
];

export function seedDemoData() {
  // Если уже есть рекламодатели, не сидируем
  const existing = db.prepare("SELECT COUNT(*) as c FROM advertisers").get() as any;
  if (existing.c > 0) {
    return { seeded: false, reason: "advertisers already exist" };
  }

  console.log("🌱 Seeding demo advertisers and tasks…");

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
    const totalCost = adv.tasks.reduce(
      (sum, t) => sum + t.reward * t.slots,
      0,
    );

    for (const taskData of adv.tasks) {
      const task = TaskModel.create({
        advertiserId: advertiser.id,
        title: taskData.title,
        description: taskData.description,
        type: taskData.type as any,
        url: taskData.url,
        reward: taskData.reward,
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
  return { seeded: true, advertisers: ADVERTISERS.length, tasks: taskCount };
}

// Запуск как скрипт
if (require.main === module) {
  seedDemoData();
}
