// Суммы храним в копейках (целые числа), чтобы не было ошибок округления.

export function toKop(value: number): number {
  return Math.round(value * 100);
}

/** Валюты, которые можно выбрать в «Настройках». По умолчанию — гривна. */
export const CURRENCIES = [
  { code: "UAH", symbol: "₴", name: "Гривна" },
  { code: "USD", symbol: "$", name: "Доллар США" },
  { code: "EUR", symbol: "€", name: "Евро" },
  { code: "PLN", symbol: "zł", name: "Злотый" },
  { code: "GBP", symbol: "£", name: "Фунт стерлингов" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

// Валюта аккаунта задаётся в настройках. Этот файл работает и в браузере, поэтому базу он не читает:
// сервер сам подключает «где взять валюту» (см. lib/settings.ts). В браузере — гривна, если не передали явно.
let resolver: (() => string | null) | null = null;
export function setCurrencyResolver(fn: () => string | null) {
  resolver = fn;
}

export function normalizeCurrency(v: string | null | undefined): CurrencyCode {
  return (CURRENCIES.find((c) => c.code === v)?.code ?? "UAH") as CurrencyCode;
}

/** Валюта текущего аккаунта (на сервере) или гривна. */
export function currentCurrency(): CurrencyCode {
  try {
    return normalizeCurrency(resolver?.());
  } catch {
    return "UAH";
  }
}

/** Знак валюты: ₴, $, €, zł, £. */
export function curSymbol(currency: string = currentCurrency()): string {
  return CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;
}

export function formatMoney(kop: number, currency: string = currentCurrency()): string {
  const sign = kop < 0 ? "−" : "";
  const abs = Math.abs(kop) / 100;
  const num = abs.toLocaleString("uk-UA", {
    minimumFractionDigits: abs % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${num} ${curSymbol(currency)}`;
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
