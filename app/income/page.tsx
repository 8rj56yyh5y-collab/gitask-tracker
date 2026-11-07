import Link from "next/link";
import { addIncomeAction, createSalaryAction } from "../actions.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { CenterSelect } from "../components/CenterSelect.tsx";
import { Hint } from "../components/Hint.tsx";
import { MonthMoneyCard } from "../components/MonthMoneyCard.tsx";
import { OTHER_INCOME_KINDS, canAutoCredit, listSalaries, monthIncomes } from "@/lib/income.ts";
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
      <Hint>Ставка приходит каждый месяц в своё число, остальное — премии, мотивация, подработка. Здесь же видно, в плюсе месяц или в минусе.</Hint>
      {ok && <div className="card ok-note">{ok === "salary" ? "Ставка добавлена ✓" : "Доход записан ✓"}</div>}

      <MonthMoneyCard />

      <section>
        <h2>Ставка — каждый месяц</h2>
        {salaries.length === 0 && (
          <div className="card">
            <p className="muted small" style={{ margin: 0 }}>
              Добавьте ниже: сколько, какого числа и куда приходит. D&amp;N будет ждать эти деньги каждый месяц.
            </p>
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
                ? "зачисляется автоматически"
                : p.auto
                  ? "отметится, когда Monobank пришлёт поступление"
                  : "в этот день спросим в Telegram, пришли ли деньги"}
            </div>
          </Link>
        ))}
      </section>

      <form action={createSalaryAction} className="card form">
        <h2>Добавить ставку</h2>
        <div className="grid-2-tight">
          <label>
            Название
            <input name="title" defaultValue="Ставка" required />
          </label>
          <label>
            От кого
            <input name="payer" placeholder="например, работодатель" />
          </label>
        </div>
        <div className="grid-2-tight">
          <label>
            Сумма, ₴
            <input name="amount" inputMode="decimal" required placeholder="20000" />
          </label>
          <label>
            Какого числа
            <input name="day" type="number" min={1} max={31} defaultValue={1} required />
          </label>
        </div>
        <label>
          Куда приходит
          <AccountSelect none="— не указано —" />
        </label>
        <label>
          Направление
          <CenterSelect none="— не нужно —" />
        </label>
        <label className="check">
          <input type="checkbox" name="auto" value="1" defaultChecked /> Зачислять автоматически в этот день
        </label>
        <p className="muted small" style={{ margin: 0 }}>
          Если деньги приходят на карту Monobank, D&amp;N дождётся поступления от банка и отметит его сам — так ничего не задвоится.
        </p>
        <button className="btn btn-primary">Добавить ставку</button>
      </form>

      <form action={addIncomeAction} className="card form">
        <h2>Другой доход</h2>
        <div className="grid-2-tight">
          <label>
            Сумма, ₴
            <input name="amount" inputMode="decimal" required placeholder="0" />
          </label>
          <label>
            Что это
            <select name="kind" defaultValue="Мотивация">
              {OTHER_INCOME_KINDS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Название (если «Другое»)
          <input name="title" placeholder="необязательно" />
        </label>
        <label>
          Куда пришли
          <AccountSelect none="— не указано —" />
        </label>
        <div className="grid-2-tight">
          <label>
            Дата
            <input name="at" type="date" />
          </label>
          <label>
            Комментарий
            <input name="note" placeholder="необязательно" />
          </label>
        </div>
        <button className="btn btn-primary">Записать доход</button>
      </form>

      <section className="card">
        <h2>Доходы в этом месяце</h2>
        {incomes.length === 0 && <p className="muted small">Пока ничего не пришло.</p>}
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
