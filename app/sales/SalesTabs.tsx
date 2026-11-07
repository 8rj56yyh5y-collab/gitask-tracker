import Link from "next/link";

/** Шапка раздела «Продажи»: кнопка новой продажи и вкладки «Продажи · Каталог товаров». */
export function SalesTabs({ active }: { active: "sales" | "catalog" }) {
  return (
    <>
      <div className="page-head">
        <h1>Продажи</h1>
        <Link href="/sales/new" className="btn btn-primary btn-sm">
          + Продажа
        </Link>
      </div>
      <nav className="segtabs segtabs-accent" aria-label="Продажи">
        <Link href="/sales" className={`segtab ${active === "sales" ? "is-on" : ""}`} aria-current={active === "sales" ? "page" : undefined}>
          Продажи за месяц
        </Link>
        <Link href="/sales/catalog" className={`segtab ${active === "catalog" ? "is-on" : ""}`} aria-current={active === "catalog" ? "page" : undefined}>
          Каталог товаров
        </Link>
      </nav>
    </>
  );
}
