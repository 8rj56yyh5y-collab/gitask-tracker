import { SalesTabs } from "../SalesTabs.tsx";
import Link from "next/link";
import { createSaleAction } from "../../actions.ts";
import { AccountSelect } from "../../components/AccountSelect.tsx";
import { SaleForm, type SaleProduct } from "./SaleForm.tsx";
import { formatMoney } from "@/lib/money.ts";
import { getTx } from "@/lib/repo.ts";
import { listGroups, listProducts, salesBase } from "@/lib/sales.ts";

export default async function NewSale({ searchParams }: { searchParams: Promise<{ tx?: string }> }) {
  const { tx: txRaw } = await searchParams;
  const tx = txRaw ? getTx(Number(txRaw)) : null;
  const groups = new Map(listGroups().map((g) => [g.id, g]));
  const products: SaleProduct[] = listProducts().map((p) => {
    const g = p.group_id ? groups.get(p.group_id) : undefined;
    return { id: p.id, name: p.name, unit: p.unit, tiers: p.tierList, salesRate: g?.sales_rate ?? 0, mpRate: g?.mp_rate ?? 0 };
  });

  return (
    <div className="narrow">
      <SalesTabs active="sales" />
      <h2 className="section-title">Новая продажа</h2>
      {products.length === 0 ? (
        <div className="card">
          <strong>Сначала добавьте товар</strong>
          <p className="muted small">
            Откройте <Link href="/sales/catalog" className="link">Каталог товаров</Link> и нажмите «+ Добавить товар».
          </p>
        </div>
      ) : (
        <form action={createSaleAction} className="card form">
          {tx && (
            <>
              <input type="hidden" name="txId" value={tx.id} />
              <p className="small" style={{ margin: 0 }}>
                Поступление <strong>{formatMoney(tx.amount)}</strong>
                {tx.counterparty && ` от «${tx.counterparty}»`} будет записано как продажа (деньги компании).
              </p>
            </>
          )}
          <SaleForm products={products} base={salesBase()}>
            {!tx && (
              <label>
                Деньги пришли
                <AccountSelect none="не записывать поступление" />
              </label>
            )}
          </SaleForm>
          <label>
            Комментарий
            <input name="note" placeholder="кому продано" />
          </label>
          <label>
            Дата
            <input name="at" type="date" />
          </label>
          <button className="btn btn-primary">Записать продажу</button>
        </form>
      )}
    </div>
  );
}
