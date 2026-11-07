"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { analyzeMonth } from "@/lib/ai.ts";
import { connectMonobank } from "@/lib/monobank.ts";
import { connectTelegram, disconnectTelegram } from "@/lib/telegram.ts";
import { publicBase } from "@/lib/url.ts";
import { cookies } from "next/headers";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme.ts";
import { BANK_NAMES } from "@/lib/banks.ts";
import { redirect } from "next/navigation";
import { toKop, parseAmount } from "@/lib/money.ts";
import {
  archiveCard,
  archiveCenter,
  assignTx,
  createCard,
  createCenter,
  deleteTx,
  insertTx,
  monthDate,
  monthKey,
  saveAiReport,
  setCenterBudget,
  updateCardLimit,
  updateCenter,
  restoreCenter,
  applyDefaultLimit,
  setDefaultCardLimit,
  updateCard,
  mergeBankCards,
  setCardParent,
} from "@/lib/repo.ts";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const v = Number(str(f, k));
  return str(f, k) && Number.isFinite(v) ? v : null;
};

function refresh() {
  // Все страницы, включая страницы категорий и операций.
  revalidatePath("/", "layout");
}

/** Возврат только на внутренний адрес. */
function back(f: FormData) {
  const next = str(f, "next");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
}

export async function addTransaction(f: FormData) {
  const amount = parseAmount(str(f, "amount"));
  if (!amount) throw new Error("Укажите сумму");
  const direction = str(f, "direction") === "in" ? 1 : -1;
  const date = str(f, "date");
  insertTx({
    amountKop: direction * toKop(amount),
    occurredAt: date ? new Date(date).toISOString() : undefined,
    cardId: num(f, "cardId"),
    costCenterId: num(f, "centerId"),
    forWhom: str(f, "forWhom"),
    counterparty: str(f, "counterparty"),
    description: str(f, "description"),
    source: "manual",
  });
  refresh();
  redirect(str(f, "next") || "/");
}

export async function assignTransaction(f: FormData) {
  const id = num(f, "id");
  const centerId = num(f, "centerId");
  if (!id || !centerId) throw new Error("Выберите категорию");
  assignTx(id, centerId, str(f, "forWhom"), str(f, "description"));
  refresh();
  back(f);
}

export async function removeTransaction(f: FormData) {
  const id = num(f, "id");
  if (id) deleteTx(id);
  refresh();
}

export async function addCard(f: FormData) {
  const last4 = str(f, "last4").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) throw new Error("Нужны последние 4 цифры карты");
  createCard({
    bank: str(f, "bank") || "Банк",
    last4,
    owner: str(f, "owner"),
    kind: str(f, "kind") || "personal",
    monthly_limit: toKop(parseAmount(str(f, "limit")) ?? 0),
    mono_account_id: str(f, "monoAccount") || null,
  });
  back(f);
  refresh();
}

export async function setCardLimit(f: FormData) {
  const id = num(f, "id");
  if (id) updateCardLimit(id, toKop(parseAmount(str(f, "limit")) ?? 0));
  refresh();
}

export async function removeCard(f: FormData) {
  const id = num(f, "id");
  if (id) archiveCard(id);
  refresh();
  back(f);
}

export async function addCenter(f: FormData) {
  const name = str(f, "name");
  if (!name) throw new Error("Укажите название");
  createCenter(name, num(f, "parentId"), str(f, "color") || "#6b7280", toKop(parseAmount(str(f, "budget")) ?? 0), f.get("internal") === "on");
  refresh();
  back(f);
}

export async function updateCenterBudget(f: FormData) {
  const id = num(f, "id");
  if (id) setCenterBudget(id, toKop(parseAmount(str(f, "budget")) ?? 0));
  refresh();
}

export async function removeCenter(f: FormData) {
  const id = num(f, "id");
  if (id) archiveCenter(id);
  refresh();
}

export async function requestAiReport(f: FormData) {
  const d = monthDate(str(f, "month"));
  const key = monthKey(d);
  let error = "";
  try {
    saveAiReport(key, await analyzeMonth(d));
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) error = "key";
    else if (e instanceof Anthropic.RateLimitError) error = "busy";
    else if (e instanceof Anthropic.APIError) error = "api";
    else error = (e as Error).message.startsWith("ИИ не подключён") ? "off" : "api";
    console.error("AI report failed:", e);
  }
  refresh();
  redirect(`/analytics?m=${key}${error ? `&ai_error=${error}` : ""}#ai`);
}

