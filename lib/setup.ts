import { getDb } from "./db.ts";
import { getSetting, setSetting } from "./settings.ts";
import { monobankConnected } from "./repo.ts";

// Шаги настройки для нового человека: что уже сделано и куда нажать дальше.

export interface SetupStep {
  id: string;
  title: string;
  why: string;
  href: string;
  done: boolean;
  optional?: boolean;
}

const has = (sql: string) => Boolean(getDb().prepare(sql).get());

export function setupSteps(): SetupStep[] {
  return [
    {
      id: "cards",
      title: "Добавьте свои карты",
      why: "Банк и последние 4 цифры — чтобы D&N понимал, с какой карты платёж.",
      href: "/cards#add",
      done: has("SELECT 1 FROM cards WHERE archived = 0 LIMIT 1"),
    },
    {
      id: "telegram",
      title: "Подключите Telegram",
      why: "После каждой оплаты придёт сообщение с кнопками — выбрали направление, и готово.",
      href: "/settings#telegram",
      done: Boolean(getSetting("tg_chat_id")),
    },
    {
      id: "applepay",
      title: "Настройте оплаты Apple Pay",
      why: "Один раз в приложении «Команды» — и каждая оплата телефоном записывается сама. Уже настроили? Оплатите что-нибудь телефоном — шаг отметится сам.",
      href: "/settings#shortcuts",
      done: shortcutWorks(),
    },
    {
      id: "monobank",
      title: "Monobank (если есть)",
      why: "Все операции Monobank, включая переводы, приходят автоматически.",
      href: "/settings#monobank",
      done: monobankConnected(),
      optional: true,
    },
    {
      id: "assign",
      title: "Запишите первую операцию",
      why: "Нажмите «＋» внизу или выберите направление в Telegram.",
      href: "/new",
      done: has("SELECT 1 FROM transactions WHERE cost_center_id IS NOT NULL LIMIT 1"),
    },
  ];
}

export function setupHidden(): boolean {
  return getSetting("setup_hidden") === "1";
}

// ---------- Сигналы от «Команд» (Apple Pay) ----------

export type SignalResult = "ok" | "mono_skip" | "bad_key" | "no_data" | "no_amount";

export interface ShortcutSignal {
  at: string;
  result: SignalResult;
  card: string;
}

/** Запомнить последний запрос от «Команд» — чтобы видеть, что настройка работает (или почему нет). */
export function noteShortcutSignal(result: SignalResult, card = "") {
  try {
    setSetting("shortcut_last", JSON.stringify({ at: new Date().toISOString(), result, card: card.slice(0, 60) }));
    if (result === "ok" || result === "mono_skip") setSetting("shortcut_ok_at", new Date().toISOString());
  } catch {
    // не мешаем записи операции
  }
}

export function lastShortcutSignal(): ShortcutSignal | null {
  try {
    return JSON.parse(getSetting("shortcut_last") ?? "null") as ShortcutSignal | null;
  } catch {
    return null;
  }
}

/** «Команды» хоть раз успешно достучались (или операция Apple Pay/SMS уже есть). */
export function shortcutWorks(): boolean {
  return Boolean(getSetting("shortcut_ok_at")) || has("SELECT 1 FROM transactions WHERE source IN ('applepay', 'sms') LIMIT 1");
}

export const SIGNAL_TEXT: Record<SignalResult, string> = {
  ok: "операция записана ✓",
  mono_skip: "оплата Monobank — её присылает сам банк, всё в порядке ✓",
  bad_key: "неверный ключ — в «Командах» ссылка скопирована не полностью или устарела",
  no_data: "пришёл пустой запрос — в «Командах» не добавлены поля amount / merchant / card",
  no_amount: "не удалось прочитать сумму — проверьте поле amount (должно быть «Сумма» из входящих данных)",
};
