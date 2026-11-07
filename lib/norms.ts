import { getDb } from "./db.ts";
import { getSetting, setSetting } from "./settings.ts";

// Норма трат: первые 30 дней D&N просто собирает, сколько уходит на каждую категорию,
// затем предлагает месячную норму. Её можно принять (станет лимитом категории),
// поправить вручную или собирать данные ещё 30 дней.

const DAY = 864e5;
export const NORM_STEP_DAYS = 30;

export interface NormRow {
  id: number;
  name: string;
  color: string;
  /** Потрачено за период сбора, копейки. */
  spent: number;
  /** Предложенная норма на месяц, копейки (округлена вверх до 100 ₴). */
  suggested: number;
  /** Текущий лимит категории. */
  budget: number;
}

export interface NormState {
  start: string;
  days: number;
  elapsed: number;
  daysLeft: number;
  ready: boolean;
  /** Дата, когда норму приняли (null — ещё нет). */
  acceptedAt: string | null;
  rows: NormRow[];
}

function startDate(): string {
  const saved = getSetting("norm_start");
  if (saved) return saved;
  const first = getDb().prepare("SELECT MIN(occurred_at) AS m FROM transactions").get() as { m: string | null };
  const start = (first.m ?? new Date().toISOString()).slice(0, 10);
  setSetting("norm_start", start);
  return start;
}

export function roundUpNorm(kop: number): number {
  if (kop <= 0) return 0;
  return Math.ceil(kop / 10000) * 10000;
}

export function normState(now = new Date()): NormState {
  const start = startDate();
  const days = Number(getSetting("norm_days") ?? NORM_STEP_DAYS) || NORM_STEP_DAYS;
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const elapsed = Math.max(0, Math.floor((now.getTime() - startMs) / DAY));
  const db = getDb();
  const centers = db.prepare("SELECT id, name, color, parent_id, monthly_budget, is_internal, archived FROM cost_centers").all() as unknown as {
    id: number; name: string; color: string; parent_id: number | null; monthly_budget: number; is_internal: number; archived: number;
  }[];
  const byId = new Map(centers.map((c) => [c.id, c]));
  const rootOf = (id: number) => {
    let c = byId.get(id);
    const seen = new Set<number>();
    while (c?.parent_id && byId.has(c.parent_id) && !seen.has(c.id)) {
      seen.add(c.id);
      c = byId.get(c.parent_id);
    }
    return c;
  };
  const spentRows = db
    .prepare(
      `SELECT cost_center_id AS id, SUM(-amount) AS s FROM transactions
       WHERE kind = 'expense' AND cost_center_id IS NOT NULL AND occurred_at >= ? AND occurred_at < ?
       GROUP BY cost_center_id`,
    )
    .all(new Date(startMs).toISOString(), now.toISOString()) as { id: number; s: number }[];
  const spent = new Map<number, number>();
  for (const r of spentRows) {
    const root = rootOf(Number(r.id));
    if (root) spent.set(root.id, (spent.get(root.id) ?? 0) + Number(r.s));
  }
  const span = Math.max(elapsed, 1);
  const rows = centers
    .filter((c) => c.parent_id === null && !c.is_internal && (!c.archived || spent.has(c.id)))
    .map((c) => {
      const s = spent.get(c.id) ?? 0;
      return { id: c.id, name: c.name, color: c.color, spent: s, suggested: roundUpNorm(Math.round((s * 30) / span)), budget: c.monthly_budget };
    })
    .sort((a, b) => b.spent - a.spent || a.name.localeCompare(b.name, "ru"));
  return {
    start,
    days,
    elapsed,
    daysLeft: Math.max(0, days - elapsed),
    ready: elapsed >= days,
    acceptedAt: getSetting("norm_accepted"),
    rows,
  };
}

/** Собирать ещё 30 дней (к уже собранному). */
export function extendNorm() {
  const s = normState();
  setSetting("norm_days", String(Math.max(s.days, s.elapsed) + NORM_STEP_DAYS));
  setSetting("norm_accepted", null);
}

/** Принять нормы: каждая становится лимитом своей категории. */
export function acceptNorms(values: Map<number, number>, now = new Date()) {
  const upd = getDb().prepare("UPDATE cost_centers SET monthly_budget = ? WHERE id = ?");
  for (const [id, kop] of values) upd.run(Math.max(0, kop), id);
  setSetting("norm_accepted", now.toISOString().slice(0, 10));
}

/** Начать сбор заново с сегодняшнего дня. */
export function restartNorm(now = new Date()) {
  setSetting("norm_start", now.toISOString().slice(0, 10));
  setSetting("norm_days", String(NORM_STEP_DAYS));
  setSetting("norm_accepted", null);
}
