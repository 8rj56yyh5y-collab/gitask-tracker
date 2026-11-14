"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { Icon } from "./Icon.tsx";
import { NAV_ITEMS, type NavId } from "@/lib/nav.ts";
import { visibleSections } from "@/lib/sections.ts";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/** Кнопка «Обновить» в шапке; при возвращении в приложение данные обновляются сами. */
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
    </nav>
  );
}

/** Нижняя панель на телефоне (два раздела · «＋» · два раздела) и боковое меню на большом экране. */
export function Nav({ pending, items, simple = false }: { pending: number; items: NavId[]; simple?: boolean }) {
  const path = usePathname();
  const cls = (href: string) => `nav-item ${isActive(path, href) ? "is-active" : ""}`;
  const badge = pending > 0 ? <span className="badge">{pending > 99 ? "99+" : pending}</span> : null;
  const chosen = items.map((id) => NAV_ITEMS.find((i) => i.id === id)!).filter(Boolean);
  const half = Math.ceil(chosen.length / 2);
  const left = chosen.slice(0, half);
  const right = chosen.slice(half);
  const tab = (i: (typeof NAV_ITEMS)[number]) => (
    <Link key={i.id} href={i.href} className={cls(i.href)}>
      {i.id === "home" || i.id === "inbox" ? (
        <span className="icon-wrap">
          <Icon name={i.icon} />
          {badge}
        </span>
      ) : (
        <Icon name={i.icon} />
      )}
      <span>{i.label}</span>
    </Link>
  );
  const sections = visibleSections(simple);
  const groups = [...new Set(sections.map((s) => s.group))];

  return (
    <>
      {/* Телефон */}
      <nav className="tabbar" aria-label="Меню" style={{ gridTemplateColumns: `repeat(${chosen.length + 1}, 1fr)` }}>
        {left.map(tab)}
        <Link href="/new" className="nav-plus" aria-label="Записать расход">
          <Icon name="plus" size={28} />
        </Link>
        {right.map(tab)}
      </nav>

      {/* Ноутбук */}
      <aside className="sidebar" aria-label="Меню">
        <Link href="/" className="side-brand">
          D&amp;N
        </Link>
        <Link href="/new" className="btn btn-primary side-new">
          + Записать
        </Link>
        <Link href="/" className={cls("/")}>
          <Icon name="home" /> Главная {badge}
        </Link>
        {groups.map((g) => (
          <div key={g} className="side-group">
            <div className="side-group-title">{g}</div>
            {sections.filter((s) => s.group === g && s.href !== "/welcome").map((s) => (
              <Link key={s.href} href={s.href} className={cls(s.href)}>
                <Icon name={s.icon} /> {s.title}
              </Link>
            ))}
          </div>
        ))}
      </aside>
    </>
  );
}
