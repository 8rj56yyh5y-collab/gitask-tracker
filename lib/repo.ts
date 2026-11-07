import { getDb } from "./db.ts";
import { detectBank } from "./banks.ts";
import { budgetStatus, forecastMonth, type BudgetStatus } from "./budget.ts";

export interface CostCenter {
  id: number;
  name: string;
  parent_id: number | null;
  color: string;
  monthly_budget: number;
  is_internal: number;
}

export interface Card {
  id: number;
  bank: string;
  last4: string;
  owner: string;
  kind: string;
  monthly_limit: number;
  mono_account_id: string | null;
  track_from?: string | null;
}

export interface Tx {
  id: number;
  occurred_at: string;
  amount: number;
  currency: string;
  card_id: number | null;
  cost_center_id: number | null;
  kind: string;
  for_whom: string;
  counterparty: string;
  description: string;
  source: string;
  card_label?: string | null;
  center_name?: string | null;
  center_color?: string | null;
}

type Row = Record<string, unknown>;
const rows = <T>(r: unknown[]) => r as T[];

export function monthBounds(d = new Date()): { from: string; to: string } {
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

// ---------- Категории ----------

export function listCenters(): CostCenter[] {
  return rows<CostCenter>(
    getDb().prepare("SELECT * FROM cost_centers WHERE archived = 0 ORDER BY parent_id IS NOT NULL, name").all(),
  );
}

/** Категории в порядке дерева, с уровнем вложенности. */
export function centerTree(): (CostCenter & { depth: number; path: string })[] {
  const all = listCenters();
  const out: (CostCenter & { depth: number; path: string })[] = [];
  const walk = (parent: number | null, depth: number, prefix: string) => {
    for (const c of all.filter((x) => x.parent_id === parent).sort((a, b) => a.name.localeCompare(b.name, "ru"))) {
      const p = prefix ? `${prefix} › ${c.name}` : c.name;
      out.push({ ...c, depth, path: p });
      walk(c.id, depth + 1, p);
    }
  };
  walk(null, 0, "");
  return out;
}

export function createCenter(name: string, parentId: number | null, color: string, budgetKop: number, internal: boolean) {
  getDb()
    .prepare("INSERT INTO cost_centers (name, parent_id, color, monthly_budget, is_internal) VALUES (?, ?, ?, ?, ?)")
    .run(name, parentId, color, budgetKop, internal ? 1 : 0);
}

/** Переименовать, перекрасить, перенести категорию. Нельзя вложить её саму в себя или в свою подкатегорию. */
export function updateCenter(id: number, c: { name: string; color: string; parentId: number | null; internal: boolean }) {
  const db = getDb();
  if (c.parentId !== null) {
    let p: number | null = c.parentId;
    const seen = new Set<number>();
    while (p !== null && !seen.has(p)) {
      if (p === id) throw new Error("Нельзя вложить категорию саму в себя");
      seen.add(p);
      const r = db.prepare("SELECT parent_id FROM cost_centers WHERE id = ?").get(p) as { parent_id: number | null } | undefined;
      p = r?.parent_id ?? null;
    }
  }
  db.prepare("UPDATE cost_centers SET name = ?, color = ?, parent_id = ?, is_internal = ? WHERE id = ?").run(c.name, c.color, c.parentId, c.internal ? 1 : 0, id);
}

export function restoreCenter(id: number) {
  getDb().prepare("UPDATE cost_centers SET archived = 0 WHERE id = ?").run(id);
}

export function listHiddenCenters(): CostCenter[] {
  return rows<CostCenter>(getDb().prepare("SELECT * FROM cost_centers WHERE archived = 1 ORDER BY name").all());
}

export function archiveCenter(id: number) {
  getDb().prepare("UPDATE cost_centers SET archived = 1 WHERE id = ?").run(id);
}

// ---------- Карты ----------

export function listCards(): Card[] {
  return rows<Card>(getDb().prepare("SELECT * FROM cards WHERE archived = 0 ORDER BY bank, last4").all());
}

export function createCard(c: Omit<Card, "id">) {
  getDb()
    .prepare("INSERT INTO cards (bank, last4, owner, kind, monthly_limit, mono_account_id) VALUES (?, ?, ?, ?, ?, ?)")
    .run(c.bank, c.last4, c.owner, c.kind, c.monthly_limit, c.mono_account_id);
}

export function updateCardLimit(id: number, limitKop: number) {
  getDb().prepare("UPDATE cards SET monthly_limit = ? WHERE id = ?").run(limitKop, id);
}

export function archiveCard(id: number) {
  getDb().prepare("UPDATE cards SET archived = 1 WHERE id = ?").run(id);
}

export function findCard(opts: { last4?: string | null; monoAccount?: string | null; hint?: string | null }): Card | null {
  const db = getDb();
  if (opts.monoAccount) {
    const r = db.prepare("SELECT * FROM cards WHERE mono_account_id = ? AND archived = 0").get(opts.monoAccount);
    if (r) return r as unknown as Card;
  }
  const last4 = opts.last4 ?? opts.hint?.match(/(\d{4})\D*$/)?.[1];
  if (last4) {
    const r = db.prepare("SELECT * FROM cards WHERE last4 = ? AND archived = 0").get(last4);
    if (r) return r as unknown as Card;
  }
  // Wallet передаёт название карты («Monobank Black»), а не номер: узнаём по банку,
  // если карта этого банка у вас одна.
  const bank = detectBank(opts.hint);
  if (bank) {
    const same = db.prepare("SELECT * FROM cards WHERE bank = ? AND archived = 0").all(bank);
    if (same.length === 1) return same[0] as unknown as Card;
  }
  return null;
}

/** Сколько списано с карты за текущий месяц (копейки, положительное число). */
export function cardUsage(): Map<number, number> {
  const { from, to } = monthBounds();
  const r = getDb()
    .prepare(
      `SELECT card_id, SUM(-amount) AS used FROM transactions
       WHERE amount < 0 AND card_id IS NOT NULL AND occurred_at >= ? AND occurred_at < ?
       GROUP BY card_id`,
    )
    .all(from, to) as Row[];
  return new Map(r.map((x) => [Number(x.card_id), Number(x.used)]));
}

// ---------- Операции ----------

const TX_SELECT = `
  SELECT t.*, c.bank || ' *' || c.last4 AS card_label, cc.name AS center_name, cc.color AS center_color
  FROM transactions t
  LEFT JOIN cards c ON c.id = t.card_id
  LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id`;

export interface NewTx {
  occurredAt?: string;
  amountKop: number; // со знаком
  currency?: string;
  cardId?: number | null;
  costCenterId?: number | null;
  kind?: "expense" | "income" | "internal";
  forWhom?: string;
  counterparty?: string;
  description?: string;
  source: string;
  externalId?: string | null;
  raw?: string | null;
}

/** Добавляет операцию. Возвращает id, или id уже существующей при дубле externalId. */
export function insertTx(t: NewTx): { id: number; duplicate: boolean } {
  const db = getDb();
  if (t.externalId) {
    const ex = db.prepare("SELECT id FROM transactions WHERE external_id = ?").get(t.externalId) as Row | undefined;
    if (ex) return { id: Number(ex.id), duplicate: true };
  }
  let kind = t.kind ?? (t.amountKop >= 0 ? "income" : "expense");
  if (t.costCenterId) {
    // Операция сразу в «Внутренние переводы» — не расход и не доход.
    const c = db.prepare("SELECT is_internal FROM cost_centers WHERE id = ?").get(t.costCenterId) as Row | undefined;
    if (c && Number(c.is_internal)) kind = "internal";
  }
  const res = db
    .prepare(
      `INSERT INTO transactions
        (occurred_at, amount, currency, card_id, cost_center_id, kind, for_whom, counterparty, description, source, external_id, raw, assigned_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      t.occurredAt ?? new Date().toISOString(),
      t.amountKop,
      t.currency ?? "UAH",
      t.cardId ?? null,
      t.costCenterId ?? null,
      kind,
      t.forWhom ?? "",
      t.counterparty ?? "",
      t.description ?? "",
      t.source,
      t.externalId ?? null,
      t.raw ?? null,
      t.costCenterId ? new Date().toISOString() : null,
    );
  return { id: Number(res.lastInsertRowid), duplicate: false };
}

export function getTx(id: number): Tx | null {
  return (getDb().prepare(`${TX_SELECT} WHERE t.id = ?`).get(id) as unknown as Tx) ?? null;
}

/** Неразнесённые: нет категории и это не внутренний перевод. */
export function listUnassigned(): Tx[] {
  return rows<Tx>(
    getDb()
      .prepare(`${TX_SELECT} WHERE t.cost_center_id IS NULL AND t.kind != 'internal' ORDER BY t.occurred_at DESC`)
      .all(),
  );
}

export function unassignedSummary(): { count: number; sum: number } {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(ABS(amount)), 0) AS s FROM transactions
       WHERE cost_center_id IS NULL AND kind != 'internal'`,
    )
    .get() as Row;
  return { count: Number(r.n), sum: Number(r.s) };
}

export function listRecent(limit = 50): Tx[] {
  return rows<Tx>(getDb().prepare(`${TX_SELECT} ORDER BY t.occurred_at DESC LIMIT ?`).all(limit));
}

export function assignTx(id: number, centerId: number, forWhom?: string, description?: string) {
  const db = getDb();
  const center = db.prepare("SELECT is_internal FROM cost_centers WHERE id = ?").get(centerId) as Row | undefined;
  if (!center) throw new Error("Категория не найдена");
  const tx = db.prepare("SELECT amount, kind FROM transactions WHERE id = ?").get(id) as Row | undefined;
  if (!tx) throw new Error("Операция не найдена");
  const kind = Number(center.is_internal) ? "internal" : Number(tx.amount) >= 0 ? "income" : "expense";
  db.prepare(
    `UPDATE transactions SET cost_center_id = ?, kind = ?, assigned_at = ?,
       for_whom = COALESCE(NULLIF(?, ''), for_whom), description = COALESCE(NULLIF(?, ''), description)
     WHERE id = ?`,
  ).run(centerId, kind, new Date().toISOString(), forWhom ?? "", description ?? "", id);
}

export function deleteTx(id: number) {
  getDb().prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

/**
 * Подсказка категорий: сначала те, куда раньше разносили этого контрагента/описание,
 * затем самые частые за последние 90 дней.
 */
export function suggestCenters(tx: Pick<Tx, "counterparty" | "description">, limit = 3): number[] {
  const db = getDb();
  const out: number[] = [];
  const key = (tx.counterparty || tx.description || "").trim();
  if (key) {
    const byKey = db
      .prepare(
        `SELECT cost_center_id AS id, COUNT(*) AS n FROM transactions
         WHERE cost_center_id IS NOT NULL AND (counterparty = ? OR description = ?)
         GROUP BY cost_center_id ORDER BY n DESC LIMIT ?`,
      )
      .all(key, key, limit) as Row[];
    out.push(...byKey.map((r) => Number(r.id)));
  }
  if (out.length < limit) {
    const since = new Date(Date.now() - 90 * 864e5).toISOString();
    const freq = db
      .prepare(
        `SELECT cost_center_id AS id, COUNT(*) AS n FROM transactions
         WHERE cost_center_id IS NOT NULL AND occurred_at >= ?
         GROUP BY cost_center_id ORDER BY n DESC LIMIT ?`,
      )
      .all(since, limit * 2) as Row[];
    for (const r of freq) if (!out.includes(Number(r.id)) && out.length < limit) out.push(Number(r.id));
  }
  return out;
}

// ---------- Отчёты ----------

export interface CenterStat {
  id: number;
  name: string;
  color: string;
  parent_id: number | null;
  is_internal: number;
  archived: number;
  /** Расход за месяц, копейки, включая все вложенные категории. */
  spent: number;
  budget: number;
  forecast: number;
  early: boolean;
  status: BudgetStatus;
}

/** Расходы, прогноз и статус лимита по каждому категории за месяц (с учётом вложенных). */
export function centerStats(today = new Date()): Map<number, CenterStat> {
  const { from, to } = monthBounds(today);
  // Берём и скрытые категории: если по ним были расходы, деньги не должны «исчезнуть» из отчёта.
  const centers = rows<CostCenter & { archived: number }>(getDb().prepare("SELECT * FROM cost_centers").all());
  const direct = getDb()
    .prepare(
      `SELECT cost_center_id AS id, SUM(-amount) AS s FROM transactions
       WHERE kind = 'expense' AND cost_center_id IS NOT NULL AND occurred_at >= ? AND occurred_at < ?
       GROUP BY cost_center_id`,
    )
    .all(from, to) as Row[];
  const byId = new Map(centers.map((c) => [c.id, c]));
  const totals = new Map<number, number>();
  for (const r of direct) {
    // Расход идёт в саму категорию и во все её родительские.
    let c = byId.get(Number(r.id));
    const seen = new Set<number>();
    while (c && !seen.has(c.id)) {
      seen.add(c.id);
      totals.set(c.id, (totals.get(c.id) ?? 0) + Number(r.s));
      c = c.parent_id ? byId.get(c.parent_id) : undefined;
    }
  }
  const out = new Map<number, CenterStat>();
  for (const c of centers) {
    const spent = totals.get(c.id) ?? 0;
    const { forecast, early } = forecastMonth(spent, today);
    out.set(c.id, {
      id: c.id,
      name: c.archived ? `${c.name} (скрыто)` : c.name,
      color: c.color,
      parent_id: c.parent_id && byId.has(c.parent_id) ? c.parent_id : null,
      is_internal: c.is_internal,
      archived: c.archived,
      spent,
      budget: c.monthly_budget,
      forecast,
      early,
      status: budgetStatus(spent, c.monthly_budget, forecast),
    });
  }
  return out;
}

const visible = (s: CenterStat) => !s.is_internal && (!s.archived || s.spent > 0);

/** Корневые категории за месяц (вложенные уже суммированы в родителя). */
export function monthSpendByCenter(today = new Date()): CenterStat[] {
  return [...centerStats(today).values()]
    .filter((s) => s.parent_id === null && visible(s))
    .sort((a, b) => b.spent - a.spent);
}

/** Прямые категории внутри данного. */
export function childStats(parentId: number, today = new Date()): CenterStat[] {
  return [...centerStats(today).values()]
    .filter((s) => s.parent_id === parentId && visible(s))
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, "ru"));
}

