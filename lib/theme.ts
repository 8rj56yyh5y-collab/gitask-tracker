// Оформление: хранится в cookie на устройстве, чтобы страница сразу рисовалась нужными цветами.
export const THEME_COOKIE = "dn_theme";

export const THEMES = [
  { id: "system", name: "Как в телефоне", bg: "linear-gradient(135deg,#f4f5f2 50%,#000 50%)", accent: "#c9f26a" },
  { id: "light", name: "Светлая", bg: "#f4f5f2", accent: "#0c7a50" },
  { id: "dark", name: "Тёмная", bg: "#000000", accent: "#c9f26a" },
  { id: "redblack", name: "Красно-чёрная", bg: "#050505", accent: "#e11d2e" },
  { id: "redwhite", name: "Красно-белая", bg: "#ffffff", accent: "#d90429" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export function normalizeTheme(v: string | undefined | null): ThemeId {
  return (THEMES.find((t) => t.id === v)?.id ?? "system") as ThemeId;
}
