import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import { limitState } from "@/lib/limits.ts";
import { cardUsage, listCards, monthSpendByCenter, unassignedSummary } from "@/lib/repo.ts";

export default function Home() {
  const un = unassignedSummary();
  const spend = monthSpendByCenter();
  const total = spend.reduce((a, s) => a + s.spent, 0);
  const cards = listCards();
  const usage = cardUsage();
  const limited = cards.filter((c) => c.monthly_limit > 0);
  const totalLimit = limited.reduce((a, c) => a + c.monthly_limit, 0);
  const totalUsed = limited.reduce((a, c) => a + (usage.get(c.id) ?? 0), 0);
  const worst = limited
    .map((c) => ({ c, s: limitState(usage.get(c.id) ?? 0, c.monthly_limit) }))
    .filter((x) => x.s.level === "orange" || x.s.level === "red");
  const month = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

  return (
    <>
      <Link href="/inbox" className={`card alert ${un.count ? "alert-on" : "alert-ok"}`}>
        {un.count ? (
          <>
            <div className="big">{un.count} не разнесено</div>
            <div>на сумму {formatMoney(un.sum)} — нажмите, чтобы записать, куда ушли деньги</div>
          </>
        ) : (
          <div className="big">Всё разнесено ✓</div>
        )}
      </Link>

      <section className="card">
        <h2>Расходы · {month}</h2>
        <div className="big">{formatMoney(total)}</div>
        {spend.length === 0 && <p className="muted">Пока нет расходов.</p>}
        <ul className="bars">
          {spend.map((s) => (
            <li key={s.id}>
              <div className="bar-head">
                <span>
                  <i className="dot" style={{ background: s.color }} />
                  {s.name}
                </span>
                <strong>{formatMoney(s.spent)}</strong>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${total ? (s.spent / total) * 100 : 0}%`, background: s.color }} />
              </div>
              {s.spent > 0 && (s.forecast !== null || s.budget > 0) && (
                <div className="muted small">
                  {s.forecast !== null && <>прогноз на месяц ≈ {formatMoney(s.forecast)}</>}
                  {s.forecast !== null && s.budget > 0 && " · "}
                  {s.budget > 0 && <>бюджет {formatMoney(s.budget)}</>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <Link href="/cards" className="card">
        <h2>Лимиты карт</h2>
        {limited.length === 0 ? (
          <p className="muted">Добавьте карты и лимиты, чтобы видеть, сколько осталось.</p>
        ) : (
          <>
            <div>
              Всего списано <strong>{formatMoney(totalUsed)}</strong> из {formatMoney(totalLimit)}
            </div>
            {worst.map(({ c, s }) => (
              <div key={c.id} className={`pill pill-${s.level}`}>
                {c.bank} *{c.last4}: {s.left >= 0 ? `осталось ${formatMoney(s.left)}` : `перелимит ${formatMoney(-s.left)}`}
              </div>
            ))}
          </>
        )}
      </Link>
    </>
  );
}
