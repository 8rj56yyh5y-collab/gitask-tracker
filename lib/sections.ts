// Все разделы D&N в одном месте: из них собирается профиль и поиск сверху.
// keywords — слова, по которым раздел находится в поиске (как люди называют это сами).

export interface Section {
  href: string;
  icon: string;
  title: string;
  note: string;
  group: "Каждый день" | "Деньги и планы" | "Настройка и помощь";
  keywords: string;
}

export const SECTIONS: Section[] = [
  { href: "/inbox", icon: "inbox", title: "Разбор операций", note: "Новые траты: подтвердить или поправить", group: "Каждый день", keywords: "разобрать без направления записать неразобранные" },
  { href: "/history", icon: "history", title: "История", note: "Все операции, новые сверху", group: "Каждый день", keywords: "операции список все траты выписка" },
  { href: "/wallets", icon: "wallet", title: "Кошельки", note: "Карты, кассы и наличные — сколько где", group: "Каждый день", keywords: "карты кассы наличные остаток баланс счета" },
  { href: "/shopping", icon: "cart", title: "Список покупок", note: "Что купить, цены, чек по фото", group: "Каждый день", keywords: "покупки магазин чек список продукты купить" },
  { href: "/transit", icon: "swap", title: "Чужие деньги", note: "Деньги, которые нужно кому-то отдать", group: "Каждый день", keywords: "транзит чужие передать долг отдать" },
  { href: "/sales", icon: "bag", title: "Продажи", note: "Продажи товара и каталог", group: "Каждый день", keywords: "продажи товар каталог компания" },
  { href: "/plans", icon: "calendar", title: "Платежи", note: "Что оплатить, кто должен мне, подписки", group: "Деньги и планы", keywords: "платежи оплатить аренда долги должны подписки счета календарь" },
  { href: "/goals", icon: "target", title: "Копилки", note: "Откладывать на цель и видеть прогресс", group: "Деньги и планы", keywords: "копилка цель накопить отложить сбережения отпуск" },
  { href: "/analytics", icon: "chart", title: "Отчёты", note: "На что уходят деньги: месяц, год, сравнение", group: "Деньги и планы", keywords: "аналитика отчет статистика графики сравнение категории" },
  { href: "/calendar", icon: "calendar", title: "Календарь трат", note: "Каждый день месяца цветом: где потратили больше", group: "Деньги и планы", keywords: "календарь дни день месяц когда тепловая карта" },
  { href: "/recap", icon: "chart", title: "Итоги месяца", note: "Как прошёл месяц — короткие карточки", group: "Деньги и планы", keywords: "итоги месяц история сторис рекап вывод" },
  { href: "/income", icon: "income", title: "Доходы", note: "Ставка, премии и итог за месяц", group: "Деньги и планы", keywords: "доход зарплата ставка премия приход" },
  { href: "/norms", icon: "target", title: "Норма трат", note: "Сколько обычно уходит в месяц", group: "Деньги и планы", keywords: "норма бюджет лимит месяц план" },
  { href: "/centers", icon: "tag", title: "Направления", note: "Чьи деньги: личные, работа, семья", group: "Деньги и планы", keywords: "направления чьи личные работа семья лимиты центры" },
  { href: "/categories", icon: "grid", title: "Категории", note: "Продукты, такси, аренда — включить и добавить свои", group: "Деньги и планы", keywords: "категории на что продукты такси свои" },
  { href: "/cards", icon: "card", title: "Карты", note: "Карты, лимиты, добавить или удалить карту", group: "Деньги и планы", keywords: "карта банк лимит otp mono монобанк пумб приват добавить" },
  { href: "/cash", icon: "wallet", title: "Кассы", note: "Наличные: остатки и история", group: "Деньги и планы", keywords: "касса наличные кэш" },
  { href: "/settings", icon: "settings", title: "Настройки", note: "Telegram, Monobank, Apple Pay, тема, аккаунты", group: "Настройка и помощь", keywords: "настройки телеграм бот монобанк apple pay тема темная аккаунты пароль меню ии ключ" },
  { href: "/help", icon: "help", title: "Помощь", note: "Короткие ответы: что где и как", group: "Настройка и помощь", keywords: "помощь вопросы как справка" },
  { href: "/welcome", icon: "home", title: "Знакомство с D&N", note: "Как всё устроено — за минуту", group: "Настройка и помощь", keywords: "знакомство обучение начать" },
];

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е");

/** Разделы, подходящие под запрос: по названию, описанию и словам-подсказкам. */
export function findSections(q: string): Section[] {
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return SECTIONS.filter((s) => {
    const hay = norm(`${s.title} ${s.note} ${s.keywords}`);
    return words.every((w) => hay.includes(w));
  });
}
