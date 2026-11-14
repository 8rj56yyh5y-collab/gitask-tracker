import Link from "next/link";
import { requestAiReport } from "../actions.ts";
import { MonthBars } from "../components/MonthBars.tsx";
import { SubmitButton } from "../components/SubmitButton.tsx";
import { aiConfigured } from "@/lib/ai.ts";
import { formatMoney } from "@/lib/money.ts";
import { compareWithPrevMonth, dailyTotals, getAiReport, monthBounds, monthDate, monthKey, monthlyTotals, shiftMonth } from "@/lib/repo.ts";
import { spendByCategory } from "@/lib/categories.ts";
import { DayBars } from "../components/DayBars.tsx";

const MONTH_IN = ["январе", "феврале", "марте", "апреле", "мае", "июне", "июле", "августе", "сентябре", "октябре", "ноябре", "декабре"];

const AI_ERRORS: Record<string, string> = {
  off: "ИИ не подключён: на сервере не задан ключ ANTHROPIC_API_KEY.",
  key: "Ключ ИИ не подошёл — проверьте ANTHROPIC_API_KEY.",
  busy: "ИИ сейчас перегружен, попробуйте через минуту.",
  api: "Не получилось получить разбор от ИИ, попробуйте ещё раз.",
};

function CatList({ rows, total }: { rows: { id: number | null; name: string | null; emoji: string | null; spent: number }[]; total: number }) {
  if (rows.length === 0) return <p className="muted small">Расходов нет.</p>;
  const max = Math.max(1, ...rows.map((r) => r.spent));
  return (
    <ul className="cat-bars">
      {rows.slice(0, 12).map((r) => (
        <li key={r.id ?? "none"}>
          <div className="row-between">
            <span>{r.id ? `${r.emoji ?? ""} ${r.name}` : "Без категории"}</span>
            <strong>
              {formatMoney(r.spent)} <span className="muted small">· {total ? Math.round((r.spent / total) * 100) : 0}%</span>
            </strong>
          </div>
          <span className="cat-bar">
            <i style={{ width: `${(r.spent / max) * 100}%`, opacity: r.id ? 1 : 0.4 }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function Analytics({ searchParams }: { searchParams: Promise<{ m?: string; v?: string; y?: string; ai_error?: string }> }) {
  const { m, v, y, ai_error } = await searchParams;
  const now = new Date();
  const view = v === "year" ? "year" : "month";
  const d = monthDate(m, now);
  const key = monthKey(d);
  const isCurrent = key === monthKey(now);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const tabs = (
    <nav className="segtabs" aria-label="Период">
      <Link href={`/analytics?m=${key}`} className={`segtab ${view === "month" ? "is-on" : ""}`}>
        Месяц
      </Link>
      <Link href={`/analytics?v=year&y=${y ?? d.getFullYear()}`} className={`segtab ${view === "year" ? "is-on" : ""}`}>
        Год
      </Link>
    </nav>
  );

  if (view === "year") {
    const year = Math.min(Number(y) || now.getFullYear(), now.getFullYear());
    const totals = monthlyTotals(12, new Date(year, 11, 15)).map((t) => (t.key > monthKey(now) ? { ...t, expense: 0, income: 0 } : t));
    const spent = totals.reduce((a, t) => a + t.expense, 0);
    const came = totals.reduce((a, t) => a + t.income, 0);
    const monthsWithData = totals.filter((t) => t.expense > 0).length;
    const cats = spendByCategory(new Date(year, 0, 1).toISOString(), new Date(year + 1, 0, 1).toISOString());
    const top = [...totals].sort((a, b) => b.expense - a.expense)[0];
    return (
      <div className="narrow-wide">
        <h1>Отчёты</h1>
        {tabs}
        <div className="month-switch period-switch">
          <Link href={`/analytics?v=year&y=${year - 1}`} className="btn btn-sm" aria-label="Предыдущий год">‹</Link>
          <strong>{year} год</strong>
          {year >= now.getFullYear() ? (
            <span className="btn btn-sm btn-disabled" aria-hidden>›</span>
          ) : (
            <Link href={`/analytics?v=year&y=${year + 1}`} className="btn btn-sm" aria-label="Следующий год">›</Link>
          )}
        </div>
        <section className="card">
          <div className="stat-tiles">
            <div className="stat-tile">
              <span>Потрачено</span>
              <strong>{formatMoney(spent)}</strong>
            </div>
            <div className="stat-tile">
              <span>Пришло</span>
              <strong className="pos-text">{formatMoney(came)}</strong>
            </div>
            <div className="stat-tile">
              <span>В среднем в месяц</span>
              <strong>{formatMoney(monthsWithData ? Math.round(spent / monthsWithData) : 0)}</strong>
            </div>
          </div>
          <h2 className="chart-title">Расходы по месяцам</h2>
          <MonthBars data={totals} selected={top && top.expense > 0 ? top.key : ""} />
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Нажмите на месяц, чтобы открыть его по дням.{top && top.expense > 0 && ` Больше всего потрачено в ${MONTH_IN[Number(top.key.slice(5)) - 1]}.`}
          </p>
        </section>
        <section className="card">
          <h2>На что ушли деньги за год</h2>
          <CatList rows={cats} total={spent} />
        </section>
      </div>
    );
  }

  const totals = monthlyTotals(2, d);
  const cur = totals.at(-1)!;
  const prev = totals.at(-2)!;
  const change = prev.expense > 0 ? Math.round(((cur.expense - prev.expense) / prev.expense) * 100) : null;
  const days = dailyTotals(d);
  const daysPassed = isCurrent ? now.getDate() : days.length;
  const perDay = daysPassed ? Math.round(cur.expense / daysPassed) : 0;
  const cats = compareWithPrevMonth(d);
  const uncategorized = Math.max(0, cur.expense - cats.reduce((a, c) => a + c.current, 0));
  const { from, to } = monthBounds(d);
  const byCat = spendByCategory(from, to);
  const report = getAiReport(key);
  const prevKey = monthKey(shiftMonth(d, -1));
  const nextKey = monthKey(shiftMonth(d, 1));
  const monthName = d.toLocaleDateString("ru-RU", { month: "long" });
  const title = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${d.getFullYear()}`;
  const maxDay = [...days].sort((a, b) => b.expense - a.expense)[0];

  return (
    <div className="narrow-wide">
      <h1>Отчёты</h1>
      <div className="report-links">
        <Link href="/calendar" className="report-link">
          <span aria-hidden>🗓</span>
          <span>
            <b>Календарь трат</b>
            <span className="muted small">каждый день цветом</span>
          </span>
        </Link>
        <Link href="/recap" className="report-link">
          <span aria-hidden>✨</span>
          <span>
            <b>Итоги месяца</b>
            <span className="muted small">как прошёл месяц</span>
          </span>
        </Link>
      </div>
      {tabs}
      <div className="month-switch period-switch">
        <Link href={`/analytics?m=${prevKey}`} className="btn btn-sm" aria-label="Предыдущий месяц">‹</Link>
        <strong>{title}</strong>
        {isCurrent ? (
          <span className="btn btn-sm btn-disabled" aria-hidden>›</span>
        ) : (
          <Link href={`/analytics?m=${nextKey}`} className="btn btn-sm" aria-label="Следующий месяц">›</Link>
        )}
      </div>

      <section className="card">
        <div className="stat-tiles">
          <div className="stat-tile">
            <span>Потрачено</span>
            <strong>{formatMoney(cur.expense)}</strong>
          </div>
          <div className="stat-tile">
            <span>Пришло</span>
            <strong className="pos-text">{formatMoney(cur.income)}</strong>
          </div>
          <div className="stat-tile">
            <span>В среднем в день</span>
            <strong>{formatMoney(perDay)}</strong>
          </div>
        </div>
        {change !== null && (
          <div className={`small ${change > 0 ? "up" : "down"}`} style={{ marginTop: 8 }}>
            {change > 0 ? "▲" : "▼"} {Math.abs(change)}% к прошлому месяцу ({formatMoney(prev.expense)})
          </div>
        )}
        <h2 className="chart-title">Расходы по дням</h2>
        <DayBars data={days} today={today} />
        {maxDay && maxDay.expense > 0 && (
          <p className="muted small" style={{ margin: "8px 0 0" }}>
            Больше всего — {new Date(`${maxDay.date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}: {formatMoney(maxDay.expense)}.
          </p>
        )}
      </section>

      <section className="card">
        <h2>На что ушли деньги</h2>
        <CatList rows={byCat} total={cur.expense} />
      </section>

      <section className="card">
        <h2>Чьи деньги: этот месяц и прошлый</h2>
        {cats.length === 0 && <p className="muted small">В этом месяце расходов нет.</p>}
        <table className="compare">
          <thead>
            <tr>
              <th>Направление</th>
              <th>Этот</th>
              <th>Прошлый</th>
              <th>Разница</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/centers/${c.id}`} className="plain">
                    <i className="dot" style={{ background: c.color }} />
                    {c.name}
                  </Link>
                </td>
                <td>{formatMoney(c.current)}</td>
                <td className="muted">{formatMoney(c.previous)}</td>
                <td className={c.changePct === null ? "muted" : c.changePct > 0 ? "up" : "down"}>
                  {c.changePct === null ? "новое" : `${c.changePct > 0 ? "▲" : c.changePct < 0 ? "▼" : ""} ${Math.abs(c.changePct)}%`}
                </td>
              </tr>
            ))}
            {uncategorized > 0 && (
              <tr>
                <td>
                  <Link href="/inbox" className="plain danger">
                    Без направления
                  </Link>
                </td>
                <td>{formatMoney(uncategorized)}</td>
                <td className="muted">—</td>
                <td className="muted">указать</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card ai-card" id="ai">
        <h2>Помощник ИИ</h2>
        {ai_error && <p className="danger small">{AI_ERRORS[ai_error] ?? AI_ERRORS.api}</p>}
        {report ? (
          <>
            <div className="ai-text">{report.text}</div>
            <p className="muted small">
              Подготовлено {new Date(report.created_at + "Z").toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          </>
        ) : (
          <p className="muted small">
            ИИ посмотрит на траты месяца, сравнит с прошлым, сделает прогноз и подскажет, где можно сэкономить.
          </p>
        )}
        {aiConfigured() ? (
          <form action={requestAiReport}>
            <input type="hidden" name="month" value={key} />
            <SubmitButton pending="ИИ думает… (до минуты)">{report ? "Обновить разбор" : "Сделать разбор"}</SubmitButton>
          </form>
        ) : (
          <p className="small warn-text">ИИ не подключён — см. «Настройки → Помощник ИИ».</p>
        )}
      </section>
    </div>
  );
}
