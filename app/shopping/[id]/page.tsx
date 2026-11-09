import Link from "next/link";
import { notFound } from "next/navigation";
import { closeListAction, deleteListAction, renameListAction } from "../actions.ts";
import { ShoppingEditor } from "./ShoppingEditor.tsx";
import { AccountChips, CategoryChips, CenterChips } from "../../components/Pickers.tsx";
import { formatMoney } from "@/lib/money.ts";
import { getList, lastPrices, listSum } from "@/lib/shopping.ts";
import { listCategories } from "@/lib/categories.ts";
import { personalCenterIds } from "@/lib/repo.ts";

export default async function ShoppingListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id: raw } = await params;
  const { from } = await searchParams;
  const l = getList(Number(raw));
  if (!l) notFound();
  const hints = Object.fromEntries(lastPrices(l.items.map((i) => i.name)));
  const sum = listSum(l);
  const bought = l.items.filter((i) => i.bought).length;
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
      {from && <div className="card ok-note">Чек закрыт ✓ Некупленное перенесено сюда.</div>}
      {closed && (
        <div className="card ok-note">
          Чек закрыт · {formatMoney(l.total ?? 0)}
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

      <ShoppingEditor listId={l.id} initial={l.items} hints={hints} readOnly={closed} />

      {!closed && l.items.length > 0 && (
        <>
          <a href="#close" className="shop-bar">
            <span>
              Куплено {bought} из {l.items.length}
              {sum > 0 && <b> · {formatMoney(sum)}</b>}
            </span>
            <span className="shop-bar-btn">Закрыть чек ›</span>
          </a>

          <form action={closeListAction} className="card form form-big" id="close">
            <h2>Закрыть чек</h2>
            <input type="hidden" name="id" value={l.id} />
            <label className="amount-field">
              <input name="total" inputMode="decimal" className="amount-input" defaultValue={sum ? sum / 100 : ""} placeholder="0" aria-label="Сумма чека, ₴" />
              <span className="amount-cur" aria-hidden>
                ₴
              </span>
            </label>
            <p className="muted small" style={{ margin: "-6px 0 0", textAlign: "center" }}>
              {sum ? "сумма по ценам товаров — можно поправить по чеку" : "впишите сумму чека"}
            </p>
            <CenterChips required label="Чьи это деньги" defaultValue={personal} includeInternal={false} />
            <CategoryChips label="Категория" defaultValue={food} suggested={food ? [food] : []} />
            <AccountChips label="Откуда списались деньги" none="Наличными, без кассы" />
            {bought < l.items.length && (
              <label className="check">
                <input type="checkbox" name="carryOver" defaultChecked /> Перенести некупленное ({l.items.length - bought}) в новый список
              </label>
            )}
            <button className="btn btn-primary btn-big">Закрыть чек и записать расход</button>
          </form>
        </>
      )}

      <form action={deleteListAction} style={{ marginTop: 8 }}>
        <input type="hidden" name="id" value={l.id} />
        <button className="btn btn-ghost btn-sm danger">Удалить список</button>
      </form>
    </div>
  );
}
