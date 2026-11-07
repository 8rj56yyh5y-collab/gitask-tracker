import { parseAmount } from "./money.ts";
import { detectBank } from "./banks.ts";

// Разбор SMS / пушей банков. Форматы у банков разные и меняются,
// поэтому разбор «мягкий»: ищем сумму, валюту, последние 4 цифры карты и направление.

export interface ParsedBankMessage {
  amount: number; // гривны (или валюта), положительное число
  currency: string;
  direction: "out" | "in";
  cardLast4: string | null;
  merchant: string | null;
  bank: string | null;
}


const IN_WORDS = /(зарахування|зачисление|поповнення|пополнение|надходження|поступление|отримано|получено|credit|\+\s*\d)/i;
const OUT_WORDS = /(списання|списание|оплата|покупка|переказ|перевод|зняття|снятие|purchase|payment|debit|-\s*\d)/i;

export function parseBankMessage(text: string): ParsedBankMessage | null {
  if (!text) return null;
  const clean = text.replace(/ /g, " ");

  // Сумма рядом с валютой: "1 250.00 UAH", "1250,00грн", "₴1 250".
  const amountRe = /(?:₴|\$|€)\s*(\d[\d\s.,]*)|(\d[\d\s.,]*\d|\d)\s*(UAH|грн|₴|USD|\$|EUR|€)/i;
  const m = clean.match(amountRe);
  if (!m) return null;
  const amount = parseAmount(m[1] ?? m[2] ?? "");
  if (!amount) return null;
  const curRaw = (m[3] ?? clean.match(/[₴$€]/)?.[0] ?? "UAH").toUpperCase();
  const currency = /USD|\$/.test(curRaw) ? "USD" : /EUR|€/.test(curRaw) ? "EUR" : "UAH";

  const card = clean.match(/(?:\*|x|х|…|\.{2,})\s?(\d{4})\b/i) ?? clean.match(/\b\d{4}\*+(\d{4})\b/);
  const before = clean.slice(0, m.index ?? 0);
  let direction: "out" | "in" = "out";
  if (IN_WORDS.test(before) || IN_WORDS.test(clean) && !OUT_WORDS.test(clean)) direction = "in";

  const merchantMatch = clean.match(/(?:в|у|at|магазин|отримувач|получатель)\s+([A-Za-zА-Яа-яІіЇїЄєҐґ0-9"'«»._\- ]{3,40})/);
  const bank = detectBank(clean);

  return {
    amount,
    currency,
    direction,
    cardLast4: card ? card[1] : null,
    merchant: merchantMatch ? merchantMatch[1].trim() : null,
    bank,
  };
}
