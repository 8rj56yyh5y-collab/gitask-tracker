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

// ---------- Excel: фирменный бланк D&N ----------

const C = {
  ink: "FF0D0D12",
  ink2: "FF1B1830",
  accent: "FF7B61FF",
  white: "FFFFFFFF",
  muted: "FF8E8E97",
  text: "FF16161C",
  soft: "FFF4F4F7",
  zebra: "FFF8F8FB",
  line: "FFE4E4EA",
  green: "FF12A150",
  red: "FFE0383E",
  greenSoft: "FFE7F7EE",
  redSoft: "FFFDECEC",
  violetSoft: "FFEFEBFF",
};
const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
const FONT = "Calibri";

/** Логотип D&N для шапки (картинка из public). Нет файла — шапка без картинки. */
async function logo(): Promise<Buffer | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return await readFile(join(process.cwd(), "public", "icon-192.png"));
  } catch {
    return null;
  }
}

/** Тёмная шапка бланка: логотип, «D&N», что за отчёт и за какой период. */
function letterhead(ws: ExcelJS.Worksheet, wb: ExcelJS.Workbook, img: number | null, cols: number, title: string, sub: string, right: string) {
  const last = String.fromCharCode(64 + cols);
  for (const r of [1, 2, 3, 4, 5]) {
    const row = ws.getRow(r);
    for (let c = 1; c <= cols; c++) row.getCell(c).fill = fill(C.ink);
  }
  ws.getRow(1).height = 10;
  ws.getRow(2).height = 26;
  ws.getRow(3).height = 22;
  ws.getRow(4).height = 18;
  ws.getRow(5).height = 10;
  // тонкая фиолетовая полоса под шапкой — фирменный акцент
  ws.getRow(6).height = 4;
  for (let c = 1; c <= cols; c++) ws.getRow(6).getCell(c).fill = fill(C.accent);
  if (img !== null) ws.addImage(img, { tl: { col: 1.15, row: 1.1 }, ext: { width: 58, height: 58 }, editAs: "absolute" });
  const brand = ws.getCell("C2");
  brand.value = "D&N";
  brand.font = { name: FONT, size: 20, bold: true, color: { argb: C.white } };
  brand.alignment = { vertical: "middle" };
  const t = ws.getCell("C3");
  t.value = title;
  t.font = { name: FONT, size: 14, bold: true, color: { argb: C.white } };
  t.alignment = { vertical: "middle" };
  const st = ws.getCell("C4");
  st.value = sub;
  st.font = { name: FONT, size: 10.5, color: { argb: "FFB9B0FF" } };
  ws.mergeCells(`${String.fromCharCode(64 + cols - 2)}2:${String.fromCharCode(64 + cols - 1)}2`);
  const rc = ws.getCell(`${String.fromCharCode(64 + cols - 2)}2`);
  rc.value = right;
  rc.font = { name: FONT, size: 10, color: { argb: C.muted } };
  rc.alignment = { horizontal: "right", vertical: "middle" };
  void wb;
  void last;
}

