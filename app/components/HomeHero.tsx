import Link from "next/link";
import { monthMoney } from "@/lib/income.ts";
import { formatMoney } from "@/lib/money.ts";

/** Главная карточка: мои деньги за месяц — итог крупно, доходы и расходы, сколько можно отложить. */
export function HomeHero() {
  const m = monthMoney();
  const month = new Date().toLocaleDateString("ru-RU", { month: "long" });
  const plus = m.net >= 0;
  const forecast = m.net + m.expected - m.toPay;
  return (
    <Link href="/income" className="hero span-all">
      <div className="hero-top">
        <span>Мои деньги · {month}</span>
        <span className="hero-chip">{plus ? "в плюсе" : "в минусе"}</span>
      </div>
      <div className="hero-value">
        {plus ? "+" : "−"}
        {formatMoney(Math.abs(m.net))}
      </div>
      <div className="hero-row">
        <div>
          <span>Доходы</span>
          <b>{m.income ? `+${formatMoney(m.income)}` : formatMoney(0)}</b>
        </div>
        <div>
          <span>Расходы</span>
          <b>{m.expense ? `−${formatMoney(m.expense)}` : formatMoney(0)}</b>
        </div>
      </div>
      {(m.expected > 0 || m.toPay > 0 || m.net > 0) && (
        <div className="hero-note">
          {forecast >= 0 ? `Можно отложить ≈ ${formatMoney(forecast)}` : `До конца месяца не хватит ≈ ${formatMoney(-forecast)}`}
          {m.expected > 0 && ` · ещё придёт ${formatMoney(m.expected)}`}
        </div>
      )}
    </Link>
  );
}

/** Быстрые действия под главной карточкой. */
export function QuickActions() {
  const items = [
    { href: "/new", icon: "−", label: "Расход" },
    { href: "/new?type=in", icon: "+", label: "Доход" },
    { href: "/new?type=move", icon: "⇄", label: "Перевод" },
    { href: "/plans?new=1#new", icon: "📅", label: "Платёж" },
  ];
  return (
    <nav className="quick-actions span-all" aria-label="Быстрые действия">
      {items.map((i) => (
        <Link key={i.label} href={i.href} className="qa">
          <span className="qa-icon" aria-hidden>
            {i.icon}
          </span>
          <span>{i.label}</span>
        </Link>
      ))}
    </nav>
  );
}
