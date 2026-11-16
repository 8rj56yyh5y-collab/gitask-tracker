import ExcelJS from "exceljs";
import { getDb } from "./db.ts";
import { centerTree } from "./repo.ts";
import { getCashbox, listCashboxes } from "./cash.ts";
import { curSymbol, currentCurrency } from "./money.ts";

// Отчёт за период (например, еженедельный отчёт руководителю): траты, приходы, итог —
// по всему, по одному направлению («Руководитель») или по одной кассе. Есть выгрузка в Excel.

export type ReportScope = { kind: "all" } | { kind: "center"; id: number } | { kind: "cash"; id: number };

export interface ReportOp {
  at: string;
  kind: "Расход" | "Приход" | "Перевод";
  amount: number;
  category: string;
  counterparty: string;
  note: string;
  center: string;
  account: string;
}

export interface Report {
  from: string;
  to: string;
  scopeName: string;
  title: string;
  ops: ReportOp[];
  income: number;
  expense: number;
  net: number;
  byCat: { name: string; s: number; n: number }[];
  /** Остаток наличных (касса или кассы направления) на начало и конец периода. */
  cash: { names: string; start: number; end: number } | null;
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
    scopeName = b ? `Касса «${b.name}»` : "Касса";
    boxIds = b ? [b.id] : [];
    where = `t.cashbox_id = ${b ? b.id : -1}`;
  }
  const rows = db
    .prepare(
      `SELECT t.occurred_at, t.amount, t.kind, t.counterparty, t.description, c.name AS cat, cc.name AS center, k.bank || ' •' || k.last4 AS card, cb.name AS box
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id
       LEFT JOIN cards k ON k.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE ${where} AND t.transit_id IS NULL AND t.occurred_at >= ? AND t.occurred_at < ? ORDER BY t.occurred_at`,
    )
    .all(fromIso, toIso) as { occurred_at: string; amount: number; kind: string; counterparty: string; description: string; cat: string | null; center: string | null; card: string | null; box: string | null }[];
  const ops: ReportOp[] = rows.map((r) => ({
    at: r.occurred_at,
    kind: r.kind === "internal" ? "Перевод" : r.amount < 0 ? "Расход" : "Приход",
    amount: Number(r.amount),
    category: r.cat ?? (r.kind === "internal" ? "Перевод" : r.amount > 0 ? "Приход" : "Без категории"),
    counterparty: r.counterparty || "",
    note: r.description && r.description !== r.counterparty ? r.description : "",
    center: r.center ?? "",
    account: r.card ?? (r.box ? `касса «${r.box}»` : "наличные"),
  }));
  const income = ops.filter((o) => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const expense = ops.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
  const cats = new Map<string, { name: string; s: number; n: number }>();
  for (const o of ops.filter((x) => x.amount < 0)) {
    const c = cats.get(o.category) ?? { name: o.category, s: 0, n: 0 };
    c.s -= o.amount;
    c.n++;
    cats.set(o.category, c);
  }
  let cash: Report["cash"] = null;
  if (boxIds.length) {
    const q = db.prepare(`SELECT COALESCE(SUM(b.opening), 0) AS o FROM cashboxes b WHERE b.id IN (${boxIds.join(",")})`).get() as { o: number };
    const before = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE cashbox_id IN (${boxIds.join(",")}) AND occurred_at < ?`).get(fromIso) as { s: number };
    const during = db.prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE cashbox_id IN (${boxIds.join(",")}) AND occurred_at >= ? AND occurred_at < ?`).get(fromIso, toIso) as { s: number };
    const start = Number(q.o) + Number(before.s);
    const names = listCashboxes()
      .filter((b) => boxIds.includes(b.id))
      .map((b) => b.name)
      .join(", ");
    cash = { names, start, end: start + Number(during.s) };
  }
  return {
    from,
    to,
    scopeName,
    title: `${scopeName} · ${periodTitle(from, to)}`,
    ops,
    income,
    expense,
    net: income - expense,
    byCat: [...cats.values()].sort((a, b) => b.s - a.s),
    cash,
    currency: currentCurrency(),
  };
}

