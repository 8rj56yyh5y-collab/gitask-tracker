import { randomBytes, randomInt } from "node:crypto";
import { formatMoney } from "./money.ts";
import { assignTx, centerTree, getTx, suggestCenters, type Tx } from "./repo.ts";
import { getSetting, setSetting } from "./settings.ts";
import { canAutoCredit } from "./income.ts";
import { getCategory, label, listCategories, markNeedsNote, setTxDetails, suggestedCategories } from "./categories.ts";
import { createTransit, linkTxToTransit, listTransits } from "./transit.ts";
import { getDb } from "./db.ts";
import { getPlan, markReminded, payPlan, plansToRemind, undoPlanPayment, type Plan } from "./plans.ts";

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
    // Если карту не узнали — показываем, как её назвал Wallet, чтобы было понятно, откуда платёж.
    [tx.card_label || (tx.description ? `карта: ${tx.description}` : ""), SOURCE[tx.source] ?? tx.source, time].filter(Boolean).map((x) => esc(String(x))).join(" · "),
  ];
  return lines.join("\n");
}

function publicUrl(): string | null {
  const u = process.env.DN_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
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
  if (tx.amount > 0) rows.push([{ text: "💰 Ставка", callback_data: `i:${tx.id}:s` }, { text: "💰 Другой доход", callback_data: `i:${tx.id}:o` }]);
  rows.push([{ text: "↔ Чужие деньги (транзит)", callback_data: `t:${tx.id}` }]);
  const last: Button[] = [{ text: "Все направления…", callback_data: `m:${tx.id}` }];
  const url = publicUrl();
  if (url) last.push({ text: "Открыть форму", url: `${url}/inbox/${tx.id}` });
  rows.push(last);
  return rows;
}

/** Кнопки по две в ряд. */
function pairs(buttons: Button[]): Button[][] {
  const rows: Button[][] = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  return rows;
}

/** Кнопка категории: если внутри есть подкатегории — открывает их, иначе сразу записывает. */
function catButton(txId: number, c: { id: number; name: string }, all: { id: number; parent_id: number | null }[]): Button {
  const hasKids = all.some((x) => x.parent_id === c.id);
  return { text: `${c.name}${hasKids ? " ›" : ""}`.slice(0, 40), callback_data: hasKids ? `c:${txId}:${c.id}` : `a:${txId}:${c.id}` };
}

/** Категории верхнего уровня. Те, у которых есть подкатегории, открываются следующим шагом. */
function rootsKeyboard(tx: Tx): Button[][] {
  const tree = centerTree();
  const rows = pairs(tree.filter((c) => c.depth === 0).map((c) => catButton(tx.id, c, tree)));
  rows.push([{ text: "‹ Назад", callback_data: `b:${tx.id}` }]);
  return rows;
}

/** Подкатегории: сначала «записать в саму категорию», затем подпункты. */
function childKeyboard(tx: Tx, parentId: number): Button[][] {
  const tree = centerTree();
  const parent = tree.find((c) => c.id === parentId);
  const rows: Button[][] = [];
  if (parent) rows.push([{ text: `✓ Просто «${parent.name}»`.slice(0, 40), callback_data: `a:${tx.id}:${parent.id}` }]);
  rows.push(...pairs(tree.filter((c) => c.parent_id === parentId).map((c) => catButton(tx.id, c, tree))));
  rows.push([{ text: "‹ Назад", callback_data: parent?.parent_id ? `c:${tx.id}:${parent.parent_id}` : `m:${tx.id}` }]);
  return rows;
}

/** Строка с подсказкой ИИ (или по истории): «✨ Похоже на: 🛒 Продукты — продукты домой». */
function aiHint(tx: Tx): string {
  const c = getCategory(tx.ai_category_id);
  if (!c || tx.amount >= 0) return "";
  return `\n✨ Похоже на: <b>${esc(label(c))}</b>${tx.ai_note ? ` — ${esc(tx.ai_note)}` : ""}`;
}

