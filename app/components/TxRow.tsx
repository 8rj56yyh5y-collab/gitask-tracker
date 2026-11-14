import { formatMoney } from "@/lib/money.ts";
import type { Tx } from "@/lib/repo.ts";
import { BankBadge } from "./BankBadge.tsx";
import { catColor } from "@/lib/categories.ts";

// Откуда пришла операция — показываем только автоматические источники.
const SOURCE: Record<string, string> = {
  manual: "",
  applepay: "Apple Pay",
  sms: "SMS",
  monobank: "Monobank",
  import: "выписка",
};

function when(d: Date): string {
  const now = new Date();
  const y = new Date(Date.now() - 864e5);
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Сегодня, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Вчера, ${time}`;
  return `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${time}`;
}

export function TxRow({ tx, children, hidePending }: { tx: Tx; children?: React.ReactNode; hidePending?: boolean }) {
  const d = new Date(tx.occurred_at);
  void SOURCE;
  return (
    <div className="tx">
      <span className={`tx-avatar ${tx.amount > 0 ? "is-in" : ""}`} style={{ "--tc": tx.category_name ? catColor(tx.category_name) : (tx.center_color ?? "var(--accent)") } as React.CSSProperties} aria-hidden>
        {tx.category_emoji ? tx.category_emoji : tx.amount > 0 ? "↓" : tx.kind === "internal" ? "⇄" : tx.cashbox_id ? "💵" : (tx.counterparty || tx.description || "₴").trim().slice(0, 1).toUpperCase()}
        {tx.card_bank && (
          <span className="tx-avatar-bank">
            <BankBadge bank={tx.card_bank} color={tx.card_color} badge={tx.card_badge} size={18} />
          </span>
        )}
      </span>
      <div className="tx-main">
        <div className="tx-title">{tx.counterparty || tx.description || "Без описания"}</div>
        {/* Одна строка смысла: что это и откуда — как в банковских приложениях. */}
        <div className="tx-meta">
          {[
            tx.category_name
              ? tx.category_name
              : tx.transit_id
                ? "Чужие деньги"
                : tx.kind === "internal"
                  ? tx.sale_id
                    ? "Деньги компании"
                    : "Перевод"
                  : tx.income_kind
                    ? tx.income_kind === "salary"
                      ? "Ставка"
                      : "Доход"
                    : null,
            tx.center_name && !tx.transit_id && tx.kind !== "internal" ? tx.center_name : null,
            tx.card_label ?? (tx.cashbox_name ? `касса «${tx.cashbox_name}»` : null),
            when(d),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        {tx.assigned_at && tx.counterparty && tx.description && tx.description !== tx.counterparty && !tx.needs_note && (
          <div className="tx-note">{tx.description}</div>
        )}
        {tx.plan_id && <span className="chip">по платежу</span>}
        {!hidePending && tx.cost_center_id === null && tx.kind !== "internal" && !tx.income_kind && <span className="chip chip-pending">не разобрано</span>}
      </div>
      <div className={`tx-amount ${tx.amount < 0 ? "neg" : "pos"}`}>{formatMoney(tx.amount, tx.currency)}</div>
      {children}
    </div>
  );
}
