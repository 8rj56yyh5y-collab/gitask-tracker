import { getDb } from "./db.ts";
import { personalCenterIds } from "./repo.ts";

// «Итоги месяца»: короткая история о том, как прошёл месяц, — как итоги года в музыкальных приложениях.

export interface Recap {
  /** YYYY-MM */
  month: string;
  title: string;
  spent: number;
  prevSpent: number;
  income: number;
  count: number;
  days: number;
  topCats: { name: string; emoji: string; s: number; share: number }[];
  biggest: { title: string; amount: number; date: string } | null;
  favPlace: { name: string; n: number; s: number } | null;
  weekday: { name: string; avg: number } | null;
  noSpendDays: number;
  /** Самый «дорогой» день. */
  peakDay: { date: string; s: number } | null;
}

const WD = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];

/** Итоги месяца по личным деньгам (если личные направления не отмечены — по всем тратам). */
export function monthRecap(y: number, m: number): Recap {
  const ids = personalCenterIds();
  const filter = ids.length ? ` AND t.cost_center_id IN (${ids.join(",")})` : "";
  const from = new Date(y, m, 1).toISOString();
  const to = new Date(y, m + 1, 1).toISOString();
  const pFrom = new Date(y, m - 1, 1).toISOString();
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT t.amount, t.occurred_at, t.counterparty, t.description, c.name AS cat, c.emoji FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.kind = 'expense' AND t.transit_id IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?${filter}`,
    )
    .all(from, to) as { amount: number; occurred_at: string; counterparty: string; description: string; cat: string | null; emoji: string | null }[];
  const prev = db.prepare(`SELECT COALESCE(SUM(-t.amount), 0) AS s FROM transactions t WHERE t.kind = 'expense' AND t.transit_id IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?${filter}`).get(pFrom, from) as { s: number };
  const inc = db
    .prepare(
      `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t WHERE t.kind = 'income' AND t.transit_id IS NULL AND t.occurred_at >= ? AND t.occurred_at < ?
       AND (${ids.length ? `t.cost_center_id IN (${ids.join(",")}) OR ` : ""}(t.cost_center_id IS NULL AND t.income_kind IS NOT NULL))`,
    )
    .get(from, to) as { s: number };
  const spent = rows.reduce((a, r) => a + -r.amount, 0);
  const cats = new Map<string, { name: string; emoji: string; s: number }>();
  const places = new Map<string, { name: string; n: number; s: number }>();
  const byDay = new Map<string, number>();
  const byWd = Array.from({ length: 7 }, () => ({ s: 0, days: new Set<string>() }));
  let biggest: Recap["biggest"] = null;
  for (const r of rows) {
    const s = -r.amount;
    const name = r.cat ?? "Без категории";
    const c = cats.get(name) ?? { name, emoji: r.emoji ?? "•", s: 0 };
    c.s += s;
    cats.set(name, c);
    const place = (r.counterparty || r.description || "").trim();
    if (place) {
      const p = places.get(place.toLowerCase()) ?? { name: place, n: 0, s: 0 };
      p.n++;
      p.s += s;
      places.set(place.toLowerCase(), p);
    }
    const d = new Date(r.occurred_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    byDay.set(key, (byDay.get(key) ?? 0) + s);
    byWd[d.getDay()].s += s;
    byWd[d.getDay()].days.add(key);
    if (!biggest || s > biggest.amount) biggest = { title: place || name, amount: s, date: key };
  }
  const now = new Date();
  const isCurrent = now.getFullYear() === y && now.getMonth() === m;
  const days = isCurrent ? now.getDate() : new Date(y, m + 1, 0).getDate();
  const topCats = [...cats.values()].sort((a, b) => b.s - a.s).slice(0, 3).map((c) => ({ ...c, share: spent ? Math.round((c.s / spent) * 100) : 0 }));
  const fav = [...places.values()].sort((a, b) => b.n - a.n || b.s - a.s)[0];
  const wdBest = byWd.map((w, i) => ({ name: WD[i], avg: w.days.size ? w.s / w.days.size : 0 })).sort((a, b) => b.avg - a.avg)[0];
  const peak = [...byDay.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    month: `${y}-${String(m + 1).padStart(2, "0")}`,
    title: new Date(y, m, 15).toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", ""),
    spent,
    prevSpent: Number(prev.s),
    income: Number(inc.s),
    count: rows.length,
    days,
    topCats,
    biggest,
    favPlace: fav && fav.n >= 2 ? fav : null,
    weekday: wdBest && wdBest.avg > 0 ? wdBest : null,
    noSpendDays: Math.max(0, days - byDay.size),
    peakDay: peak ? { date: peak[0], s: peak[1] } : null,
  };
}
