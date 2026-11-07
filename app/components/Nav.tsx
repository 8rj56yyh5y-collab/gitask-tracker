"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon.tsx";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Кнопки в шапке на телефоне: История и «Ещё». */
export function TopNav() {
  const path = usePathname();
  const moreActive = ["/more", "/inbox", "/analytics", "/centers", "/settings", "/cash", "/norms"].some((h) => isActive(path, h));
  return (
    <nav className="top-actions" aria-label="Дополнительно">
      <Link href="/history" className={`top-btn ${isActive(path, "/history") ? "is-active" : ""}`} aria-label="История">
        <Icon name="history" />
      </Link>
      <Link href="/more" className={`top-btn top-more ${moreActive ? "is-active" : ""}`}>
        <Icon name="more" size={20} />
        <span>Ещё</span>
      </Link>
    </nav>
  );
}

/** Нижняя панель на телефоне и боковое меню на большом экране. */
export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  const cls = (href: string) => `nav-item ${isActive(path, href) ? "is-active" : ""}`;
  const badge = pending > 0 ? <span className="badge">{pending > 99 ? "99+" : pending}</span> : null;

  return (
    <>
      {/* Телефон */}
      <nav className="tabbar" aria-label="Меню">
        <Link href="/" className={cls("/")}>
          <span className="icon-wrap">
            <Icon name="home" />
            {badge}
          </span>
          <span>Главная</span>
        </Link>
        <Link href="/cards" className={cls("/cards")}>
          <Icon name="card" />
          <span>Карты</span>
        </Link>
        <Link href="/new" className="nav-plus" aria-label="Новая операция">
          <Icon name="plus" size={28} />
        </Link>
        <Link href="/plans" className={cls("/plans")}>
          <Icon name="calendar" />
          <span>Платежи</span>
        </Link>
        <Link href="/sales" className={cls("/sales")}>
          <Icon name="bag" />
          <span>Продажи</span>
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
          <Icon name="card" /> Карты
        </Link>
        <Link href="/centers" className={cls("/centers")}>
          <Icon name="tag" /> Категории
        </Link>
        <Link href="/plans" className={cls("/plans")}>
          <Icon name="calendar" /> Платежи
        </Link>
        <Link href="/cash" className={cls("/cash")}>
          <Icon name="wallet" /> Кассы
        </Link>
        <Link href="/sales" className={cls("/sales")}>
          <Icon name="bag" /> Продажи
        </Link>
        <Link href="/norms" className={cls("/norms")}>
          <Icon name="target" /> Норма трат
        </Link>
        <Link href="/settings" className={cls("/settings")}>
          <Icon name="settings" /> Настройки
        </Link>
      </aside>
    </>
  );
}
