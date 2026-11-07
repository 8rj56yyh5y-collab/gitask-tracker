import { getDb } from "./db.ts";
import { internalCenterId } from "./repo.ts";

// Транзит — чужие деньги, которые прошли через меня: снял в банке деньги компании и отдал.
// Пока не отдал — они «заморожены»: видны отдельно, не считаются ни доходом, ни расходом.

export interface Transit {
  id: number;
  title: string;
  amount: number;
  note: string;
  created_at: string;
  done_at: string | null;
  /** Связанные операции из банка/кассы. */
  linked: number;
}

const SELECT = `SELECT tr.*, (SELECT COUNT(*) FROM transactions t WHERE t.transit_id = tr.id) AS linked FROM transits tr`;

export function createTransit(t: { title: string; amountKop: number; note?: string }): number {
  if (!t.title.trim()) throw new Error("Напишите, что это за деньги");
  if (!(t.amountKop > 0)) throw new Error("Укажите сумму");
  const r = getDb().prepare("INSERT INTO transits (title, amount, note) VALUES (?, ?, ?)").run(t.title.trim(), t.amountKop, t.note ?? "");
  return Number(r.lastInsertRowid);
}

export function listTransits(open = true, limit = 100): Transit[] {
  return getDb()
    .prepare(`${SELECT} WHERE tr.done_at IS ${open ? "" : "NOT "}NULL ORDER BY ${open ? "tr.created_at" : "tr.done_at DESC"} LIMIT ?`)
    .all(limit) as unknown as Transit[];
}

export function getTransit(id: number): Transit | null {
  return (getDb().prepare(`${SELECT} WHERE tr.id = ?`).get(id) as unknown as Transit) ?? null;
}

export function finishTransit(id: number, done = true) {
  getDb().prepare("UPDATE transits SET done_at = ? WHERE id = ?").run(done ? new Date().toISOString() : null, id);
}

export function deleteTransit(id: number) {
  const db = getDb();
  db.prepare("UPDATE transactions SET transit_id = NULL WHERE transit_id = ?").run(id);
  db.prepare("DELETE FROM transits WHERE id = ?").run(id);
}

/** Сумма денег в транзите (не отданных). */
export function transitOpenSum(): number {
  const r = getDb().prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM transits WHERE done_at IS NULL").get() as { s: number };
  return Number(r.s);
}

/**
 * Операция из банка относится к транзиту (например, сняли наличные компании с карты):
 * она уходит во «Внутренние переводы» — не доход и не расход.
 */
export function linkTxToTransit(txId: number, transitId: number) {
  getDb()
    .prepare("UPDATE transactions SET transit_id = ?, kind = 'internal', cost_center_id = ?, assigned_at = COALESCE(assigned_at, ?) WHERE id = ?")
    .run(transitId, internalCenterId(), new Date().toISOString(), txId);
}

export function transitTransactions(id: number) {
  return getDb()
    .prepare("SELECT id, occurred_at, amount, counterparty, description FROM transactions WHERE transit_id = ? ORDER BY occurred_at")
    .all(id) as { id: number; occurred_at: string; amount: number; counterparty: string; description: string }[];
}
