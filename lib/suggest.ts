import { getDb } from "./db.ts";
import { suggestCategory } from "./ai.ts";
import { categoriesFromHistory, listCategories } from "./categories.ts";
import { getTx } from "./repo.ts";

/**
 * Подсказка категории для новой операции: сначала по истории (так уже записывали этот магазин),
 * если истории нет — спрашиваем ИИ. Результат сохраняется в операции (ai_category_id, ai_note).
 */
export async function suggestForTx(txId: number): Promise<void> {
  const tx = getTx(txId);
  if (!tx || tx.kind === "internal" || tx.amount >= 0 || tx.category_id) return;
  const fromHistory = categoriesFromHistory(tx, 1)[0];
  if (fromHistory) {
    getDb().prepare("UPDATE transactions SET ai_category_id = ? WHERE id = ?").run(fromHistory, txId);
    return;
  }
  const s = await suggestCategory(tx, listCategories().map((c) => ({ id: c.id, name: c.name })));
  if (s) getDb().prepare("UPDATE transactions SET ai_category_id = ?, ai_note = ? WHERE id = ?").run(s.categoryId, s.note || null, txId);
}