/** Категории любого уровня, где лимит превышен или будет превышен при текущем темпе. */
export function budgetAlerts(today = new Date()): CenterStat[] {
  return [...centerStats(today).values()]
    .filter((s) => (s.status === "over" || s.status === "pace") && visible(s))
    .sort((a, b) => (a.status === b.status ? b.forecast - b.budget - (a.forecast - a.budget) : a.status === "over" ? -1 : 1));
}

/** id категории и всех вложенных. */
function descendantIds(id: number): number[] {
  const all = rows<{ id: number; parent_id: number | null }>(getDb().prepare("SELECT id, parent_id FROM cost_centers").all());
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of all) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/** Операции категории (с вложенными) за текущий месяц. */
export function centerTransactions(id: number, today = new Date()): Tx[] {
  const { from, to } = monthBounds(today);
  const ids = descendantIds(id);
  return rows<Tx>(
    getDb()
      .prepare(
        `${TX_SELECT} WHERE t.cost_center_id IN (${ids.map(() => "?").join(",")})
         AND t.occurred_at >= ? AND t.occurred_at < ? ORDER BY t.occurred_at DESC`,
      )
      .all(...ids, from, to),
  );
}

export function getCenter(id: number): (CostCenter & { archived: number }) | null {
  return (getDb().prepare("SELECT * FROM cost_centers WHERE id = ?").get(id) as unknown as CostCenter & { archived: number }) ?? null;
}

