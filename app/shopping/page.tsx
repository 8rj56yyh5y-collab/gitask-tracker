import Link from "next/link";
import { createListAction } from "./actions.ts";
import { formatMoney } from "@/lib/money.ts";
import { listLists, listSum } from "@/lib/shopping.ts";

const when = (iso: string | null) =>
  iso ? new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "";

export default async function Shopping({ searchParams }: { searchParams: Promise<{ closed?: string }> }) {
  const { closed } = await searchParams;
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
        Составьте список перед магазином, в магазине отмечайте купленное и вписывайте цены. «Закрыть чек» — и покупка сразу записана как расход.
      </p>
      {closed && (
        <div className="card ok-note">
          Чек закрыт и записан ✓{" "}
          <Link href={`/inbox/${closed}`} className="link">
            открыть расход
          </Link>
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

      <details className="card settings-fold add-fold" open={open.length === 0}>
        <summary>+ Новый список</summary>
        <form action={createListAction} className="form" style={{ marginTop: 14 }}>
          <label>
            Название (необязательно)
            <input name="title" placeholder="например, Продукты на неделю" />
          </label>
          <label>
            Что купить — по одному в строке
            <textarea name="items" rows={5} placeholder={"Яйца 10 шт\nФарш 0,5 кг\nМолоко 2\nХлеб"} className="shop-textarea" />
          </label>
          <button className="btn btn-primary btn-big">Создать список</button>
        </form>
      </details>

      {done.length > 0 && (
        <section>
          <h2>Закрытые чеки</h2>
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
                <strong className="plan-amount">{formatMoney(l.total ?? 0)}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
