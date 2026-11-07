import Link from "next/link";
import { Icon } from "../components/Icon.tsx";
import { toggleSetupAction } from "../actions.ts";
import { unassignedSummary } from "@/lib/repo.ts";
import { setupHidden } from "@/lib/setup.ts";
import { transitOpenSum } from "@/lib/transit.ts";
import { formatMoney } from "@/lib/money.ts";

type Item = { href: string; icon: string; title: string; note: string };

export default function More() {
  const { count } = unassignedSummary();
  const transit = transitOpenSum();
  const groups: [string, Item[]][] = [
    [
      "Каждый день",
      [
        { href: "/inbox", icon: "inbox", title: "Без направления", note: count ? `${count} ждут — выберите, на что ушли деньги` : "Всё записано ✓" },
        { href: "/history", icon: "history", title: "История", note: "Все операции, новые сверху" },
        { href: "/transit", icon: "swap", title: "Чужие деньги", note: transit ? `У вас сейчас ${formatMoney(transit)} — нужно передать` : "Деньги, которые нужно кому-то отдать" },
      ],
    ],
    [
      "Деньги и планы",
      [
        { href: "/income", icon: "income", title: "Доходы", note: "Ставка, премии и ваш итог за месяц" },
        { href: "/centers", icon: "tag", title: "Направления", note: "Личные, работа, семья — и лимиты на месяц" },
        { href: "/norms", icon: "target", title: "Норма трат", note: "Сколько обычно уходит в месяц — подскажет D&N" },
        { href: "/analytics", icon: "chart", title: "Аналитика", note: "Куда уходят деньги: месяцы и сравнение" },
      ],
    ],
    [
      "Настройка и помощь",
      [
        { href: "/help", icon: "help", title: "Помощь", note: "Короткие ответы: что где и как" },
        { href: "/settings", icon: "settings", title: "Настройки", note: "Telegram, Monobank, Apple Pay, тема" },
      ],
    ],
  ];
  return (
    <div className="narrow-wide">
      <h1>Ещё</h1>
      {groups.map(([name, items]) => (
        <section key={name}>
          <div className="menu-group">{name}</div>
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
        </section>
      ))}
      {setupHidden() && (
        <form action={toggleSetupAction} style={{ marginTop: 12 }}>
          <input type="hidden" name="hide" value="0" />
          <input type="hidden" name="next" value="/" />
          <button className="btn btn-ghost btn-sm">Показать «С чего начать» на главной</button>
        </form>
      )}
      <form action="/logout" method="post">
        <button className="btn btn-ghost menu-logout">
          <Icon name="logout" size={18} /> Выйти
        </button>
      </form>
    </div>
  );
}
