import Link from "next/link";
import { notFound } from "next/navigation";
import { assignTransaction, createTransitAction, linkTransitAction, markIncomeAction, removeTransaction } from "../../actions.ts";
import { listTransits } from "@/lib/transit.ts";
import { formatMoney } from "@/lib/money.ts";
import { TxRow } from "../../components/TxRow.tsx";
import { centerTree, getTx, suggestCenters } from "@/lib/repo.ts";

// Экран «Куда ушли деньги?» — его открывает «Команда» iOS сразу после оплаты.
export default async function AssignOne({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tx = getTx(Number(id));
  if (!tx) notFound();
  const tree = centerTree();
  const sugg = new Set(suggestCenters(tx));
  const transits = listTransits(true);
  const isIn = tx.amount > 0;

  return (
    <div className="narrow-wide">
      <h1>{tx.amount > 0 ? "Откуда пришли деньги?" : "На что ушли деньги?"}</h1>
      {tx.amount > 0 && !tx.sale_id && (
        <Link href={`/sales/new?tx=${tx.id}`} className="card alert-budget plain" style={{ display: "block" }}>
          <strong>Это оплата за товар компании?</strong>
          <div className="muted small">Записать как продажу: посчитается ваша комиссия, остальное — долг компании ›</div>
        </Link>
      )}
      <div className="card">
        <TxRow tx={tx} />
      </div>
      <form action={assignTransaction} className="card form">
        <input type="hidden" name="id" value={tx.id} />
        <input type="hidden" name="next" value="/inbox" />
        <div className="choices">
          {tree.map((c) => (
            <label key={c.id} className={`choice ${sugg.has(c.id) ? "choice-sugg" : ""}`} style={{ marginLeft: c.depth * 16 }}>
              <input type="radio" name="centerId" value={c.id} defaultChecked={tx.cost_center_id === c.id} required />
              <i className="dot" style={{ background: c.color }} />
              {c.name}
            </label>
          ))}
        </div>
        <label>
          Для кого
          <input name="forWhom" defaultValue={tx.for_whom} placeholder="например, семья" />
        </label>
        <label>
          Комментарий
          <input name="description" defaultValue={tx.description} placeholder="необязательно" />
        </label>
        <button className="btn btn-primary">Записать</button>
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

      {!tx.transit_id && (
        <section className="card form">
          <h2>Это чужие деньги (транзит)?</h2>
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
  );
}