/** Excel-файл отчёта — фирменный бланк: лист «Отчёт» (итоги и категории) и лист «Операции» (всё по строкам). */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "D&N";
  wb.created = new Date();
  const sym = curSymbol(r.currency);
  const money = `#,##0.00 "${sym}"`;
  const signed = `+#,##0.00 "${sym}";−#,##0.00 "${sym}";0 "${sym}"`;
  const pic = await logo();
  const img = pic ? wb.addImage({ buffer: pic as unknown as ExcelJS.Buffer, extension: "png" }) : null;
  const made = `Сформировано ${new Date().toLocaleDateString("ru-RU")}`;
  const period = periodTitle(r.from, r.to);

  // ===== Лист «Отчёт» =====
  const s = wb.addWorksheet("Отчёт", {
    views: [{ showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: `&L&8D&&N · ${r.scopeName.replace(/&/g, "&&")} · ${period}&R&8стр. &P из &N` },
  });
  s.columns = [{ width: 2.5 }, { width: 11 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 2.5 }];
  letterhead(s, wb, img, 8, `Отчёт о движении средств · ${r.scopeName}`, period, made);

  // Итоги — плашками по три в ряд: подпись мелко, сумма крупно.
  const kpis: { label: string; v: number | string; tone: "plain" | "in" | "out" | "total"; fmt?: string }[] = [];
  if (r.cash) kpis.push({ label: "Наличные на начало", v: r.cash.start / 100, tone: "plain", fmt: money });
  kpis.push({ label: "Приходы", v: r.income / 100, tone: "in", fmt: money });
  kpis.push({ label: "Расходы", v: r.expense / 100, tone: "out", fmt: money });
  kpis.push({ label: "Итог за период", v: r.net / 100, tone: "total", fmt: signed });
  if (r.cash) kpis.push({ label: "Наличные на конец", v: r.cash.end / 100, tone: "total", fmt: money });
  kpis.push({ label: "Операций", v: r.ops.length, tone: "plain", fmt: "0" });
  if (!r.cash) {
    const days = Math.max(1, Math.round((startOf(r.to).getTime() - startOf(r.from).getTime()) / 864e5) + 1);
    kpis.push({ label: "Расход в среднем за день", v: r.expense / days / 100, tone: "plain", fmt: money });
  }
  const tone = {
    plain: { bg: C.soft, fg: C.text },
    in: { bg: C.greenSoft, fg: C.green },
    out: { bg: C.redSoft, fg: C.red },
    total: { bg: C.violetSoft, fg: C.ink },
  };
  let row = 8;
  for (let i = 0; i < kpis.length; i += 3) {
    const lab = s.getRow(row);
    const val = s.getRow(row + 1);
    lab.height = 20;
    val.height = 30;
    kpis.slice(i, i + 3).forEach((k, j) => {
      const c1 = 2 + j * 2;
      const L = String.fromCharCode(64 + c1);
      const R = String.fromCharCode(64 + c1 + 1);
      s.mergeCells(`${L}${row}:${R}${row}`);
      s.mergeCells(`${L}${row + 1}:${R}${row + 1}`);
      const l = s.getCell(`${L}${row}`);
      l.value = k.label.toUpperCase();
      l.font = { name: FONT, size: 8.5, bold: true, color: { argb: C.muted } };
      l.alignment = { vertical: "bottom", indent: 1 };
      const v = s.getCell(`${L}${row + 1}`);
      v.value = k.v;
      v.numFmt = k.fmt ?? money;
      const fg = k.fmt === signed && typeof k.v === "number" ? (k.v < 0 ? C.red : k.v > 0 ? C.green : C.text) : tone[k.tone].fg;
      v.font = { name: FONT, size: 17, bold: true, color: { argb: fg } };
      v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      for (const cell of [l, v, s.getCell(`${R}${row}`), s.getCell(`${R}${row + 1}`)]) cell.fill = fill(tone[k.tone].bg);
    });
    s.getRow(row + 2).height = 8;
    row += 3;
  }

  // Расходы по категориям: сумма, доля, операции и полоска.
  row += 1;
  const h = s.getCell(`B${row}`);
  h.value = "Расходы по категориям";
  h.font = { name: FONT, size: 13, bold: true, color: { argb: C.text } };
  s.getRow(row).height = 22;
  row += 1;
  const hdr = s.getRow(row);
  s.mergeCells(`B${row}:C${row}`);
  [["B", "Категория"], ["D", "Сумма"], ["E", "Доля"], ["F", "Операций"], ["G", ""]].forEach(([col, text]) => {
    const c = s.getCell(`${col}${row}`);
    c.value = text;
    c.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
    c.alignment = { vertical: "middle", horizontal: col === "B" ? "left" : "right", indent: col === "B" ? 1 : 0 };
  });
  for (let c = 2; c <= 7; c++) hdr.getCell(c).fill = fill(C.ink);
  hdr.height = 20;
  const maxCat = Math.max(1, ...r.byCat.map((c) => c.s));
  r.byCat.forEach((c, i) => {
    row += 1;
    const rr = s.getRow(row);
    rr.height = 19;
    s.mergeCells(`B${row}:C${row}`);
    s.getCell(`B${row}`).value = c.name;
    s.getCell(`B${row}`).alignment = { indent: 1, vertical: "middle" };
    s.getCell(`D${row}`).value = c.s / 100;
    s.getCell(`D${row}`).numFmt = money;
    s.getCell(`E${row}`).value = r.expense ? c.s / r.expense : 0;
    s.getCell(`E${row}`).numFmt = "0%";
    s.getCell(`F${row}`).value = c.n;
    const bar = s.getCell(`G${row}`);
    bar.value = "█".repeat(Math.max(1, Math.round((c.s / maxCat) * 12)));
    bar.font = { name: FONT, size: 9, color: { argb: C.accent } };
    for (let k = 2; k <= 7; k++) {
      if (k === 3) continue; // C объединена с B: её стиль — это стиль B
      const cell = rr.getCell(k);
      if (k !== 7) cell.font = { name: FONT, size: 10.5, color: { argb: C.text }, bold: k === 4 };
      cell.alignment = { ...(cell.alignment ?? {}), vertical: "middle", horizontal: k === 2 ? "left" : k === 7 ? "left" : "right" };
      if (i % 2) cell.fill = fill(C.zebra);
      cell.border = { bottom: { style: "thin", color: { argb: C.line } } };
    }
  });
  if (!r.byCat.length) {
    row += 1;
    s.getCell(`B${row}`).value = "Расходов за период нет";
    s.getCell(`B${row}`).font = { name: FONT, size: 10.5, italic: true, color: { argb: C.muted } };
  } else {
    row += 1;
    const tr = s.getRow(row);
    tr.height = 21;
    s.mergeCells(`B${row}:C${row}`);
    s.getCell(`B${row}`).value = "Всего расходов";
    s.getCell(`D${row}`).value = r.expense / 100;
    s.getCell(`D${row}`).numFmt = money;
    s.getCell(`E${row}`).value = 1;
    s.getCell(`E${row}`).numFmt = "0%";
    s.getCell(`F${row}`).value = r.byCat.reduce((a, c) => a + c.n, 0);
    for (let k = 2; k <= 7; k++) {
      if (k === 3) continue;
      const cell = tr.getCell(k);
      cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.text } };
      cell.alignment = { vertical: "middle", horizontal: k === 2 ? "left" : "right", indent: k === 2 ? 1 : 0 };
      cell.border = { top: { style: "medium", color: { argb: C.ink } } };
    }
  }

  // Подписи — как на бланке.
  row += 3;
  s.getCell(`B${row}`).value = "Составил";
  s.getCell(`E${row}`).value = "Проверил";
  for (const col of ["B", "E"]) s.getCell(`${col}${row}`).font = { name: FONT, size: 9, color: { argb: C.muted } };
  row += 1;
  s.getRow(row).height = 22;
  for (const col of ["B", "C", "E", "F", "G"]) s.getCell(`${col}${row}`).border = { bottom: { style: "thin", color: { argb: C.text } } };
  row += 2;
  const note = s.getCell(`B${row}`);
  note.value = `Каждая операция — на листе «Операции». ${made} в D&N.`;
  note.font = { name: FONT, size: 9, color: { argb: C.muted } };

  // ===== Лист «Операции» =====
  const o = wb.addWorksheet("Операции", {
    views: [{ state: "frozen", ySplit: 8, showGridLines: false }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "8:8", margins: { left: 0.4, right: 0.4, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: `&L&8D&&N · ${r.scopeName.replace(/&/g, "&&")} · ${period}&R&8стр. &P из &N` },
  });
  o.columns = [{ width: 2.5 }, { width: 11 }, { width: 13 }, { width: 7 }, { width: 10 }, { width: 15 }, { width: 20 }, { width: 24 }, { width: 30 }, { width: 18 }, { width: 22 }, { width: 2.5 }];
  letterhead(o, wb, img, 12, `Операции · ${r.scopeName}`, period, made);
  const head = ["", "Дата", "", "Время", "Тип", "Сумма", "Категория", "Где / кому", "Комментарий", "Чьи деньги", "Карта / касса", ""];
  const hr = o.getRow(8);
  head.forEach((t, i) => {
    const c = hr.getCell(i + 1);
    c.value = t;
    if (i >= 1 && i <= 10) {
      c.fill = fill(C.ink);
      c.font = { name: FONT, size: 9.5, bold: true, color: { argb: C.white } };
      c.alignment = { vertical: "middle", horizontal: i === 5 ? "right" : "left", indent: i === 1 || i === 6 ? 1 : 0 };
    }
  });
  o.mergeCells("B8:C8");
  hr.height = 22;
  r.ops.forEach((op, i) => {
    const rr = o.getRow(9 + i);
    const d = new Date(op.at);
    o.mergeCells(`B${9 + i}:C${9 + i}`);
    rr.getCell(2).value = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    rr.getCell(2).numFmt = "dd.mm.yyyy";
    rr.getCell(4).value = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    rr.getCell(5).value = op.kind;
    rr.getCell(6).value = op.amount / 100;
    rr.getCell(6).numFmt = signed;
    rr.getCell(7).value = op.category;
    rr.getCell(8).value = op.counterparty;
    rr.getCell(9).value = op.note;
    rr.getCell(10).value = op.center;
    rr.getCell(11).value = op.account;
    rr.height = 18;
    for (let k = 2; k <= 11; k++) {
      const cell = rr.getCell(k);
      if (k === 3) continue;
      cell.font = { name: FONT, size: 10, bold: k === 6, color: { argb: k === 6 ? (op.amount < 0 ? C.red : C.green) : k === 4 || k === 11 ? C.muted : C.text } };
      cell.alignment = { vertical: "middle", horizontal: k === 6 ? "right" : "left", indent: k === 2 || k === 7 ? 1 : 0, wrapText: k === 9 };
      if (i % 2) cell.fill = fill(C.zebra);
      cell.border = { bottom: { style: "thin", color: { argb: C.line } } };
    }
  });
  const last = 8 + r.ops.length;
  const tr = o.getRow(last + 1);
  o.mergeCells(`B${last + 1}:C${last + 1}`);
  tr.getCell(2).value = "Итого";
  tr.getCell(6).value = { formula: r.ops.length ? `SUM(F9:F${last})` : "0", result: r.net / 100 };
  tr.getCell(6).numFmt = signed;
  tr.height = 21;
  for (let k = 2; k <= 11; k++) {
    const cell = tr.getCell(k);
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.text } };
    cell.alignment = { vertical: "middle", horizontal: k === 6 ? "right" : "left", indent: k === 2 ? 1 : 0 };
    cell.border = { top: { style: "medium", color: { argb: C.ink } } };
  }
  tr.getCell(6).font = { name: FONT, size: 11, bold: true, color: { argb: r.net < 0 ? C.red : r.net > 0 ? C.green : C.text } };
  if (r.ops.length) o.autoFilter = { from: { row: 8, column: 2 }, to: { row: last, column: 11 } };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** Имя файла: «Отчёт Руководитель 2026-11-09 - 2026-11-15.xlsx» — без символов, на которых спотыкаются браузеры. */
export function reportFileName(r: Report): string {
  const scope = r.scopeName.replace(/[^\p{L}\p{N} ._-]/gu, "").replace(/\s+/g, " ").trim();
  return `Отчёт ${scope} ${r.from} - ${r.to}.xlsx`;
}
