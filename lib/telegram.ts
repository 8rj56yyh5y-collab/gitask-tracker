import { randomBytes, randomInt } from "node:crypto";
import { formatMoney } from "./money.ts";
import { assignTx, centerTree, getTx, suggestCenters, type Tx } from "./repo.ts";
import { getSetting, setSetting } from "./settings.ts";

// Уведомления в Telegram: после каждой новой операции бот присылает сообщение
// с кнопками категорий. Нажатие кнопки сразу записывает операцию.

const API = () => process.env.DN_TELEGRAM_API ?? "https://api.telegram.org";

type Button = { text: string; callback_data?: string; url?: string };

async function call<T = unknown>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API()}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description ?? res.status}`);
  return data.result as T;
}

export interface TelegramState {
  connected: boolean;
  botName: string | null;
  linked: boolean;
  linkCode: string | null;
}

export function telegramState(): TelegramState {
  return {
    connected: Boolean(getSetting("tg_token")),
    botName: getSetting("tg_bot"),
    linked: Boolean(getSetting("tg_chat_id")),
    linkCode: getSetting("tg_link_code"),
  };
}

export function telegramSecret(): string | null {
  return getSetting("tg_secret");
}

/** Проверяет токен бота, регистрирует вебхук и выдаёт код для привязки чата. */
export async function connectTelegram(token: string, publicUrl: string): Promise<string> {
  const me = await call<{ username: string }>(token, "getMe", {});
  const secret = randomBytes(24).toString("hex");
  await call(token, "setWebhook", {
    url: `${publicUrl}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
  setSetting("tg_token", token);
  setSetting("tg_bot", me.username);
  setSetting("tg_secret", secret);
  setSetting("tg_chat_id", null);
  setSetting("tg_link_code", String(randomInt(100000, 999999)));
  return me.username;
}

export async function disconnectTelegram() {
  const token = getSetting("tg_token");
  if (token) await call(token, "deleteWebhook", {}).catch(() => {});
  for (const k of ["tg_token", "tg_bot", "tg_secret", "tg_chat_id", "tg_link_code"]) setSetting(k, null);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const SOURCE: Record<string, string> = { manual: "вручную", applepay: "Apple Pay", sms: "SMS", monobank: "Monobank", import: "выписка" };

function txText(tx: Tx): string {
  const time = new Date(tx.occurred_at).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const lines = [
    `<b>${esc(formatMoney(tx.amount, tx.currency))}</b>${tx.counterparty ? ` · ${esc(tx.counterparty)}` : ""}`,
    [tx.card_label, SOURCE[tx.source] ?? tx.source, time].filter(Boolean).map((x) => esc(String(x))).join(" · "),
  ];
  return lines.join("\n");
}

function publicUrl(): string | null {
  const u = process.env.DN_PUBLIC_URL;
  return u && u.startsWith("https://") ? u.replace(/\/$/, "") : null;
}

/** Кнопки: вероятные категории + «Все категории» + ссылка на форму. */
function suggestKeyboard(tx: Tx): Button[][] {
  const tree = new Map(centerTree().map((c) => [c.id, c]));
  const sugg = suggestCenters(tx, 4)
    .map((id) => tree.get(id))
    .filter((c) => c !== undefined);
  const rows: Button[][] = [];
  for (let i = 0; i < sugg.length; i += 2) {
    rows.push(sugg.slice(i, i + 2).map((c) => ({ text: c.name, callback_data: `a:${tx.id}:${c.id}` })));
  }
  const last: Button[] = [{ text: "Все категории…", callback_data: `m:${tx.id}` }];
  const url = publicUrl();
  if (url) last.push({ text: "Открыть форму", url: `${url}/inbox/${tx.id}` });
  rows.push(last);
  return rows;
}

/** Полный список категорий, по две в ряд. */
function allKeyboard(tx: Tx): Button[][] {
  const tree = centerTree();
  const rows: Button[][] = [];
  for (let i = 0; i < tree.length; i += 2) {
    rows.push(
      tree.slice(i, i + 2).map((c) => ({ text: `${c.depth ? "· " : ""}${c.name}`.slice(0, 40), callback_data: `a:${tx.id}:${c.id}` })),
    );
  }
  rows.push([{ text: "‹ Назад", callback_data: `b:${tx.id}` }]);
  return rows;
}

/** Уведомление о новой неразнесённой операции. Ошибки не мешают приёму операции. */
export async function notifyNewTx(txId: number): Promise<void> {
  const token = getSetting("tg_token");
  const chat = getSetting("tg_chat_id");
  if (!token || !chat) return;
  const tx = getTx(txId);
  if (!tx || tx.cost_center_id !== null || tx.kind === "internal") return;
  try {
    await call(token, "sendMessage", {
      chat_id: chat,
      text: `${txText(tx)}\n\nКуда ушли деньги?`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: suggestKeyboard(tx) },
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }
}

interface Update {
  message?: { chat: { id: number }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { chat: { id: number }; message_id: number };
  };
}

/** Обработка входящего события от Telegram (вебхук). */
export async function handleUpdate(update: Update): Promise<void> {
  const token = getSetting("tg_token");
  if (!token) return;
  const boundChat = getSetting("tg_chat_id");

  if (update.message) {
    const chatId = String(update.message.chat.id);
    const text = update.message.text?.trim() ?? "";
    const code = text.match(/^\/start\s+(\d{6})$/)?.[1];
    if (code && code === getSetting("tg_link_code")) {
      setSetting("tg_chat_id", chatId);
      setSetting("tg_link_code", null);
      await call(token, "sendMessage", {
        chat_id: chatId,
        text: "Готово ✓ Теперь после каждой операции я пришлю сообщение — выберите категорию кнопкой.",
      });
    } else if (chatId !== boundChat) {
      await call(token, "sendMessage", {
        chat_id: chatId,
        text: "Этот чат не привязан к D&N. Откройте «Настройки» в D&N и нажмите ссылку для привязки.",
      });
    }
    return;
  }

  const q = update.callback_query;
  if (!q?.data || !q.message) return;
  const chatId = String(q.message.chat.id);
  if (chatId !== boundChat) {
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Чат не привязан" });
    return;
  }
  const [action, txRaw, centerRaw] = q.data.split(":");
  const tx = getTx(Number(txRaw));
  const target = { chat_id: chatId, message_id: q.message.message_id };
  if (!tx) {
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Операция не найдена (удалена?)" });
    return;
  }
  if (action === "a") {
    const center = centerTree().find((c) => c.id === Number(centerRaw));
    if (!center) {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Категория не найдена" });
      return;
    }
    assignTx(tx.id, center.id);
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: `Записано: ${center.name}` });
    await call(token, "editMessageText", {
      ...target,
      text: `${txText(getTx(tx.id)!)}\n\n✓ Записано: <b>${esc(center.path)}</b>`,
      parse_mode: "HTML",
    });
  } else if (action === "m" || action === "b") {
    await call(token, "answerCallbackQuery", { callback_query_id: q.id });
    await call(token, "editMessageReplyMarkup", {
      ...target,
      reply_markup: { inline_keyboard: action === "m" ? allKeyboard(tx) : suggestKeyboard(tx) },
    });
  }
}
