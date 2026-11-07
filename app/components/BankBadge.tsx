import { cardStyle } from "@/lib/banks.ts";

/** Значок банка: цветной квадрат с коротким названием. Цвет и текст настраиваются у карты. */
export function BankBadge({ bank, color, badge, size = 36 }: { bank: string; color?: string | null; badge?: string | null; size?: number }) {
  const s = cardStyle({ bank, color, badge });
  const fs = Math.round(size * (s.badge.length > 2 ? 0.3 : 0.42));
  return (
    <span className="bank-badge" style={{ width: size, height: size, background: s.color, color: s.ink, fontSize: fs, borderRadius: Math.round(size * 0.28) }} aria-hidden>
      {s.badge}
    </span>
  );
}
