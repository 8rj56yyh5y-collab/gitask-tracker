import Link from "next/link";
import { requestAiReport } from "../actions.ts";
import { MonthBars } from "../components/MonthBars.tsx";
import { SubmitButton } from "../components/SubmitButton.tsx";
import { aiConfigured } from "@/lib/ai.ts";
import { formatMoney } from "@/lib/money.ts";
import { compareWithPrevMonth, getAiReport, monthDate, monthKey, monthlyTotals, shiftMonth } from "@/lib/repo.ts";

const AI_ERRORS: Record<string, string> = {
  off: "ИИ не подключён: на сервере не задан ключ ANTHROPIC_API_KEY.",
  key: "Ключ ИИ не подошёл — проверьте ANTHROPIC_API_KEY.",
  busy: "ИИ сейчас перегружен, попробуйте через минуту.",
  api: "Не получилось получить разбор от ИИ, попробуйте ещё раз.",
};

export default async function Analytics({ searchParams }: { searchParams: Promise<{ m?: string; ai_error?: string }> }) {
  const { m, ai_error } = await searchParams;
  const now = new Date();
  const d = monthDate(m, now);
  const key = monthKey(d);
  const isCurrent = key === monthKey(now);
  // Год до выбранного месяца, но не дальше текущего.
  const totals = monthlyTotals(12, d);
  const cur = totals.at(-1)!;
  const prev = totals.at(-2)!;
  const change = prev.expense > 0 ? Math.round(((cur.expense - prev.expense) / prev.expense) * 100) : null;
  const yearTotal = totals.reduce((a, t) => a + t.expense, 0);
  const cats = compareWithPrevMonth(d);
  // Расходы, которым ещё не выбрана категория: чтобы таблица сходилась с общей суммой месяца.
  const uncategorized = Math.max(0, cur.expense - cats.reduce((a, c) => a + c.current, 0));
  const report = getAiReport(key);
  const prevKey = monthKey(shiftMonth(d, -1));
  const nextKey = monthKey(shiftMonth(d, 1));
  const monthName = d.toLocaleDateString("ru-RU", { month: "long" });
  const title = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${d.getFullYear()}`;

  return (
    <div className="grid grid-2">
      <div className="span-all month-nav">
        <h1>Аналитика</h1>
        <div className="month-switch">
          <Link href={`/analytics?m=${prevKey}`} className="btn btn-sm" aria-label="Предыдущий месяц">
            ‹
          </Link>
          <strong>{title}</strong>
          {isCurrent ? (
            <span className="btn btn-sm btn-disabled" aria-hidden>
              ›
            </span>
          ) : (
            <Link href={`/analytics?m=${nextKey}`} className="btn btn-sm" aria-label="Следующий месяц">
              ›
            </Link>
          )}
        </div>
      </div>

      <section className="card span-all">
        <div className="kpis">
          <div>
            <div className="muted small">Потрачено{isCurrent ? " в этом месяце" : " за месяц"}</div>
            <div className="big">{formatMoney(cur.expense)}</div>
            {change !== null && (
              <div className={`small ${change > 0 ? "up" : "down"}`}>
                {change > 0 ? "▲" : "▼"} {Math.abs(change)}% к прошлому месяцу ({formatMoney(prev.expense)})
              </div>
            )}
          </div>
          <div>
            <div className="muted small">Пришло денег</div>
            <div className="big">{formatMoney(cur.income)}</div>
          </div>
          <div>
            <div className="muted small">Потрачено за год</div>
            <div className="big">{formatMoney(yearTotal)}</div>
          </div>
        </div>
        <h2 className="chart-title">Расходы по месяцам</h2>
        <MonthBars data={totals} selected={key} />
      </section>

      <section className="card">
        <h2>По направлениям: этот месяц и прошлый</h2>
        {cats.length === 0 && <p className="muted small">В этом месяце расходов нет.</p>}
        <table className="compare">
          <thead>
            <tr>
              <th>Направление</th>
              <th>Этот месяц</th>
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
                  <Link href="/history" className="plain danger">
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
          <p className="small warn-text">ИИ ещё не подключён — скоро включим.</p>
        )}
      </section>
    </div>
  );
}
