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
  is_personal?: number;
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
  color?: string | null;
  badge?: string | null;
  archived?: number;
  parent_id?: number | null;
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
  card_bank?: string | null;
  card_color?: string | null;
  card_badge?: string | null;
  cashbox_id?: number | null;
  raw?: string | null;
  cashbox_name?: string | null;
  plan_id?: number | null;
  sale_id?: number | null;
  transit_id?: number | null;
  income_kind?: string | null;
  category_id?: number | null;
  ai_category_id?: number | null;
  ai_note?: string | null;
  needs_note?: number;
  assigned_at?: string | null;
  category_name?: string | null;
  category_emoji?: string | null;
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

export function createCenter(name: string, parentId: number | null, color: string, budgetKop: number, internal: boolean): number {
  const r = getDb()
    .prepare("INSERT INTO cost_centers (name, parent_id, color, monthly_budget, is_internal) VALUES (?, ?, ?, ?, ?)")
    .run(name, parentId, color, budgetKop, internal ? 1 : 0);
  return Number(r.lastInsertRowid);
}

/** Переименовать, перекрасить, перенести категорию. Нельзя вложить её саму в себя или в свою подкатегорию. */
export function updateCenter(id: number, c: { name: string; color: string; parentId: number | null; internal: boolean; personal?: boolean }) {
  const db = getDb();
  if (c.parentId !== null) {
    let p: number | null = c.parentId;
    const seen = new Set<number>();
    while (p !== null && !seen.has(p)) {
      if (p === id) throw new Error("Нельзя вложить направление само в себя");
      seen.add(p);
      const r = db.prepare("SELECT parent_id FROM cost_centers WHERE id = ?").get(p) as { parent_id: number | null } | undefined;
      p = r?.parent_id ?? null;
    }
  }
  db.prepare("UPDATE cost_centers SET name = ?, color = ?, parent_id = ?, is_internal = ?, is_personal = COALESCE(?, is_personal) WHERE id = ?").run(
    c.name, c.color, c.parentId, c.internal ? 1 : 0, c.personal === undefined ? null : c.personal ? 1 : 0, id,
  );
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

/** Подключён ли Monobank (есть карты с привязанным счётом). */
export function monobankConnected(): boolean {
  return Boolean(getDb().prepare("SELECT 1 FROM cards WHERE mono_account_id IS NOT NULL AND archived = 0 LIMIT 1").get());
}

/** Основные карты (без дополнительных, которые входят в другую карту). */
export function listMainCards(): Card[] {
  const all = listCards();
  const ids = new Set(all.map((c) => c.id));
  return all.filter((c) => !c.parent_id || !ids.has(c.parent_id));
}

/** Дополнительные карты, которые входят в эту. */
export function childCards(id: number): Card[] {
  return rows<Card>(getDb().prepare("SELECT * FROM cards WHERE parent_id = ? AND archived = 0 ORDER BY last4").all(id));
}

/** Сделать карту дополнительной к основной (или отделить: parentId = null). */
export function setCardParent(id: number, parentId: number | null) {
  const db = getDb();
  if (parentId !== null) {
    if (parentId === id) throw new Error("Карта не может входить сама в себя");
    const parent = db.prepare("SELECT parent_id FROM cards WHERE id = ?").get(parentId) as { parent_id: number | null } | undefined;
    if (!parent) throw new Error("Основная карта не найдена");
    if (parent.parent_id) parentId = parent.parent_id; // только один уровень
    db.prepare("UPDATE cards SET parent_id = ? WHERE parent_id = ?").run(parentId, id); // её дополнительные — к новой основной
  }
  db.prepare("UPDATE cards SET parent_id = ? WHERE id = ?").run(parentId, id);
}

/** Объединить все карты банка основной карты под ней. Возвращает, сколько карт добавлено в группу. */
export function mergeBankCards(mainId: number): number {
  const db = getDb();
  const main = db.prepare("SELECT bank FROM cards WHERE id = ?").get(mainId) as { bank: string } | undefined;
  if (!main) return 0;
  db.prepare("UPDATE cards SET parent_id = NULL WHERE id = ?").run(mainId);
  return Number(db.prepare("UPDATE cards SET parent_id = ? WHERE bank = ? AND id != ? AND archived = 0").run(mainId, main.bank, mainId).changes);
}

/** Траты за месяц с учётом дополнительных карт: у основной — её траты плюс траты всех её карт. */
export function groupUsage(): Map<number, number> {
  const own = cardUsage();
  const out = new Map(own);
  for (const c of listCards()) if (c.parent_id) out.set(c.parent_id, (out.get(c.parent_id) ?? 0) + (own.get(c.id) ?? 0));
  return out;
}

/** Лимит по умолчанию для новых карт (копейки), задаётся на странице «Карты». */
export function defaultCardLimit(): number {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = 'default_card_limit'").get() as { value: string } | undefined;
  return Number(r?.value ?? 0) || 0;
}

export function setDefaultCardLimit(kop: number) {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES ('default_card_limit', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(String(Math.max(0, kop)));
}

/** Проставить лимит по умолчанию всем картам без лимита. Возвращает, скольким картам поставлен. */
export function applyDefaultLimit(): number {
  const lim = defaultCardLimit();
  if (!lim) return 0;
  return Number(getDb().prepare("UPDATE cards SET monthly_limit = ? WHERE monthly_limit = 0 AND archived = 0").run(lim).changes);
}

/** Новая карта. Без указанного лимита получает лимит по умолчанию. */
export function createCard(c: Omit<Card, "id">) {
  const limit = c.monthly_limit > 0 ? c.monthly_limit : defaultCardLimit();
  getDb()
    .prepare("INSERT INTO cards (bank, last4, owner, kind, monthly_limit, mono_account_id, color, badge) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(c.bank, c.last4, c.owner, c.kind, limit, c.mono_account_id, c.color ?? null, c.badge ?? null);
}

export function getCard(id: number): Card | null {
  return (getDb().prepare("SELECT * FROM cards WHERE id = ?").get(id) as unknown as Card) ?? null;
}

export function updateCard(id: number, c: Pick<Card, "bank" | "last4" | "owner" | "kind" | "monthly_limit" | "color" | "badge">) {
  getDb()
    .prepare("UPDATE cards SET bank = ?, last4 = ?, owner = ?, kind = ?, monthly_limit = ?, color = ?, badge = ? WHERE id = ?")
    .run(c.bank, c.last4, c.owner, c.kind, c.monthly_limit, c.color ?? null, c.badge ?? null, id);
}

/** Операции карты за месяц. */
export function cardTransactions(cardId: number, today = new Date()): Tx[] {
  const { from, to } = monthBounds(today);
  return rows<Tx>(
    getDb()
      .prepare(
        `${TX_SELECT} WHERE (t.card_id = ? OR t.card_id IN (SELECT id FROM cards WHERE parent_id = ?))
         AND t.occurred_at >= ? AND t.occurred_at < ? ORDER BY t.occurred_at DESC`,
      )
      .all(cardId, cardId, from, to),
  );
}

export function updateCardLimit(id: number, limitKop: number) {
  getDb().prepare("UPDATE cards SET monthly_limit = ? WHERE id = ?").run(limitKop, id);
}

/** Удалить карту: её операции остаются (без карты), дополнительные карты становятся самостоятельными. */
export function deleteCard(id: number) {
  const db = getDb();
  db.prepare("UPDATE transactions SET card_id = NULL WHERE card_id = ?").run(id);
  db.prepare("UPDATE cards SET parent_id = NULL WHERE parent_id = ?").run(id);
  db.prepare("UPDATE plans SET card_id = NULL WHERE card_id = ?").run(id);
  db.prepare("DELETE FROM cards WHERE id = ?").run(id);
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
  // Название из Wallet, которое вы уже однажды привязали к карте.
  const alias = normAlias(opts.hint);
  if (alias) {
    const r = db.prepare("SELECT c.* FROM card_aliases a JOIN cards c ON c.id = a.card_id WHERE a.alias = ? AND c.archived = 0").get(alias);
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
    const same = db.prepare("SELECT * FROM cards WHERE bank = ? AND archived = 0").all(bank) as unknown as Card[];
    if (same.length === 1) return same[0];
    const mains = same.filter((c) => !c.parent_id);
    if (mains.length === 1) return mains[0];
  }
  return null;
}

const normAlias = (hint: string | null | undefined) => (hint ?? "").trim().toLocaleLowerCase("ru").replace(/\s+/g, " ").slice(0, 80);

/** Название карты, которое прислали Wallet или SMS (лежит в исходных данных операции). */
export function cardHintOf(tx: { raw?: string | null; source: string }): string {
  if (!tx.raw) return "";
  try {
    const body = JSON.parse(tx.raw) as Record<string, unknown>;
    return typeof body.card === "string" ? body.card.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Указать карту операции вручную. Название из Wallet запоминается за этой картой —
 * следующие оплаты с неё определятся сами.
 */
export function setTxCard(txId: number, cardId: number | null) {
  const db = getDb();
  const tx = db.prepare("SELECT id, raw, source, description, assigned_at FROM transactions WHERE id = ?").get(txId) as
    | { id: number; raw: string | null; source: string; description: string; assigned_at: string | null }
    | undefined;
  if (!tx) return;
  db.prepare("UPDATE transactions SET card_id = ? WHERE id = ?").run(cardId, txId);
  const hint = cardHintOf(tx);
  if (cardId && hint) {
    db.prepare("INSERT INTO card_aliases (alias, card_id) VALUES (?, ?) ON CONFLICT(alias) DO UPDATE SET card_id = excluded.card_id").run(normAlias(hint), cardId);
    // Название карты лежало в описании, пока карта была неизвестна, — убираем.
    if (!tx.assigned_at && tx.description === hint) db.prepare("UPDATE transactions SET description = '' WHERE id = ?").run(txId);
  }
}

/** Карта не определилась, а это оплата из Wallet/SMS — нужно спросить, с какой карты. */
export function needsCard(tx: { card_id?: number | null; cashbox_id?: number | null; source: string; kind: string }): boolean {
  return !tx.card_id && !tx.cashbox_id && (tx.source === "applepay" || tx.source === "sms") && tx.kind !== "internal";
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
  SELECT t.*, c.bank || ' *' || c.last4 AS card_label, c.bank AS card_bank, c.color AS card_color, c.badge AS card_badge,
    cc.name AS center_name, cc.color AS center_color, cb.name AS cashbox_name,
    cat.name AS category_name, cat.emoji AS category_emoji
  FROM transactions t
  LEFT JOIN categories cat ON cat.id = t.category_id
  LEFT JOIN cards c ON c.id = t.card_id
  LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id
  LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id`;

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
  cashboxId?: number | null;
  planId?: number | null;
  saleId?: number | null;
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
        (occurred_at, amount, currency, card_id, cost_center_id, kind, for_whom, counterparty, description, source, external_id, raw, assigned_at,
         cashbox_id, plan_id, sale_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      t.costCenterId || kind === "internal" ? new Date().toISOString() : null,
      t.cashboxId ?? null,
      t.planId ?? null,
      t.saleId ?? null,
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
      .prepare(`${TX_SELECT} WHERE (t.cost_center_id IS NULL AND t.kind != 'internal' AND t.income_kind IS NULL) OR t.needs_note = 1 ORDER BY t.occurred_at DESC`)
      .all(),
  );
}

export function unassignedSummary(): { count: number; sum: number } {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(ABS(amount)), 0) AS s FROM transactions
       WHERE (cost_center_id IS NULL AND kind != 'internal' AND income_kind IS NULL) OR needs_note = 1`,
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
  if (!center) throw new Error("Направление не найдено");
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

/** Категория для переводов и транзитных денег (не расход и не доход). */
export function internalCenterId(): number | null {
  const r = getDb().prepare("SELECT id FROM cost_centers WHERE is_internal = 1 AND archived = 0 ORDER BY id LIMIT 1").get() as Row | undefined;
  return r ? Number(r.id) : null;
}

/** Личные направления и все вложенные в них — только они входят в «Мои деньги». */
export function personalCenterIds(): number[] {
  const all = getDb().prepare("SELECT id, parent_id, is_personal FROM cost_centers").all() as { id: number; parent_id: number | null; is_personal: number }[];
  const out = all.filter((c) => c.is_personal).map((c) => c.id);
  for (let i = 0; i < out.length; i++) for (const c of all) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

/** Расходы и поступления по дням месяца (для аналитики за месяц). */
export function dailyTotals(d: Date): { day: number; date: string; expense: number; income: number }[] {
  const y = d.getFullYear();
  const m = d.getMonth();
  const days = new Date(y, m + 1, 0).getDate();
  const from = new Date(y, m, 1).toISOString();
  const to = new Date(y, m + 1, 1).toISOString();
  const rows = rows_<{ occurred_at: string; amount: number; kind: string }>(
    getDb().prepare("SELECT occurred_at, amount, kind FROM transactions WHERE occurred_at >= ? AND occurred_at < ? AND kind != 'internal'").all(from, to),
  );
  const out = Array.from({ length: days }, (_, i) => ({ day: i + 1, date: `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`, expense: 0, income: 0 }));
  for (const r of rows) {
    const day = new Date(r.occurred_at).getDate();
    const slot = out[day - 1];
    if (!slot) continue;
    if (r.kind === "expense") slot.expense += -Number(r.amount);
    else if (r.kind === "income") slot.income += Number(r.amount);
  }
  return out;
}

function rows_<T>(r: unknown): T[] {
  return r as T[];
}

/**
 * Поиск операций: по магазину, комментарию, категории, направлению, карте и сумме.
 * Регистр и «ё» не важны. Берём последние 3000 операций — этого хватает на годы.
 */
export function searchTx(q: string, limit = 30): Tx[] {
  const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
  const words = norm(q.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const all = rows<Tx>(getDb().prepare(`${TX_SELECT} ORDER BY t.occurred_at DESC LIMIT 3000`).all());
  const out: Tx[] = [];
  for (const t of all) {
    const hay = norm(
      [t.counterparty, t.description, t.category_name, t.center_name, t.card_label, t.cashbox_name, t.for_whom, String(Math.abs(t.amount) / 100)].join(" "),
    );
    if (words.every((w) => hay.includes(w.replace(",", ".")))) {
      out.push(t);
      if (out.length >= limit) break;
    }
  }
  return out;
}
