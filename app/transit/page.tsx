import { createTransitAction, deleteTransitAction, finishTransitAction } from "../actions.ts";
import { Hint } from "../components/Hint.tsx";
import { formatMoney } from "@/lib/money.ts";
import { listTransits, transitOpenSum, transitTransactions } from "@/lib/transit.ts";

const when = (iso: string) => new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });

export default function TransitPage() {
  const open = listTransits(true);
  const done = listTransits(false, 15);
  const sum = transitOpenSum();
  return (
    <div className="narrow-wide">
      <h1>Чужие деньги</h1>
      <Hint>
        Деньги, которые не ваши и которые нужно кому-то передать. Например, сняли в банке наличные компании. Пока не отдали — они лежат
        отдельно и не считаются ни доходом, ни расходом.
      </Hint>

      <section className={`card ${sum > 0 ? "transit-hold" : ""}`}>
        <div className="summary-label">Сейчас у вас чужих денег</div>
        <div className="summary-value">{formatMoney(sum)}</div>
        {sum > 0 && <div className="small">Это не ваши деньги — нажмите «✓ Отдал», когда передадите.</div>}
      </section>

      {open.map((t) => {
        const ops = transitTransactions(t.id);
        return (
          <section key={t.id} className="card">
            <div className="row-between">
              <strong>{t.title}</strong>
              <strong>{formatMoney(t.amount)}</strong>
            </div>
            <div className="muted small">
              с {when(t.created_at)}
              {t.note && ` · ${t.note}`}
              {ops.length > 0 && ` · связано операций: ${ops.length}`}
            </div>
            <div className="row-gap" style={{ marginBottom: 0 }}>
              <form action={finishTransitAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="next" value="/transit" />
                <button className="btn btn-primary btn-sm">✓ Отдал</button>
              </form>
              <form action={deleteTransitAction}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="next" value="/transit" />
                <button className="btn btn-ghost btn-sm danger">Удалить запись</button>
              </form>
            </div>
          </section>
        );
      })}

      <details className="card settings-fold add-fold" open={open.length === 0}>
        <summary>+ Взял чужие деньги</summary>
        <form action={createTransitAction} className="form form-big" style={{ marginTop: 14 }}>
        <label className="amount-field">
          <input name="amount" inputMode="decimal" required className="amount-input" placeholder="0" aria-label="Сумма, ₴" />
          <span className="amount-cur" aria-hidden>₴</span>
        </label>
        <label>
          Что за деньги
          <input name="title" required placeholder="например, Наличные для компании" />
        </label>
        <label>
          Кому отдать
          <input name="note" placeholder="необязательно" />
        </label>
        <button className="btn btn-primary btn-big">Отложить как чужие</button>
        <p className="muted small" style={{ margin: 0 }}>
          Деньги прошли через вашу карту? Откройте эту операцию (или нажмите в Telegram «↔ Чужие деньги») — она не попадёт в ваши доходы и
          расходы.
        </p>
        </form>
      </details>

      {done.length > 0 && (
        <section className="card">
          <h2>Отдано</h2>
          {done.map((t) => (
            <div key={t.id} className="row-between tree-row">
              <span>
                ✓ {t.title} <span className="muted small">· {t.done_at ? when(t.done_at) : ""}</span>
              </span>
              <span className="inline" style={{ margin: 0, alignItems: "center" }}>
                <span className="muted">{formatMoney(t.amount)}</span>
                <form action={finishTransitAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="undo" value="1" />
                  <input type="hidden" name="next" value="/transit" />
                  <button className="btn btn-ghost btn-sm" title="Отметили по ошибке">↩</button>
                </form>
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
