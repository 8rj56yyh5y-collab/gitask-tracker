import { getDb } from "./db.ts";
import { personalCenterIds } from "./repo.ts";

// Лимиты по категориям на месяц: «Кафе — не больше 3 000 ₴». Считаются мои траты (личные деньги).

export interface CatBudget {
  categoryId: number;
  name: string;
  emoji: string;
  limit: number;
  spent: number;
  left: number;
  pct: number;
  /** ok — меньше 80%, near — 80–100%, over — больше лимита. */
  level: "ok" | "near" | "over";
}

export function setCategoryBudget(categoryId: number, amount: number | null) {
  if (amount && amount > 0) getDb().prepare("INSERT INTO category_budgets (category_id, amount) VALUES (?, ?) ON CONFLICT(category_id) DO UPDATE SET amount = excluded.amount").run(categoryId, amount);
  else getDb().prepare("DELETE FROM category_budgets WHERE category_id = ?").run(categoryId);
}

/** Все лимиты с тратами за месяц. allMoney — считать все траты, а не только личные (простой режим). */
export function categoryBudgets(now = new Date(), allMoney = false): CatBudget[] {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const ids = personalCenterIds();
  const scope = allMoney || !ids.length ? "" : ` AND (t.cost_center_id IS NULL OR t.cost_center_id IN (${ids.join(",")}))`;
  const rows = getDb()
    .prepare(
      `SELECT b.category_id AS id, b.amount AS lim, c.name, c.emoji,
         COALESCE((SELECT SUM(-t.amount) FROM transactions t WHERE t.category_id = b.category_id AND t.kind = 'expense' AND t.transit_id IS NULL
           AND t.occurred_at >= ? AND t.occurred_at < ?${scope}), 0) AS spent
       FROM category_budgets b JOIN categories c ON c.id = b.category_id ORDER BY c.sort, c.name`,
    )
    .all(from, to) as { id: number; lim: number; name: string; emoji: string; spent: number }[];
  return rows.map((r) => {
    const limit = Number(r.lim);
    const spent = Number(r.spent);
    const pct = limit ? Math.round((spent / limit) * 100) : 0;
    return { categoryId: Number(r.id), name: r.name, emoji: r.emoji, limit, spent, left: limit - spent, pct, level: spent > limit ? "over" : pct >= 80 ? "near" : "ok" };
  });
}