function backToSettings(param: string, message: string): never {
  redirect(`/settings?${param}=${encodeURIComponent(message)}`);
}

export async function connectTelegramAction(f: FormData) {
  const token = str(f, "token");
  if (!/^\d+:[\w-]{30,}$/.test(token)) backToSettings("tg_error", "Это не похоже на токен бота. Он выглядит так: 1234567890:AA…");
  const base = await publicBase();
  if (!base.startsWith("https://")) backToSettings("tg_error", "Telegram работает только с сайтом по https — подключите после размещения в интернете.");
  let error = "";
  try {
    await connectTelegram(token, base);
  } catch (e) {
    console.error("Telegram connect failed:", e);
    error = "Telegram не принял токен или недоступен. Проверьте токен и попробуйте ещё раз.";
  }
  refresh();
  if (error) backToSettings("tg_error", error);
  redirect("/settings#telegram");
}

export async function disconnectTelegramAction() {
  await disconnectTelegram();
  refresh();
  redirect("/settings#telegram");
}

export async function connectMonobankAction(f: FormData) {
  const token = str(f, "token");
  if (token.length < 20) backToSettings("mono_error", "Вставьте токен Monobank целиком.");
  const key = process.env.DN_INGEST_TOKEN;
  if (!key) backToSettings("mono_error", "На сервере не задан DN_INGEST_TOKEN.");
  const base = await publicBase();
  if (!base.startsWith("https://")) backToSettings("mono_error", "Monobank присылает операции только на сайт по https — подключите после размещения в интернете.");
  let message = "";
  let ok = false;
  try {
    // Дата из формы — начало выбранного дня по Киеву (часовой пояс сервера задан в instrumentation.ts).
    const d = str(f, "from").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const from = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : new Date();
    const r = await connectMonobank(token, `${base}/api/monobank?key=${encodeURIComponent(key!)}`, { from, backfill: f.get("backfill") === "on" });
    const since = new Date(r.from).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    message =
      `Monobank подключён${r.owner ? ` (${r.owner})` : ""}: новых карт ${r.added}, связано с уже добавленными ${r.linked}. Операции ведутся с ${since}.` +
      (r.backfillAccounts ? ` Прошлые операции загружаются в фоне — по минуте на каждый счёт.` : "");
    ok = true;
  } catch (e) {
    message = (e as Error).message || "Не получилось подключить Monobank.";
  }
  refresh();
  backToSettings(ok ? "mono_ok" : "mono_error", message);
}

export async function updateCenterAction(f: FormData) {
  const id = num(f, "id");
  const name = str(f, "name");
  if (!id || !name) throw new Error("Нужно название категории");
  updateCenter(id, { name, color: str(f, "color") || "#6b7280", parentId: num(f, "parentId"), internal: f.get("internal") === "on" });
  refresh();
}

export async function restoreCenterAction(f: FormData) {
  const id = num(f, "id");
  if (id) restoreCenter(id);
  refresh();
}

const hexColor = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : null);

export async function updateCardAction(f: FormData) {
  const id = num(f, "id");
  if (!id) return;
  const last4 = str(f, "last4").replace(/\D/g, "").slice(-4);
  if (last4.length !== 4) throw new Error("Нужны последние 4 цифры карты");
  const bank = BANK_NAMES.includes(str(f, "bank")) ? str(f, "bank") : "Другой";
  updateCard(id, {
    bank,
    last4,
    owner: str(f, "owner"),
    kind: str(f, "kind") || "personal",
    monthly_limit: toKop(parseAmount(str(f, "limit")) ?? 0),
    color: f.get("resetStyle") === "on" ? null : hexColor(str(f, "color")),
    badge: f.get("resetStyle") === "on" ? null : str(f, "badge").slice(0, 4) || null,
  });
  refresh();
  back(f);
}

export async function setDefaultLimitAction(f: FormData) {
  setDefaultCardLimit(toKop(parseAmount(str(f, "limit")) ?? 0));
  if (f.get("applyAll") === "on") applyDefaultLimit();
  refresh();
}

export async function setThemeAction(f: FormData) {
  (await cookies()).set(THEME_COOKIE, normalizeTheme(str(f, "theme")), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  refresh();
}

export async function mergeCardsAction(f: FormData) {
  const id = num(f, "mainId");
  if (id) mergeBankCards(id);
  refresh();
  back(f);
}

export async function setCardParentAction(f: FormData) {
  const id = num(f, "id");
  if (id) setCardParent(id, num(f, "parentId"));
  refresh();
  back(f);
}
