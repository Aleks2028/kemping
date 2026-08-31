import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { PORT, NODE_ENV } from "./config";
import { authOptional } from "./middleware/auth";
import authRoutes from "./routes/auth";
import taskRoutes from "./routes/tasks";
import withdrawRoutes from "./routes/withdraw";
import adminRoutes from "./routes/admin";
import advertiserRoutes from "./routes/advertiser";
import referralPackRoutes from "./routes/referral-packs";
import vipAdRoutes from "./routes/vip-ads";
import paymentRoutes from "./routes/payments";
import vipRoutes from "./routes/vip";
import shortlinksRoutes from "./routes/shortlinks";
import { seedDemoData } from "./scripts/seed";
import { VipModel, FaucetModel } from "./models/vip";
import { db } from "./models/database";
import { UserModel } from "./models/user";

const app = express();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(NODE_ENV === "production" ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Статика
app.use(express.static(path.join(__dirname, "../public")));

// EJS
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../src/views"));

// Auth middleware
app.use(authOptional);

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/withdraw", withdrawRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/advertiser", advertiserRoutes);
app.use("/api/referral-packs", referralPackRoutes);
app.use("/api/vip", vipRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/faucet", vipRoutes);
app.use("/api/urls", shortlinksRoutes);

// ── Page Routes ──────────────────────────────────────────────

// Главная
app.get("/", (_req, res) => {
  res.render("index", { title: "Kemping — Зарабатывай на заданиях" });
});

// Перехватчик токена из URL — ставит cookie и редиректит на /tasks
app.get("/auth-callback", (req, res) => {
  const token = req.query.token as string;
  if (token) {
    res.cookie("token", token, {
      httpOnly: false,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }
  res.redirect("/tasks");
});

// Регистрация
app.get("/register", (_req, res) => {
  res.render("register", { title: "Регистрация" });
});

// Вход
app.get("/login", (_req, res) => {
  res.render("login", { title: "Вход" });
});

// Панель заданий (требует авторизации — перенаправляет на /login если не авторизован)
app.get("/tasks", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("tasks", { title: "Задания", user: req.user });
});

// Профиль
app.get("/profile", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("profile", { title: "Профиль", user: req.user });
});

// Вывод средств
app.get("/withdraw", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("withdraw", { title: "Вывод средств", user: req.user });
});

// Админка
app.get("/admin", authOptional, (req, res) => {
  if (!req.user?.isAdmin) return res.redirect("/");
  res.render("admin", { title: "Админка", user: req.user });
});

// Рекламодатель
app.get("/advertiser", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("advertiser", { title: "Кабинет рекламодателя", user: req.user });
});

app.get("/advertiser/new-task", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("advertiser-new-task", { title: "Новое задание", user: req.user });
});

app.get("/advertiser/deposit", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("advertiser-deposit", { title: "Пополнение баланса", user: req.user });
});

app.get("/advertiser/referrals", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("advertiser-referrals", { title: "Покупка рефералов", user: req.user });
});

app.get("/advertiser/vip", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("advertiser-vip", { title: "VIP-реклама", user: req.user });
});

// Страница VIP
app.get("/vip", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("vip", { title: "VIP-пакеты", user: req.user });
});

// Страница крана
app.get("/faucet", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("faucet", { title: "Кран-букс", user: req.user });
});

// Редирект по короткой ссылке
app.get("/:code", async (req, res, next) => {
  // Не трогаем известные маршруты
  const staticRoutes = [
    "tasks", "profile", "withdraw", "admin", "advertiser", "login", "register",
    "vip", "faucet", "urls", "auth", "api", "css", "js", "favicon"
  ];
  if (staticRoutes.includes(req.params.code)) return next();

  const row = db.prepare("SELECT target_url, clicks, expires_at FROM url_redirects WHERE code = ?").get(req.params.code) as any;

  if (!row) return next();
  if (row.expires_at && Math.floor(Date.now() / 1000) > row.expires_at) {
    db.prepare("DELETE FROM url_redirects WHERE code = ?").run(req.params.code);
    return res.status(410).json({ error: "Ссылка устарела" });
  }

  // Увеличиваем счётчик кликов
  db.prepare("UPDATE url_redirects SET clicks = clicks + 1 WHERE code = ?").run(req.params.code);

  return res.redirect(row.target_url);
});

// Страница управления короткими ссылками
app.get("/urls", authOptional, (req, res) => {
  if (!req.user) return res.redirect("/login");
  res.render("manage-urls", { title: "Короткие ссылки", user: req.user });
});

// ── Error handler ─────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

app.listen(PORT, () => {
  console.log(`🚀 Kemping запущен на http://localhost:${PORT}`);

  // Периодическая проверка крипто-депозитов (USDT TRC20, BTC, ETH)
  const { checkUsdtDeposits, checkCryptoDeposits } = require("./services/payment");
  setInterval(async () => {
    await checkUsdtDeposits();
    await checkCryptoDeposits();
  }, 60000); // каждую минуту
  console.log(`💰 Периодическая проверка крипто-депозитов запущена (каждые 60с)`);
  // Сидируем демо-данные, если база пустая
  try {
    const result = seedDemoData();
    if (result.seeded) {
      console.log(`📊 Создано ${result.advertisers} рекламодателей и ${result.tasks} заданий`);
    }
  } catch (e) {
    console.warn("⚠️ Не удалось засидировать демо-данные:", e);
  }

  // Гарантируем существование админа (для Render, где SQLite не сохраняется)
  try {
    const { UserModel } = require("./models/user");
    const { db } = require("./models/database");
    const adminEmail = "admin@kemping.ru";
    let admin = UserModel.getByEmail(adminEmail);
    if (!admin) {
      admin = UserModel.create({
        username: "admin",
        email: adminEmail,
        password: "admin123",
      });
    }
    db.prepare("UPDATE users SET is_admin = 1, balance = 10000, total_earned = 0, deposited = 1 WHERE id = ?").run(admin.id);
    console.log(`👑 Админ готов: admin / admin123`);
  } catch (e) {
    console.warn("⚠️ Не удалось создать админа:", e);
  }

  // Гарантируем существование рекламодателя
  try {
    const { UserModel } = require("./models/user");
    const { AdvertiserModel } = require("./models/advertiser");
    let advUser = UserModel.getByUsername("advertiser");
    if (!advUser) {
      advUser = UserModel.create({
        username: "advertiser",
        email: "ads@kemping.ru",
        password: "ads123456",
      });
    }
    let adv = AdvertiserModel.getByUserId(advUser.id);
    if (!adv) {
      adv = AdvertiserModel.create({
        userId: advUser.id,
        companyName: "Kemping Company",
        contact: "@kemping_ads",
      });
    }
    console.log(`📢 Рекламодатель готов: advertiser / ads123456`);
  } catch (e) {
    console.warn("⚠️ Не удалось создать рекламодателя:", e);
  }
});

export default app;
