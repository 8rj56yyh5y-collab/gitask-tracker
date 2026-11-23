import ExcelJS from "exceljs";
import { getDb } from "./db.ts";
import { centerTree } from "./repo.ts";
import { ADJUST, boxScope, cashFactAt, cashPending, getCashbox, listCashboxes, type PendingPay } from "./cash.ts";
import { curSymbol, currentCurrency } from "./money.ts";

// Отчёт за период (например, еженедельный отчёт руководителю): траты, приходы, итог —
// по всему, по одному направлению («Руководитель») или по одной кассе. Есть выгрузка в Excel.

export type ReportScope = { kind: "all" } | { kind: "center"; id: number } | { kind: "cash"; id: number };

export interface ReportOp {
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
    // «Касса = направление» — все траты и приходы направления плюс движения кассы.
    where = b ? boxScope(b) : "0";
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
    pending,
    cash,
    currency: currentCurrency(),
  };
}

// ---------- Excel: современный отчёт D&N ----------
// Лист «Сводка»: итоги карточками со сравнением с прошлым периодом, график по дням, диаграмма категорий,
// крупнейшие траты, откуда приходы, по картам и кассам. Лист «Операции» — умная таблица Excel с фильтрами.

const C = {
  ink: "FF111118",
  text: "FF1D1D26",
  muted: "FF8A8A96",
  faint: "FFB4B4BE",
  line: "FFE7E7EE",
  soft: "FFF6F6FA",
  white: "FFFFFFFF",
  accent: "FF6E56F8",
  accentSoft: "FFF0EDFF",
  green: "FF0F9D58",
  red: "FFE5484D",
  amber: "FFF59E0B",
};
/** Цвета категорий: и в диаграмме, и точкой перед названием в таблице. */
const PALETTE = ["#6E56F8", "#14B8A6", "#F59E0B", "#EF4444", "#3B82F6", "#EC4899", "#22C55E", "#A855F7", "#F97316", "#0EA5E9"];
const OTHER = "#B4B4BE";
const argb = (hex: string) => `FF${hex.slice(1).toUpperCase()}`;
const fill = (c: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: c } });
const FONT = "Calibri";
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

async function readPublic(name: string): Promise<Buffer | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    return await readFile(join(process.cwd(), "public", name));
  } catch {
    return null;
  }
}

/** SVG → PNG. Без текста внутри картинки (подписи — в ячейках): на сервере может не быть шрифтов. Нет sharp — без картинки. */
async function png(svg: string): Promise<Buffer | null> {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(Buffer.from(svg), { density: 144 }).png().toBuffer();
  } catch {
    return null;
  }
}

/** Столбики по дням: приход — зелёный, расход — красный, тонкая базовая линия. */
function daySvg(days: { inc: number; exp: number }[], w: number, h: number): string {
  const max = Math.max(1, ...days.map((d) => Math.max(d.inc, d.exp)));
  const pad = 10;
  const slot = (w - pad * 2) / Math.max(1, days.length);
  const bw = Math.max(3, Math.min(22, slot * 0.32));
  const base = h - 6;
  const top = 8;
  const H = base - top;
  let bars = "";
  days.forEach((d, i) => {
    const cx = pad + slot * i + slot / 2;
    const hi = (d.inc / max) * H;
    const he = (d.exp / max) * H;
    if (d.inc) bars += `<rect x="${cx - bw - 1.5}" y="${base - hi}" width="${bw}" height="${hi}" rx="${Math.min(4, bw / 2)}" fill="#0F9D58"/>`;
    if (d.exp) bars += `<rect x="${cx + 1.5}" y="${base - he}" width="${bw}" height="${he}" rx="${Math.min(4, bw / 2)}" fill="#E5484D"/>`;
  });
  let grid = "";
  for (const k of [0.25, 0.5, 0.75, 1]) grid += `<line x1="${pad}" x2="${w - pad}" y1="${base - H * k}" y2="${base - H * k}" stroke="#ECECF2" stroke-width="1"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#FFFFFF"/>${grid}${bars}<line x1="${pad}" x2="${w - pad}" y1="${base}" y2="${base}" stroke="#C9C9D3" stroke-width="1.5"/></svg>`;
}

/** Кольцевая диаграмма долей. */
function donutSvg(parts: { v: number; color: string }[], size: number): string {
  const total = parts.reduce((a, p) => a + p.v, 0) || 1;
  const r = size / 2 - 14;
  const c = size / 2;
  const sw = 30;
  const L = 2 * Math.PI * r;
  let off = 0;
  let arcs = "";
  for (const p of parts) {
    const len = (p.v / total) * L;
    arcs += `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${p.color}" stroke-width="${sw}" stroke-dasharray="${Math.max(0, len - 2)} ${L}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})"/>`;
    off += len;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" fill="#FFFFFF"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#F1F1F6" stroke-width="${sw}"/>${arcs}</svg>`;
}

/** Тот же период, сдвинутый назад: неделя → прошлая неделя, месяц → прошлый месяц. */
function prevRange(from: string, to: string): { from: string; to: string } {
  const a = startOf(from);
  const b = startOf(to);
  const wholeMonth = a.getDate() === 1 && new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).getDate() === 1 && a.getMonth() === b.getMonth();
  if (wholeMonth) return { from: ymdLocal(new Date(a.getFullYear(), a.getMonth() - 1, 1)), to: ymdLocal(new Date(a.getFullYear(), a.getMonth(), 0)) };
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  return { from: ymdLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - days)), to: ymdLocal(new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1)) };
}

