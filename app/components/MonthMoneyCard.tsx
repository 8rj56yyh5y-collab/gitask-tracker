import Link from "next/link";
import { monthMoney } from "@/lib/income.ts";
import { formatMoney } from "@/lib/money.ts";

/** Итог месяца: доходы, расходы и что остаётся. */
export function MonthMoneyCard({ link = false }: { link?: boolean }) {
  const m = monthMoney();
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });
  const plus = m.net >= 0;
  const forecast = m.net + m.expected - m.toPay;
  const body = (
    <>
      <div className="row-between">
        <h2 style={{ margin: 0 }}>Мои деньги за {month}</h2>
        {link && <span className="muted small">Доходы ›</span>}
      </div>
      <div className="mm-grid">
        <div>
          <div className="muted small">Доходы</div>
          <strong className="pos-text">+{formatMoney(m.income)}</strong>
        </div>
        <div>
          <div className="muted small">Расходы</div>
          <strong>−{formatMoney(m.expense)}</strong>
        </div>
        <div>
          <div className="muted small">{plus ? "В плюсе" : "В минусе"}</div>
          <strong className={plus ? "pos-text" : "danger"}>
            {plus ? "+" : "−"}
            {formatMoney(Math.abs(m.net))}
          </strong>
        </div>
      </div>
      {(m.expected > 0 || m.toPay > 0) && (
        <div className="muted small" style={{ marginTop: 8 }}>
          {m.expected > 0 && `До конца месяца придёт ещё ${formatMoney(m.expected)}. `}
          {m.toPay > 0 && `Нужно оплатить ${formatMoney(m.toPay)}. `}
          {forecast >= 0 ? `Можно отложить около ${formatMoney(forecast)}.` : `Не хватит около ${formatMoney(-forecast)} — лучше пока не откладывать.`}
        </div>
      )}
      {m.expected === 0 && m.toPay === 0 && m.net > 0 && (
        <div className="muted small" style={{ marginTop: 8 }}>Можно отложить до {formatMoney(m.net)}.</div>
      )}
      <div className="muted small mm-scope">
        {m.personal.length
          ? `Учтено только личное: ${m.personal.join(", ")}, ставка и ваши доходы. Деньги отдела и других направлений сюда не входят.`
          : "Отметьте, какое направление — ваши личные деньги (Направления → направление → «Это мои личные деньги»)."}
        {m.unsorted > 0 && ` Ещё ${m.unsorted} опер. ещё не разобраны — пока не учтены.`}
      </div>
    </>
  );
  return link ? (
    <Link href="/income" className="card span-all plain mm-card">
      {body}
    </Link>
  ) : (
    <section className="card mm-card">{body}</section>
  );
}
