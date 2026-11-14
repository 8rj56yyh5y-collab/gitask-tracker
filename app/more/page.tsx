import Link from "next/link";
import { Icon } from "../components/Icon.tsx";
import { toggleSetupAction } from "../actions.ts";
import { unassignedSummary } from "@/lib/repo.ts";
import { setupHidden } from "@/lib/setup.ts";
import { transitOpenSum } from "@/lib/transit.ts";
import { formatMoney } from "@/lib/money.ts";
import { SECTIONS } from "@/lib/sections.ts";
import { currentAccountName } from "@/lib/accounts.ts";

export default function More() {
  const { count } = unassignedSummary();
  const transit = transitOpenSum();
  const acc = currentAccountName();
  // Живые подписи: сколько ждёт разбора, сколько чужих денег.
  const live: Record<string, string> = {
    "/inbox": count ? `${count} ждут — подтвердите или поправьте` : "Всё разобрано ✓",
    "/transit": transit ? `У вас сейчас ${formatMoney(transit)} — нужно передать` : "Деньги, которые нужно кому-то отдать",
  };
  const groups = [...new Set(SECTIONS.map((s) => s.group))];
  return (
    <div className="narrow-wide">
      <div className="profile-head card">
        <span className="profile-ava">{(acc || "Я").charAt(0).toUpperCase()}</span>
        <span>
          <strong>{acc || "Мой D&N"}</strong>
          <span className="muted small">Все разделы и настройки. Быстрее всего — через поиск сверху.</span>
        </span>
      </div>
      {groups.map((name) => (
        <section key={name}>
          <div className="menu-group">{name}</div>
          <div className="card menu-list">
            {SECTIONS.filter((x) => x.group === name).map((i) => (
              <Link key={i.href} href={i.href} className="menu-row">
                <span className="menu-icon">
                  <Icon name={i.icon} />
                </span>
                <span className="menu-text">
                  <strong>{i.title}</strong>
                  <span className="muted small">{live[i.href] ?? i.note}</span>
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
