import Link from "next/link";
import { BankBadge } from "./BankBadge.tsx";
import { cardStyle } from "@/lib/banks.ts";
import { formatMoney } from "@/lib/money.ts";
import { LEVEL_LABEL, limitState } from "@/lib/limits.ts";
import type { Card } from "@/lib/repo.ts";

const LEVEL_DOT = { green: "var(--green)", yellow: "var(--yellow)", orange: "var(--orange)", red: "var(--red)" } as const;

/** Карта в виде плитки, как в Wallet: банк, номер, лимит и остаток. */
export function CardTile({ card, used, href }: { card: Card; used: number; href?: string }) {
  const st = cardStyle(card);
  const s = card.monthly_limit > 0 ? limitState(used, card.monthly_limit) : null;
  const body = (
    <>
      <div className="top-row">
        <BankBadge bank={card.bank} color={st.color} badge={st.badge} size={38} />
        <div style={{ minWidth: 0 }}>
          <strong>{card.bank}</strong>
          <div className="sub">{card.owner || " "}</div>
        </div>
      </div>
      <div className="num">•••• {card.last4}</div>
      {s ? (
        <div>
          <div className="limit-track">
            <div className="limit-fill" style={{ width: `${Math.min(100, s.ratio * 100)}%`, background: LEVEL_DOT[s.level] }} />
          </div>
          <div className="row-between sub">
            <span>
              {formatMoney(used)} из {formatMoney(card.monthly_limit)}
            </span>
            <strong>{s.left >= 0 ? `осталось ${formatMoney(s.left)}` : `перелимит ${formatMoney(-s.left)}`}</strong>
          </div>
          <span className="lvl" style={{ marginTop: 6 }}>
            <i className="lvl-dot" style={{ background: LEVEL_DOT[s.level] }} />
            {LEVEL_LABEL[s.level]} · {Math.round(s.ratio * 100)}%
          </span>
        </div>
      ) : (
        <div className="sub">Лимит не задан · списано {formatMoney(used)} за месяц</div>
      )}
    </>
  );
  const style = { "--c": st.color, "--ink": st.ink } as React.CSSProperties;
  const cls = `ctile ${s?.level === "red" ? "is-hot" : ""}`;
  return href ? (
    <Link href={href} className={cls} style={style} aria-label={`${card.bank} •••• ${card.last4}`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {body}
    </div>
  );
}
