"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Icon } from "./Icon.tsx";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Кнопки в шапке на телефоне: Обновить, История и «Ещё». */
export function TopNav() {
  const path = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  const reload = () => start(() => router.refresh());
  // Вернулись в приложение (с экрана iPhone или из Telegram) — показываем свежие данные.
  useEffect(() => {
    let last = Date.now();
    const onShow = () => {
      if (document.visibilityState === "visible" && Date.now() - last > 5000) {
        last = Date.now();
        start(() => router.refresh());
      }
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
    };
  }, [router]);
  return (
    <nav className="top-actions" aria-label="Дополнительно">
      <button type="button" className={`top-btn ${pending ? "is-spinning" : ""}`} onClick={reload} aria-label="Обновить" title="Обновить">
        <Icon name="refresh" />
      </button>
      <Link href="/history" className={`top-btn ${isActive(path, "/history") ? "is-active" : ""}`} aria-label="История">
        <Icon name="history" />
      </Link>
    </nav>
  );
}

/** Нижняя панель на телефоне и боковое меню на большом экране. */
export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  const cls = (href: string) => `nav-item ${isActive(path, href) ? "is-active" : ""}`;
  const badge = pending > 0 ? <span className="badge">{pending > 99 ? "99+" : pending}</span> : null;
  const moreActive = ["/more", "/inbox", "/analytics", "/centers", "/settings", "/norms", "/income", "/transit", "/help"].some((h) => isActive(path, h));

  return (
    <>
      {/* Телефон */}
      <nav className="tabbar tabbar-7" aria-label="Меню">
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
        <Link href="/cash" className={cls("/cash")}>
          <Icon name="wallet" />
          <span>Кассы</span>
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
          <Icon name="inbox" /> Без направления {badge}
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
          <Icon name="tag" /> Направления
        </Link>
        <Link href="/plans" className={cls("/plans")}>
          <Icon name="calendar" /> Платежи
        </Link>
        <Link href="/cash" className={cls("/cash")}>
          <Icon name="wallet" /> Кассы
        </Link>
        <Link href="/income" className={cls("/income")}>
          <Icon name="income" /> Доходы
        </Link>
        <Link href="/transit" className={cls("/transit")}>
          <Icon name="swap" /> Транзит
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
