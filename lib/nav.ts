// Нижнее меню на телефоне: четыре раздела, человек может заменить любой. «＋» есть всегда, остальное — через поиск и профиль.

// В 2.0 меню новое — старый выбор не переносим, поэтому другое имя cookie.
export const NAV_COOKIE = "dn_nav2";
export const NAV_MAX = 4;

export const NAV_ITEMS = [
  { id: "home", href: "/", label: "Сегодня", icon: "home" },
  { id: "wallets", href: "/wallets", label: "Кошельки", icon: "wallet" },
  { id: "cards", href: "/cards", label: "Карты", icon: "card" },
  { id: "cash", href: "/cash", label: "Кассы", icon: "wallet" },
  { id: "plans", href: "/plans", label: "Платежи", icon: "calendar" },
  { id: "sales", href: "/sales", label: "Продажи", icon: "bag" },
  { id: "history", href: "/history", label: "История", icon: "history" },
  { id: "inbox", href: "/inbox", label: "Записать", icon: "inbox" },
  { id: "income", href: "/income", label: "Доходы", icon: "income" },
  { id: "analytics", href: "/analytics", label: "Отчёты", icon: "chart" },
  { id: "centers", href: "/centers", label: "Направл.", icon: "tag" },
  { id: "categories", href: "/categories", label: "Категории", icon: "grid" },
  { id: "transit", href: "/transit", label: "Чужие", icon: "swap" },
  { id: "shopping", href: "/shopping", label: "Покупки", icon: "cart" },
] as const;

export type NavId = (typeof NAV_ITEMS)[number]["id"];
export const DEFAULT_NAV: NavId[] = ["home", "wallets", "plans", "analytics"];

export function parseNav(raw: string | null | undefined): NavId[] {
  if (!raw) return DEFAULT_NAV;
  const ids = raw.split(",").filter((x): x is NavId => NAV_ITEMS.some((i) => i.id === x));
  const uniq = [...new Set(ids)].slice(0, NAV_MAX);
  return uniq.length ? uniq : DEFAULT_NAV;
}
