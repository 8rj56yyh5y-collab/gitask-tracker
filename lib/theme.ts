// Оформление: хранится в cookie на устройстве, чтобы страница сразу рисовалась нужными цветами.
export const THEME_COOKIE = "dn_theme";

export const THEMES = [
  { id: "system", name: "Как в телефоне", bg: "linear-gradient(135deg,#f1f5f9 50%,#0b1120 50%)", accent: "#2563eb" },
  { id: "light", name: "Светлая", bg: "#f1f5f9", accent: "#2563eb" },
  { id: "dark", name: "Тёмная", bg: "#0b1120", accent: "#60a5fa" },
  { id: "redblack", name: "Красно-чёрная", bg: "#0a0a0a", accent: "#e11d2e" },
  { id: "redwhite", name: "Красно-белая", bg: "#ffffff", accent: "#d90429" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function normalizeTheme(v: string | undefined | null): ThemeId {
  return (THEMES.find((t) => t.id === v)?.id ?? "system") as ThemeId;
}