/** Excel-файл отчёта: «Сводка» (всё главное на одном листе) и «Операции» (каждая операция строкой, с фильтрами). */
export async function reportXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "D&N";
  wb.created = new Date();
  const sym = curSymbol(r.currency);
  const money = `#,##0 "${sym}";−#,##0 "${sym}";0 "${sym}"`;
  const money2 = `#,##0.00 "${sym}";−#,##0.00 "${sym}";0 "${sym}"`;
  const signed = `+#,##0 "${sym}";−#,##0 "${sym}";0 "${sym}"`;
  const pct = `+0%;−0%;0%`;
  const now = new Date();
  const made = `${now.toLocaleDateString("ru-RU", { timeZone: "Europe/Kyiv" })} в ${now.toLocaleTimeString("ru-RU", { timeZone: "Europe/Kyiv", hour: "2-digit", minute: "2-digit", hour12: false })}`;
  const period = periodTitle(r.from, r.to);
  const nDays = Math.max(1, Math.round((startOf(r.to).getTime() - startOf(r.from).getTime()) / 864e5) + 1);
  const pr = prevRange(r.from, r.to);
  const prev = buildReport(r.scope, pr.from, pr.to);
  const prevName = nDays === 7 ? "прошлой неделе" : nDays >= 28 && nDays <= 31 ? "прошлому месяцу" : "прошлому периоду";
  const real = r.ops.filter((o) => o.kind !== "Корректировка" && o.kind !== "Перевод");
  const spends = real.filter((o) => o.amount < 0);
  const incomes = r.ops.filter((o) => o.kind !== "Корректировка" && o.amount > 0);
  const biggest = spends.reduce<ReportOp | null>((a, o) => (!a || o.amount < a.amount ? o : a), null);
  const footer = `&L&8D&&N · ${r.scopeName.replace(/&/g, "&&")} · ${period}&R&8стр. &P из &N`;

  // ===================== Сводка =====================
  const s = wb.addWorksheet("Сводка", {
    views: [{ showGridLines: false, zoomScale: 100 }],
    properties: { tabColor: { argb: C.accent } },
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true, margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: footer },
  });
  // A — фирменная полоска, B…I — 8 рабочих колонок, J — поле.
  s.columns = [{ width: 1.6 }, ...Array.from({ length: 8 }, () => ({ width: 14.2 })), { width: 1.6 }];
  const COLS = "BCDEFGHI".split("");
  const cell = (ref: string) => s.getCell(ref);
  const font = (size: number, color = C.text, bold = false, italic = false) => ({ name: FONT, size, bold, italic, color: { argb: color } });
  let row = 1;
  const strip = (from: number, to: number, color = C.accent) => {
    for (let i = from; i <= to; i++) s.getCell(`A${i}`).fill = fill(color);
  };

  // ---- Шапка: светлая, крупный заголовок, логотип справа ----
  s.getRow(1).height = 8;
  s.getRow(2).height = 18;
  s.getRow(3).height = 34;
  s.getRow(4).height = 20;
  s.getRow(5).height = 10;
  strip(2, 4);
  cell("B2").value = "D&N  ·  ОТЧЁТ О ДВИЖЕНИИ ДЕНЕГ";
  cell("B2").font = font(9, C.accent, true);
  s.mergeCells("B3:G3");
  cell("B3").value = r.scopeName;
  cell("B3").font = font(24, C.ink, true);
  cell("B3").alignment = { vertical: "middle" };
  s.mergeCells("B4:G4");
  cell("B4").value = `${period}  ·  ${nDays} ${nDays % 10 === 1 && nDays % 100 !== 11 ? "день" : nDays % 10 >= 2 && nDays % 10 <= 4 && (nDays % 100 < 10 || nDays % 100 >= 20) ? "дня" : "дней"}  ·  сформировано ${made}`;
  cell("B4").font = font(10.5, C.muted);
  const logoPng = await readPublic("icon-192.png");
  if (logoPng) {
    const id = wb.addImage({ buffer: logoPng as unknown as ExcelJS.Buffer, extension: "png" });
    s.addImage(id, { tl: { col: 8.35, row: 1.25 }, ext: { width: 56, height: 56 }, editAs: "absolute" });
  }
  for (const c of COLS) cell(`${c}5`).border = { bottom: { style: "thin", color: { argb: C.line } } };
  row = 7;

  // ---- Карточки итогов: подпись, крупная сумма, сравнение с прошлым периодом ----
  type Card = { label: string; v: number; fmt: string; color: string; bg: string; edge: string; note?: string; noteColor?: string };
  const delta = (cur: number, was: number, goodUp: boolean): { note: string; color: string } => {
    if (!was && !cur) return { note: "без изменений", color: C.muted };
    if (!was) return { note: `в ${prevName.replace("прошлой неделе", "прошлую неделю").replace("прошлому месяцу", "прошлом месяце").replace("прошлому периоду", "прошлом периоде")} — 0`, color: C.muted };
    const d = (cur - was) / Math.abs(was);
    const up = d > 0;
    const arrow = Math.abs(d) < 0.005 ? "=" : up ? "▲" : "▼";
    const good = Math.abs(d) < 0.005 ? null : up === goodUp;
    return { note: `${arrow} ${Math.abs(Math.round(d * 100))}% к ${prevName}`, color: good === null ? C.muted : good ? C.green : C.red };
  };
  const dIn = delta(r.income, prev.income, true);
  const dOut = delta(r.expense, prev.expense, false);
  const dNet = delta(r.net, prev.net, true);
  const cards1: Card[] = [
    { label: "Приходы", v: r.income / 100, fmt: money, color: C.green, bg: C.soft, edge: C.green, note: dIn.note, noteColor: dIn.color },
    { label: "Расходы", v: r.expense / 100, fmt: money, color: C.red, bg: C.soft, edge: C.red, note: dOut.note, noteColor: dOut.color },
    { label: "Итог за период", v: r.net / 100, fmt: signed, color: r.net < 0 ? C.red : r.net > 0 ? C.green : C.text, bg: C.soft, edge: C.accent, note: dNet.note, noteColor: dNet.color },
    r.cash
      ? {
          label: "Остаток на конец",
          v: r.cash.end / 100,
          fmt: money,
          color: r.cash.end < 0 ? C.red : C.ink,
          bg: C.soft,
          edge: C.ink,
          note: r.pending.length ? `после оплат ${r.cash.end - r.pending.reduce((a, p) => a + p.left, 0) < 0 ? "−" : ""}${fmtPlain(Math.abs(r.cash.end - r.pending.reduce((a, p) => a + p.left, 0)), sym)}` : `на начало ${fmtPlain(r.cash.start, sym)}`,
          noteColor: r.pending.length ? C.accent : C.muted,
        }
      : { label: "В среднем в день", v: r.expense / nDays / 100, fmt: money, color: C.ink, bg: C.soft, edge: C.ink, note: "расходов", noteColor: C.muted },
  ];
  // Остальное — одной спокойной строкой, а не второй сеткой карточек.
  const facts: string[] = [`${r.ops.length} операций`];
  if (spends.length) facts.push(`средняя трата ${fmtPlain(Math.round(r.expense / spends.length), sym)}`);
  if (biggest) facts.push(`самая крупная ${fmtPlain(-biggest.amount, sym)} — ${(biggest.counterparty || biggest.category).slice(0, 24)}`);
  if (r.cash) facts.push(`в среднем ${fmtPlain(Math.round(r.expense / nDays), sym)} в день`);
  if (r.adjust) facts.push(`корректировки ${r.adjust > 0 ? "+" : ""}${fmtPlain(r.adjust, sym)}`);
  const drawCards = (cards: Card[], big: boolean) => {
    s.getRow(row).height = 20;
    s.getRow(row + 1).height = big ? 32 : 24;
    s.getRow(row + 2).height = 18;
    cards.forEach((k, j) => {
      const L = COLS[j * 2];
      const R = COLS[j * 2 + 1];
      for (let i = 0; i < 3; i++) s.mergeCells(`${L}${row + i}:${R}${row + i}`);
      const a = cell(`${L}${row}`);
      a.value = k.label.toUpperCase();
      a.font = font(8.5, C.muted, true);
      a.alignment = { vertical: "bottom", indent: 1 };
      const v = cell(`${L}${row + 1}`);
      v.value = k.v;
      v.numFmt = k.fmt;
      v.font = font(big ? 19 : 14, k.color, true);
      v.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      const n = cell(`${L}${row + 2}`);
      n.value = k.note ?? "";
      n.font = font(9, k.noteColor ?? C.muted, false);
      n.alignment = { vertical: "top", indent: 1 };
      for (let i = 0; i < 3; i++)
        for (const c of [L, R]) {
          const x = cell(`${c}${row + i}`);
          x.fill = fill(k.bg);
          x.border = {
            top: i === 0 ? { style: "medium", color: { argb: k.edge } } : undefined,
            bottom: i === 2 ? { style: "thin", color: { argb: big ? k.bg : C.line } } : undefined,
            left: c === L ? { style: "thin", color: { argb: C.white } } : undefined,
            right: c === R ? { style: "medium", color: { argb: C.white } } : undefined,
          };
        }
    });
    row += 4;
  };
  drawCards(cards1, true);
  // «На руках по факту» — отдельной плашкой: учёт с тратами, записанными заранее, может отличаться от пересчёта.
  if (r.cash?.fact) {
    const f = r.cash.fact;
    const diff = f.amount - r.cash.end;
    const when = f.at ? new Date(f.at).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";
    s.getRow(row).height = 30;
    s.mergeCells(`B${row}:F${row}`);
    s.mergeCells(`G${row}:I${row}`);
    cell(`B${row}`).value = {
      richText: [
        { text: "НА РУКАХ ПО ФАКТУ", font: font(8.5, C.muted, true) },
        { text: `   пересчёт ${when}: ${fmtPlain(f.base, sym)}${f.since ? `, с тех пор ${f.since > 0 ? "+" : ""}${fmtPlain(f.since, sym)}` : ""}${diff ? ` · разница с учётом ${diff > 0 ? "+" : ""}${fmtPlain(diff, sym)}` : ""}`, font: font(9, C.muted) },
      ],
    };
    cell(`B${row}`).alignment = { vertical: "middle", indent: 1 };
    cell(`G${row}`).value = f.amount / 100;
    cell(`G${row}`).numFmt = money;
    cell(`G${row}`).font = font(17, f.amount < 0 ? C.red : C.ink, true);
    cell(`G${row}`).alignment = { vertical: "middle", horizontal: "right", indent: 1 };
    for (const c of COLS) {
      cell(`${c}${row}`).fill = fill(C.soft);
      cell(`${c}${row}`).border = { left: c === "B" ? { style: "thick", color: { argb: C.accent } } : undefined };
    }
    row += 2;
  }
  s.mergeCells(`B${row}:I${row}`);
  s.getRow(row).height = 18;
  cell(`B${row}`).value = facts.join("   ·   ");
  cell(`B${row}`).font = font(9.5, C.muted);
  cell(`B${row}`).alignment = { vertical: "middle", indent: 1 };
  row += 1;

  const section = (title: string, hint?: string) => {
    row += 1;
    s.getRow(row).height = 24;
    strip(row, row, C.accent);
    cell(`B${row}`).value = title;
    cell(`B${row}`).font = font(13, C.ink, true);
    cell(`B${row}`).alignment = { vertical: "middle" };
    if (hint) {
      s.mergeCells(`E${row}:I${row}`);
      cell(`E${row}`).value = hint;
      cell(`E${row}`).font = font(9, C.muted);
      cell(`E${row}`).alignment = { horizontal: "right", vertical: "middle" };
    }
    row += 1;
  };
  const header = (cols: [string, string, ("left" | "right")?][]) => {
    s.getRow(row).height = 20;
    for (const [ref, text, al] of cols) {
      const [a] = ref.split(":");
      if (ref.includes(":")) s.mergeCells(`${a}${row}:${ref.split(":")[1]}${row}`);
      const c = cell(`${a}${row}`);
      c.value = text.toUpperCase();
      c.font = font(8.5, C.muted, true);
      c.alignment = { vertical: "middle", horizontal: al ?? "left", indent: al === "right" ? 0 : 1 };
    }
    for (const c of COLS) cell(`${c}${row}`).border = { bottom: { style: "thin", color: { argb: C.faint } } };
    row += 1;
  };
  const line = (i: number, cols: [string, ExcelJS.CellValue, { fmt?: string; color?: string; bold?: boolean; right?: boolean; size?: number }?][]) => {
    s.getRow(row).height = 19;
    for (const [ref, val, o] of cols) {
      const [a, b] = ref.split(":");
      if (b) s.mergeCells(`${a}${row}:${b}${row}`);
      const c = cell(`${a}${row}`);
      c.value = val;
      if (o?.fmt) c.numFmt = o.fmt;
      c.font = font(o?.size ?? 10.5, o?.color ?? C.text, o?.bold ?? false);
      c.alignment = { vertical: "middle", horizontal: o?.right ? "right" : "left", indent: o?.right ? 0 : 1 };
    }
    for (const c of COLS) {
      const x = cell(`${c}${row}`);
      if (i % 2) x.fill = fill(C.soft);
      x.border = { bottom: { style: "hair", color: { argb: C.line } } };
    }
    row += 1;
  };

  // ---- По дням: график + таблица ----
  const days: { d: Date; inc: number; exp: number; n: number; top: ReportOp | null }[] = [];
  for (let i = 0; i < nDays; i++) {
    const a = startOf(r.from);
    days.push({ d: new Date(a.getFullYear(), a.getMonth(), a.getDate() + i), inc: 0, exp: 0, n: 0, top: null });
  }
  const dayIdx = (iso: string) => {
    const d = new Date(iso);
    const a = startOf(r.from);
    return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - a.getTime()) / 864e5);
  };
  for (const o of r.ops) {
    if (o.kind === "Корректировка") continue;
    const dd = days[dayIdx(o.at)];
    if (!dd) continue;
    dd.n++;
    if (o.amount > 0) dd.inc += o.amount;
    else {
      dd.exp -= o.amount;
      if (!dd.top || o.amount < dd.top.amount) dd.top = o;
    }
  }
  if (nDays <= 62) {
    section("По дням");
    const chart = await png(daySvg(days, 780, 170));
    if (chart) {
      const id = wb.addImage({ buffer: chart as unknown as ExcelJS.Buffer, extension: "png" });
      s.addImage(id, { tl: { col: 1, row: row - 1 + 0.2 }, ext: { width: 780, height: 170 }, editAs: "oneCell" });
      for (let i = 0; i < 9; i++) s.getRow(row + i).height = 19.5;
      row += 9;
    }
    header([["B:C", "День"], ["D", "Приходы", "right"], ["E", "Расходы", "right"], ["F", "Итог дня", "right"], ["G", "Операций", "right"], ["H:I", "Крупнейшая трата"]]);
    days.forEach((d, i) =>
      line(i, [
        ["B:C", `${WD[d.d.getDay()]}, ${d.d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`, { color: d.d.getDay() % 6 === 0 ? C.muted : C.text }],
        ["D", d.inc / 100, { fmt: money, right: true, color: d.inc ? C.green : C.faint }],
        ["E", d.exp / 100, { fmt: money, right: true, color: d.exp ? C.red : C.faint }],
        ["F", (d.inc - d.exp) / 100, { fmt: signed, right: true, bold: true, color: d.inc - d.exp < 0 ? C.red : d.inc - d.exp > 0 ? C.green : C.faint }],
        ["G", d.n, { right: true, color: d.n ? C.text : C.faint }],
        ["H:I", d.top ? `${(d.top.counterparty || d.top.category).slice(0, 22)} · ${fmtPlain(-d.top.amount, sym)}` : "", { color: C.muted, size: 9.5 }],
      ]),
    );

  }

  // ---- Куда ушли деньги: кольцо + таблица категорий ----
  const top = r.byCat.slice(0, 9);
  const rest = r.byCat.slice(9);
  const catRows = rest.length ? [...top, { name: `Остальное (${rest.length})`, s: rest.reduce((a, c) => a + c.s, 0), n: rest.reduce((a, c) => a + c.n, 0) }] : top;
  const prevCat = new Map(prev.byCat.map((c) => [c.name, c.s]));
  section("Куда ушли деньги", r.expense ? `всего ${fmtPlain(r.expense, sym)}` : undefined);
  if (!catRows.length) {
    line(0, [["B:I", "Расходов за период нет", { color: C.muted }]]);
  } else {
    const donut = await png(donutSvg(catRows.map((c, i) => ({ v: c.s, color: i < 9 ? PALETTE[i] : OTHER })), 210));
    if (donut) {
      const id = wb.addImage({ buffer: donut as unknown as ExcelJS.Buffer, extension: "png" });
      s.addImage(id, { tl: { col: 1.05, row: row - 1 + 0.3 }, ext: { width: 180, height: 180 }, editAs: "oneCell" });
    }
    const nameRef = donut ? "D:F" : "B:F";
    header([[nameRef, "Категория"], ["G", "Сумма", "right"], ["H", "Доля", "right"], ["I", `К ${prevName.split(" ")[0] === "прошлой" ? "пр. неделе" : "пр. периоду"}`, "right"]]);
    catRows.forEach((c, i) => {
      const was = prevCat.get(c.name) ?? 0;
      const d = was ? (c.s - was) / was : null;
      line(i, [
        [nameRef, { richText: [{ text: "●  ", font: font(11, argb(i < 9 ? PALETTE[i] : OTHER), true) }, { text: c.name, font: font(10.5, C.text) }, { text: `  ·  ${c.n}`, font: font(9, C.muted) }] }],
        ["G", c.s / 100, { fmt: money, right: true, bold: true }],
        ["H", r.expense ? c.s / r.expense : 0, { fmt: "0%", right: true, color: C.muted }],
        ["I", d === null ? "новое" : d, { fmt: pct, right: true, color: d === null ? C.muted : d > 0.005 ? C.red : d < -0.005 ? C.green : C.muted, size: 9.5 }],
      ]);
    });
    // Если категорий мало, оставляем место под кольцо.
    const need = donut ? 10 - (catRows.length + 1) : 0;
    for (let i = 0; i < need; i++) {
      s.getRow(row).height = 19;
      row += 1;
    }
    s.getRow(row).height = 22;
    s.mergeCells(`${donut ? "D" : "B"}${row}:F${row}`);
    cell(`${donut ? "D" : "B"}${row}`).value = "Всего расходов";
    cell(`${donut ? "D" : "B"}${row}`).font = font(11, C.ink, true);
    cell(`${donut ? "D" : "B"}${row}`).alignment = { indent: 1, vertical: "middle" };
    cell(`G${row}`).value = r.expense / 100;
    cell(`G${row}`).numFmt = money;
    cell(`G${row}`).font = font(11, C.ink, true);
    cell(`H${row}`).value = 1;
    cell(`H${row}`).numFmt = "0%";
    cell(`H${row}`).font = font(10, C.muted);
    for (const c of COLS.slice(donut ? 2 : 0)) cell(`${c}${row}`).border = { top: { style: "medium", color: { argb: C.ink } } };
    row += 1;
  }

  // ---- Крупнейшие траты ----
  if (spends.length) {
    // Первая страница — главное (итоги, дни, категории); детали — со второй.
    s.getRow(row).addPageBreak();
    section("Крупнейшие траты", spends.length > 5 ? `5 из ${spends.length}` : undefined);
    header([["B", "Дата"], ["C:E", "Где / кому"], ["F:G", "Категория"], ["H", "Карта / касса"], ["I", "Сумма", "right"]]);
    [...spends]
      .sort((a, b) => a.amount - b.amount)
      .slice(0, 5)
      .forEach((o, i) =>
        line(i, [
          ["B", new Date(o.at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), { color: C.muted }],
          ["C:E", [o.counterparty, o.note].filter(Boolean).join(" — ").slice(0, 46) || "—"],
          ["F:G", o.category, { color: C.muted }],
          ["H", o.account.slice(0, 16), { color: C.muted, size: 9 }],
          ["I", -o.amount / 100, { fmt: money, right: true, bold: true, color: C.red }],
        ]),
      );
  }

  // ---- Ожидают оплаты (заказали, платить при получении) ----
  if (r.pending.length) {
    const tot = r.pending.reduce((a, p) => a + p.left, 0);
    section("Ожидают оплаты", "оплата при получении — из кассы ещё не списано");
    header([["B:E", "Что"], ["F:G", "Где / кому"], ["H", "Когда"], ["I", "Сумма", "right"]]);
    r.pending.forEach((p, i) =>
      line(i, [
        ["B:E", p.title.slice(0, 50)],
        ["F:G", p.payee || "—", { color: C.muted }],
        ["H", p.due ? new Date(`${p.due}T12:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "—", { color: C.muted }],
        ["I", p.left / 100, { fmt: money, right: true, bold: true, color: C.accent }],
      ]),
    );
    const rest = (r.cash ? r.cash.end : 0) - tot;
    s.getRow(row).height = 22;
    s.mergeCells(`B${row}:H${row}`);
    cell(`B${row}`).value = r.cash ? `Остаток на конец ${fmtPlain(r.cash.end, sym)} − ожидают оплаты ${fmtPlain(tot, sym)} = после всех оплат` : "Всего ожидают оплаты";
    cell(`B${row}`).font = font(10.5, C.ink, true);
    cell(`B${row}`).alignment = { indent: 1, vertical: "middle" };
    cell(`I${row}`).value = (r.cash ? rest : tot) / 100;
    cell(`I${row}`).numFmt = r.cash ? money : money;
    cell(`I${row}`).font = font(12, r.cash && rest < 0 ? C.red : C.ink, true);
    cell(`I${row}`).alignment = { horizontal: "right", vertical: "middle" };
    for (const c of COLS) cell(`${c}${row}`).border = { top: { style: "medium", color: { argb: C.ink } } };
    row += 1;
  }

  // ---- Откуда приходы ----
  if (incomes.length > 1) {
    const src = new Map<string, { s: number; n: number }>();
    for (const o of incomes) {
      const k = o.kind === "Перевод" ? `Перевод · ${o.account}` : o.counterparty || o.category;
      const x = src.get(k) ?? { s: 0, n: 0 };
      x.s += o.amount;
      x.n++;
      src.set(k, x);
    }
    const tot = incomes.reduce((a, o) => a + o.amount, 0);
    section("Откуда приходы", `всего ${fmtPlain(tot, sym)}`);
    header([["B:F", "Источник"], ["G", "Сумма", "right"], ["H", "Доля", "right"], ["I", "Раз", "right"]]);
    [...src.entries()]
      .sort((a, b) => b[1].s - a[1].s)
      .slice(0, 8)
      .forEach(([k, v], i) =>
        line(i, [
          ["B:F", k.slice(0, 60)],
          ["G", v.s / 100, { fmt: money, right: true, bold: true, color: C.green }],
          ["H", tot ? v.s / tot : 0, { fmt: "0%", right: true, color: C.muted }],
          ["I", v.n, { right: true, color: C.muted }],
        ]),
      );
  }

  // ---- По картам и кассам ----
  const acc = new Map<string, { i: number; o: number; n: number }>();
  for (const o of r.ops) {
    if (o.kind === "Корректировка") continue;
    const x = acc.get(o.account) ?? { i: 0, o: 0, n: 0 };
    if (o.amount > 0) x.i += o.amount;
    else x.o -= o.amount;
    x.n++;
    acc.set(o.account, x);
  }
  if (acc.size > 1) {
    section("По картам и кассам");
    header([["B:E", "Откуда платили"], ["F", "Приходы", "right"], ["G", "Расходы", "right"], ["H", "Итог", "right"], ["I", "Операций", "right"]]);
    [...acc.entries()]
      .sort((a, b) => b[1].o - a[1].o)
      .forEach(([k, v], i) =>
        line(i, [
          ["B:E", k[0].toUpperCase() + k.slice(1)],
          ["F", v.i / 100, { fmt: money, right: true, color: v.i ? C.green : C.faint }],
          ["G", v.o / 100, { fmt: money, right: true, color: v.o ? C.red : C.faint }],
          ["H", (v.i - v.o) / 100, { fmt: signed, right: true, bold: true }],
          ["I", v.n, { right: true, color: C.muted }],
        ]),
      );
  }

  // ---- Подписи ----
  row += 2;
  cell(`B${row}`).value = "Составил";
  cell(`F${row}`).value = "Проверил";
  for (const c of ["B", "F"]) cell(`${c}${row}`).font = font(9, C.muted);
  row += 1;
  s.getRow(row).height = 24;
  for (const c of ["B", "C", "D", "F", "G", "H"]) cell(`${c}${row}`).border = { bottom: { style: "thin", color: { argb: C.text } } };
  row += 2;
  s.mergeCells(`B${row}:I${row}`);
  cell(`B${row}`).value = `Каждая операция — на листе «Операции» (с фильтрами). Сформировано в D&N ${made}.`;
  cell(`B${row}`).font = font(8.5, C.faint);

  // ===================== Операции =====================
  const o = wb.addWorksheet("Операции", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
    properties: { tabColor: { argb: C.ink } },
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "5:5", margins: { left: 0.35, right: 0.35, top: 0.4, bottom: 0.5, header: 0.2, footer: 0.25 } },
    headerFooter: { oddFooter: footer },
  });
  const withRest = Boolean(r.cash) && r.ops.reduce((a, x) => a + x.amount, r.cash ? r.cash.start : 0) === (r.cash ? r.cash.end : 0);
  const cols: { name: string; width: number }[] = [
    { name: "Дата", width: 12 },
    { name: "День", width: 6 },
    { name: "Время", width: 7 },
    { name: "Тип", width: 13 },
    { name: "Сумма", width: 14 },
    { name: "Категория", width: 20 },
    { name: "Где / кому", width: 24 },
    { name: "Комментарий", width: 30 },
    { name: "Чьи деньги", width: 16 },
    { name: "Карта / касса", width: 20 },
    ...(withRest ? [{ name: "Остаток", width: 14 }] : []),
  ];
  o.columns = cols.map((c) => ({ width: c.width }));
  for (let i = 1; i <= cols.length; i++) o.getCell(1, i).fill = fill(C.accent);
  o.getRow(1).height = 4;
  o.getRow(2).height = 26;
  o.getCell("A2").value = `Операции · ${r.scopeName}`;
  o.getCell("A2").font = font(16, C.ink, true);
  o.getRow(3).height = 18;
  o.getCell("A3").value = `${period} · ${r.ops.length} операций · приходы ${fmtPlain(r.income, sym)} · расходы ${fmtPlain(r.expense, sym)} · итог ${r.net >= 0 ? "+" : "−"}${fmtPlain(Math.abs(r.net), sym)}`;
  o.getCell("A3").font = font(10, C.muted);
  o.getRow(4).height = 8;
  if (!r.ops.length) {
    o.getCell("A5").value = "Операций за период нет";
    o.getCell("A5").font = font(11, C.muted, false, true);
  } else {
    let rest0 = r.cash?.start ?? 0;
    const rows = r.ops.map((x) => {
      const d = new Date(x.at);
      rest0 += x.amount;
      return [
        new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
        WD[d.getDay()],
        `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        x.kind,
        x.amount / 100,
        x.category,
        x.counterparty,
        x.note,
        x.center,
        x.account,
        ...(withRest ? [rest0 / 100] : []),
      ];
    });
    o.addTable({
      name: "Operations",
      ref: "A5",
      headerRow: true,
      totalsRow: true,
      style: { theme: "TableStyleLight1", showRowStripes: true },
      columns: cols.map((c, i) =>
        i === 0 ? { name: c.name, totalsRowLabel: "Итого", filterButton: true } : c.name === "Сумма" ? { name: c.name, totalsRowFunction: "sum", filterButton: true } : { name: c.name, filterButton: true },
      ) as ExcelJS.TableColumnProperties[],
      rows,
    });
    const hr = o.getRow(5);
    hr.height = 22;
    for (let i = 1; i <= cols.length; i++) {
      const c = hr.getCell(i);
      c.fill = fill(C.ink);
      c.font = font(9.5, C.white, true);
      const right = cols[i - 1].name === "Сумма" || cols[i - 1].name === "Остаток";
      c.alignment = { vertical: "middle", horizontal: right ? "right" : "left", indent: right || cols[i - 1].name === "Категория" ? 1 : 0 };
    }
    r.ops.forEach((x, k) => {
      const rr = o.getRow(6 + k);
      rr.height = 18;
      for (let i = 1; i <= cols.length; i++) {
        const c = rr.getCell(i);
        const name = cols[i - 1].name;
        const right = name === "Сумма" || name === "Остаток";
        c.alignment = { vertical: "middle", horizontal: right ? "right" : "left", indent: right ? 1 : name === "Категория" ? 1 : 0, wrapText: name === "Комментарий" };
        c.font = font(10, name === "День" || name === "Время" || name === "Карта / касса" ? C.muted : C.text);
        c.border = { bottom: { style: "hair", color: { argb: C.line } } };
      }
      rr.getCell(1).numFmt = "dd.mm.yyyy";
      rr.getCell(5).numFmt = signed.replace(/#,##0/g, "#,##0.00");
      rr.getCell(5).font = font(10, x.kind === "Корректировка" ? C.accent : x.amount < 0 ? C.red : C.green, true);
      rr.getCell(4).font = font(10, x.kind === "Корректировка" ? C.accent : x.kind === "Перевод" ? C.muted : C.text);
      if (withRest) rr.getCell(11).numFmt = money2;
    });
    const t = o.getRow(6 + r.ops.length);
    t.height = 22;
    for (let i = 1; i <= cols.length; i++) {
      const c = t.getCell(i);
      c.font = font(11, C.ink, true);
      c.border = { top: { style: "medium", color: { argb: C.ink } } };
    }
    t.getCell(5).numFmt = signed.replace(/#,##0/g, "#,##0.00");
    t.getCell(5).alignment = { horizontal: "right" };
  }

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
  const sym = curSymbol(r.currency);
  const m = (k: number) => fmtPlain(k, sym);
  const nDays = Math.max(1, Math.round((startOf(r.to).getTime() - startOf(r.from).getTime()) / 864e5) + 1);
  const unit = nDays === 7 ? "к прошлой неделе" : nDays >= 28 && nDays <= 31 ? "к прошлому месяцу" : "к прошлому периоду";
  const cmp = (cur: number, was: number) => {
    if (!was || !cur) return "";
    const d = Math.round(((cur - was) / was) * 100);
    return d === 0 ? "" : `  <i>${d > 0 ? "▲" : "▼"} ${Math.abs(d)}%</i>`;
  };
  const L: string[] = [];
  L.push(`📊 <b>${escHtml(r.scopeName)}</b>`);
  L.push(`<i>${escHtml(periodTitle(r.from, r.to))}</i>`);
  L.push("");
  L.push(`🟢 Приходы  <b>+${m(r.income)}</b>${cmp(r.income, prev.income)}`);
  L.push(`🔴 Расходы  <b>−${m(r.expense)}</b>${cmp(r.expense, prev.expense)}`);
  L.push(`${r.net >= 0 ? "✅" : "⚠️"} Итог  <b>${r.net >= 0 ? "+" : "−"}${m(Math.abs(r.net))}</b>`);
  if (r.cash) {
    L.push("");
    L.push(`💵 Касса  ${m(r.cash.start)} → <b>${m(r.cash.end)}</b>`);
    if (r.cash.fact) L.push(`✋ На руках по факту  <b>${m(r.cash.fact.amount)}</b>`);
    if (r.pending.length) {
      const tot = r.pending.reduce((a, p) => a + p.left, 0);
      L.push(`⏳ Ждут оплаты  ${m(tot)} → останется <b>${m(r.cash.end - tot)}</b>`);
    }
    if (r.adjust) L.push(`✎ Корректировки  ${r.adjust > 0 ? "+" : ""}${m(r.adjust)}`);
  } else if (r.pending.length) {
    L.push(`⏳ Ждут оплаты  ${m(r.pending.reduce((a, p) => a + p.left, 0))}`);
  }
  if (r.byCat.length) {
    L.push("");
    L.push("<b>Куда ушло больше всего</b>");
    for (const c of r.byCat.slice(0, 3)) {
      const name = c.name.length > 22 ? `${c.name.slice(0, 21)}…` : c.name;
      L.push(`• ${escHtml(name)} — ${m(c.s)} <i>${r.expense ? Math.round((c.s / r.expense) * 100) : 0}%</i>`);
    }
  }
  L.push("");
  L.push(`<i>▲▼ — ${unit} · ${r.ops.length} операций, подробно — в файле 📎</i>`);
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
