import Link from "next/link";
import { archiveGroupAction, archiveProductAction, saveGroupAction, saveProductAction, setSalesBaseAction } from "../../actions.ts";
import { formatTiers } from "@/lib/pricing.ts";
import { listGroups, listProducts, salesBase } from "@/lib/sales.ts";

export default function Catalog() {
  const groups = listGroups();
  const products = listProducts();
  const base = salesBase();
  const next = "/sales/catalog";
  return (
    <div className="narrow-wide">
      <div className="muted small">
        <Link href="/sales">Продажи</Link>
      </div>
      <h1>Каталог и ставки</h1>

      <section className="card form">
        <h2>Группы товаров и проценты</h2>
        <p className="muted small" style={{ margin: 0 }}>Отдел продаж — ваш процент с продажи. Маркетплейс — если продано через него.</p>
        {groups.map((g) => (
          <div key={g.id} className="tree-row">
            <form action={saveGroupAction} className="inline">
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="next" value={next} />
              <input name="name" defaultValue={g.name} aria-label="Название группы" required />
              <input name="sales_rate" inputMode="decimal" defaultValue={g.sales_rate} aria-label="% отделу продаж" style={{ maxWidth: 90 }} />
              <input name="mp_rate" inputMode="decimal" defaultValue={g.mp_rate} aria-label="% маркетплейса" style={{ maxWidth: 90 }} />
              <button className="btn btn-sm">Сохранить</button>
            </form>
            <form action={archiveGroupAction}>
              <input type="hidden" name="id" value={g.id} />
              <input type="hidden" name="next" value={next} />
              <button className="btn btn-ghost btn-sm">Скрыть</button>
            </form>
          </div>
        ))}
        <form action={saveGroupAction} className="form">
          <input type="hidden" name="next" value={next} />
          <label>
            Новая группа
            <input name="name" required placeholder="например, Грузики" />
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
      </section>

      <section className="card form">
        <h2>Товары и цены</h2>
        <p className="muted small" style={{ margin: 0 }}>
          Цены пишутся так: <code>1=450; 3=1200</code> — одна упаковка 450 ₴, набор из трёх 1 200 ₴. При продаже D&amp;N сам выберет самую выгодную комбинацию.
        </p>
        {products.map((p) => (
          <div key={p.id} className="tree-row">
            <form action={saveProductAction} className="form">
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="next" value={next} />
              <div className="inline">
                <input name="name" defaultValue={p.name} required aria-label="Товар" />
                <input name="unit" defaultValue={p.unit} aria-label="Единица" style={{ maxWidth: 80 }} />
              </div>
              <div className="inline">
                <input name="tiers" defaultValue={formatTiers(p.tierList)} placeholder="1=450; 3=1200" aria-label="Цены" />
                <select name="groupId" defaultValue={p.group_id ?? ""} aria-label="Группа" style={{ maxWidth: 160 }}>
                  <option value="">без группы</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <button className="btn btn-sm">Сохранить</button>
              </div>
            </form>
            <form action={archiveProductAction}>
              <input type="hidden" name="id" value={p.id} />
              <input type="hidden" name="next" value={next} />
              <button className="btn btn-ghost btn-sm">Скрыть</button>
            </form>
          </div>
        ))}
        <form action={saveProductAction} className="form">
          <input type="hidden" name="next" value={next} />
          <label>
            Новый товар
            <input name="name" required placeholder="например, Грузики балансировочные" />
          </label>
          <div className="grid-2-tight">
            <label>
              Цены
              <input name="tiers" placeholder="1=450; 3=1200" />
            </label>
            <label>
              Единица
              <input name="unit" defaultValue="уп." />
            </label>
          </div>
          <label>
            Группа (проценты)
            <select name="groupId" defaultValue={groups[0]?.id ?? ""}>
              <option value="">без группы</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name} · отделу {g.sales_rate}% · маркетплейс {g.mp_rate}%</option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Добавить товар</button>
        </form>
      </section>

      <section className="card form">
        <h2>Комиссия отдела считается</h2>
        <div className="inline">
          <form action={setSalesBaseAction}>
            <input type="hidden" name="base" value="gross" />
            <input type="hidden" name="next" value={next} />
            <button className={`btn btn-sm ${base === "gross" ? "btn-primary" : ""}`}>от суммы продажи</button>
          </form>
          <form action={setSalesBaseAction}>
            <input type="hidden" name="base" value="net" />
            <input type="hidden" name="next" value={next} />
            <button className={`btn btn-sm ${base === "net" ? "btn-primary" : ""}`}>после комиссии маркетплейса</button>
          </form>
        </div>
      </section>
    </div>
  );
}
