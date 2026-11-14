// Оформление: хранится в cookie на устройстве, чтобы страница сразу рисовалась нужными цветами.
export const THEME_COOKIE = "dn_theme";

export const THEMES = [
  { id: "premium", name: "Премиум · чёрный", bg: "linear-gradient(135deg,#000 55%,#ff3d77 75%,#8f3dff)", accent: "#ffffff" },
  { id: "system", name: "Стекло · как в телефоне", bg: "linear-gradient(135deg,#efeaff 50%,#0b0b10 50%)", accent: "#6d4aff" },
  { id: "light", name: "Стекло · светлое", bg: "linear-gradient(135deg,#e9e3ff,#fde2f0,#d9f7ea)", accent: "#0b0b10" },
  { id: "dark", name: "Стекло · тёмное", bg: "linear-gradient(135deg,#1a1430,#07070a,#0d2a33)", accent: "#9d87ff" },
  { id: "graphite", name: "Графит и золото", bg: "#111113", accent: "#d4b06a" },
  { id: "classic", name: "Классика (синяя)", bg: "#f3f5f8", accent: "#3654ff" },
  { id: "redblack", name: "Красно-чёрная", bg: "#050505", accent: "#e11d2e" },
  { id: "redwhite", name: "Красно-белая", bg: "#ffffff", accent: "#d90429" },
] as const;

/** «Стекло» — полупрозрачные карточки на цветном фоне. Остальные оформления (и «Премиум» по умолчанию) — плоские. */
export function lookOf(theme: string): "glass" | "flat" {
  return theme === "system" || theme === "light" || theme === "dark" ? "glass" : "flat";
}

export type ThemeId = (typeof THEMES)[number]["id"];

export function normalizeTheme(v: string | undefined | null): ThemeId {
  return (THEMES.find((t) => t.id === v)?.id ?? "premium") as ThemeId;
}
