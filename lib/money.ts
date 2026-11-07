// Суммы храним в копейках (целые числа), чтобы не было ошибок округления.

export function toKop(value: number): number {
  return Math.round(value * 100);
}

export function formatMoney(kop: number, currency = "UAH"): string {
  const sign = kop < 0 ? "−" : "";
  const abs = Math.abs(kop) / 100;
  const num = abs.toLocaleString("uk-UA", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const symbol = currency === "UAH" ? "₴" : currency === "USD" ? "$" : currency === "EUR" ? "€" : currency;
  return `${sign}${num} ${symbol}`;
}

/**
 * Разбирает сумму из произвольной строки: "₴1 250,50", "1,250.50 UAH", "-300 грн", "250".
 * Возвращает положительное число в гривнах или null.
 */
export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const m = raw.replace(/ /g, " ").match(/\d[\d\s.,']*/);
  if (!m) return null;
  let s = m[0].replace(/[\s']/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // Десятичный разделитель — тот, что стоит последним.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    // "1,250" — тысячи; "1250,50" — копейки.
    s = /,\d{3}$/.test(s) && s.indexOf(",") === lastComma && s.length > 4 ? s.replace(",", "") : s.replace(",", ".");
  } else if (lastDot > -1 && /\.\d{3}$/.test(s) && s.indexOf(".") !== lastDot) {
    s = s.replace(/\./g, "");
  }
  s = s.replace(/[.,]$/, "");
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}
