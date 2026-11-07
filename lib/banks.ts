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

/** Цвет и значок по умолчанию для каждого банка (их можно поменять у каждой карты). */
export const BANK_STYLE: Record<string, { color: string; badge: string }> = {
  Monobank: { color: "#141414", badge: "mono" },
  "ПриватБанк": { color: "#2e8b3a", badge: "П" },
  "ПУМБ": { color: "#d71920", badge: "ПУМБ" },
  "А-Банк": { color: "#0a9f53", badge: "А" },
  "Радабанк": { color: "#1f4e9c", badge: "Р" },
  "Альянс Банк": { color: "#00468c", badge: "АБ" },
  NovaPay: { color: "#e30613", badge: "NP" },
  "Райффайзен": { color: "#f5d800", badge: "R" },
  "Другой": { color: "#64748b", badge: "•" },
};

export function cardStyle(c: { bank: string; color?: string | null; badge?: string | null }) {
  const def = BANK_STYLE[c.bank] ?? BANK_STYLE["Другой"];
  const color = /^#[0-9a-f]{6}$/i.test(c.color ?? "") ? c.color! : def.color;
  return { color, badge: (c.badge || def.badge).slice(0, 4), ink: inkOn(color) };
}

/** Белый или тёмный текст — что читается на этом цвете. */
export function inkOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? "#111111" : "#ffffff";
}
