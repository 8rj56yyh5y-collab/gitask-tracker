import { getDb } from "./db.ts";

// Копилки: человек откладывает на цель и видит, сколько осталось и сколько нужно в месяц.

export interface Goal {
  id: number;
  name: string;
  emoji: string;
  target: number;
  deadline: string | null;
  saved: number;
}

export interface GoalView extends Goal {
  left: number;
  pct: number;
  /** Сколько откладывать в месяц, чтобы успеть к сроку (null — срока нет или уже собрано). */
  perMonth: number | null;
  monthsLeft: number | null;
  done: boolean;
}

export function listGoals(): GoalView[] {
  const rows = getDb()
    .prepare(
      `SELECT g.id, g.name, g.emoji, g.target, g.deadline, COALESCE(SUM(m.amount), 0) AS saved
       FROM goals g LEFT JOIN goal_moves m ON m.goal_id = g.id
       WHERE g.archived = 0 GROUP BY g.id ORDER BY g.id`,
    )
    .all() as unknown as Goal[];
  return rows.map((g) => view({ ...g, id: Number(g.id), target: Number(g.target), saved: Number(g.saved) }));
}

export function getGoal(id: number): GoalView | null {
  return listGoals().find((g) => g.id === id) ?? null;
}

export function view(g: Goal, now = new Date()): GoalView {
  const left = Math.max(0, g.target - g.saved);
  const pct = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  let monthsLeft: number | null = null;
  let perMonth: number | null = null;
  if (g.deadline && left > 0) {
    const [y, m] = g.deadline.split("-").map(Number);
    monthsLeft = Math.max(1, (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth()) + 1);
    perMonth = Math.ceil(left / monthsLeft / 100) * 100;
  }
  return { ...g, left, pct, perMonth, monthsLeft, done: left === 0 };
}

export function createGoal(g: { name: string; emoji?: string; target: number; deadline?: string | null; start?: number }): number {
  const name = g.name.trim().slice(0, 60);
  if (!name) throw new Error("Назовите копилку: на что копите");
  if (!(g.target > 0)) throw new Error("Укажите, сколько нужно собрать");
  const r = getDb()
    .prepare("INSERT INTO goals (name, emoji, target, deadline) VALUES (?, ?, ?, ?)")
    .run(name, (g.emoji || "🎯").slice(0, 8), g.target, g.deadline || null);
  const id = Number(r.lastInsertRowid);
  if (g.start && g.start > 0) addToGoal(id, g.start, "уже было");
  return id;
}

/** Отложить (amount > 0) или взять из копилки (amount < 0). Больше, чем есть, взять нельзя. */
export function addToGoal(id: number, amount: number, note = "") {
  if (!amount) throw new Error("Укажите сумму");
  const g = getGoal(id);
  if (!g) throw new Error("Копилка не найдена");
  if (amount < 0 && -amount > g.saved) throw new Error("В копилке столько нет");
  getDb().prepare("INSERT INTO goal_moves (goal_id, amount, note) VALUES (?, ?, ?)").run(id, amount, note.slice(0, 100));
}

export function goalMoves(id: number) {
  return getDb().prepare("SELECT id, amount, note, at FROM goal_moves WHERE goal_id = ? ORDER BY at DESC, id DESC LIMIT 50").all(id) as {
    id: number;
    amount: number;
    note: string;
    at: string;
  }[];
}

export function archiveGoal(id: number) {
  getDb().prepare("UPDATE goals SET archived = 1 WHERE id = ?").run(id);
}

export function goalsTotal(): number {
  return listGoals().reduce((a, g) => a + g.saved, 0);
}