/** Шаг 2: категории — подсказанная первой (со звёздочкой), затем частые. */
function categoryKeyboard(tx: Tx): Button[][] {
  const all = new Map(listCategories().map((c) => [c.id, c]));
  const ids = suggestedCategories(tx, 8);
  const btn = (id: number): Button => {
    const c = all.get(id)!;
    return { text: `${id === tx.ai_category_id ? "✨ " : ""}${label(c)}`.slice(0, 40), callback_data: `k:${tx.id}:${id}` };
  };
  const rows = pairs(ids.filter((id) => all.has(id)).map(btn));
  rows.push([{ text: "Все категории…", callback_data: `K:${tx.id}:0` }]);
  return rows;
}

/** Все включённые категории, по 10 на страницу. */
function allCategoriesKeyboard(tx: Tx, page: number): Button[][] {
  const list = listCategories();
  const per = 10;
  const pages = Math.max(1, Math.ceil(list.length / per));
  const p = Math.min(Math.max(0, page), pages - 1);
  const rows = pairs(list.slice(p * per, p * per + per).map((c) => ({ text: label(c).slice(0, 40), callback_data: `k:${tx.id}:${c.id}` })));
  const nav: Button[] = [];
  if (p > 0) nav.push({ text: "‹", callback_data: `K:${tx.id}:${p - 1}` });
  nav.push({ text: `${p + 1} / ${pages}`, callback_data: `K:${tx.id}:${p}` });
  if (p < pages - 1) nav.push({ text: "›", callback_data: `K:${tx.id}:${p + 1}` });
  rows.push(nav);
  return rows;
}

/** Шаг 3: попросить комментарий. Без него операция остаётся в «Без направления» с пометкой. */
async function askNote(token: string, chatId: string, target: { chat_id: string; message_id: number }, tx: Tx) {
  setSetting("tg_pending_note", `${tx.id}:${target.message_id}`);
  const buttons: Button[][] = [];
  if (tx.ai_note) buttons.push([{ text: `✓ «${tx.ai_note}»`.slice(0, 60), callback_data: `n:${tx.id}` }]);
  const cat = getCategory(tx.category_id);
  await call(token, "editMessageText", {
    ...target,
    text:
      `${txText(tx)}\n\n✓ ${esc(tx.center_name ?? "")}${cat ? ` · ${esc(label(cat))}` : ""}\n` +
      `<b>${tx.amount < 0 ? "3 из 3" : "2 из 2"}.</b> Напишите сообщением, на что именно${tx.amount < 0 ? " (например: продукты на неделю)" : ""}.` +
      (tx.ai_note ? " Или нажмите кнопку с подсказкой." : ""),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons },
  });
  void chatId;
}

/** Итог после всех шагов. */
function doneText(tx: Tx): string {
  const cat = getCategory(tx.category_id);
  return `${txText(tx)}\n\n✓ Записано: <b>${esc(tx.center_name ?? "")}</b>${cat ? ` · ${esc(label(cat))}` : ""}${tx.description ? `\n💬 ${esc(tx.description)}` : ""}`;
}

/** Уведомление о новой неразнесённой операции. Ошибки не мешают приёму операции. */
export async function notifyNewTx(txId: number): Promise<void> {
  const token = getSetting("tg_token");
  const chat = getSetting("tg_chat_id");
  if (!token || !chat) return;
  const tx = getTx(txId);
  if (!tx || tx.cost_center_id !== null || tx.kind === "internal") return;
  try {
    const hint = aiHint(tx);
    await call(token, "sendMessage", {
      chat_id: chat,
      text: `${txText(tx)}${hint}\n\n<b>1 из 3.</b> Чьи это деньги?`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: suggestKeyboard(tx) },
    });
  } catch (e) {
    console.error("Telegram notify failed:", e);
  }
}

