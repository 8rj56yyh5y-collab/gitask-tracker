import Link from "next/link";
import { addIncomeAction, addTransaction, transferAction } from "../actions.ts";
import { AccountChips, CategoryChips, CenterChips, ChipPicker, SegTabs } from "../components/Pickers.tsx";
import { popularCategories } from "@/lib/categories.ts";
import { AccountSelect } from "../components/AccountSelect.tsx";
import { CashCenterLink } from "../components/CashCenterLink.tsx";
import { OTHER_INCOME_KINDS } from "@/lib/income.ts";
import { getSetting } from "@/lib/settings.ts";
import { centerTree, listCards } from "@/lib/repo.ts";
import { listCashboxes } from "@/lib/cash.ts";

/** Что выбрали в прошлый раз: направление и карту/кассу — чтобы не выбирать их каждый раз заново. */
function lastChoice() {
  const centerId = Number(getSetting("last_center")) || null;
  const center = centerId ? centerTree().find((c) => c.id === centerId && !c.is_internal) : undefined;
  const account = getSetting("last_account") ?? "";
  const [kind, idRaw] = account.split(":");
  const id = Number(idRaw);
  const card = kind === "card" ? listCards().find((c) => c.id === id) : undefined;
  const box = kind === "cash" ? listCashboxes().find((b) => b.id === id) : undefined;
  const accountLabel = card ? `${card.bank} •${card.last4}` : box ? `касса «${box.name}»` : "наличные без кассы";
  return { center, account: card || box ? account : "", accountLabel };
}

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

export default async function NewTx({ searchParams }: { searchParams: Promise<{ type?: string; saved?: string }> }) {
  const { type, saved } = await searchParams;
  const tab = type === "in" || type === "move" ? type : "out";
  const last = lastChoice();

  return (
    <div className="narrow">
      <h1>Новая операция</h1>
      <SegTabs tabs={TABS} active={tab} />
      {saved && <div className="toast-row">✓ Записано. Можно вводить следующую.</div>}
      {tab === "out" && (
        <form action={addTransaction} className="card form form-big">
          <input type="hidden" name="direction" value="out" />
          <Amount />
          <CategoryChips required label="На что — категория" suggested={popularCategories(6)} />
          <label>
            Комментарий
            <input name="description" required placeholder="например, продукты на неделю" />
          </label>
          {last.center ? (
            <details className="quick-defaults">
              <summary>
                <span>
                  <b>{last.center.name}</b> · {last.accountLabel}
                </span>
                <span className="link">изменить</span>
              </summary>
              <div className="form">
                <CenterChips required label="Чьи это деньги — направление" includeInternal={false} defaultValue={last.center.id} />
                <AccountChips label="Откуда списались деньги" none="Наличными, без кассы" defaultValue={last.account} hint="Касса — расход уменьшит её остаток. Карта — трата попадёт в её лимит." />
              </div>
            </details>
          ) : (
            <>
              <CenterChips required label="Чьи это деньги — направление" includeInternal={false} />
              <AccountChips label="Откуда списались деньги" none="Наличными, без кассы" hint="Касса — расход уменьшит её остаток. Карта — трата попадёт в её лимит." />
            </>
          )}
          <CashCenterLink />
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
          <div className="review-actions">
            <button className="btn btn-primary btn-big">Записать расход</button>
            <button className="btn btn-big" name="again" value="1">Записать и ещё одну</button>
          </div>
        </form>
      )}

      {tab === "in" && (
        <form action={addIncomeAction} className="card form form-big">
          <Amount />
          <ChipPicker name="kind" label="Что это" defaultValue="Ставка" options={["Ставка", ...OTHER_INCOME_KINDS].map((k) => ({ value: k, label: k }))} />
          <AccountChips label="Куда пришли деньги" none="Наличными, без кассы" hint="Выберите кассу — приход появится в её истории, а остаток вырастет." />
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
