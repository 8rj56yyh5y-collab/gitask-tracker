import { getDb } from "./db.ts";

// Баланс карты — по желанию. Человек один раз вписывает, сколько сейчас на карте,
// дальше D&N сам прибавляет приходы и вычитает траты по этой карте (и её дополнительным картам).

export function setCardBalance(cardId: number, kop: number | null) {
  getDb()
    .prepare("UPDATE cards SET balance = ?, balance_at = ? WHERE id = ?")
    .run(kop === null ? null : Math.round(kop), kop === null ? null : new Date().toISOString(), cardId);
}

/** Балансы всех карт, у которых он задан: id карты → копейки. */
export function cardBalances(): Map<number, number> {
  const db = getDb();
  const cards = db.prepare("SELECT id, balance, balance_at FROM cards WHERE balance IS NOT NULL AND archived = 0").all() as { id: number; balance: number; balance_at: string }[];
  const out = new Map<number, number>();
  const q = db.prepare(
    `SELECT COALESCE(SUM(t.amount), 0) AS s FROM transactions t JOIN cards c ON c.id = t.card_id
     WHERE (c.id = ? OR c.parent_id = ?) AND t.occurred_at >= ?`,
  );
  for (const c of cards) {
    const r = q.get(c.id, c.id, c.balance_at) as { s: number };
    out.set(Number(c.id), Number(c.balance) + Number(r.s));
  }
  return out;
}

export function cardBalance(cardId: number): number | null {
  return cardBalances().get(cardId) ?? null;
}
