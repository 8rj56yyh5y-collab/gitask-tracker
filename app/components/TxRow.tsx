import { formatMoney } from "@/lib/money.ts";
import type { Tx } from "@/lib/repo.ts";
import { BankBadge } from "./BankBadge.tsx";

const SOURCE: Record<string, string> = {
  manual: "вручную",
  applepay: "Apple Pay",
  sms: "SMS",
  monobank: "Monobank",
  import: "выписка",
};

export function TxRow({ tx, children }: { tx: Tx; children?: React.ReactNode }) {
  const d = new Date(tx.occurred_at);
  return (
    <div className="tx">
      {tx.card_bank ? (
        <BankBadge bank={tx.card_bank} color={tx.card_color} badge={tx.card_badge} size={32} />
      ) : (
        <span className="bank-badge" style={{ width: 32, height: 32, background: "var(--line)", color: "var(--muted)", fontSize: 14, borderRadius: 9 }} aria-hidden>
          ₴
        </span>
      )}
      <div className="tx-main">
        <div className="tx-title">{tx.counterparty || tx.description || "Без описания"}</div>
        <div className="muted small">
          {d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}{" "}
          {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          {tx.card_label ? <> · {tx.card_label}</> : tx.cashbox_name ? <> · касса «{tx.cashbox_name}»</> : null} · {SOURCE[tx.source] ?? tx.source}
          {tx.for_whom && <> · для: {tx.for_whom}</>}
        </div>
        {tx.center_name && (
          <span className="chip" style={{ borderColor: tx.center_color ?? undefined, color: tx.center_color ?? undefined }}>
            {tx.center_name}
          </span>
        )}
        {tx.kind === "internal" && <span className="chip">{tx.sale_id ? "деньги компании" : "перевод"}</span>}
        {tx.plan_id && <span className="chip">по платежу</span>}
        {tx.cost_center_id === null && tx.kind !== "internal" && <span className="chip chip-pending">не разнесено</span>}
      </div>
      <div className={`tx-amount ${tx.amount < 0 ? "neg" : "pos"}`}>{formatMoney(tx.amount, tx.currency)}</div>
      {children}
    </div>
  );
}
