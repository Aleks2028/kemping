import { Router } from "express";
import { TaskModel } from "../models/task";
import { requireAuth, requireAdmin } from "../middleware/auth";
import type { Request, Response } from "express";

const router = Router();

// GET /tasks — список активных заданий
router.get("/", requireAuth, (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = 20;
  const offset = (page - 1) * limit;

  const tasks = TaskModel.listActive(limit, offset);
  return res.json({ tasks, page });
});

// GET /tasks/:id
router.get("/:id", requireAuth, (req: Request, res: Response) => {
  const task = TaskModel.getById(req.params.id);
  if (!task) return res.status(404).json({ error: "Задание не найдено" });
  return res.json(task);
});

// POST /tasks/:id/start — начать выполнение задания
router.post("/:id/start", requireAuth, (req: Request, res: Response) => {
  try {
    const completion = TaskModel.startCompletion(req.params.id, req.user!.id);
    return res.status(201).json({ completion });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// POST /tasks/:id/submit — отправить доказательство (если требуется)
router.post("/:id/submit", requireAuth, (req: Request, res: Response) => {
  const { completionId, proofText, proofImage } = req.body;
  if (!completionId) return res.status(400).json({ error: "completionId required" });
  try {
    TaskModel.submitCompletion(completionId, proofText, proofImage);
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(400).json({ error: e.message });
  }
});

// GET /tasks/mine — задания пользователя (история)
router.get("/user/history", requireAuth, (req: Request, res: Response) => {
  const completions = TaskModel.listCompletionsByUser(req.user!.id);
  return res.json({ completions });
});

// POST /tasks (только рекламодатели и админы)
router.post("/", requireAdmin, (req: Request, res: Response) => {
  const { title, description, type, url, reward, totalSlots, requiresProof, proofInstructions, expiresAt } = req.body;

  if (!title || !url || !reward || !totalSlots) {
    return res.status(400).json({ error: "Заполните обязательные поля" });
  }

  if (reward < 10) { // минимум 10 центов
    return res.status(400).json({ error: "Минимальная награда 10 центов" });
  }

  try {
    const task = TaskModel.create({
      advertiserId: req.user!.id,
      title, description, type: type ?? "custom",
      url, reward: Number(reward), totalSlots: Number(totalSlots),
      requiresProof: !!requiresProof, proofInstructions,
      expiresAt: expiresAt ? Number(expiresAt) : undefined,
    });
    return res.status(201).json({ task });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
