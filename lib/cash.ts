import { getDb } from "./db.ts";
import { centerTree, insertTx, internalCenterId } from "./repo.ts";

// Кассы (наличные): у каждой свой остаток. Движения кассы — обычные операции с cashbox_id.

export interface Cashbox {
  id: number;
  name: string;
  owner: string;
  color: string;
  opening: number;
  archived: number;
  /** Категория по умолчанию для расходов из кассы. */
  center_id: number | null;
  /** 1 — «касса = направление»: считает все операции своего направления, не только свои движения. */
  pot?: number;
}

type Row = Record<string, unknown>;

export function listCashboxes(): Cashbox[] {
  return getDb().prepare("SELECT * FROM cashboxes WHERE archived = 0 ORDER BY id").all() as unknown as Cashbox[];
}

export function getCashbox(id: number): Cashbox | null {
  return (getDb().prepare("SELECT * FROM cashboxes WHERE id = ?").get(id) as unknown as Cashbox) ?? null;
}

/** Цвета для новых касс — по очереди, чтобы кассы не были одинаковыми. */
export const CASH_COLORS = ["#16a34a", "#2563eb", "#9333ea", "#ea580c", "#0d9488", "#db2777", "#ca8a04", "#4f46e5", "#dc2626", "#0891b2"];

/** Следующий свободный цвет (тот, которого ещё нет у касс). */
export function nextCashColor(): string {
  const used = new Set((getDb().prepare("SELECT color FROM cashboxes WHERE archived = 0").all() as { color: string }[]).map((r) => r.color.toLowerCase()));
  return CASH_COLORS.find((c) => !used.has(c)) ?? CASH_COLORS[used.size % CASH_COLORS.length];
}

/** Название без слова «касса» и без знаков: «Касса D» → «d». */
export const boxNameKey = (s: string) => s.toLowerCase().replace(/касс[аыи]?/g, "").replace(/[^a-zа-яёіїєґ0-9]/gi, "");

/**
 * Новая касса. Если направление не выбрано, но есть направление с таким же названием — привязываем к нему.
 * Касса направления («Касса D» у направления «D», или созданная со страницы отчёта) — сразу «касса = направление».
 */
export function createCashbox(c: { name: string; owner?: string; color?: string; opening?: number; centerId?: number | null; pot?: boolean }): number {
  const db = getDb();
  let centerId = c.centerId ?? null;
  const key = boxNameKey(c.name);
  if (!centerId && key) {
    const same = centerTree().filter((x) => !x.is_internal && boxNameKey(x.name) === key);
    if (same.length === 1) centerId = same[0].id;
  }
  const center = centerId ? centerTree().find((x) => x.id === centerId) : null;
  const pot = c.pot ?? Boolean(center && key && boxNameKey(center.name) === key);
  const r = db
    .prepare("INSERT INTO cashboxes (name, owner, color, opening, center_id, pot) VALUES (?, ?, ?, ?, ?, ?)")
    .run(c.name, c.owner ?? "", c.color || nextCashColor(), c.opening ?? 0, centerId, pot ? 1 : 0);
  return Number(r.lastInsertRowid);
}

export function updateCashbox(id: number, c: { name: string; owner: string; color: string; opening: number; centerId?: number | null }) {
  getDb()
    .prepare("UPDATE cashboxes SET name = ?, owner = ?, color = ?, opening = ?, center_id = ? WHERE id = ?")
    .run(c.name, c.owner, c.color, c.opening, c.centerId ?? null, id);
}

export function archiveCashbox(id: number) {
  getDb().prepare("UPDATE cashboxes SET archived = 1 WHERE id = ?").run(id);
}

/** Направление и все вложенные в него. */
function centerSubtree(id: number): number[] {
  const all = centerTree();
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of all) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/**
 * Какие операции относятся к кассе (условие SQL для таблицы `t`).
 * Обычная касса — только её движения. «Касса = направление» — ещё и все траты и приходы её направления
 * (с карт тоже), кроме переводов и чужих денег. Операция, которая и в кассе, и в направлении, считается один раз.
 */
export function boxScope(b: Pick<Cashbox, "id" | "center_id" | "pot">, alias = "t"): string {
  const id = Number(b.id);
  if (!b.pot || !b.center_id) return `${alias}.cashbox_id = ${id}`;
  const ids = centerSubtree(Number(b.center_id)).join(",");
  return `(${alias}.cashbox_id = ${id} OR (${alias}.cost_center_id IN (${ids}) AND ${alias}.kind != 'internal' AND ${alias}.transit_id IS NULL))`;
}

