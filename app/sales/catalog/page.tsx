import { archiveGroupAction, archiveProductAction, saveGroupAction, saveProductAction, setSalesBaseAction } from "../../actions.ts";
import { ChipPicker } from "../../components/Pickers.tsx";
import { SalesTabs } from "../SalesTabs.tsx";
import { formatMoney } from "@/lib/money.ts";
import type { Tier } from "@/lib/pricing.ts";
import { listGroups, listProducts, salesBase } from "@/lib/sales.ts";

type Group = ReturnType<typeof listGroups>[number];

function ProductFields({ p, groups }: { p?: { id: number; name: string; unit: string; group_id: number | null; tierList: Tier[] }; groups: Group[] }) {
  const one = p?.tierList.find((t) => t.qty === 1);
  const sets = (p?.tierList ?? []).filter((t) => t.qty > 1);
  return (
    <>
      {p && <input type="hidden" name="id" value={p.id} />}
      <input type="hidden" name="next" value="/sales/catalog" />
      <label>
        Название товара
        <input name="name" required defaultValue={p?.name} placeholder="например, Свеча ароматическая" />
      </label>
      <div className="grid-2-tight">
        <label>
          Цена за 1, ₴
          <input name="price1" inputMode="decimal" defaultValue={one ? one.price / 100 : ""} placeholder="450" />
        </label>
        <label>
          Единица
          <input name="unit" defaultValue={p?.unit ?? "шт."} />
        </label>
      </div>
      <div className="sets">
        <div className="sets-title">Цена за набор (если дешевле) — необязательно</div>
        {[1, 2, 3].map((i) => {
          const t = sets[i - 1];
          return (
            <div key={i} className="set-row">
              <input name={`setQty${i}`} inputMode="numeric" defaultValue={t?.qty ?? ""} placeholder={i === 1 ? "3" : "кол-во"} aria-label={`Набор ${i}: сколько штук`} />
              <span>шт. за</span>
              <input name={`setPrice${i}`} inputMode="decimal" defaultValue={t ? t.price / 100 : ""} placeholder={i === 1 ? "1200" : "цена"} aria-label={`Набор ${i}: цена, ₴`} />
              <span>₴</span>
            </div>
          );
        })}
      </div>
      {groups.length > 0 && (
        <ChipPicker
          name="groupId"
          label="Группа — от неё зависят проценты"
          defaultValue={p ? (p.group_id ?? "") : (groups[0]?.id ?? "")}
          options={[{ value: "", label: "Без группы" }, ...groups.map((g) => ({ value: g.id, label: `${g.name} · ${g.sales_rate}%` }))]}
        />
      )}
    </>
  );
}

export default function Catalog() {
  const groups = listGroups();
  const products = listProducts();
  const base = salesBase();
  const groupName = new Map(groups.map((g) => [g.id, g]));
  const next = "/sales/catalog";

  return (
    <div className="narrow-wide">
      <SalesTabs active="catalog" />
      <p className="page-hint">Товары, которые вы продаёте, и их цены. При продаже D&amp;N сам посчитает сумму, вашу комиссию и долю компании.</p>

      <details className="card settings-fold add-fold" open={products.length === 0}>
        <summary>+ Добавить товар</summary>
        <form action={saveProductAction} className="form" style={{ marginTop: 14 }}>
          <ProductFields groups={groups} />
          <button className="btn btn-primary btn-big">Добавить товар</button>
        </form>
      </details>

      {products.length === 0 && (
        <div className="empty">
          <div className="empty-icon">🛍</div>
          <strong>Товаров пока нет</strong>
          <p>Добавьте первый товар выше — и он появится при записи продажи.</p>
        </div>
      )}

      <div className="product-list">
        {products.map((p) => {
          const g = p.group_id ? groupName.get(p.group_id) : undefined;
          return (
            <details key={p.id} className="card product">
              <summary>
                <span className="product-icon" aria-hidden>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="product-main">
                  <strong>{p.name}</strong>
                  <span className="price-chips">
                    {p.tierList.map((t) => (
                      <span key={t.qty} className="price-chip">
                        {t.qty} {p.unit} — {formatMoney(t.price)}
                      </span>
                    ))}
                    {p.tierList.length === 0 && <span className="muted small">цена не указана</span>}
                  </span>
                  {g && <span className="muted small">{g.name} · отделу {g.sales_rate}% · маркетплейс {g.mp_rate}%</span>}
                </span>
                <span className="product-edit">Изменить</span>
              </summary>
              <form action={saveProductAction} className="form" style={{ marginTop: 14 }}>
                <ProductFields p={p} groups={groups} />
                <button className="btn btn-primary">Сохранить</button>
              </form>
              <form action={archiveProductAction} style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="next" value={next} />
                <button className="btn btn-ghost btn-sm danger">Убрать из каталога</button>
              </form>
            </details>
          );
        })}
      </div>

      <h2 className="section-title">Проценты</h2>
      <details className="card settings-fold">
        <summary>Группы товаров и проценты</summary>
        <p className="muted small">Группа задаёт, сколько процентов получает отдел продаж (ваш доход) и сколько берёт маркетплейс.</p>
        {groups.map((g) => (
          <form key={g.id} action={saveGroupAction} className="group-row">
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="next" value={next} />
            <label>
              Группа
              <input name="name" defaultValue={g.name} required />
            </label>
            <label>
              Отделу, %
              <input name="sales_rate" inputMode="decimal" defaultValue={g.sales_rate} />
            </label>
            <label>
              Маркетплейс, %
              <input name="mp_rate" inputMode="decimal" defaultValue={g.mp_rate} />
            </label>
            <button className="btn btn-sm">Сохранить</button>
          </form>
        ))}
        {groups.map((g) => (
          <form key={`a${g.id}`} action={archiveGroupAction} className="inline-hide">
            <input type="hidden" name="id" value={g.id} />
            <input type="hidden" name="next" value={next} />
            <button className="btn btn-ghost btn-sm">Скрыть группу «{g.name}»</button>
          </form>
        ))}
        <form action={saveGroupAction} className="form" style={{ marginTop: 12 }}>
          <input type="hidden" name="next" value={next} />
          <label>
            Новая группа
            <input name="name" required placeholder="например, Свечи" />
          </label>
          <div className="grid-2-tight">
            <label>
              Отделу продаж, %
              <input name="sales_rate" inputMode="decimal" placeholder="7.5" />
            </label>
            <label>
              Маркетплейс, %
              <input name="mp_rate" inputMode="decimal" placeholder="5" />
            </label>
          </div>
          <button className="btn">Добавить группу</button>
        </form>
      </details>

      <details className="card settings-fold">
        <summary>Как считать комиссию отдела</summary>
        <div className="row-gap">
          <form action={setSalesBaseAction}>
            <input type="hidden" name="base" value="gross" />
            <input type="hidden" name="next" value={next} />
            <button className={`btn btn-sm ${base === "gross" ? "btn-primary" : ""}`}>От суммы продажи</button>
          </form>
          <form action={setSalesBaseAction}>
            <input type="hidden" name="base" value="net" />
            <input type="hidden" name="next" value={next} />
            <button className={`btn btn-sm ${base === "net" ? "btn-primary" : ""}`}>После комиссии маркетплейса</button>
          </form>
        </div>
      </details>
    </div>
  );
}
