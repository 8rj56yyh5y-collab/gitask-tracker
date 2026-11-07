// Цветовая индикация использования лимита карты (и бюджета категории).

export type LimitLevel = "green" | "yellow" | "orange" | "red";

export interface LimitThresholds {
  /** До этой доли лимита — зелёный. */
  yellowFrom: number;
  /** С этой доли — оранжевый. */
  orangeFrom: number;
}

export const DEFAULT_THRESHOLDS: LimitThresholds = { yellowFrom: 0.4, orangeFrom: 0.6 };

export interface LimitState {
  level: LimitLevel;
  used: number;
  limit: number;
  left: number;
  /** Доля использования, 0..∞ */
  ratio: number;
}

export function limitState(used: number, limit: number, t: LimitThresholds = DEFAULT_THRESHOLDS): LimitState {
  const safeUsed = Math.max(0, used);
  if (limit <= 0) return { level: "green", used: safeUsed, limit, left: 0, ratio: 0 };
  const ratio = safeUsed / limit;
  let level: LimitLevel = "green";
  if (ratio > 1) level = "red";
  else if (ratio >= t.orangeFrom) level = "orange";
  else if (ratio >= t.yellowFrom) level = "yellow";
  return { level, used: safeUsed, limit, left: limit - safeUsed, ratio };
}

export const LEVEL_LABEL: Record<LimitLevel, string> = {
  green: "Запас большой",
  yellow: "Около половины",
  orange: "За половиной, беречь",
  red: "Перелимит",
};

/** Прогноз дня исчерпания лимита при текущем темпе (линейно по дням месяца). */
export function forecastExhaustDay(used: number, limit: number, today: Date): number | null {
  const day = today.getDate();
  if (used <= 0 || limit <= 0 || used >= limit) return null;
  const perDay = used / day;
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const exhaustDay = Math.ceil(limit / perDay);
  return exhaustDay <= daysInMonth ? exhaustDay : null;
}
