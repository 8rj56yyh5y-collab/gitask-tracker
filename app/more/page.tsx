import Link from "next/link";
import { Icon } from "../components/Icon.tsx";
import { unassignedSummary } from "@/lib/repo.ts";

export default function More() {
  const { count } = unassignedSummary();
  const items = [
    { href: "/inbox", icon: "inbox", title: "Разнести", note: count ? `${count} ждут записи` : "Всё разнесено" },
    { href: "/history", icon: "history", title: "История", note: "Все операции" },
    { href: "/norms", icon: "target", title: "Норма трат", note: "Сколько тратить в месяц по каждой категории" },
    { href: "/cash", icon: "wallet", title: "Кассы", note: "Наличные: остатки, приход, расход" },
    { href: "/plans", icon: "calendar", title: "Платежи", note: "Я плачу, мне должны, долг компании" },
    { href: "/sales", icon: "bag", title: "Продажи", note: "Комиссия отдела, долг компании" },
    { href: "/analytics", icon: "chart", title: "Аналитика", note: "Месяцы, год, сравнение, разбор от ИИ" },
    { href: "/centers", icon: "tag", title: "Категории", note: "Лимиты и прогноз по каждой" },
    { href: "/settings", icon: "settings", title: "Настройки", note: "Оформление, Telegram, Monobank, Apple Pay, ИИ" },
  ];
  return (
    <div className="narrow-wide">
      <h1>Ещё</h1>
      <div className="card menu-list">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="menu-row">
            <span className="menu-icon">
              <Icon name={i.icon} />
            </span>
            <span className="menu-text">
              <strong>{i.title}</strong>
              <span className="muted small">{i.note}</span>
            </span>
            {i.href === "/inbox" && count > 0 && <span className="badge">{count}</span>}
            <Icon name="chevron" size={18} />
          </Link>
        ))}
      </div>
      <form action="/logout" method="post">
        <button className="btn btn-ghost menu-logout">
          <Icon name="logout" size={18} /> Выйти
        </button>
      </form>
    </div>
  );
}
