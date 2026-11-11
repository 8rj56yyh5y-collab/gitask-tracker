// Группы товаров для чека (без зависимостей — можно использовать и в браузере).

/** Группы товаров для чека — общие и понятные. */
export const RECEIPT_GROUPS: { id: string; name: string; emoji: string }[] = [
  { id: "meat", name: "Мясо и птица", emoji: "🥩" },
  { id: "fish", name: "Рыба и морепродукты", emoji: "🐟" },
  { id: "dairy", name: "Молочное", emoji: "🥛" },
  { id: "eggs", name: "Яйца", emoji: "🥚" },
  { id: "veg", name: "Овощи и зелень", emoji: "🥦" },
  { id: "fruit", name: "Фрукты и ягоды", emoji: "🍎" },
  { id: "bread", name: "Хлеб и выпечка", emoji: "🍞" },
  { id: "grocery", name: "Крупы, макароны, бакалея", emoji: "🌾" },
  { id: "sweets", name: "Сладкое и снеки", emoji: "🍫" },
  { id: "drinks", name: "Напитки", emoji: "🧃" },
  { id: "alcohol", name: "Алкоголь", emoji: "🍷" },
  { id: "ready", name: "Готовая еда и кулинария", emoji: "🍱" },
  { id: "frozen", name: "Заморозка", emoji: "🧊" },
  { id: "household", name: "Бытовая химия и для дома", emoji: "🧴" },
  { id: "hygiene", name: "Гигиена и косметика", emoji: "🪥" },
  { id: "kids", name: "Детское", emoji: "👶" },
  { id: "pets", name: "Для животных", emoji: "🐾" },
  { id: "other", name: "Другое", emoji: "📦" },
];

export const groupById = (id: string | null | undefined) => RECEIPT_GROUPS.find((g) => g.id === id) ?? null;
