import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import { limitState } from "@/lib/limits.ts";
import { budgetAlerts, cardUsage, listCards, monthSpendByCenter, unassignedSummary } from "@/lib/repo.ts";
import { BudgetLine } from "./components/BudgetLine.tsx";

export default function Home() {
  const un = unassignedSummary();
  const spend = monthSpendByCenter();
  const alerts = budgetAlerts();
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
    <div className="grid grid-home">
      <Link href="/inbox" className={`card alert span-all ${un.count ? "alert-on" : "alert-ok"}`}>
        {un.count ? (
          <>
            <div className="big">{un.count} не разнесено</div>
            <div>на сумму {formatMoney(un.sum)} — нажмите, чтобы записать, куда ушли деньги</div>
          </>
        ) : (
          <div className="big">Всё разнесено ✓</div>
        )}
      </Link>

      {alerts.length > 0 && (
        <section className="card span-all alert-budget">
          <h2>Сигналы по лимитам</h2>
          {alerts.map((a) => (
            <Link key={a.id} href={`/centers/${a.id}`} className={`pill pill-${a.status === "over" ? "red" : "orange"} plain`}>
              {a.name}:{" "}
              {a.status === "over"
                ? `перелимит ${formatMoney(a.spent - a.budget)} (лимит ${formatMoney(a.budget)})`
                : `при таком темпе ≈ ${formatMoney(a.forecast)} при лимите ${formatMoney(a.budget)}`}
            </Link>
          ))}
        </section>
      )}

      <section className="card">
        <h2>Расходы · {month}</h2>
        <div className="big">{formatMoney(total)}</div>
        {spend.length === 0 && <p className="muted">Пока нет расходов.</p>}
        <ul className="bars">
          {spend.map((st) => (
            <li key={st.id}>
              <BudgetLine s={st} total={total} href={`/centers/${st.id}`} />
            </li>
          ))}
        </ul>
      </section>

      <Link href="/analytics" className="card">
        <h2>Аналитика ›</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Любой месяц, год по месяцам, сравнение с прошлым месяцем, разбор от ИИ.
        </p>
      </Link>

      <Link href="/cards" className="card">
        <h2>Лимиты карт ›</h2>
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
    </div>
  );
}
