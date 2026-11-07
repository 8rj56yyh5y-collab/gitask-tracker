import { getDb } from "./db.ts";
import { getSetting } from "./settings.ts";
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
      why: "После каждой оплаты придёт сообщение с кнопками — выбрали категорию, и готово.",
      href: "/settings#telegram",
      done: Boolean(getSetting("tg_chat_id")),
    },
    {
      id: "applepay",
      title: "Настройте оплаты Apple Pay",
      why: "Один раз в приложении «Команды» — и каждая оплата телефоном записывается сама.",
      href: "/settings#shortcuts",
      done: has("SELECT 1 FROM transactions WHERE source IN ('applepay', 'sms') LIMIT 1"),
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
      why: "Нажмите «＋» внизу или выберите категорию в Telegram.",
      href: "/new",
      done: has("SELECT 1 FROM transactions WHERE cost_center_id IS NOT NULL LIMIT 1"),
    },
  ];
}

export function setupHidden(): boolean {
  return getSetting("setup_hidden") === "1";
}
