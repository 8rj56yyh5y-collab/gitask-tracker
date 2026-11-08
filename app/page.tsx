import Link from "next/link";
import { formatMoney } from "@/lib/money.ts";
import { limitState } from "@/lib/limits.ts";
import { budgetAlerts, groupUsage, listMainCards, listRecent, monthSpendByCenter, unassignedSummary } from "@/lib/repo.ts";
import { BudgetLine } from "./components/BudgetLine.tsx";
import { cashBalances, listCashboxes } from "@/lib/cash.ts";
import { listPlans, ymd } from "@/lib/plans.ts";
import { companyDebt } from "@/lib/sales.ts";
import { normState } from "@/lib/norms.ts";
import { SetupCard } from "./components/SetupCard.tsx";
import { HomeHero, QuickActions } from "./components/HomeHero.tsx";
import { TxRow } from "./components/TxRow.tsx";
import { cardStyle } from "@/lib/banks.ts";
import { transitOpenSum } from "@/lib/transit.ts";

export default function Home() {
  const un = unassignedSummary();
  const spend = monthSpendByCenter();
  const alerts = budgetAlerts();
  const total = spend.reduce((a, s) => a + s.spent, 0);
  const cards = listMainCards();
  const usage = groupUsage();
  const limited = cards.filter((c) => c.monthly_limit > 0);
  const totalLimit = limited.reduce((a, c) => a + c.monthly_limit, 0);
  const totalUsed = limited.reduce((a, c) => a + (usage.get(c.id) ?? 0), 0);
  const worst = limited
    .map((c) => ({ c, s: limitState(usage.get(c.id) ?? 0, c.monthly_limit) }))
    .filter((x) => x.s.level === "orange" || x.s.level === "red");
  const month = new Date().toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const recent = listRecent(5);
  void worst;

  return (
    <div className="grid grid-home">
      <HomeHero />
      <QuickActions />
      <SetupCard />

      {un.count > 0 && (
        <Link href="/inbox" className="todo span-all">
          <span className="todo-dot" aria-hidden>
            {un.count}
          </span>
          <span className="todo-text">
            <strong>{un.count === 1 ? "Операция ждёт записи" : "Операции ждут записи"}</strong>
            <span>на {formatMoney(un.sum)} — укажите, на что ушли деньги</span>
          </span>
          <span className="todo-go">›</span>
        </Link>
      )}

      {alerts.length > 0 && (
        <section className="card span-all alert-budget">
          <h2>Внимание: лимиты</h2>
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

      {(() => {
        const today = ymd(new Date());
        const week = ymd(new Date(Date.now() + 7 * 864e5));
        const soon = listPlans("open", 200, "out").filter((p) => p.due_date && p.due_date <= week);
        const owed = listPlans("open", 200, "in").filter((p) => p.kind !== "salary");
        const norm = normState();
        const boxes = listCashboxes();
        const bal = cashBalances();
        const debt = companyDebt();
        const transit = transitOpenSum();
        return (
          <>
            {soon.length > 0 && (
              <Link href="/plans?tab=out" className="card alert-budget span-all">
                <h2>Скоро оплатить</h2>
                {soon.slice(0, 4).map((p) => (
                  <div key={p.id} className="row-between small" style={{ padding: "3px 0" }}>
                    <span>
                      {p.due_date! < today ? <strong className="danger">просрочен · </strong> : p.due_date === today ? <strong className="warn-text">сегодня · </strong> : null}
                      {p.title}
                    </span>
                    <strong>{formatMoney(p.total - p.paid)}</strong>
                  </div>
                ))}
                {soon.length > 4 && <div className="muted small">и ещё {soon.length - 4} ›</div>}
              </Link>
            )}
            {norm.ready && !norm.acceptedAt && (
              <Link href="/norms" className="card alert-budget span-all plain">
                <h2>Норма трат готова</h2>
                <div className="muted small">За {norm.elapsed} дн. собрано, сколько уходит на каждое направление. Посмотрите и примите — или соберите ещё 30 дней ›</div>
              </Link>
            )}
            {(boxes.length > 0 || debt > 0 || owed.length > 0 || transit > 0) && (
              <div className="card">
                {boxes.length > 0 && (
                  <Link href="/cash" className="row-between plain" style={{ padding: "2px 0" }}>
                    <span>Наличные в кассах</span>
                    <strong>{formatMoney(boxes.reduce((a, b) => a + (bal.get(b.id) ?? 0), 0))} ›</strong>
                  </Link>
                )}
                {transit > 0 && (
                  <Link href="/transit" className="row-between plain" style={{ padding: "2px 0" }}>
                    <span>Чужие деньги</span>
                    <strong>{formatMoney(transit)} ›</strong>
                  </Link>
                )}
                {owed.length > 0 && (
                  <Link href="/plans?tab=in" className="row-between plain" style={{ padding: "2px 0" }}>
                    <span>Мне должны</span>
                    <strong className="pos-text">{formatMoney(owed.reduce((a, p) => a + p.total - p.paid, 0))} ›</strong>
                  </Link>
                )}
                {debt > 0 && (
                  <Link href="/plans?tab=company" className="row-between plain" style={{ padding: "2px 0" }}>
                    <span>Долг компании за товар</span>
                    <strong>{formatMoney(debt)} ›</strong>
                  </Link>
                )}
              </div>
            )}
          </>
        );
      })()}

      <section className="card">
        <h2>Траты по направлениям · {month}</h2>
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

      <section className="card span-all recent">
        <div className="row-between">
          <h2 style={{ margin: 0 }}>Последние операции</h2>
          <Link href="/history" className="link-quiet">
            Все ›
          </Link>
        </div>
        {recent.length === 0 && <p className="muted small">Пока пусто. Нажмите «Расход» выше, чтобы записать первую.</p>}
        {recent.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="plain">
            <TxRow tx={t} />
          </Link>
        ))}
      </section>

      {cards.length > 0 && (
        <section className="span-all">
          <div className="row-between strip-head">
            <h2 style={{ margin: 0 }}>Карты</h2>
            <Link href="/cards" className="link-quiet">
              {limited.length ? `списано ${formatMoney(totalUsed)} из ${formatMoney(totalLimit)}` : "Все ›"}
            </Link>
          </div>
          <div className="card-strip">
            {cards.map((c) => {
              const used = usage.get(c.id) ?? 0;
              const st = c.monthly_limit > 0 ? limitState(used, c.monthly_limit) : null;
              const cs = cardStyle(c);
              return (
                <Link key={c.id} href={`/cards/${c.id}`} className="mini-card" style={{ "--c": cs.color, "--ink": cs.ink } as React.CSSProperties}>
                  <span className="mini-card-bank">{c.bank}</span>
                  <span className="mini-card-num">•• {c.last4}</span>
                  <span className="mini-card-sum">{st ? (st.left >= 0 ? `осталось ${formatMoney(st.left)}` : `перелимит ${formatMoney(-st.left)}`) : `списано ${formatMoney(used)}`}</span>
                  {st && (
                    <span className="mini-card-track">
                      <i style={{ width: `${Math.min(100, (used / c.monthly_limit) * 100)}%` }} className={`lvl-${st.level}`} />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
