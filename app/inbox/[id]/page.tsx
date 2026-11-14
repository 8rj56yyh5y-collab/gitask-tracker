import Link from "next/link";
import { notFound } from "next/navigation";
import { assignTransaction, setTxCardAction, createTransitAction, linkTransitAction, markIncomeAction, removeTransaction } from "../../actions.ts";
import { listTransits } from "@/lib/transit.ts";
import { formatMoney } from "@/lib/money.ts";
import { TxRow } from "../../components/TxRow.tsx";
import { CardChips, CategoryChips, CenterChips } from "../../components/Pickers.tsx";
import { getCategory, label, suggestedCategories } from "@/lib/categories.ts";
import { cardHintOf, getTx, listCards, needsCard, suggestCenters } from "@/lib/repo.ts";
import { isSimple, personalCenterId } from "@/lib/mode.ts";
import { inWorkTime } from "@/lib/hours.ts";

// Экран «Куда ушли деньги?» — его открывает «Команда» iOS сразу после оплаты.
export default async function AssignOne({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; cat?: string; card_ok?: string }> }) {
  const { id } = await params;
  const { c: pickedRaw, cat: catRaw, card_ok } = await searchParams;
  const simple = isSimple();
  const tx = getTx(Number(id));
  if (!tx) notFound();
  const sugg = new Set(suggestCenters(tx));
  const transits = listTransits(true);
  const isIn = tx.amount > 0;
  const picked = Number(pickedRaw) || null;
  const recorded = Boolean(tx.cost_center_id && !tx.needs_note);
  // Комментарий, который человек уже писал, — оставляем; иначе подставляем подсказку ИИ.
  const noteDefault = tx.assigned_at && !tx.needs_note ? tx.description : (tx.ai_note ?? "");
  const aiCat = getCategory(tx.ai_category_id);

  return (
    <div className="narrow-wide">
      <h1>{recorded ? "Операция" : tx.amount > 0 ? "Что это за поступление?" : "На что ушли деньги?"}</h1>
      {card_ok && <div className="card ok-note">Карта сохранена ✓</div>}
      <div className="card">
        <TxRow tx={tx} />
        {tx.amount < 0 && inWorkTime(tx.amount) && <div className="tx-hours">⏱ {inWorkTime(tx.amount)}</div>}
        {!tx.cashbox_id && listCards().length > 0 && (
          <details className={`card-edit ${needsCard(tx) ? "is-ask" : ""}`} open={needsCard(tx)}>
            <summary>
              <span>💳 {tx.card_label ? `Карта: ${tx.card_label}` : needsCard(tx) ? "Карта не определилась — выберите" : "Карта не указана"}</span>
              <span className="card-edit-btn">{tx.card_id ? "Изменить" : "Указать"}</span>
            </summary>
            <form action={setTxCardAction} className="form" style={{ marginTop: 10 }}>
              <input type="hidden" name="id" value={tx.id} />
              <CardChips label="С какой карты оплатили" defaultValue={tx.card_id ?? undefined} />
              {cardHintOf(tx) && (
                <p className="muted small" style={{ margin: 0 }}>
                  В Apple Pay карта называется «{cardHintOf(tx)}». D&amp;N запомнит выбор — следующие оплаты с неё определятся сами.
                </p>
              )}
              <button className="btn btn-primary">Сохранить карту</button>
            </form>
          </details>
        )}
      </div>
      <form action={assignTransaction} className="card form">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="next" value="/inbox" />
        {aiCat && !isIn && (
          <div className="ai-hint">
            ✨ Похоже на <b>{label(aiCat)}</b>
            {tx.ai_note && <> — «{tx.ai_note}»</>}
          </div>
        )}
        {!isIn && (
          <CategoryChips tiles label="На что" required defaultValue={Number(catRaw) || tx.category_id} aiId={tx.ai_category_id} suggested={suggestedCategories(tx, 8)} />
        )}
        <label>
          Комментарий
          <input name="description" required defaultValue={noteDefault} placeholder={isIn ? "например, вернул долг" : "например, продукты на неделю"} />
        </label>
        {simple ? (
          <input type="hidden" name="centerId" value={picked ?? tx.cost_center_id ?? personalCenterId() ?? ""} />
        ) : (
          <CenterChips label={isIn ? "Чьи это деньги" : "Чьи это деньги — мои, работы, семьи"} required defaultValue={picked ?? tx.cost_center_id} first={[...sugg]} />
        )}
        <details className="more-fields">
          <summary>Для кого (необязательно)</summary>
          <div className="form">
            <label>
              Для кого
              <input name="forWhom" defaultValue={tx.for_whom} placeholder="например, семья" />
            </label>
          </div>
        </details>
        <button className="btn btn-primary btn-big">Сохранить</button>
      </form>
      {isIn && !tx.sale_id && (
        <section className="card">
          <h2>Это доход?</h2>
          <p className="muted small" style={{ marginTop: 0 }}>Тогда направление не нужно — он просто попадёт в «Доходы».</p>
          <div className="row-gap" style={{ margin: 0 }}>
            <form action={markIncomeAction}>
              <input type="hidden" name="id" value={tx.id} />
              <input type="hidden" name="kind" value="salary" />
              <button className="btn btn-sm">Это ставка</button>
            </form>
            <form action={markIncomeAction}>
              <input type="hidden" name="id" value={tx.id} />
              <input type="hidden" name="kind" value="other" />
              <button className="btn btn-sm">Другой доход</button>
            </form>
          </div>
        </section>
      )}

      <details className="card more-actions">
        <summary>Ещё действия: чужие деньги, удалить</summary>
        <div className="more-actions-body">
      {!simple && tx.amount > 0 && !tx.sale_id && (
        <Link href={`/sales/new?tx=${tx.id}`} className="card alert-budget plain" style={{ display: "block" }}>
          <strong>Это оплата за товар компании?</strong>
          <div className="muted small">Записать как продажу: посчитается ваша комиссия, остальное — долг компании ›</div>
        </Link>
      )}
      {!simple && !tx.transit_id && (
        <section className="card form">
          <h2>Это чужие деньги?</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Например, сняли наличные компании и отдадите их. Операция не будет считаться ни доходом, ни расходом.
          </p>
          {transits.length > 0 && (
            <form action={linkTransitAction} className="inline" style={{ alignItems: "center" }}>
              <input type="hidden" name="txId" value={tx.id} />
              <select name="transitId" defaultValue={transits[0].id} aria-label="Транзит">
                {transits.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {formatMoney(t.amount)}
                  </option>
                ))}
              </select>
              <button className="btn btn-sm">Добавить</button>
            </form>
          )}
          <form action={createTransitAction} className="inline" style={{ alignItems: "center" }}>
            <input type="hidden" name="txId" value={tx.id} />
            <input type="hidden" name="amount" value={Math.abs(tx.amount) / 100} />
            <input name="title" required placeholder="Что за деньги, например, Наличные для компании" aria-label="Что за деньги" />
            <button className="btn btn-sm">{transits.length ? "Новый" : "Заморозить"}</button>
          </form>
        </section>
      )}

      <form action={removeTransaction}>
        <input type="hidden" name="id" value={tx.id} />
        <button className="btn btn-ghost btn-sm danger">Удалить операцию — если это дубль или ошибка</button>
      </form>
        </div>
      </details>
    </div>
  );
}