/** Остатки всех касс: начальный остаток + все приходы и расходы (у «касса = направление» — всего направления). */
export function cashBalances(): Map<number, number> {
  const db = getDb();
  const out = new Map<number, number>();
  for (const b of db.prepare("SELECT id, opening, center_id, pot FROM cashboxes").all() as unknown as Cashbox[]) {
    const r = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t WHERE ${boxScope(b)}`).get() as { s: number };
    out.set(Number(b.id), Number(b.opening) + Number(r.s));
  }
  return out;
}

/** Включить или выключить «касса = направление». */
export function setCashboxPot(id: number, on: boolean) {
  getDb().prepare("UPDATE cashboxes SET pot = ? WHERE id = ?").run(on ? 1 : 0, id);
}

export interface CashMove {
  amountKop: number; // со знаком: + приход, − расход
  note?: string;
  counterparty?: string;
  centerId?: number | null;
  at?: string;
  planId?: number | null;
}

/**
 * Приход или расход кассы. Без выбранного направления — идёт в направление кассы (и приход, и расход);
 * если и у кассы её нет — попадёт в «Нужно записать», как любая операция.
 */
export function cashMove(cashboxId: number, m: CashMove): number {
  const boxCenter = m.centerId == null ? (getCashbox(cashboxId)?.center_id ?? null) : null;
  return insertTx({
    amountKop: m.amountKop,
    cashboxId,
    costCenterId: m.centerId ?? boxCenter,
    counterparty: m.counterparty ?? "",
    description: m.note ?? "",
    occurredAt: m.at,
    planId: m.planId ?? null,
    source: "manual",
  }).id;
}

export type Account = { card: number } | { cashbox: number };

/** Перевод между кассами и картами: две операции «внутренний перевод», не расход и не доход. */
export function transfer(from: Account, to: Account, amountKop: number, note = "", at?: string): [number, number] {
  if (amountKop <= 0) throw new Error("Сумма перевода должна быть больше нуля");
  const center = internalCenterId();
  const base = { kind: "internal" as const, costCenterId: center, description: note, occurredAt: at, source: "manual" };
  const a = insertTx({ ...base, amountKop: -amountKop, ...side(from), counterparty: "Перевод" });
  const b = insertTx({ ...base, amountKop, ...side(to), counterparty: "Перевод" });
  return [a.id, b.id];
}

function side(a: Account) {
  return "card" in a ? { cardId: a.card, cashboxId: null } : { cardId: null, cashboxId: a.cashbox };
}

/** «card:5» / «cash:2» → счёт (для форм). */
export function parseAccount(v: string): Account | null {
  const m = String(v || "").match(/^(card|cash):(\d+)$/);
  if (!m) return null;
  return m[1] === "card" ? { card: Number(m[2]) } : { cashbox: Number(m[2]) };
}

// ---------- Аналитика кассы ----------

export interface CashStats {
  balance: number;
  monthIn: number;
  monthOut: number;
  /** Приход − расход за месяц. */
  monthNet: number;
  /** Сколько дней есть данные (не больше 30) — по ним считается прогноз. */
  dataDays: number;
  /** Средний итог в день за последние dataDays дней. */
  perDay: number;
  /** Прогноз остатка на конец месяца (null — данных пока мало). */
  forecastEnd: number | null;
  /** Через сколько дней прогноз станет точным (30 дней данных). */
  daysToAccurate: number;
  /** Последние 6 месяцев: приход и расход. */
  months: { key: string; label: string; in: number; out: number }[];
}

const DAY_MS = 864e5;

export function cashStats(id: number, now = new Date()): CashStats {
  const db = getDb();
  const balance = cashBalances().get(id) ?? 0;
  const box = getCashbox(id);
  const where = box ? boxScope(box) : `t.cashbox_id = ${Number(id)}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const sum = (from: Date, to: Date) =>
    db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS i, COALESCE(SUM(CASE WHEN amount < 0 THEN -amount END), 0) AS o
         FROM transactions t WHERE ${where} AND t.occurred_at >= ? AND t.occurred_at < ?`,
      )
      .get(from.toISOString(), to.toISOString()) as { i: number; o: number };
  const m = sum(monthStart, nextMonth);
  const first = db.prepare(`SELECT MIN(t.occurred_at) AS f FROM transactions t WHERE ${where}`).get() as { f: string | null };
  const since = first.f ? Math.max(1, Math.ceil((now.getTime() - new Date(first.f).getTime()) / DAY_MS)) : 0;
  const dataDays = Math.min(30, since);
  let perDay = 0;
  if (dataDays > 0) {
    const w = sum(new Date(now.getTime() - dataDays * DAY_MS), new Date(now.getTime() + 1));
    perDay = Math.round((Number(w.i) - Number(w.o)) / dataDays);
  }
  const daysLeft = Math.max(0, Math.ceil((nextMonth.getTime() - now.getTime()) / DAY_MS) - 1);
  const months: CashStats["months"] = [];
  for (let k = 5; k >= 0; k--) {
    const a = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const b = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    const s = sum(a, b);
    const label = a.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "");
    months.push({ key: `${a.getFullYear()}-${a.getMonth()}`, label, in: Number(s.i), out: Number(s.o) });
  }
  return {
    balance,
    monthIn: Number(m.i),
    monthOut: Number(m.o),
    monthNet: Number(m.i) - Number(m.o),
    dataDays,
    perDay,
    // Прогноз — от 7 дней данных; до 30 — предварительный.
    forecastEnd: dataDays >= 7 ? balance + perDay * daysLeft : null,
    daysToAccurate: Math.max(0, 30 - since),
    months,
  };
}

/** Итоги всех касс за месяц: приход и расход по каждой. */
export function cashMonthTotals(now = new Date()): Map<number, { in: number; out: number }> {
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const db = getDb();
  const out = new Map<number, { in: number; out: number }>();
  for (const b of listCashboxes()) {
    const r = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount END), 0) AS i, COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount END), 0) AS o
         FROM transactions t WHERE ${boxScope(b)} AND t.occurred_at >= ? AND t.occurred_at < ?`,
      )
      .get(from, to) as { i: number; o: number };
    out.set(b.id, { in: Number(r.i), out: Number(r.o) });
  }
  return out;
}
