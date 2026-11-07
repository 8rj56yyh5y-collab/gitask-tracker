import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelPlanAction, payPlanAction, restorePlanAction, undoPlanPaymentAction, updatePlanAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { AccountChips } from "../../components/Pickers.tsx";
import { CenterSelect } from "../../components/CenterSelect.tsx";
import { TxRow } from "../../components/TxRow.tsx";
import { getDb } from "@/lib/db.ts";
import { formatMoney } from "@/lib/money.ts";
import { getPlan } from "@/lib/plans.ts";
import type { Tx } from "@/lib/repo.ts";

export default async function PlanPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ undone?: string }> }) {
  const { id: raw } = await params;
  const { undone } = await searchParams;
  const p = getPlan(Number(raw));
  if (!p) notFound();
  const left = p.total - p.paid;
  const isIn = p.direction === "in";
  const acc = p.card_id ? `card:${p.card_id}` : p.cashbox_id ? `cash:${p.cashbox_id}` : "";
  const payments = getDb()
    .prepare(
      `SELECT t.*, c.bank || ' *' || c.last4 AS card_label, c.bank AS card_bank, c.color AS card_color, c.badge AS card_badge, cb.name AS cashbox_name
       FROM transactions t LEFT JOIN cards c ON c.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.plan_id = ? ORDER BY t.occurred_at DESC`,
    )
    .all(p.id) as unknown as Tx[];

  return (
    <div className="narrow-wide">
      <div className="muted small">
        {p.kind === "salary" ? (
          <Link href="/income">Доходы · Ставка</Link>
        ) : (
          <Link href={`/plans?tab=${p.direction}`}>Платежи · {isIn ? "Мне должны" : "Я плачу"}</Link>
        )}
      </div>
      <h1>{p.title}</h1>
      <section className="card">
        <div className="muted small">{p.kind === "salary" ? "ставка, каждый месяц" : p.direction === "in" ? "мне должны" : "я плачу"}{p.payee && ` · ${p.payee}`}{p.due_date && ` · до ${new Date(`${p.due_date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`}{p.repeat === "month" && " · каждый месяц"}</div>
        <div className="big" style={{ marginTop: 6 }}>{p.status === "open" ? `Осталось ${formatMoney(left)}` : p.status === "done" ? (isIn ? "Получено ✓" : "Оплачено ✓") : "Отменён"}</div>
        <div className="limit-track">
          <div className="limit-fill" style={{ width: `${Math.min(100, (p.paid / p.total) * 100)}%`, background: "var(--green)" }} />
        </div>
        <div className="muted small">
          {isIn ? "получено" : "оплачено"} {formatMoney(p.paid)} из {formatMoney(p.total)}
        </div>
      </section>

      {undone && (
        <div className="card ok-note">↩ Оплата отменена{p.status === "open" ? " — платёж снова ждёт оплаты." : "."}</div>
      )}
      {p.status === "cancelled" && (
        <form action={restorePlanAction} className="card">
          <p style={{ marginTop: 0 }}>Этот платёж отменён.</p>
          <input type="hidden" name="id" value={p.id} />
          <button className="btn btn-primary">↩ Вернуть платёж</button>
        </form>
      )}

      {p.status === "open" && (
        <form action={payPlanAction} className="card form form-big">
          <h2>{isIn ? "Деньги пришли" : "Оплатить"}</h2>
          <input type="hidden" name="id" value={p.id} />
          <input type="hidden" name="next" value={`/plans/${p.id}`} />
          <label className="amount-field">
            <input name="amount" inputMode="decimal" defaultValue={left / 100} required className="amount-input" aria-label="Сумма, ₴ — всё или часть" />
            <span className="amount-cur" aria-hidden>₴</span>
          </label>
          <p className="muted small" style={{ margin: "-6px 0 0", textAlign: "center" }}>можно всю сумму или часть</p>
          <AccountChips label={isIn ? "Куда пришли" : "Чем платили"} defaultValue={acc} none="Наличными / не важно" />
          <details className="more-fields">
            <summary>Другая дата</summary>
            <div className="form">
              <label>
                Дата
                <input name="at" type="date" />
              </label>
            </div>
          </details>
          <button className="btn btn-primary btn-big">{isIn ? "Записать поступление" : "Записать оплату"}</button>
        </form>
      )}

      <section className="card">
        <h2>{isIn ? "Поступления" : "Оплаты"}</h2>
        {payments.length === 0 && <p className="muted small">{isIn ? "Денег пока не приходило." : "Оплат пока не было."}</p>}
        {payments.map((t) => (
          <div key={t.id} className="pay-row">
            <Link href={`/inbox/${t.id}`} className="plain pay-row-main">
              <TxRow tx={t} />
            </Link>
            <form action={undoPlanPaymentAction}>
              <input type="hidden" name="txId" value={t.id} />
              <button className="btn btn-sm btn-ghost" title={t.source === "manual" ? "Удалить эту оплату" : "Операция из банка останется в истории, но перестанет считаться оплатой этого платежа"}>
                ↩ Отменить
              </button>
            </form>
          </div>
        ))}
        {payments.length > 0 && (
          <p className="muted small" style={{ margin: "6px 0 0" }}>
            Отметили по ошибке? Нажмите «↩ Отменить» — платёж снова станет неоплаченным.
          </p>
        )}
      </section>

      <details className="card settings-fold">
      <summary>Изменить платёж</summary>
      <form action={updatePlanAction} className="form" style={{ marginTop: 14 }}>
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="next" value={`/plans/${p.id}`} />
        <label>
          Название
          <input name="title" defaultValue={p.title} required />
        </label>
        <div className="grid-2-tight">
          <label>
            Сумма, ₴
            <input name="total" inputMode="decimal" defaultValue={p.total / 100} required />
          </label>
          <label>
            {isIn ? "Когда ждать" : "Когда оплатить"}
            <input name="due" type="date" defaultValue={p.due_date ?? ""} />
          </label>
        </div>
        <label>
          {isIn ? "Куда придут" : "Платить с"}
          <AccountSelect defaultValue={acc} none="— выберу при оплате —" />
        </label>
        {!isIn && (
          <label>
            Направление
            <CenterSelect defaultValue={p.cost_center_id} />
          </label>
        )}
        {p.kind === "salary" ? (
          <>
            <input type="hidden" name="repeat" value="month" />
            <input type="hidden" name="autoShown" value="1" />
            <label className="check">
              <input type="checkbox" name="auto" value="1" defaultChecked={Boolean(p.auto)} /> Зачислять автоматически в этот день
            </label>
          </>
        ) : (
          <label className="check">
            <input type="checkbox" name="repeat" value="month" defaultChecked={p.repeat === "month"} /> Повторять каждый месяц
          </label>
        )}
        <label>
          Комментарий
          <input name="note" defaultValue={p.note} />
        </label>
        <button className="btn">Сохранить</button>
      </form>
      </details>
      {p.status === "open" && (
        <form action={cancelPlanAction}>
          <input type="hidden" name="id" value={p.id} />
          <button className="btn btn-ghost btn-sm danger">{p.kind === "salary" ? "Удалить ставку" : isIn ? "Больше не жду" : "Отменить платёж"}</button>
        </form>
      )}
    </div>
  );
}
