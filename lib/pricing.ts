// Цены за количество (наборы) и раскладка суммы продажи на доли.

export interface Tier {
  /** Сколько единиц в наборе. */
  qty: number;
  /** Цена за весь набор, копейки. */
  price: number;
}

/** «1=450; 3=1200» → наборы. Принимает «;», перевод строки, «,» между наборами и «=» или «:» внутри. */
export function parseTiers(text: string): Tier[] {
  const out: Tier[] = [];
  for (const part of String(text || "").split(/[;\n]+/)) {
    const m = part.match(/^\s*(\d+)\s*(?:шт|уп|уп\.)?\s*[=:]\s*([\d\s.,]+)\s*(?:₴|грн)?\s*$/i);
    if (!m) continue;
    const qty = Number(m[1]);
    const price = Math.round(Number(m[2].replace(/\s/g, "").replace(",", ".")) * 100);
    if (qty > 0 && price > 0) out.push({ qty, price });
  }
  // Один набор на каждое количество: последний указанный побеждает.
  const byQty = new Map(out.map((t) => [t.qty, t]));
  return [...byQty.values()].sort((a, b) => a.qty - b.qty);
}

export function formatTiers(tiers: Tier[]): string {
  return tiers.map((t) => `${t.qty}=${t.price / 100}`).join("; ");
}

export interface PriceResult {
  total: number;
  /** Из каких наборов сложилась цена: [{qty, price, count}]. */
  parts: { qty: number; price: number; count: number }[];
}

/**
 * Самая выгодная для покупателя цена за `qty` единиц из наборов.
 * Если набора на 1 единицу нет, недостающие единицы считаются по цене самого маленького набора за единицу.
 */
export function priceFor(qty: number, tiers: Tier[]): PriceResult | null {
  const n = Math.round(qty);
  if (n <= 0 || !tiers.length) return null;
  const list = [...tiers];
  if (!list.some((t) => t.qty === 1)) {
    const small = list.reduce((a, b) => (a.qty < b.qty ? a : b));
    list.push({ qty: 1, price: Math.round(small.price / small.qty) });
  }
  // Динамика по количеству: dp[k] — минимальная цена за k единиц.
  const dp: number[] = new Array(n + 1).fill(Infinity);
  const pick: number[] = new Array(n + 1).fill(-1);
  dp[0] = 0;
  for (let k = 1; k <= n; k++) {
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.qty <= k && dp[k - t.qty] + t.price < dp[k]) {
        dp[k] = dp[k - t.qty] + t.price;
        pick[k] = i;
      }
    }
  }
  const count = new Map<number, number>();
  for (let k = n; k > 0; k -= list[pick[k]].qty) count.set(pick[k], (count.get(pick[k]) ?? 0) + 1);
  const parts = [...count.entries()].map(([i, c]) => ({ qty: list[i].qty, price: list[i].price, count: c })).sort((a, b) => b.qty - a.qty);
  return { total: dp[n], parts };
}

export interface SaleSplit {
  mpFee: number;
  commission: number;
  company: number;
}

/**
 * Раскладка продажи: комиссия маркетплейса, доход отдела продаж (ваша комиссия), доля компании.
 * base: «gross» — комиссия отдела от суммы продажи, «net» — от суммы после маркетплейса.
 */
export function splitSale(total: number, salesRate: number, mpRate: number, channel: "direct" | "mp", base: "gross" | "net" = "gross"): SaleSplit {
  const mpFee = channel === "mp" ? Math.round((total * mpRate) / 100) : 0;
  const commission = Math.round(((base === "net" ? total - mpFee : total) * salesRate) / 100);
  return { mpFee, commission, company: total - mpFee - commission };
}
