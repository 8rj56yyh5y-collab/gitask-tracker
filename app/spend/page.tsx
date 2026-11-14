import Link from "next/link";
import { listTxRange, personalCenterIds, type Tx } from "@/lib/repo.ts";
import { catColor } from "@/lib/categories.ts";
import { formatMoney } from "@/lib/money.ts";
import { isSimple } from "@/lib/mode.ts";
import { TxRow } from "../components/TxRow.tsx";

type SP = { m?: string; cat?: string; q?: string; who?: string; type?: string };

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");
const mKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const dKey = (d: Date) => `${mKey(d)}-${String(d.getDate()).padStart(2, "0")}`;

/** Кольцевая диаграмма: доли категорий, в центре — сумма. Нарисована сразу на сервере. */
function Donut({ parts, total, label }: { parts: { color: string; value: number }[]; total: number; label: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <svg viewBox="0 0 140 140" className="donut" role="img" aria-label={`${label}: ${formatMoney(total)}`}>
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--field)" strokeWidth="18" />
      {total > 0 &&
        parts.map((p, i) => {
          const len = (p.value / total) * C;
          const gap = parts.length > 1 ? Math.min(2, len / 3) : 0;
          const el = (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={p.color}
              strokeWidth="18"
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            />
          );
          acc += len;
          return el;
        })}
      <text x="70" y="64" textAnchor="middle" className="donut-label">
        {label}
      </text>
      <text x="70" y="84" textAnchor="middle" className="donut-sum">
        {formatMoney(total).replace(/,\d+/, "")}
      </text>
    </svg>
  );
}

function dayTitle(key: string, today: string, yesterday: string) {
  if (key === today) return "Сегодня";
  if (key === yesterday) return "Вчера";
  return new Date(`${key}T12:00:00`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "long" });
}

