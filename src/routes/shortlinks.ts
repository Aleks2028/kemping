import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "../models/database";
import { requireAuth } from "../middleware/auth";
import { UserModel } from "../models/user";

const router = Router();

// Функция для генерации короткого кода
function generateCode(length = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// POST /api/urls/shorten — создать короткую ссылку
router.post("/shorten", requireAuth, (req: Request, res: Response) => {
  const { targetUrl, code: customCode, expiresAt } = req.body;

  if (!targetUrl) return res.status(400).json({ error: "Не указана целевая ссылка" });

  let code = customCode;
  if (code) {
    // Проверяем, что кастомный код свободен
    const exists = db.prepare("SELECT id FROM url_redirects WHERE code = ?").get(code);
    if (exists) return res.status(400).json({ error: "Этот короткий код уже занят" });
  } else {
    // Генерируем уникальный
    do {
      code = generateCode();
    } while (db.prepare("SELECT id FROM url_redirects WHERE code = ?").get(code));
  }

  const now = Math.floor(Date.now() / 1000);
  const id = uuidv4();

  db.prepare(`
    INSERT INTO url_redirects (id, code, target_url, created_by, clicks, created_at, expires_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, code, targetUrl, req.user!.id, now, expiresAt ?? null);

  res.json({
    success: true,
    id,
    code,
    shortUrl: `https://${req.get("host") || "kemping-production.up.railway.app"}/${code}`,
  });
});

// GET /api/urls/my — список ссылок пользователя
router.get("/my", requireAuth, (req: Request, res: Response) => {
  const links = db.prepare(`
    SELECT id, code, target_url, clicks, created_at, expires_at
    FROM url_redirects
    WHERE created_by = ?
    ORDER BY created_at DESC
  `).all(req.user!.id) as any[];

  res.json({ links });
});

// DELETE /api/urls/:code — удалить ссылку
router.delete("/:code", requireAuth, (req: Request, res: Response) => {
  const { code } = req.params;

  const result = db.prepare("DELETE FROM url_redirects WHERE code = ? AND created_by = ?").run(code, req.user!.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: "Ссылка не найдена или не принадлежит вам" });
  }

  res.json({ success: true });
});

// GET /:code — перенаправление (обрабатывается в app.ts)
export default router;

// Экспортируем функцию для использования в app.ts
export { generateCode };
