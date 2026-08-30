import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config";
import { UserModel } from "../models/user";
import { db } from "../models/database";
import type { User } from "../models/types";

// Расширяем Request
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export interface JwtPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function authOptional(req: Request, res: Response, next: NextFunction) {
  let token = "";

  // 1. Authorization header
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7);
  }

  // 2. Cookie
  if (!token) {
    const cookies = req.headers.cookie || "";
    const match = cookies.match(/(?:^|;\s*)token=([^;]*)/);
    if (match) token = match[1];
  }

  // 3. URL query parameter (?token=xxx)
  if (!token) {
    token = (req.query.token as string) || "";
  }

  if (!token) return next();

  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = UserModel.getById(payload.userId);
    if (user && !user.banned) {
      req.user = user;
    }
  } catch {
    // invalid token — just continue without user
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  authOptional(req, res, () => {
    if (!req.user) {
      return res.status(401).json({ error: "Требуется авторизация" });
    }
    next();
  });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: "Доступ запрещён" });
    }
    next();
  });
}

export function generateToken(user: User): string {
  return jwt.sign(
    { userId: user.id },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Очистка просроченных сессий
export function cleanupExpiredSessions() {
  const now = Math.floor(Date.now() / 1000);
  db.prepare(`DELETE FROM sessions WHERE expires_at < ?`).run(now);
}

// Запуск очистки раз в час
setInterval(cleanupExpiredSessions, 3600 * 1000);
