import { getDb } from "./db.ts";

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

// ---------- Подразделения ----------

export function listCenters(): CostCenter[] {
  return rows<CostCenter>(
    getDb().prepare("SELECT * FROM cost_centers WHERE archived = 0 ORDER BY parent_id IS NOT NULL, name").all(),
  );
}

/** Подразделения в порядке дерева, с уровнем вложенности. */
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
  const kind = t.kind ?? (t.amountKop >= 0 ? "income" : "expense");
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

/** Неразнесённые: нет подразделения и это не внутренний перевод. */
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
  if (!center) throw new Error("Подразделение не найдено");
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
 * Подсказка подразделений: сначала те, куда раньше разносили этого контрагента/описание,
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

export interface CenterSpend {
  id: number;
  name: string;
  color: string;
  spent: number;
  budget: number;
  forecast: number;
}

/** Расходы за текущий месяц по корневым подразделениям (дочерние суммируются в родителя). */
export function monthSpendByCenter(today = new Date()): CenterSpend[] {
  const { from, to } = monthBounds(today);
  const centers = listCenters();
  const spent = getDb()
    .prepare(
      `SELECT cost_center_id AS id, SUM(-amount) AS s FROM transactions
       WHERE kind = 'expense' AND cost_center_id IS NOT NULL AND occurred_at >= ? AND occurred_at < ?
       GROUP BY cost_center_id`,
    )
    .all(from, to) as Row[];
  const byId = new Map(centers.map((c) => [c.id, c]));
  const rootOf = (id: number): number => {
    let c = byId.get(id);
    while (c?.parent_id && byId.has(c.parent_id)) c = byId.get(c.parent_id);
    return c?.id ?? id;
  };
  const totals = new Map<number, number>();
  for (const r of spent) {
    const root = rootOf(Number(r.id));
    totals.set(root, (totals.get(root) ?? 0) + Number(r.s));
  }
  const day = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return centers
    .filter((c) => c.parent_id === null && !c.is_internal)
    .map((c) => {
      const s = totals.get(c.id) ?? 0;
      return {
        id: c.id,
        name: c.name,
        color: c.color,
        spent: s,
        budget: c.monthly_budget,
        forecast: Math.round((s / day) * daysInMonth),
      };
    })
    .sort((a, b) => b.spent - a.spent);
}
