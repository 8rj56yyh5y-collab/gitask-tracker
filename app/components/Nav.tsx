"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon.tsx";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Нижняя панель на телефоне и боковое меню на большом экране. */
export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  const cls = (href: string) => `nav-item ${isActive(path, href) ? "is-active" : ""}`;
  const badge = pending > 0 ? <span className="badge">{pending > 99 ? "99+" : pending}</span> : null;
  const moreActive = ["/more", "/inbox", "/cards", "/centers", "/settings"].some((h) => isActive(path, h));

  return (
    <>
      {/* Телефон */}
      <nav className="tabbar" aria-label="Меню">
        <Link href="/" className={cls("/")}>
          <Icon name="home" />
          <span>Главная</span>
        </Link>
        <Link href="/history" className={cls("/history")}>
          <span className="icon-wrap">
            <Icon name="history" />
            {badge}
          </span>
          <span>История</span>
        </Link>
        <Link href="/new" className="nav-plus" aria-label="Новая операция">
          <Icon name="plus" size={28} />
        </Link>
        <Link href="/analytics" className={cls("/analytics")}>
          <Icon name="chart" />
          <span>Аналитика</span>
        </Link>
        <Link href="/more" className={`nav-item ${moreActive ? "is-active" : ""}`}>
          <Icon name="more" />
          <span>Ещё</span>
        </Link>
      </nav>

      {/* Ноутбук */}
      <aside className="sidebar" aria-label="Меню">
        <Link href="/" className="side-brand">
          D&amp;N
        </Link>
        <Link href="/new" className="btn btn-primary side-new">
          + Операция
        </Link>
        <Link href="/" className={cls("/")}>
          <Icon name="home" /> Главная
        </Link>
        <Link href="/inbox" className={cls("/inbox")}>
          <Icon name="inbox" /> Разнести {badge}
        </Link>
        <Link href="/history" className={cls("/history")}>
          <Icon name="history" /> История
        </Link>
        <Link href="/analytics" className={cls("/analytics")}>
          <Icon name="chart" /> Аналитика
        </Link>
        <Link href="/cards" className={cls("/cards")}>
          <Icon name="card" /> Лимиты карт
        </Link>
        <Link href="/centers" className={cls("/centers")}>
          <Icon name="tag" /> Категории
        </Link>
        <Link href="/settings" className={cls("/settings")}>
          <Icon name="settings" /> Настройки
        </Link>
      </aside>
    </>
  );
}