export function setCenterBudget(id: number, budgetKop: number) {
  getDb().prepare("UPDATE cost_centers SET monthly_budget = ? WHERE id = ?").run(Math.max(0, budgetKop), id);
}

// ---------- Аналитика по месяцам ----------

/** "2026-11" → дата внутри этого месяца (для текущего — сегодня, для прошлых — последний день). */
export function monthDate(key: string | null | undefined, now = new Date()): Date {
  const m = key?.match(/^(\d{4})-(\d{2})$/);
  if (!m) return now;
  const y = Number(m[1]);
  const mon = Number(m[2]) - 1;
  if (y === now.getFullYear() && mon === now.getMonth()) return now;
  if (new Date(y, mon, 1) > now) return now;
  return new Date(y, mon + 1, 0, 12);
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta + 1, 0, 12);
}

export interface MonthTotal {
  key: string;
  expense: number;
  income: number;
}

/** Расходы и поступления по месяцам: `count` месяцев, заканчивая месяцем `end`. */
export function monthlyTotals(count = 12, end = new Date()): MonthTotal[] {
  const out: MonthTotal[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = shiftMonth(end, -i);
    const { from, to } = monthBounds(d);
    const r = getDb()
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN kind = 'expense' THEN -amount END), 0) AS e,
                COALESCE(SUM(CASE WHEN kind = 'income' THEN amount END), 0) AS i
         FROM transactions WHERE occurred_at >= ? AND occurred_at < ?`,
      )
      .get(from, to) as Row;
    out.push({ key: monthKey(d), expense: Number(r.e), income: Number(r.i) });
  }
  return out;
}

export interface CategoryCompare {
  id: number;
  name: string;
  color: string;
  current: number;
  previous: number;
  /** Изменение в процентах; null, если в прошлом месяце расходов не было. */
  changePct: number | null;
}

/** Сравнение расходов по категориям верхнего уровня: выбранный месяц против предыдущего. */
export function compareWithPrevMonth(d: Date): CategoryCompare[] {
  const cur = centerStats(d);
  const prev = centerStats(shiftMonth(d, -1));
  return [...cur.values()]
    .filter((s) => s.parent_id === null && !s.is_internal)
    .map((s) => {
      const p = prev.get(s.id)?.spent ?? 0;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        current: s.spent,
        previous: p,
        changePct: p > 0 ? Math.round(((s.spent - p) / p) * 100) : null,
      };
    })
    .filter((c) => c.current > 0 || c.previous > 0)
    .sort((a, b) => b.current - a.current);
}

export function getAiReport(month: string): { text: string; created_at: string } | null {
  return (getDb().prepare("SELECT text, created_at FROM ai_reports WHERE month = ?").get(month) as { text: string; created_at: string }) ?? null;
}

export function saveAiReport(month: string, text: string) {
  getDb()
    .prepare("INSERT INTO ai_reports (month, text) VALUES (?, ?) ON CONFLICT(month) DO UPDATE SET text = excluded.text, created_at = datetime('now')")
    .run(month, text);
}