/** «Траты»: всё, что потрачено, — по дням, с диаграммой по категориям, поиском и фильтрами. */
export default async function Spend({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const now = new Date();
  const [y, mo] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const base = new Date(y, mo - 1, 1);
  const type = sp.type === "in" ? "in" : "out";
  const simple = isSimple();
  const who = simple ? "me" : sp.who === "me" ? "me" : "all";
  const q = (sp.q ?? "").trim().slice(0, 60);
  const cat = sp.cat ?? "";
  const mine = new Set(personalCenterIds());

  const all = listTxRange(base.toISOString(), new Date(y, mo, 1).toISOString()).filter(
    (t) => t.kind !== "internal" && !t.transit_id && (type === "out" ? t.amount < 0 : t.amount > 0),
  );
  const scoped = all.filter((t) => who === "all" || t.cost_center_id === null || mine.has(t.cost_center_id));
  // Категории — по всем операциям месяца (без учёта выбранной категории), чтобы диаграмма не «прыгала».
  const byCat = new Map<string, { key: string; name: string; emoji: string; s: number; n: number }>();
  for (const t of scoped) {
    const key = t.category_id ? String(t.category_id) : "none";
    const c = byCat.get(key) ?? { key, name: t.category_name ?? (type === "in" ? "Доход" : "Без категории"), emoji: t.category_emoji ?? (type === "in" ? "💰" : "•"), s: 0, n: 0 };
    c.s += Math.abs(t.amount);
    c.n++;
    byCat.set(key, c);
  }
  const cats = [...byCat.values()].sort((a, b) => b.s - a.s);
  const total = cats.reduce((a, c) => a + c.s, 0);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const list = scoped.filter(
    (t) =>
      (!cat || (cat === "none" ? !t.category_id : String(t.category_id) === cat)) &&
      (!words.length || words.every((w) => norm(`${t.counterparty} ${t.description} ${t.category_name ?? ""} ${t.center_name ?? ""} ${t.card_label ?? ""} ${Math.abs(t.amount) / 100}`).includes(w.replace(",", ".")))),
  );
  const shown = list.reduce((a, t) => a + Math.abs(t.amount), 0);
  const days = new Map<string, Tx[]>();
  for (const t of list) {
    const k = dKey(new Date(t.occurred_at));
    if (!days.has(k)) days.set(k, []);
    days.get(k)!.push(t);
  }
  const today = dKey(now);
  const yesterday = dKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const isCurrent = y === now.getFullYear() && mo === now.getMonth() + 1;
  const passedDays = isCurrent ? now.getDate() : new Date(y, mo, 0).getDate();
  const title = base.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }).replace(" г.", "");
  const link = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const v = { m: mKey(base), cat, q, who: simple ? "" : who === "me" ? "me" : "", type: type === "in" ? "in" : "", ...patch };
    for (const [k, val] of Object.entries(v)) if (val && !(k === "m" && val === mKey(now))) p.set(k, String(val));
    const s = p.toString();
    return `/spend${s ? `?${s}` : ""}`;
  };
  const selected = cat ? byCat.get(cat) : null;

  return (
    <div className="narrow-wide spend">
      <div className="spend-head">
        <h1>{type === "out" ? "Траты" : "Доходы"}</h1>
        <nav className="segtabs spend-type" aria-label="Расходы или доходы">
          <Link href={link({ type: "", cat: "" })} className={`segtab ${type === "out" ? "is-on" : ""}`} replace scroll={false}>
            Расходы
          </Link>
          <Link href={link({ type: "in", cat: "" })} className={`segtab ${type === "in" ? "is-on" : ""}`} replace scroll={false}>
            Доходы
          </Link>
        </nav>
      </div>

      <div className="cal-nav">
        <Link href={link({ m: mKey(new Date(y, mo - 2, 1)) })} className="cal-arrow" aria-label="Предыдущий месяц" scroll={false}>
          ‹
        </Link>
        <strong className="cal-title">{title}</strong>
        {isCurrent ? (
          <span className="cal-arrow is-off" aria-hidden>
            ›
          </span>
        ) : (
          <Link href={link({ m: mKey(new Date(y, mo, 1)) })} className="cal-arrow" aria-label="Следующий месяц" scroll={false}>
            ›
          </Link>
        )}
      </div>

      <section className="card spend-chart">
        <Donut parts={cats.map((c) => ({ color: c.key === "none" ? "#9aa1ad" : catColor(c.name), value: c.s }))} total={total} label={type === "out" ? "потрачено" : "пришло"} />
        <div className="spend-facts">
          <div>
            <b className="num">{formatMoney(total)}</b>
            <span className="muted small">
              {scoped.length} {type === "out" ? "трат" : "поступлений"} · ≈ {formatMoney(Math.round(total / Math.max(1, passedDays) / 100) * 100)} в день
            </span>
          </div>
          {!simple && (
            <nav className="who-switch" aria-label="Чьи деньги показывать">
              <Link href={link({ who: "" })} className={who === "all" ? "is-on" : ""} replace scroll={false}>
                Все
              </Link>
              <Link href={link({ who: "me" })} className={who === "me" ? "is-on" : ""} replace scroll={false}>
                Только мои
              </Link>
            </nav>
          )}
        </div>
      </section>

      {cats.length > 0 && (
        <div className="cat-filter" role="list" aria-label="Категории — нажмите, чтобы показать только их">
          <Link href={link({ cat: "" })} className={`cf ${!cat ? "is-on" : ""}`} replace scroll={false} role="listitem">
            Все
          </Link>
          {cats.map((c) => (
            <Link
              key={c.key}
              href={link({ cat: cat === c.key ? "" : c.key })}
              className={`cf ${cat === c.key ? "is-on" : ""}`}
              style={{ "--cc": c.key === "none" ? "#9aa1ad" : catColor(c.name) } as React.CSSProperties}
              replace
              scroll={false}
              role="listitem"
            >
              <i aria-hidden />
              {c.emoji} {c.name}
              <b>{total ? Math.round((c.s / total) * 100) : 0}%</b>
            </Link>
          ))}
        </div>
      )}

      <form className="search-box spend-search" role="search" action="/spend">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        {mKey(base) !== mKey(now) && <input type="hidden" name="m" value={mKey(base)} />}
        {cat && <input type="hidden" name="cat" value={cat} />}
        {type === "in" && <input type="hidden" name="type" value="in" />}
        {who === "me" && !simple && <input type="hidden" name="who" value="me" />}
        <input id="spend-q" name="q" type="search" defaultValue={q} placeholder="Найти: магазин, комментарий, сумма" aria-label="Найти трату" enterKeyHint="search" />
      </form>

      {(selected || q) && (
        <div className="spend-filter-note">
          <span>
            {selected ? `${selected.emoji} ${selected.name}` : ""}
            {selected && q ? " · " : ""}
            {q ? `«${q}»` : ""}: <b>{formatMoney(shown)}</b> · {list.length} шт.
          </span>
          <Link href={link({ cat: "", q: "" })} className="link small" replace scroll={false}>
            Сбросить
          </Link>
        </div>
      )}

      {list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">{q || cat ? "🔍" : "🌿"}</div>
          <strong>{q || cat ? "Ничего не нашлось" : type === "out" ? "В этом месяце трат нет" : "В этом месяце доходов нет"}</strong>
          <p>{q || cat ? "Попробуйте другое слово или сбросьте фильтр." : "Нажмите «＋» внизу, чтобы записать."}</p>
        </div>
      ) : (
        [...days.entries()].map(([k, items]) => (
          <section key={k} className="day-group">
            <div className="day-head">
              <span>{dayTitle(k, today, yesterday)}</span>
              <b className="num">
                {type === "out" ? "−" : "+"}
                {formatMoney(items.reduce((a, t) => a + Math.abs(t.amount), 0))}
              </b>
            </div>
            <div className="card list-card">
              {items.map((t) => (
                <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
                  <TxRow tx={t} />
                </Link>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
