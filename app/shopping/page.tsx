import Link from "next/link";
import { quickListAction } from "./actions.ts";
import { formatMoney } from "@/lib/money.ts";
import { listLists, listSum } from "@/lib/shopping.ts";

const when = (iso: string | null) =>
  iso ? new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";

export default async function Shopping({ searchParams }: { searchParams: Promise<{ closed?: string; done?: string }> }) {
  const { closed, done: plainDone } = await searchParams;
  const open = listLists("open");
  const done = listLists("closed", 15);
  return (
    <div className="narrow-wide">
      <div className="page-head">
        <h1>Список покупок</h1>
        <Link href="/shopping/prices" className="btn btn-sm">
          Цены товаров
        </Link>
      </div>
      <p className="page-hint">
        Обычный список покупок: впишите товары, в магазине отмечайте купленное. Если хотите — впишите цены или итог чека, и покупка запишется
        расходом.
      </p>
      {plainDone && <div className="card ok-note">Список закрыт ✓</div>}
      {closed && (
        <div className="card ok-note">
          Покупка записана как расход ✓{" "}
          <Link href={`/inbox/${closed}`} className="link">
            открыть расход
          </Link>
        </div>
      )}

      <form action={quickListAction}>
        <button className="new-list">
          <span className="new-list-plus" aria-hidden>
            +
          </span>
          <span>
            <strong>Новый список</strong>
            <span className="muted small">Откроется сразу — пишите товары</span>
          </span>
        </button>
      </form>

      {open.length === 0 && done.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🛒</div>
          <strong>Списков пока нет</strong>
          <p>Нажмите «Новый список» и впишите, что купить. В магазине отмечайте купленное — и ничего не забудете.</p>
        </div>
      )}
      {open.map((l) => {
        const bought = l.items.filter((i) => i.bought).length;
        const sum = listSum(l);
        return (
          <Link key={l.id} href={`/shopping/${l.id}`} className="card shop-card">
            <div className="row-between">
              <strong>🛒 {l.title}</strong>
              <span className="muted small">
                {bought} из {l.items.length}
              </span>
            </div>
            <div className="limit-track">
              <div className="limit-fill" style={{ width: `${l.items.length ? (bought / l.items.length) * 100 : 0}%`, background: "var(--green)" }} />
            </div>
            <div className="muted small shop-card-items">
              {l.items.slice(0, 6).map((i) => i.name).join(", ")}
              {l.items.length > 6 && "…"}
              {sum > 0 && <b> · {formatMoney(sum)}</b>}
            </div>
          </Link>
        );
      })}



      {done.length > 0 && (
        <section>
          <h2>Закрытые списки</h2>
          <div className="card plan-list">
            {done.map((l) => (
              <Link key={l.id} href={`/shopping/${l.id}`} className="plan-row">
                <span className="date-tile is-done">✓</span>
                <span className="plan-main">
                  <strong>{l.title}</strong>
                  <span className="plan-due">
                    {when(l.closed_at)} · {l.items.filter((i) => i.bought).length} товаров{l.store && ` · ${l.store}`}
                  </span>
                </span>
                <strong className="plan-amount">{l.total ? formatMoney(l.total) : <span className="muted small">без суммы</span>}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
