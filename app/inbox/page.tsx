import { UnassignedItem } from "../components/UnassignedItem.tsx";
import { centerTree, listUnassigned } from "@/lib/repo.ts";
import { formatMoney } from "@/lib/money.ts";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

export default function Inbox() {
  const items = listUnassigned();
  const centers = new Map(centerTree().map((c) => [c.id, c]));
  const total = items.reduce((a, t) => a + Math.abs(t.amount), 0);

  return (
    <div className="narrow-wide">
      <h1>Без направления</h1>
      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">✅</div>
          <strong>Все операции записаны</strong>
          <p>Новые оплаты появятся здесь, если направление не выбрано в Telegram.</p>
        </div>
      ) : (
        <p className="page-hint">
          {items.length} {plural(items.length, "операция", "операции", "операций")} на {formatMoney(total)}. Нажмите направление под операцией — и
          она записана.
        </p>
      )}
      {items.map((t) => (
        <UnassignedItem key={t.id} tx={t} centers={centers} />
      ))}
    </div>
  );
}
