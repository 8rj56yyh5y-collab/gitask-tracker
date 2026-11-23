import ExcelJS from "exceljs";
import { getDb } from "./db.ts";
import { centerTree } from "./repo.ts";
import { ADJUST, boxScope, cashFactAt, cashPending, notAdjust, getCashbox, listCashboxes, type PendingPay } from "./cash.ts";
import { curSymbol, currentCurrency } from "./money.ts";

// Отчёт за период (например, еженедельный отчёт руководителю): траты, приходы, итог —
// по всему, по одному направлению («Руководитель») или по одной кассе. Есть выгрузка в Excel.

export type ReportScope = { kind: "all" } | { kind: "center"; id: number } | { kind: "cash"; id: number };

export interface ReportOp {
  /** Операция прошла через кассу (наличные) — входит в «было → осталось». */
  cash: boolean;
  at: string;
  kind: "Расход" | "Приход" | "Перевод" | "Корректировка";
  amount: number;
  category: string;
  counterparty: string;
  note: string;
  center: string;
  account: string;
}

export interface Report {
  scope: ReportScope;
  from: string;
  to: string;
  scopeName: string;
  title: string;
  ops: ReportOp[];
  income: number;
  expense: number;
  net: number;
  byCat: { name: string; s: number; n: number }[];
  /** Корректировки остатка кассы за период (не приход и не расход). */
  adjust: number;
  /** Движение наличных в кассах отчёта за период: приходы и расходы (без корректировок). start + in − out + adjust = end. */
  cashFlow: { in: number; out: number; adjust: number } | null;
  /** Ожидают оплаты из кассы (заказали, платить при получении) — на сегодня. */
  pending: PendingPay[];
  /** Остаток наличных (касса или кассы направления) на начало и конец периода. */
  cash: { names: string; start: number; end: number; fact?: { amount: number; at: string; base: number; since: number } | null } | null;
  currency: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ymdLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOf = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
};

/** Готовые периоды: прошлая неделя (пн–вс), эта неделя, этот месяц, прошлый месяц. */
export function presetRange(preset: string, now = new Date()): { from: string; to: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
  switch (preset) {
    case "week":
      return { from: ymdLocal(monday), to: ymdLocal(today) };
    case "month":
      return { from: ymdLocal(new Date(today.getFullYear(), today.getMonth(), 1)), to: ymdLocal(today) };
    case "prevmonth":
      return { from: ymdLocal(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: ymdLocal(new Date(today.getFullYear(), today.getMonth(), 0)) };
    default: {
      const prevMon = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7);
      return { from: ymdLocal(prevMon), to: ymdLocal(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 1)) };
    }
  }
}

export function parseScope(v: string | undefined | null): ReportScope {
  const m = String(v ?? "").match(/^(c|b):(\d+)$/);
  if (!m) return { kind: "all" };
  return m[1] === "c" ? { kind: "center", id: Number(m[2]) } : { kind: "cash", id: Number(m[2]) };
}

export function scopeKey(s: ReportScope): string {
  return s.kind === "all" ? "" : `${s.kind === "center" ? "c" : "b"}:${s.id}`;
}

/** «9–15 ноября 2026», «28 октября — 3 ноября 2026». */
export function periodTitle(from: string, to: string): string {
  const a = startOf(from);
  const b = startOf(to);
  const month = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }).replace(/^\d+\s/, "");
  if (from === to) return `${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${month(b)} ${b.getFullYear()}`;
  return `${a.getDate()} ${month(a)} — ${b.getDate()} ${month(b)} ${b.getFullYear()}`;
}

/** Направление и все вложенные в него. */
function subtree(id: number): number[] {
  const all = centerTree();
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const c of all) if (c.parent_id === out[i] && !out.includes(c.id)) out.push(c.id);
  return out;
}

