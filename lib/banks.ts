// Банки, с которыми работает D&N, и как их узнать по тексту (название карты в Wallet, SMS).
// Порядок важен: «Радабанк» проверяем раньше «А-Банка», иначе «radAbank» примет за А-Банк.
export const BANK_PATTERNS: [RegExp, string][] = [
  [/radabank|радабанк|рада ?банк/i, "Радабанк"],
  [/alliance|альянс/i, "Альянс Банк"],
  [/nova ?pay|нова ?пей|новапей/i, "NovaPay"],
  [/privat|приват/i, "ПриватБанк"],
  [/pumb|пумб/i, "ПУМБ"],
  [/raiffeisen|райф/i, "Райффайзен"],
  [/mono/i, "Monobank"],
  [/a-?bank|а-?банк/i, "А-Банк"],
];

export const BANK_NAMES = ["Monobank", "ПриватБанк", "ПУМБ", "А-Банк", "Радабанк", "Альянс Банк", "NovaPay", "Райффайзен", "Другой"];

/** Название банка по тексту или null. */
export function detectBank(text: string | null | undefined): string | null {
  if (!text) return null;
  return BANK_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null;
}
