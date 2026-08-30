import { Router } from "express";
import { UserModel } from "../models/user";
import { generateToken } from "../middleware/auth";
import { requireAuth } from "../middleware/auth";
import type { Request, Response } from "express";

const router = Router();

// POST /auth/register
router.post("/register", (req: Request, res: Response) => {
  const { username, email, password, referralCode, telegramId } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: "Заполните все поля" });
  }
  if (username.length < 3) {
    return res.status(400).json({ error: "Никнейм должен быть минимум 3 символа" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Пароль минимум 6 символов" });
  }

  // Проверка дубликатов
  if (UserModel.getByEmail(email)) {
    return res.status(400).json({ error: "Email уже зарегистрирован" });
  }
  if (UserModel.getByUsername(username)) {
    return res.status(400).json({ error: "Никнейм уже занят" });
  }

  // Referral — ищем пользователя по username
  let referredBy: string | undefined;
  if (referralCode) {
    const referrer = UserModel.getByUsername(referralCode);
    if (referrer) referredBy = referrer.id;
  }

  try {
    const user = UserModel.create({ username, email, password, referredBy, telegramId });
    const token = generateToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        balance: user.balance,
        totalEarned: user.totalEarned,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /auth/login
router.post("/login", (req: Request, res: Response) => {
  const { login, password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Введите пароль" });
  }
  if (!login) {
    return res.status(400).json({ error: "Введите email или логин" });
  }

  // Ищем по email или username
  let user = login ? UserModel.getByEmail(login) : null;
  if (!user && login) {
    user = UserModel.getByUsername(login);
  }
  if (!user) {
    return res.status(401).json({ error: "Неверный email/логин или пароль" });
  }

  if (user.banned) {
    return res.status(403).json({ error: "Аккаунт заблокирован" });
  }

  if (!UserModel.verifyPassword(user, password)) {
    return res.status(401).json({ error: "Неверный email или пароль" });
  }

  const token = generateToken(user);
  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      balance: user.balance,
      pendingBalance: user.pendingBalance,
      totalEarned: user.totalEarned,
      totalWithdrawn: user.totalWithdrawn,
    },
  });
});

// GET /auth/me
router.get("/me", requireAuth, (req: Request, res: Response) => {
  const u = req.user!;
  return res.json({
    id: u.id,
    username: u.username,
    email: u.email,
    telegramId: u.telegramId,
    balance: u.balance,
    pendingBalance: u.pendingBalance,
    totalEarned: u.totalEarned,
    totalWithdrawn: u.totalWithdrawn,
    isAdvertiser: u.isAdvertiser,
    createdAt: u.createdAt,
  });
});

export default router;
