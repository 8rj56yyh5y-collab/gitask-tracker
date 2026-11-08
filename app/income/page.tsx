import Link from "next/link";
import { createSalaryAction } from "../actions.ts";
import { AccountChips } from "../components/Pickers.tsx";
import { Hint } from "../components/Hint.tsx";
import { MonthMoneyCard } from "../components/MonthMoneyCard.tsx";
import { canAutoCredit, listSalaries, monthIncomes } from "@/lib/income.ts";
import { formatMoney } from "@/lib/money.ts";
import { listCards } from "@/lib/repo.ts";
import { listCashboxes } from "@/lib/cash.ts";

const dayMonth = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export default async function Income({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const salaries = listSalaries();
  const incomes = monthIncomes();
  const cards = new Map(listCards().map((c) => [c.id, `${c.bank} •••• ${c.last4}`]));
  const boxes = new Map(listCashboxes().map((b) => [b.id, b.name]));
  const where = (cardId: number | null, boxId: number | null) =>
    cardId ? cards.get(cardId) : boxId ? `касса «${boxes.get(boxId)}»` : "куда — не указано";

  return (
    <div className="narrow-wide">
      <h1>Доходы</h1>
      <Hint>Сколько денег пришло вам в этом месяце и сколько ещё придёт. Ставка записывается сама в своё число.</Hint>
      {ok && <div className="card ok-note">{ok === "salary" ? "Ставка добавлена ✓" : "Доход записан ✓"}</div>}

      <MonthMoneyCard />

      <section>
        <h2>Ставка — каждый месяц</h2>
        {salaries.length === 0 && (
          <div className="empty">
            <div className="empty-icon">🗓</div>
            <strong>Ставка ещё не добавлена</strong>
            <p>Укажите сумму и число месяца — дальше D&amp;N будет записывать её сам.</p>
          </div>
        )}
        {salaries.map((p) => (
          <Link key={p.id} href={`/plans/${p.id}`} className="card plan plain">
            <div className="row-between">
              <strong>{p.title}</strong>
              <strong className="pos-text">+{formatMoney(p.total)}</strong>
            </div>
            <div className="muted small">
              {p.payee && `от ${p.payee} · `}
              {p.due_date ? `следующая ${dayMonth(p.due_date)}` : "без даты"} · {where(p.card_id, p.cashbox_id)}
            </div>
            <div className="muted small">
              {p.auto && canAutoCredit(p)
                ? "запишется сама"
                : p.auto
                  ? "отметится, когда придёт на Monobank"
                  : "в этот день спросим в Telegram, пришли ли деньги"}
            </div>
          </Link>
        ))}
      </section>

      <details className="card settings-fold add-fold" open={salaries.length === 0}>
        <summary>+ Добавить ставку</summary>
        <form action={createSalaryAction} className="form form-big" style={{ marginTop: 14 }}>
          <label className="amount-field">
            <input name="amount" inputMode="decimal" required className="amount-input" placeholder="0" aria-label="Сумма ставки, ₴" />
            <span className="amount-cur" aria-hidden>₴</span>
          </label>
          <div className="grid-2-tight">
            <label>
              Название
              <input name="title" defaultValue="Ставка" required />
            </label>
            <label>
              Какого числа
              <input name="day" type="number" min={1} max={31} defaultValue={1} required />
            </label>
          </div>
          <label>
            От кого
            <input name="payer" placeholder="например, работодатель" />
          </label>
          <AccountChips label="Куда приходит" none="Не указано" hint="Выберите кассу — ставка будет добавляться к её остатку." />
          <label className="check">
            <input type="checkbox" name="auto" value="1" defaultChecked /> Записывать автоматически каждый месяц
          </label>
          <p className="muted small" style={{ margin: 0 }}>
            Если ставка приходит на Monobank, D&amp;N дождётся поступления от банка и отметит его — двойной записи не будет.
          </p>
          <button className="btn btn-primary btn-big">Добавить ставку</button>
        </form>
      </details>

      <Link href="/new?type=in" className="card add-link">
        <span className="set-icon" aria-hidden>💰</span>
        <span className="set-title">
          <strong>Записать другой доход</strong>
          <span className="muted">премия, мотивация, подработка, подарок</span>
        </span>
      </Link>

      <section className="card">
        <h2>Доходы в этом месяце</h2>
        {incomes.length === 0 && <p className="muted small">В этом месяце доходов пока нет.</p>}
        {incomes.map((t) => (
          <Link key={t.id} href={`/inbox/${t.id}`} className="row-between tree-row plain">
            <span>
              {t.counterparty || t.description || "Поступление"}
              <span className="muted small">
                {" "}
                · {new Date(t.occurred_at).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
                {t.income_kind === "salary" ? " · ставка" : t.income_kind === "other" ? "" : " · из банка"}
              </span>
            </span>
            <strong className="pos-text">+{formatMoney(t.amount)}</strong>
          </Link>
        ))}
      </section>
    </div>
  );
}
