import Link from "next/link";
import { addIncomeAction, addTransaction, transferAction } from "../actions.ts";
import { AccountChips, CardChips, CategoryChips, CenterChips, ChipPicker, SegTabs } from "../components/Pickers.tsx";
import { popularCategories } from "@/lib/categories.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { OTHER_INCOME_KINDS } from "@/lib/income.ts";

const TABS = [
  { id: "out", label: "Расход", href: "/new" },
  { id: "in", label: "Доход", href: "/new?type=in" },
  { id: "move", label: "Перевод", href: "/new?type=move" },
];

function Amount({ autoFocus = true }: { autoFocus?: boolean }) {
  return (
    <label className="amount-field">
      <span className="sr-only">Сумма, ₴</span>
      <input name="amount" inputMode="decimal" required autoFocus={autoFocus} placeholder="0" className="amount-input" aria-label="Сумма в гривнах" />
      <span className="amount-cur" aria-hidden>
        ₴
      </span>
    </label>
  );
}

function More({ children }: { children: React.ReactNode }) {
  return (
    <details className="more-fields">
      <summary>Ещё: где, для кого, дата</summary>
      <div className="form">{children}</div>
    </details>
  );
}

export default async function NewTx({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type } = await searchParams;
  const tab = type === "in" || type === "move" ? type : "out";

  return (
    <div className="narrow">
      <h1>Новая операция</h1>
      <SegTabs tabs={TABS} active={tab} />

      {tab === "out" && (
        <form action={addTransaction} className="card form form-big">
          <input type="hidden" name="direction" value="out" />
          <Amount />
          <CenterChips required label="Чьи это деньги" includeInternal={false} />
          <CategoryChips required suggested={popularCategories(6)} />
          <label>
            Комментарий — на что именно
            <input name="description" required placeholder="например, продукты на неделю" />
          </label>
          <CardChips label="С какой карты" />
          <More>
            <label>
              Где или кому
              <input name="counterparty" placeholder="например, АТБ" />
            </label>
            <label>
              Для кого
              <input name="forWhom" placeholder="например, для семьи" />
            </label>
            <label>
              Дата и время
              <input name="date" type="datetime-local" />
            </label>
          </More>
          <button className="btn btn-primary btn-big">Записать расход</button>
        </form>
      )}

      {tab === "in" && (
        <form action={addIncomeAction} className="card form form-big">
          <Amount />
          <ChipPicker name="kind" label="Что это" defaultValue="Ставка" options={["Ставка", ...OTHER_INCOME_KINDS].map((k) => ({ value: k, label: k }))} />
          <AccountChips label="Куда пришли" none="Наличными / не важно" />
          <More>
            <label>
              Название (если «Другое»)
              <input name="title" />
            </label>
            <label>
              Комментарий
              <input name="note" />
            </label>
            <label>
              Дата
              <input name="at" type="date" />
            </label>
          </More>
          <button className="btn btn-primary btn-big">Записать доход</button>
          <p className="muted small" style={{ margin: 0 }}>
            Ставка приходит каждый месяц? Настройте её один раз в <Link href="/income" className="link">Доходах</Link> — дальше D&amp;N будет
            записывать её сам.
          </p>
        </form>
      )}

      {tab === "move" && (
        <form action={transferAction} className="card form form-big">
          <input type="hidden" name="next" value="/" />
          <Amount />
          <div className="grid-2-tight">
            <label>
              Откуда
              <AccountSelect name="from" />
            </label>
            <label>
              Куда
              <AccountSelect name="to" />
            </label>
          </div>
          <label>
            Комментарий
            <input name="note" placeholder="например, снял в банкомате" />
          </label>
          <button className="btn btn-primary btn-big">Перевести</button>
          <p className="muted small" style={{ margin: 0 }}>
            Перевод между своими картами и кассами — это не расход и не доход. Чужие деньги, которые нужно передать, записывайте в{" "}
            <Link href="/transit" className="link">Транзит</Link>.
          </p>
        </form>
      )}

      <div className="new-links">
        <Link href="/plans#new" className="new-link">
          📅 <span>Запланировать платёж</span>
        </Link>
        <Link href="/sales/new" className="new-link">
          🛍 <span>Продажа товара</span>
        </Link>
        <Link href="/transit" className="new-link">
          ↔ <span>Чужие деньги</span>
        </Link>
      </div>
    </div>
  );
}
