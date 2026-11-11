import Link from "next/link";
import { notFound } from "next/navigation";
import { closeListAction, closePlainAction, deleteListAction, renameListAction, reopenListAction } from "../actions.ts";
import { ShoppingEditor } from "./ShoppingEditor.tsx";
import { AccountChips, CategoryChips, CenterChips } from "../../components/Pickers.tsx";
import { formatMoney } from "@/lib/money.ts";
import { getList, groupTotals, lastPrices, listSum, paymentMatches } from "@/lib/shopping.ts";
import { groupById } from "@/lib/groups.ts";
import { ReceiptButton } from "../ReceiptButton.tsx";
import { listCategories } from "@/lib/categories.ts";
import { personalCenterIds } from "@/lib/repo.ts";

export default async function ShoppingListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; new?: string; receipt?: string }> }) {
  const { id: raw } = await params;
  const { from, new: isNew, receipt } = await searchParams;
  const l = getList(Number(raw));
  if (!l) notFound();
  const hints = Object.fromEntries(lastPrices(l.items.map((i) => i.name)));
  const sum = listSum(l);
  const groups = groupTotals(l);
  const checkTotal = l.receipt_total ?? sum;
  const matches = l.status === "open" ? paymentMatches(checkTotal, l.receipt_date) : [];
  const bought = l.items.filter((i) => i.bought).length;
  const left = l.items.length - bought;
  const food = listCategories().find((c) => c.name === "Продукты")?.id;
  const personal = personalCenterIds()[0];
  const closed = l.status === "closed";

  return (
    <div className="narrow-wide">
      <div className="crumbs">
        <Link href="/shopping">Списки покупок</Link>
      </div>
      <details className="list-title">
        <summary>
          <h1>{l.title}</h1>
          {l.store && <span className="muted small">{l.store}</span>}
        </summary>
        {!closed && (
          <form action={renameListAction} className="form card" style={{ marginTop: 8 }}>
            <input type="hidden" name="id" value={l.id} />
            <div className="grid-2-tight">
              <label>
                Название
                <input name="title" defaultValue={l.title} />
              </label>
              <label>
                Магазин
                <input name="store" defaultValue={l.store} placeholder="например, АТБ" />
              </label>
            </div>
            <button className="btn btn-sm">Сохранить</button>
          </form>
        )}
      </details>
      {!closed && (
        <div className="row-gap" style={{ marginTop: 0 }}>
          <ReceiptButton listId={l.id} />
        </div>
      )}
      {receipt && <div className="card ok-note">Чек прочитан ✓ Проверьте товары и цены — всё можно поправить.</div>}
      {l.source === "receipt" && (
        <section className="card receipt-sum">
          <div className="row-between">
            <span>
              🧾 <b>{l.store || "Чек"}</b>
              {l.receipt_date && <span className="muted small"> · {new Date(`${l.receipt_date}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}</span>}
            </span>
            {l.receipt_total ? <b>{formatMoney(l.receipt_total)}</b> : null}
          </div>
          {l.receipt_total && sum && Math.abs(l.receipt_total - sum) >= 100 ? (
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              По товарам {formatMoney(sum)} — разница {formatMoney(Math.abs(l.receipt_total - sum))} (скидки или нечитаемая строка).
            </p>
          ) : null}
          {groups.length > 0 && (
            <div className="grp-chips">
              {groups.map((g) => {
                const meta = groupById(g.grp);
                return (
                  <span key={g.grp} className="grp-chip">
                    {meta ? `${meta.emoji} ${meta.name}` : "Без группы"} <b>{formatMoney(g.sum)}</b>
                  </span>
                );
              })}
            </div>
          )}
        </section>
      )}
      {from && <div className="card ok-note">Прошлый список закрыт ✓ Некупленное перенесено сюда.</div>}
      {closed && !l.tx_id && <div className="card ok-note">Список закрыт ✓</div>}
      {closed && l.tx_id && (
        <div className="card ok-note">
          Записано как расход · {formatMoney(l.total ?? 0)}
          {l.tx_id && (
            <>
              {" · "}
              <Link href={`/inbox/${l.tx_id}`} className="link">
                открыть расход
              </Link>
            </>
          )}
        </div>
      )}

      <ShoppingEditor listId={l.id} initial={l.items} hints={hints} readOnly={closed} autoFocus={Boolean(isNew) || l.items.length === 0} />

      {!closed && l.items.length > 0 && (
        <section className="card finish">
          <h2>Закончить список</h2>
          <div className="finish-opts">
            <form action={closePlainAction} className="form finish-opt">
              <input type="hidden" name="id" value={l.id} />
              {left > 0 && (
                <label className="check">
                  <input type="checkbox" name="carryOver" defaultChecked /> Некупленное ({left}) — в новый список
                </label>
              )}
              <button className="btn btn-big">✓ Просто закрыть</button>
              <span className="muted small">Без денег — как обычный список.</span>
            </form>
            <details className="finish-opt finish-money">
              <summary className="btn btn-primary btn-big">₴ Записать как расход</summary>
              <form action={closeListAction} className="form form-big" style={{ marginTop: 12 }}>
                <input type="hidden" name="id" value={l.id} />
                <label className="amount-field">
                  <input name="total" inputMode="decimal" className="amount-input" defaultValue={checkTotal ? checkTotal / 100 : ""} placeholder="0" aria-label="Сумма чека, ₴" />
                  <span className="amount-cur" aria-hidden>
                    ₴
                  </span>
                </label>
                <p className="muted small" style={{ margin: "-6px 0 0", textAlign: "center" }}>
                  {l.receipt_total ? "итог из чека" : sum ? "посчитано по ценам товаров — можно поправить по чеку" : "сумма из чека"}
                </p>
                {matches.length > 0 && (
                  <fieldset className="chips-field merge-box">
                    <legend>💳 Эта покупка уже пришла из банка?</legend>
                    <p className="muted small" style={{ margin: "0 0 8px" }}>
                      Есть оплата на ту же сумму. Объединим — будет один расход с товарами, без дубля.
                    </p>
                    <div className="chips">
                      {matches.map((m, i) => (
                        <label key={m.id} className="chip-opt">
                          <input type="radio" name="merge" value={m.id} defaultChecked={i === 0} />
                          <span>
                            {m.counterparty || "Оплата"} · {m.card_label ?? "карта"} ·{" "}
                            {new Date(m.occurred_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </label>
                      ))}
                      <label className="chip-opt">
                        <input type="radio" name="merge" value="" />
                        <span>Нет, это другая покупка</span>
                      </label>
                    </div>
                  </fieldset>
                )}
                <CenterChips required label="Чьи это деньги" defaultValue={personal} includeInternal={false} />
                <CategoryChips label="Категория" defaultValue={food} suggested={food ? [food] : []} />
                <AccountChips label="Откуда списались деньги" none="Наличными, без кассы" />
                {left > 0 && (
                  <label className="check">
                    <input type="checkbox" name="carryOver" defaultChecked /> Некупленное ({left}) — в новый список
                  </label>
                )}
                <button className="btn btn-primary btn-big">Записать расход и закрыть</button>
              </form>
            </details>
          </div>
        </section>
      )}

      {closed && !l.tx_id && (
        <form action={reopenListAction} style={{ marginTop: 4 }}>
          <input type="hidden" name="id" value={l.id} />
          <button className="btn btn-sm">↩ Открыть список снова</button>
        </form>
      )}

      <form action={deleteListAction} style={{ marginTop: 8 }}>
        <input type="hidden" name="id" value={l.id} />
        <button className="btn btn-ghost btn-sm danger">Удалить список</button>
      </form>
    </div>
  );
}
