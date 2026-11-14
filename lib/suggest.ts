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

// ---------- Полная подсказка: «Верно ✓» одним нажатием ----------

export interface FullSuggestion {
  centerId: number;
  categoryId: number | null;
  note: string;
  /** history — так уже записывали этот магазин; ai — подсказал ИИ; usual — самое частое направление. */
  source: "history" | "ai" | "usual";
  /** Карта, если в операции её нет: та же, что в прошлый раз у этого магазина, или единственная карта. */
  cardId: number | null;
}

/** С какой карты, скорее всего, оплачено: как в прошлый раз у этого магазина; если карта одна — она. */
function guessCard(tx: { id: number; counterparty: string; card_id?: number | null; cashbox_id?: number | null }): number | null {
  if (tx.card_id || tx.cashbox_id) return null;
  const db = getDb();
  const key = (tx.counterparty || "").trim();
  if (key) {
    const r = db
      .prepare("SELECT t.card_id FROM transactions t JOIN cards c ON c.id = t.card_id AND c.archived = 0 WHERE t.counterparty = ? AND t.id != ? ORDER BY t.occurred_at DESC LIMIT 1")
      .get(key, tx.id) as { card_id: number } | undefined;
    if (r) return Number(r.card_id);
  }
  const main = db.prepare("SELECT id FROM cards WHERE parent_id IS NULL AND archived = 0").all() as { id: number }[];
  return main.length === 1 ? Number(main[0].id) : null;
}

/**
 * Что D&N предлагает для операции целиком: направление, категорию и комментарий.
 * 1) Этот магазин уже записывали — берём как в прошлый раз.
 * 2) Иначе — категория и комментарий от ИИ, направление — личное (или самое частое).
 * null — подсказать нечего.
 */
export function fullSuggestion(tx: { id: number; counterparty: string; amount: number; ai_category_id?: number | null; ai_note?: string | null; kind: string; card_id?: number | null; cashbox_id?: number | null }): FullSuggestion | null {
  if (tx.kind === "internal") return null;
  const db = getDb();
  const key = (tx.counterparty || "").trim();
  if (key) {
    const last = db
      .prepare(
        `SELECT cost_center_id, category_id, description FROM transactions
         WHERE counterparty = ? AND id != ? AND cost_center_id IS NOT NULL AND needs_note = 0 AND kind != 'internal'
           AND ((amount < 0) = (? < 0))
         ORDER BY occurred_at DESC LIMIT 1`,
      )
      .get(key, tx.id, tx.amount) as { cost_center_id: number; category_id: number | null; description: string } | undefined;
    if (last) return { centerId: Number(last.cost_center_id), categoryId: last.category_id, note: last.description || "", source: "history", cardId: guessCard(tx) };
  }
  if (tx.amount < 0 && tx.ai_category_id) {
    const personal = db.prepare("SELECT id FROM cost_centers WHERE is_personal = 1 AND archived = 0 AND is_internal = 0 ORDER BY id LIMIT 1").get() as { id: number } | undefined;
    const usual = db
      .prepare("SELECT cost_center_id AS id FROM transactions WHERE cost_center_id IS NOT NULL AND kind = 'expense' GROUP BY cost_center_id ORDER BY COUNT(*) DESC LIMIT 1")
      .get() as { id: number } | undefined;
    const centerId = personal?.id ?? usual?.id;
    if (centerId) return { centerId: Number(centerId), categoryId: tx.ai_category_id, note: tx.ai_note ?? "", source: personal ? "ai" : "usual", cardId: guessCard(tx) };
  }
  return null;
}

/**
 * Принять подсказку. Если комментария в подсказке нет — направление и категория записываются,
 * а операция ждёт комментарий (needs_note). Возвращает true, если операция записана полностью.
 */
export function acceptSuggestion(txId: number, s: FullSuggestion): boolean {
  const db = getDb();
  db.prepare("UPDATE transactions SET cost_center_id = ?, category_id = COALESCE(?, category_id), assigned_at = ?, kind = CASE WHEN kind = 'internal' THEN kind WHEN amount < 0 THEN 'expense' ELSE 'income' END WHERE id = ?").run(
    s.centerId, s.categoryId, new Date().toISOString(), txId,
  );
  if (s.cardId) db.prepare("UPDATE transactions SET card_id = ? WHERE id = ? AND card_id IS NULL AND cashbox_id IS NULL").run(s.cardId, txId);
  const internal = db.prepare("SELECT is_internal FROM cost_centers WHERE id = ?").get(s.centerId) as { is_internal: number } | undefined;
  if (internal?.is_internal) db.prepare("UPDATE transactions SET kind = 'internal' WHERE id = ?").run(txId);
  if (s.note.trim()) {
    db.prepare("UPDATE transactions SET description = ?, needs_note = 0 WHERE id = ?").run(s.note.trim().slice(0, 200), txId);
    return true;
  }
  db.prepare("UPDATE transactions SET needs_note = 1 WHERE id = ?").run(txId);
  return false;
}