export function buildReport(scope: ReportScope, from: string, to: string): Report {
  const db = getDb();
  const fromIso = startOf(from).toISOString();
  const toEnd = startOf(to);
  const toIso = new Date(toEnd.getFullYear(), toEnd.getMonth(), toEnd.getDate() + 1).toISOString();
  let where = "t.kind != 'internal'";
  let scopeName = "Все деньги";
  let boxIds: number[] = [];
  if (scope.kind === "center") {
    const ids = subtree(scope.id);
    const c = centerTree().find((x) => x.id === scope.id);
    scopeName = c?.name ?? "Направление";
    boxIds = listCashboxes()
      .filter((b) => b.center_id !== null && ids.includes(b.center_id))
      .map((b) => b.id);
    // Траты и приходы направления + все движения его касс (в том числе деньги, которые в кассу положили или из неё забрали).
    where = `((t.cost_center_id IN (${ids.join(",")}) AND t.kind != 'internal')${boxIds.length ? ` OR t.cashbox_id IN (${boxIds.join(",")})` : ""})`;
  } else if (scope.kind === "cash") {
    const b = getCashbox(scope.id);
    const c = b?.pot && b.center_id ? centerTree().find((x) => x.id === b.center_id) : null;
    scopeName = b ? (c ? c.name : `Касса «${b.name}»`) : "Касса";
    boxIds = b ? [b.id] : [];
    // «Касса и направление» — все траты и приходы направления (и с карт) плюс движения кассы; обычная касса — только её движения.
    where = b ? (c ? `((t.cost_center_id IN (${subtree(c.id).join(",")}) AND t.kind != 'internal') OR t.cashbox_id = ${b.id})` : boxScope(b)) : "0";
  }
  const boxList = listCashboxes().filter((x) => boxIds.includes(x.id));
  const cashCond = boxList.map((x) => boxScope(x)).join(" OR ") || "0";
  const rows = db
    .prepare(
      `SELECT (${cashCond}) AS is_cash, t.occurred_at, t.amount, t.kind, t.counterparty, t.description, c.name AS cat, cc.name AS center, k.bank || ' •' || k.last4 AS card, cb.name AS box
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id
       LEFT JOIN cards k ON k.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE ${where} AND t.transit_id IS NULL AND t.occurred_at >= ? AND t.occurred_at < ? ORDER BY t.occurred_at`,
    )
    .all(fromIso, toIso) as { is_cash: number; occurred_at: string; amount: number; kind: string; counterparty: string; description: string; cat: string | null; center: string | null; card: string | null; box: string | null }[];
  const ops: ReportOp[] = rows.map((r) => ({
    cash: Boolean(Number(r.is_cash)),
    at: r.occurred_at,
    kind: r.kind === "internal" ? (r.counterparty === ADJUST ? "Корректировка" : "Перевод") : r.amount < 0 ? "Расход" : "Приход",
    amount: Number(r.amount),
    category: r.cat ?? (r.kind === "internal" ? (r.counterparty === ADJUST ? ADJUST : "Перевод") : r.amount > 0 ? "Приход" : "Без категории"),
    counterparty: r.counterparty || "",
    note: r.description && r.description !== r.counterparty ? r.description : "",
    center: r.center ?? "",
    account: r.card ?? (r.box ? `касса «${r.box}»` : "наличные"),
  }));
  const real = ops.filter((o) => o.kind !== "Корректировка");
  const income = real.filter((o) => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const expense = real.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
  const adjust = ops.filter((o) => o.kind === "Корректировка").reduce((a, o) => a + o.amount, 0);
  const cats = new Map<string, { name: string; s: number; n: number }>();
  for (const o of real.filter((x) => x.amount < 0)) {
    const c = cats.get(o.category) ?? { name: o.category, s: 0, n: 0 };
    c.s -= o.amount;
    c.n++;
    cats.set(o.category, c);
  }
  const pendingMap = new Map<number, PendingPay>();
  for (const b of listCashboxes().filter((x) => boxIds.includes(x.id))) for (const p of cashPending(b)) pendingMap.set(p.id, p);
  const pending = [...pendingMap.values()];
  let cash: Report["cash"] = null;
  let cashFlow: Report["cashFlow"] = null;
  if (boxIds.length) {
    // Остаток кассы на начало и конец. У «касса = направление» он включает все операции направления.
    // Каждая операция считается один раз, даже если подходит под несколько касс.
    const list = listCashboxes().filter((b) => boxIds.includes(b.id));
    const cond = list.map((b) => boxScope(b)).join(" OR ") || "0";
    const opening = list.reduce((a, b) => a + Number(b.opening), 0);
    const before = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t WHERE (${cond}) AND t.occurred_at < ?`).get(fromIso) as { s: number };
    const during = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t WHERE (${cond}) AND t.occurred_at >= ? AND t.occurred_at < ?`).get(fromIso, toIso) as { s: number };
    const start = opening + Number(before.s);
    // «На руках по факту» — только если записан у всех касс отчёта.
    // На конец периода: пересчёт ± наличные операции после него.
    const endIso = toIso < new Date().toISOString() ? toIso : new Date().toISOString();
    // Период закончился раньше пересчёта — «на руках» тогда неизвестно (траты могли быть записаны заранее), не показываем.
    const facts = list.map((b) => (b.fact_at && endIso >= b.fact_at ? cashFactAt(b, endIso) : null));
    const fact = facts.length && facts.every(Boolean)
      ? { amount: facts.reduce((a, x) => a + x!.amount, 0), base: facts.reduce((a, x) => a + x!.base, 0), since: facts.reduce((a, x) => a + x!.since, 0), at: facts.map((x) => x!.at).sort()[0] }
      : null;
    cash = { names: list.map((b) => b.name).join(", "), start, end: start + Number(during.s), fact };
    // Движение наличных — тем же условием, что и остаток: было + пришло − ушло ± корректировки = осталось, без расхождений.
    const fl = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN t.amount > 0 AND ${notAdjust()} THEN t.amount END), 0) AS i, COALESCE(SUM(CASE WHEN t.amount < 0 AND ${notAdjust()} THEN -t.amount END), 0) AS o
         FROM transactions t WHERE (${cond}) AND t.occurred_at >= ? AND t.occurred_at < ?`,
      )
      .get(fromIso, toIso) as { i: number; o: number };
    cashFlow = { in: Number(fl.i), out: Number(fl.o), adjust: Number(during.s) - Number(fl.i) + Number(fl.o) };
  }
  return {
    scope,
    from,
    to,
    scopeName,
    title: `${scopeName} · ${periodTitle(from, to)}`,
    ops,
    income,
    expense,
    net: income - expense,
    byCat: [...cats.values()].sort((a, b) => b.s - a.s),
    adjust,
    cashFlow,
    pending,
    cash,
    currency: currentCurrency(),
  };
}

// ---------- Excel: простой отчёт, который читается сверху вниз ----------
// Один лист, как банковская выписка: шапка → итог в виде «было + пришло − ушло = стало» → на что ушли деньги → все операции.
// Белый фон, один акцентный цвет, никаких картинок и графиков: одинаково выглядит в Excel, Numbers и в просмотре на iPhone.

const C = {
  ink: "FF15151A",
  text: "FF2A2A33",
  muted: "FF8B8B96",
  line: "FFE6E6EC",
  band: "FFF5F5F8",
  accent: "FF5B47E0",
  green: "FF0E8A4F",
  red: "FFD63A3F",
  white: "FFFFFFFF",
};
const fill = (c: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: c } });
const FONT = "Arial";
const WD = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

/** Тот же период, сдвинутый назад: неделя → прошлая неделя, месяц → прошлый месяц. */
function prevRange(from: string, to: string): { from: string; to: string } {
  const a = startOf(from);
  const b = startOf(to);
  const wholeMonth = a.getDate() === 1 && new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).getDate() === 1 && a.getMonth() === b.getMonth();
  if (wholeMonth) return { from: ymdLocal(new Date(a.getFullYear(), a.getMonth() - 1, 1)), to: ymdLocal(new Date(a.getFullYear(), a.getMonth(), 0)) };
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  return { from: ymdLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - days)), to: ymdLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1)) };
}

/** Excel-файл отчёта: один лист «Отчёт» — итог, категории, операции. */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "D&N";
  wb.created = new Date();
  const sym = curSymbol(r.currency);
  const money = `#,##0.00 "${sym}";−#,##0.00 "${sym}";0 "${sym}"`;
  const signed = `+#,##0.00 "${sym}";−#,##0.00 "${sym}";0 "${sym}"`;
  const now = new Date();
  const made = `${now.toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" })} в ${now.toLocaleTimeString("ru-RU", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hour12: false })}`;
  const period = periodTitle(r.from, r.to);

  const s = wb.addWorksheet("Отчёт", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.6, header: 0.25, footer: 0.3 } },
    headerFooter: { oddFooter: `&L&8&K8B8B96D&&N · ${r.scopeName.replace(/&/g, "&&")} · ${period}&R&8&K8B8B96стр. &P из &N` },
  });
  // A — поле; B дата; C описание; D категория; E сумма.
  s.columns = [{ width: 2 }, { width: 13 }, { width: 44 }, { width: 24 }, { width: 17 }];
  const font = (size: number, color = C.text, bold = false) => ({ name: FONT, size, bold, color: { argb: color } });
  let row = 1;
  const put = (col: string, v: ExcelJS.CellValue, f: Partial<ExcelJS.Font>, al: Partial<ExcelJS.Alignment> = {}, fmt?: string) => {
    const c = s.getCell(`${col}${row}`);
    c.value = v;
    c.font = f;
    c.alignment = { vertical: "middle", ...al };
    if (fmt) c.numFmt = fmt;
    return c;
  };
  const rule = (color = C.line, style: ExcelJS.BorderStyle = "thin") => {
    for (const col of ["B", "C", "D", "E"]) s.getCell(`${col}${row}`).border = { bottom: { style, color: { argb: color } } };
  };
  const title = (text: string, hint = "") => {
    row += 1;
    s.getRow(row).height = 26;
    put("B", text, font(13, C.ink, true));
    if (hint) put("E", hint, font(9, C.muted), { horizontal: "right" });
    rule(C.ink, "medium");
    row += 1;
  };

  // ---- Шапка ----
  s.getRow(row).height = 6;
  for (const col of ["B", "C", "D", "E"]) s.getCell(`${col}${row}`).fill = fill(C.accent);
  row += 2;
  s.getRow(row).height = 16;
  put("B", "D&N · ОТЧЁТ", font(9, C.accent, true));
  put("E", `сформирован ${made}`, font(9, C.muted), { horizontal: "right" });
  row += 1;
  s.getRow(row).height = 30;
  put("B", r.scopeName, font(20, C.ink, true));
  row += 1;
  s.getRow(row).height = 18;
  put("B", period, font(11, C.muted));
  row += 1;

  // ---- Итог. Наличные: было + пришло − ушло = осталось (сходится всегда). Траты с карт — отдельно, в кассу не входят. ----
  const sumLine = (label: string, v: number, opts: { color?: string; bold?: boolean; fmt?: string; note?: string; size?: number } = {}) => {
    s.getRow(row).height = opts.bold ? 24 : 20;
    s.mergeCells(`B${row}:C${row}`);
    put("B", label, font(opts.size ?? 11, opts.bold ? C.ink : C.text, opts.bold), { indent: 0 });
    if (opts.note) put("D", opts.note, font(9, C.muted), { horizontal: "right" });
    put("E", v / 100, font(opts.size ?? 11, opts.color ?? C.ink, true), { horizontal: "right" }, opts.fmt ?? money);
    row += 1;
  };
  const real = r.ops.filter((o) => o.kind !== "Корректировка");
  const nonCash = real.filter((o) => !o.cash);
  const cnt = (list: ReportOp[], sign: 1 | -1) => {
    const n = list.filter((o) => (sign > 0 ? o.amount > 0 : o.amount < 0)).length;
    return n ? `${n} шт.` : "";
  };
  if (r.cash && r.cashFlow) {
    const f = r.cashFlow;
    const cashOps = real.filter((o) => o.cash);
    title("Наличные в кассе");
    sumLine("Было на начало", r.cash.start, { color: r.cash.start < 0 ? C.red : C.text });
    sumLine("＋ Пришло", f.in, { color: f.in ? C.green : C.muted, note: cnt(cashOps, 1) });
    sumLine("− Ушло", -f.out, { color: f.out ? C.red : C.muted, note: cnt(cashOps, -1) });
    if (f.adjust) sumLine("Корректировки учёта", f.adjust, { color: C.muted, fmt: signed });
    rule(C.ink);
    sumLine("＝ Осталось на конец", r.cash.end, { bold: true, size: 13, color: r.cash.end < 0 ? C.red : C.ink });
  }
  if (!r.cash || nonCash.length) {
    title(r.cash ? "Всего по направлению" : "Итог за период", r.cash ? "наличные и карты" : "");
    sumLine("＋ Приходы", r.income, { color: r.income ? C.green : C.muted, note: cnt(real, 1) });
    const cardOut = nonCash.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
    sumLine("− Расходы", -r.expense, { color: r.expense ? C.red : C.muted, note: r.cash && cardOut ? `из них с карт ${fmtPlain(cardOut, sym)}` : cnt(real, -1) });
    rule(C.ink);
    sumLine("＝ Итог", r.net, { bold: true, size: 13, color: r.net < 0 ? C.red : r.net > 0 ? C.green : C.ink, fmt: signed });
  }
  // Дополнительно — только если есть.
  const extra: [string, number, string][] = [];
  if (r.cash?.fact) {
    const when = new Date(r.cash.fact.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Kyiv" });
    extra.push(["На руках по факту", r.cash.fact.amount, `пересчёт ${when}${r.cash.fact.since ? `, потом ${r.cash.fact.since > 0 ? "+" : ""}${fmtPlain(r.cash.fact.since, sym)}` : ""}`]);
  }
  if (r.pending.length) {
    const tot = r.pending.reduce((a, p) => a + p.left, 0);
    const what = r.pending.map((p) => p.title).join(", ");
    extra.push(["Ожидают оплаты", -tot, what.length > 30 ? `${what.slice(0, 29)}…` : what]);
    if (r.cash) extra.push(["Останется после оплат", r.cash.end - tot, ""]);
  }
  if (extra.length) {
    row += 1;
    for (const [label, v, note] of extra) {
      s.getRow(row).height = 20;
      s.mergeCells(`B${row}:C${row}`);
      put("B", label, font(10.5, C.text));
      put("D", note, font(9, C.muted), { horizontal: "right", shrinkToFit: true });
      put("E", v / 100, font(10.5, v < 0 ? C.red : C.ink, true), { horizontal: "right" }, money);
      for (const col of ["B", "C", "D", "E"]) s.getCell(`${col}${row}`).fill = fill(C.band);
      row += 1;
    }
  }

  // ---- На что ушли деньги ----
  title("На что ушли деньги", r.expense ? `всего ${fmtPlain(r.expense, sym)}` : "");
  if (!r.byCat.length) {
    put("B", "Расходов за период нет", font(10.5, C.muted));
    row += 1;
  } else {
    for (const c of r.byCat) {
      s.getRow(row).height = 20;
      s.mergeCells(`B${row}:C${row}`);
      put("B", c.name, font(10.5, C.text));
      put("D", r.expense ? c.s / r.expense : 0, font(10, C.muted), { horizontal: "right" }, "0%");
      put("E", c.s / 100, font(10.5, C.ink, true), { horizontal: "right" }, money);
      rule();
      row += 1;
    }
  }

  // ---- Все операции ----
  title("Все операции", `${r.ops.length} шт.`);
  s.getRow(row).height = 18;
  put("B", "ДАТА", font(8.5, C.muted, true));
  put("C", "ЧТО / ГДЕ", font(8.5, C.muted, true));
  put("D", "КАТЕГОРИЯ", font(8.5, C.muted, true));
  put("E", "СУММА", font(8.5, C.muted, true), { horizontal: "right" });
  rule();
  row += 1;
  if (!r.ops.length) {
    put("B", "Операций за период нет", font(10.5, C.muted));
    row += 1;
  }
  let lastDay = "";
  for (const o of r.ops) {
    const d = new Date(o.at);
    const day = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
    const what = [o.counterparty, o.note].filter(Boolean).join(" — ") || (o.kind === "Приход" ? "Приход" : "—");
    s.getRow(row).height = 19;
    put("B", day === lastDay ? "" : `${day}, ${WD[d.getDay()]}`, font(10, C.muted));
    put("C", what.length > 60 ? `${what.slice(0, 59)}…` : what, font(10.5, C.text));
    put("D", `${o.kind === "Перевод" || o.kind === "Корректировка" ? o.kind : o.category}${r.cash && !o.cash ? " · карта" : ""}`, font(10, C.muted));
    put("E", o.amount / 100, font(10.5, o.kind === "Корректировка" ? C.muted : o.amount < 0 ? C.red : C.green, true), { horizontal: "right" }, signed);
    rule();
    lastDay = day;
    row += 1;
  }
  if (r.ops.length) {
    s.getRow(row).height = 22;
    put("B", "Итого", font(11, C.ink, true));
    put("E", { formula: `SUM(E${row - r.ops.length}:E${row - 1})`, result: r.ops.reduce((a, o) => a + o.amount, 0) / 100 }, font(11, C.ink, true), { horizontal: "right" }, signed);
    for (const col of ["B", "C", "D", "E"]) s.getCell(`${col}${row}`).border = { top: { style: "medium", color: { argb: C.ink } } };
    row += 1;
  }

  // ---- Подписи ----
  row += 2;
  put("B", "Составил", font(9, C.muted));
  put("D", "Проверил", font(9, C.muted));
  row += 1;
  s.getRow(row).height = 24;
  for (const col of ["B", "C", "D", "E"]) s.getCell(`${col}${row}`).border = { bottom: { style: "thin", color: { argb: C.muted } } };
  s.getCell(`C${row}`).border = { bottom: { style: "thin", color: { argb: C.muted } } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** «1 250 ₴» для подписей внутри текста. */
function fmtPlain(kop: number, sym: string): string {
  return `${kop < 0 ? "−" : ""}${Math.round(Math.abs(kop) / 100).toLocaleString("ru-RU").replace(/ /g, " ")} ${sym}`;
}

const escHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Тот же отчёт за прошлый такой же период — для сравнения «к прошлой неделе». */
export function prevReport(r: Report): Report {
  const p = prevRange(r.from, r.to);
  return buildReport(r.scope, p.from, p.to);
}

/**
 * Сообщение к файлу отчёта в Telegram: главное за 5 секунд. Итоги со сравнением, касса, топ-3 категорий.
 * Без лишнего: строки появляются, только если в них есть смысл.
 */
export function reportMessage(r: Report, prev: Report = prevReport(r)): string {
  void prev;
  const sym = curSymbol(r.currency);
  const m = (k: number) => fmtPlain(k, sym);
  const L: string[] = [`<b>${escHtml(r.scopeName)}</b> · ${escHtml(periodTitle(r.from, r.to))}`, ""];
  const real = r.ops.filter((o) => o.kind !== "Корректировка");
  const nonCash = real.filter((o) => !o.cash);
  if (r.cash && r.cashFlow) {
    L.push("<b>Наличные в кассе</b>");
    L.push(`Было на начало: ${m(r.cash.start)}`);
    L.push(`＋ Пришло: ${m(r.cashFlow.in)}`);
    L.push(`− Ушло: ${m(r.cashFlow.out)}`);
    if (r.cashFlow.adjust) L.push(`Корректировки учёта: ${r.cashFlow.adjust > 0 ? "+" : ""}${m(r.cashFlow.adjust)}`);
    L.push(`＝ <b>Осталось: ${m(r.cash.end)}</b>`);
    if (r.cash.fact) L.push(`На руках по факту: ${m(r.cash.fact.amount)}`);
    if (r.pending.length) {
      const tot = r.pending.reduce((a, p) => a + p.left, 0);
      L.push(`Ждут оплаты: ${m(tot)} → останется ${m(r.cash.end - tot)}`);
    }
  }
  if (!r.cash || nonCash.length) {
    if (r.cash) L.push("", "<b>Всего по направлению (наличные и карты)</b>");
    const cardOut = nonCash.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
    L.push(`＋ Приходы: ${m(r.income)}`);
    L.push(`− Расходы: ${m(r.expense)}${r.cash && cardOut ? ` (с карт ${m(cardOut)})` : ""}`);
    L.push(`＝ <b>Итог: ${r.net >= 0 ? "+" : "−"}${m(Math.abs(r.net))}</b>`);
  }
  if (r.byCat.length) {
    L.push("", "<b>На что ушли деньги</b>");
    for (const c of r.byCat.slice(0, 3)) L.push(`${escHtml(c.name.length > 24 ? `${c.name.slice(0, 23)}…` : c.name)} — ${m(c.s)}`);
    if (r.byCat.length > 3) L.push(`и ещё ${r.byCat.length - 3} — в файле`);
  }
  return L.join("\n");
}

/** Имя файла: «Отчёт Руководитель 2026-11-09 - 2026-11-15.xlsx» — без символов, на которых спотыкаются браузеры. */
export function reportFileName(r: Report, made: Date = new Date()): string {
  const scope = r.scopeName.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim();
  // Время формирования в имени: телефон не перепутает новый файл со старым за тот же период.
  return `Отчёт ${scope} ${r.from} - ${r.to} (${madeStamp(made)}).xlsx`;
}

/** «23.11 22-15» по Киеву — когда сформирован файл. */
export function madeStamp(d: Date = new Date()): string {
  const p = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}.${g("month")} ${g("hour")}-${g("minute")}`;
}