/** Excel-файл отчёта: лист «Итог» (суммы, по категориям) и лист «Операции» (всё по строкам, с фильтром). */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "D&N";
  wb.created = new Date();
  const sym = curSymbol(r.currency);
  const money = `#,##0.00 "${sym}";[Red]-#,##0.00 "${sym}"`;
  const head = { bold: true, color: { argb: "FFFFFFFF" } } as const;
  const headFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF111114" } } as const;

  // --- Итог ---
  const s = wb.addWorksheet("Итог", { views: [{ showGridLines: false }] });
  s.columns = [{ width: 34 }, { width: 18 }, { width: 12 }];
  s.addRow([r.title]).font = { bold: true, size: 16 };
  s.addRow([`Период: ${periodTitle(r.from, r.to)} · сформировано в D&N ${new Date().toLocaleDateString("ru-RU")}`]).font = { color: { argb: "FF6B6B76" } };
  s.addRow([]);
  const line = (label: string, v: number, bold = false) => {
    const row = s.addRow([label, v / 100]);
    row.getCell(2).numFmt = money;
    row.font = { bold, size: bold ? 13 : 12 };
    return row;
  };
  if (r.cash) line(`Наличные на начало (${r.cash.names})`, r.cash.start);
  line("Приходы", r.income);
  line("Расходы", -r.expense);
  const total = line(r.cash ? "Итог за период" : "Итог (приходы − расходы)", r.net, true);
  total.getCell(1).border = { top: { style: "thin" } };
  total.getCell(2).border = { top: { style: "thin" } };
  if (r.cash) line(`Наличные на конец (${r.cash.names})`, r.cash.end, true);
  s.addRow([]);
  const ch = s.addRow(["Расходы по категориям", "Сумма", "Операций"]);
  ch.eachCell((c) => {
    c.font = head;
    c.fill = headFill;
  });
  for (const c of r.byCat) {
    const row = s.addRow([c.name, c.s / 100, c.n]);
    row.getCell(2).numFmt = money;
  }
  if (!r.byCat.length) s.addRow(["Расходов за период нет"]);

  // --- Операции ---
  const o = wb.addWorksheet("Операции", { views: [{ state: "frozen", ySplit: 1 }] });
  o.columns = [
    { header: "Дата", key: "date", width: 12 },
    { header: "Время", key: "time", width: 8 },
    { header: "Тип", key: "kind", width: 10 },
    { header: "Сумма", key: "amount", width: 16 },
    { header: "Категория", key: "category", width: 22 },
    { header: "Где / кому", key: "counterparty", width: 26 },
    { header: "Комментарий", key: "note", width: 32 },
    { header: "Чьи деньги", key: "center", width: 18 },
    { header: "Карта / касса", key: "account", width: 20 },
  ];
  o.getRow(1).eachCell((c) => {
    c.font = head;
    c.fill = headFill;
  });
  for (const op of r.ops) {
    const d = new Date(op.at);
    const row = o.addRow({
      date: new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
      time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      kind: op.kind,
      amount: op.amount / 100,
      category: op.category,
      counterparty: op.counterparty,
      note: op.note,
      center: op.center,
      account: op.account,
    });
    row.getCell("date").numFmt = "dd.mm.yyyy";
    row.getCell("amount").numFmt = money;
  }
  const last = r.ops.length + 1;
  const sum = o.addRow({ kind: "Итого", amount: { formula: last > 1 ? `SUM(D2:D${last})` : "0", result: r.net / 100 } });
  sum.font = { bold: true };
  sum.getCell("amount").numFmt = money;
  if (last > 1) o.autoFilter = { from: "A1", to: `I${last}` };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** Имя файла: «Отчёт Руководитель 2026-11-09 - 2026-11-15.xlsx» — без символов, на которых спотыкаются браузеры. */
export function reportFileName(r: Report): string {
  const scope = r.scopeName.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim();
  return `Отчёт ${scope} ${r.from} - ${r.to}.xlsx`;
}