/** Напоминание о платеже в день оплаты (и о просроченных — раз в день). */
export async function remindPlan(p: Plan): Promise<boolean> {
  const token = getSetting("tg_token");
  const chat = getSetting("tg_chat_id");
  if (!token || !chat) return false;
  const left = p.total - p.paid;
  const today = new Date();
  const overdue = p.due_date && p.due_date < `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const isIn = p.direction === "in";
  const buttons: Button[][] = [[{ text: isIn ? "✓ Пришли" : "✓ Оплачено", callback_data: `p:${p.id}` }]];
  const url = publicUrl();
  if (url) buttons[0].push({ text: "Открыть", url: `${url}/plans/${p.id}` });
  const head = isIn
    ? `💰 ${overdue ? "Ещё не пришла" : "Сегодня ждём"}: <b>${esc(p.title)}</b>`
    : `${overdue ? "⚠️ Платёж просрочен" : "📅 Сегодня оплатить"}: <b>${esc(p.title)}</b>`;
  const tail = isIn
    ? "Если деньги придут на Monobank — D&N отметит сам. Пришли иначе — нажмите «✓ Пришли»."
    : "Платите с Monobank или Apple Pay — нажимать ничего не нужно, D&N отметит сам.";
  await call(token, "sendMessage", {
    chat_id: chat,
    parse_mode: "HTML",
    text: `${head}\n${esc(formatMoney(left))}${p.payee ? ` · ${esc(p.payee)}` : ""}${p.paid ? `\nуже ${isIn ? "получено" : "оплачено"} ${esc(formatMoney(p.paid))} из ${esc(formatMoney(p.total))}` : ""}\n\n${tail}`,
    reply_markup: { inline_keyboard: buttons },
  });
  return true;
}

/** Разослать напоминания о платежах, срок которых наступил (раз в день, с 9 утра). */
export async function sendPlanReminders(now = new Date()): Promise<number> {
  if (now.getHours() < 9 || !getSetting("tg_chat_id")) return 0;
  let n = 0;
  for (const p of plansToRemind(now)) {
    // Ставку, которая зачислится сама, не спрашиваем.
    if (p.kind === "salary" && p.auto && canAutoCredit(p)) continue;
    try {
      if (await remindPlan(p)) { markReminded(p.id, now); n++; }
    } catch (e) {
      console.error("Plan reminder failed:", e);
    }
  }
  return n;
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
        text: "Готово ✓ Теперь после каждой операции я пришлю сообщение — выберите направление кнопкой.",
      });
    } else if (chatId !== boundChat) {
      await call(token, "sendMessage", {
        chat_id: chatId,
        text: "Этот чат не привязан к D&N. Откройте «Настройки» в D&N и нажмите ссылку для привязки.",
      });
    } else if (text && !text.startsWith("/")) {
      // Комментарий к операции, которая ждёт его (шаг 3).
      const [txRaw, msgRaw] = (getSetting("tg_pending_note") ?? "").split(":");
      const pending = txRaw ? getTx(Number(txRaw)) : null;
      if (!pending) {
        await call(token, "sendMessage", { chat_id: chatId, text: "Сейчас нет операции, которая ждёт комментарий. Новые оплаты придут сюда сами." });
        return;
      }
      setTxDetails(pending.id, { note: text });
      setSetting("tg_pending_note", null);
      const done = getTx(pending.id)!;
      if (msgRaw) {
        await call(token, "editMessageText", { chat_id: chatId, message_id: Number(msgRaw), text: doneText(done), parse_mode: "HTML" }).catch(() => {});
      }
      await call(token, "sendMessage", { chat_id: chatId, text: `✓ Записано: ${formatMoney(Math.abs(done.amount))} — ${text}` });
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
  if (action === "p") {
    // «✓ Оплачено» из напоминания о платеже: записываем остаток с карты/кассы платежа.
    const p = getPlan(Number(txRaw));
    if (!p || p.status !== "open") {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Платёж уже закрыт" });
      return;
    }
    const isIn = p.direction === "in";
    const txId = payPlan(p.id, p.total - p.paid, { cardId: p.card_id, cashboxId: p.cashbox_id });
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: isIn ? "Записано: деньги пришли" : "Записано: оплачено" });
    await call(token, "editMessageText", {
      chat_id: chatId,
      message_id: q.message.message_id,
      text: `${isIn ? "✓ Пришли" : "✓ Оплачено"}: <b>${esc(p.title)}</b> · ${esc(formatMoney(p.total - p.paid))}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "↩ Отменить", callback_data: `u:${txId}` }]] },
    });
    return;
  }
  if (action === "u") {
    // «↩ Отменить» — нажали «Оплачено» по ошибке.
    const planId = undoPlanPayment(Number(txRaw));
    const p = planId ? getPlan(planId) : null;
    if (!p) {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Эту оплату уже отменили" });
      return;
    }
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Оплата отменена" });
    await call(token, "editMessageText", {
      chat_id: chatId,
      message_id: q.message.message_id,
      text: `↩ Отменено: <b>${esc(p.title)}</b> · ${esc(formatMoney(p.total - p.paid))} — снова ${p.direction === "in" ? "ждём" : "ждёт оплаты"}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: p.direction === "in" ? "✓ Пришли" : "✓ Оплачено", callback_data: `p:${p.id}` }]] },
    });
    return;
  }
  const tx = getTx(Number(txRaw));
  const target = { chat_id: chatId, message_id: q.message.message_id };
  if (!tx) {
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Операция не найдена (удалена?)" });
    return;
  }
  if (action === "i") {
    getDb()
      .prepare("UPDATE transactions SET income_kind = ?, kind = 'income', assigned_at = COALESCE(assigned_at, ?) WHERE id = ?")
      .run(centerRaw === "s" ? "salary" : "other", new Date().toISOString(), tx.id);
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Записано в доходы" });
    await call(token, "editMessageReplyMarkup", { ...target, reply_markup: { inline_keyboard: [] } });
    await call(token, "sendMessage", { chat_id: chatId, text: `✓ ${formatMoney(tx.amount)} — ${centerRaw === "s" ? "ставка" : "доход"}` });
    return;
  }
  if (action === "t") {
    const amount = Math.abs(tx.amount);
    const same = listTransits(true).find((t) => t.amount === amount);
    const transitId = same?.id ?? createTransit({ title: tx.counterparty || "Чужие деньги", amountKop: amount });
    linkTxToTransit(tx.id, transitId);
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Заморожено как транзит" });
    await call(token, "editMessageReplyMarkup", { ...target, reply_markup: { inline_keyboard: [] } });
    await call(token, "sendMessage", {
      chat_id: chatId,
      text: `↔ ${formatMoney(amount)} — чужие деньги (транзит). Не считаются вашими доходами и расходами. Когда отдадите — отметьте «Отдал» в D&N → Ещё → Транзит.`,
    });
    return;
  }
  if (action === "k") {
    // Выбрана категория → шаг 3: комментарий.
    const cat = getCategory(Number(centerRaw));
    if (!cat) {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Категория не найдена" });
      return;
    }
    setTxDetails(tx.id, { categoryId: cat.id });
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: label(cat) });
    await askNote(token, chatId, target, getTx(tx.id)!);
    return;
  }
  if (action === "K") {
    // Все категории, по страницам.
    await call(token, "answerCallbackQuery", { callback_query_id: q.id });
    await call(token, "editMessageReplyMarkup", { ...target, reply_markup: { inline_keyboard: allCategoriesKeyboard(tx, Number(centerRaw) || 0) } });
    return;
  }
  if (action === "n") {
    // Принять комментарий, предложенный ИИ.
    if (!tx.ai_note) {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Напишите комментарий сообщением" });
      return;
    }
    setTxDetails(tx.id, { note: tx.ai_note });
    setSetting("tg_pending_note", null);
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Записано ✓" });
    await call(token, "editMessageText", { ...target, text: doneText(getTx(tx.id)!), parse_mode: "HTML" });
    return;
  }
  if (action === "a") {
    const center = centerTree().find((c) => c.id === Number(centerRaw));
    if (!center) {
      await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: "Направление не найдено" });
      return;
    }
    assignTx(tx.id, center.id);
    markNeedsNote(tx.id, true);
    await call(token, "answerCallbackQuery", { callback_query_id: q.id, text: center.name });
    const fresh = getTx(tx.id)!;
    if (fresh.amount < 0) {
      await call(token, "editMessageText", {
        ...target,
        text: `${txText(fresh)}${aiHint(fresh)}\n\n✓ ${esc(center.path)}\n<b>2 из 3.</b> На что именно?`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: categoryKeyboard(fresh) },
      });
    } else {
      await askNote(token, chatId, target, fresh);
    }
  } else if (action === "m" || action === "b" || action === "c") {
    await call(token, "answerCallbackQuery", { callback_query_id: q.id });
    const kb = action === "m" ? rootsKeyboard(tx) : action === "c" ? childKeyboard(tx, Number(centerRaw)) : suggestKeyboard(tx);
    await call(token, "editMessageReplyMarkup", { ...target, reply_markup: { inline_keyboard: kb } });
  }
}
