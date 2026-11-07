import { formatMoney } from "@/lib/money.ts";
import type { Tx } from "@/lib/repo.ts";

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
      <div className="tx-main">
        <div className="tx-title">{tx.counterparty || tx.description || "Без описания"}</div>
        <div className="muted small">
          {d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })}{" "}
          {d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
          {tx.card_label && <> · {tx.card_label}</>} · {SOURCE[tx.source] ?? tx.source}
          {tx.for_whom && <> · для: {tx.for_whom}</>}
        </div>
        {tx.center_name && (
          <span className="chip" style={{ borderColor: tx.center_color ?? undefined, color: tx.center_color ?? undefined }}>
            {tx.center_name}
          </span>
        )}
        {tx.kind === "internal" && <span className="chip">внутренний перевод</span>}
        {tx.cost_center_id === null && tx.kind !== "internal" && <span className="chip chip-pending">не разнесено</span>}
      </div>
      <div className={`tx-amount ${tx.amount < 0 ? "neg" : "pos"}`}>{formatMoney(tx.amount, tx.currency)}</div>
      {children}
    </div>
  );
}
