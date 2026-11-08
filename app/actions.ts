"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { analyzeMonth } from "@/lib/ai.ts";
import { connectMonobank } from "@/lib/monobank.ts";
import { connectTelegram, disconnectTelegram } from "@/lib/telegram.ts";
import { publicBase } from "@/lib/url.ts";
import { cookies } from "next/headers";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme.ts";
import { NAV_COOKIE, NAV_ITEMS, parseNav } from "@/lib/nav.ts";
import { BANK_NAMES } from "@/lib/banks.ts";
import { archiveCashbox, cashMove, createCashbox, parseAccount, transfer, updateCashbox } from "@/lib/cash.ts";
import { afterTxDeleted, cancelPlan, createPlan, payPlan, restorePlan, undoPlanPayment, updatePlan } from "@/lib/plans.ts";
import { archiveGroup, archiveProduct, createSale, deleteSale, payCompany, saveGroup, saveProduct, setSalesBase } from "@/lib/sales.ts";
import { acceptNorms, extendNorm, restartNorm } from "@/lib/norms.ts";
import { setSetting } from "@/lib/settings.ts";
import { addCategory, renameCategory, setCategoryEnabled, setTxDetails } from "@/lib/categories.ts";
import { addOtherIncome, createSalary, creditDueSalaries } from "@/lib/income.ts";
import { createTransit, deleteTransit, finishTransit, linkTxToTransit } from "@/lib/transit.ts";
import { getDb } from "@/lib/db.ts";
import { createAccount, currentIngestKey, deleteAccount, isOwner, resetPassword, updateAccount } from "@/lib/accounts.ts";
import { redirect } from "next/navigation";
import { toKop, parseAmount } from "@/lib/money.ts";
import {
  archiveCard,
  deleteCard,
  setTxCard,
  archiveCenter,
  assignTx,
  createCard,
  createCenter,
  deleteTx,
  getTx,
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
  const note = str(f, "description");
  if (direction < 0 && !note) throw new Error("Напишите комментарий: на что именно");
  const created = insertTx({
    amountKop: direction * toKop(amount),
    occurredAt: date ? new Date(date).toISOString() : undefined,
    ...accountOf(f),
    ...(f.has("cardId") ? { cardId: num(f, "cardId") || null, cashboxId: null } : {}),
    costCenterId: num(f, "centerId"),
    forWhom: str(f, "forWhom"),
    counterparty: str(f, "counterparty"),
    description: note,
    source: "manual",
  });
  setTxDetails(created.id, { categoryId: num(f, "categoryId") });
  refresh();
  redirect(str(f, "next") || "/");
}

export async function assignTransaction(f: FormData) {
  const id = num(f, "id");
  const centerId = num(f, "centerId");
  if (!id || !centerId) throw new Error("Выберите направление");
  const tx = getTx(id);
  const note = str(f, "description");
  if (!note) throw new Error("Напишите комментарий: на что именно ушли деньги");
  if (tx && tx.amount < 0 && !num(f, "categoryId")) throw new Error("Выберите категорию");
  if (f.has("cardId") && str(f, "cardId") !== "") setTxCard(id, num(f, "cardId") || null);
  assignTx(id, centerId, str(f, "forWhom"), note);
  setTxDetails(id, { categoryId: num(f, "categoryId"), note });
  refresh();
  back(f);
}

export async function removeTransaction(f: FormData) {
  const id = num(f, "id");
  if (id) {
    const planId = getTx(id)?.plan_id;
    deleteTx(id);
    afterTxDeleted(planId);
  }
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
  const color = str(f, "color") || "#6b7280";
  const id = createCenter(name, num(f, "parentId"), color, toKop(parseAmount(str(f, "budget")) ?? 0), f.get("internal") === "on");
  if (f.get("personal") === "on") getDb().prepare("UPDATE cost_centers SET is_personal = 1 WHERE id = ?").run(id);
  // Своя касса (наличные) у направления — сразу.
  if (f.get("withCash") === "on") createCashbox({ name, centerId: id, opening: kop(f, "opening") });
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
  back(f);
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
  const key = currentIngestKey();
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
  if (!id || !name) throw new Error("Напишите название направления");
  updateCenter(id, { name, color: str(f, "color") || "#6b7280", parentId: num(f, "parentId"), internal: f.get("internal") === "on", personal: f.get("personal") === "on" });
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

export async function setNavAction(f: FormData) {
  const picked = f.getAll("nav").map(String);
  const order = NAV_ITEMS.map((i) => i.id as string).filter((id) => picked.includes(id));
  const value = parseNav(str(f, "reset") ? "" : order.join(","));
  (await cookies()).set(NAV_COOKIE, value.join(","), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  refresh();
  redirect("/settings?nav_ok=1#nav");
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

// ---------- Счета: карта или касса ----------
const accountOf = (f: FormData, k = "account") => {
  const a = parseAccount(str(f, k));
  return { cardId: a && "card" in a ? a.card : null, cashboxId: a && "cashbox" in a ? a.cashbox : null };
};
const kop = (f: FormData, k: string) => toKop(parseAmount(str(f, k)) ?? 0);
const isoDate = (f: FormData, k: string) => {
  const v = str(f, k);
  return v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toISOString() : undefined;
};
const pct = (f: FormData, k: string) => {
  const n = Number(str(f, k).replace(",", "."));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

// ---------- Кассы ----------
export async function createCashboxAction(f: FormData) {
  const name = str(f, "name");
  if (!name) throw new Error("Назовите кассу");
  const id = createCashbox({ name, owner: str(f, "owner"), color: hexColor(str(f, "color")) ?? undefined, opening: kop(f, "opening"), centerId: num(f, "centerId") });
  refresh();
  redirect(`/cash/${id}`);
}

export async function updateCashboxAction(f: FormData) {
  const id = num(f, "id");
  if (!id) return;
  updateCashbox(id, { name: str(f, "name") || "Касса", owner: str(f, "owner"), color: hexColor(str(f, "color")) ?? "#16a34a", opening: kop(f, "opening"), centerId: num(f, "centerId") });
  refresh();
  back(f);
}

export async function archiveCashboxAction(f: FormData) {
  const id = num(f, "id");
  if (id) archiveCashbox(id);
  refresh();
  redirect("/cash");
}

export async function cashMoveAction(f: FormData) {
  const id = num(f, "id");
  const amount = kop(f, "amount");
  if (!id || !amount) throw new Error("Укажите сумму");
  const sign = str(f, "dir") === "in" ? 1 : -1;
  const txId = cashMove(id, { amountKop: sign * amount, counterparty: str(f, "who"), note: str(f, "note"), centerId: num(f, "centerId"), at: isoDate(f, "at"), planId: num(f, "planId") });
  if (num(f, "categoryId")) setTxDetails(txId, { categoryId: num(f, "categoryId") });
  refresh();
  back(f);
}

export async function transferAction(f: FormData) {
  const from = parseAccount(str(f, "from"));
  const to = parseAccount(str(f, "to"));
  const amount = kop(f, "amount");
  if (!from || !to) throw new Error("Выберите, откуда и куда");
  if (str(f, "from") === str(f, "to")) throw new Error("Откуда и куда — одно и то же");
  transfer(from, to, amount, str(f, "note"), isoDate(f, "at"));
  refresh();
  back(f);
}

// ---------- Платежи ----------
function planFields(f: FormData) {
  const acc = accountOf(f);
  return {
    title: str(f, "title"), payee: f.has("payee") ? str(f, "payee") : undefined, total: kop(f, "total"), dueDate: str(f, "due") || null,
    cardId: acc.cardId, cashboxId: acc.cashboxId, centerId: num(f, "centerId"), note: str(f, "note"),
    repeat: (str(f, "repeat") === "month" ? "month" : "none") as "month" | "none",
    direction: (str(f, "direction") === "in" ? "in" : "out") as "in" | "out",
    auto: f.has("autoShown") ? str(f, "auto") === "1" : undefined,
  };
}

export async function createPlanAction(f: FormData) {
  const id = createPlan(planFields(f));
  const advance = kop(f, "advance");
  if (advance > 0) payPlan(id, advance, { ...accountOf(f) });
  refresh();
  redirect(str(f, "next") || "/plans");
}

export async function updatePlanAction(f: FormData) {
  const id = num(f, "id");
  if (id) updatePlan(id, planFields(f));
  refresh();
  back(f);
}

export async function payPlanAction(f: FormData) {
  const id = num(f, "id");
  if (!id) return;
  payPlan(id, kop(f, "amount"), { ...accountOf(f), at: isoDate(f, "at") });
  refresh();
  back(f);
}

export async function cancelPlanAction(f: FormData) {
  const id = num(f, "id");
  if (id) cancelPlan(id);
  refresh();
  redirect("/plans");
}

// ---------- Продажи товара компании ----------
export async function saveGroupAction(f: FormData) {
  const name = str(f, "name");
  if (!name) throw new Error("Назовите группу");
  saveGroup({ id: num(f, "id"), name, sales_rate: pct(f, "sales_rate"), mp_rate: pct(f, "mp_rate") });
  refresh();
  back(f);
}
export async function archiveGroupAction(f: FormData) {
  const id = num(f, "id");
  if (id) archiveGroup(id);
  refresh();
  back(f);
}
export async function saveProductAction(f: FormData) {
  const name = str(f, "name");
  if (!name) throw new Error("Назовите товар");
  // Простая форма: «цена за 1» и до трёх наборов «количество — цена».
  let tiersText = str(f, "tiers");
  if (f.has("price1")) {
    const parts: string[] = [];
    if (str(f, "price1")) parts.push(`1=${str(f, "price1")}`);
    for (const i of [1, 2, 3]) {
      const q = str(f, `setQty${i}`);
      const p = str(f, `setPrice${i}`);
      if (q && p && Number(q) > 1) parts.push(`${q}=${p}`);
    }
    tiersText = parts.join("; ");
  }
  saveProduct({ id: num(f, "id"), name, group_id: num(f, "groupId"), unit: str(f, "unit") || "шт.", tiersText });
  refresh();
  back(f);
}
export async function archiveProductAction(f: FormData) {
  const id = num(f, "id");
  if (id) archiveProduct(id);
  refresh();
  back(f);
}
export async function setSalesBaseAction(f: FormData) {
  setSalesBase(str(f, "base") === "net" ? "net" : "gross");
  refresh();
  back(f);
}
export async function createSaleAction(f: FormData) {
  const productId = num(f, "productId");
  if (!productId) throw new Error("Выберите товар");
  const qty = Number(str(f, "qty").replace(",", ".")) || 0;
  createSale({
    productId, qty, total: kop(f, "total") || null, channel: str(f, "channel") === "mp" ? "mp" : "direct",
    ...accountOf(f), txId: num(f, "txId"), at: isoDate(f, "at"), note: str(f, "note"),
  });
  refresh();
  redirect("/sales");
}
export async function deleteSaleAction(f: FormData) {
  const id = num(f, "id");
  if (id) deleteSale(id);
  refresh();
  redirect("/sales");
}
export async function payCompanyAction(f: FormData) {
  payCompany(kop(f, "amount"), accountOf(f), str(f, "note"), isoDate(f, "at"));
  refresh();
  back(f);
}

// ---------- Норма трат ----------
export async function acceptNormsAction(f: FormData) {
  const values = new Map<number, number>();
  for (const [k, v] of f.entries()) {
    const m = /^norm_(\d+)$/.exec(k);
    if (m && typeof v === "string") values.set(Number(m[1]), toKop(parseAmount(v) ?? 0));
  }
  acceptNorms(values);
  refresh();
  redirect("/norms?ok=1");
}

export async function extendNormAction() {
  extendNorm();
  refresh();
  redirect("/norms");
}

export async function restartNormAction() {
  restartNorm();
  refresh();
  redirect("/norms");
}

export async function undoPlanPaymentAction(f: FormData) {
  const planId = undoPlanPayment(num(f, "txId") ?? 0);
  refresh();
  redirect(planId ? `/plans/${planId}?undone=1` : "/plans");
}

export async function restorePlanAction(f: FormData) {
  const id = num(f, "id");
  if (id) restorePlan(id);
  refresh();
  redirect(`/plans/${id}`);
}

export async function toggleSetupAction(f: FormData) {
  setSetting("setup_hidden", str(f, "hide") === "1" ? "1" : null);
  refresh();
  back(f);
}

// ---------- Доходы ----------
export async function createSalaryAction(f: FormData) {
  const acc = accountOf(f);
  createSalary({
    title: str(f, "title") || "Ставка",
    payer: str(f, "payer"),
    amountKop: kop(f, "amount"),
    day: num(f, "day") ?? 1,
    cardId: acc.cardId,
    cashboxId: acc.cashboxId,
    centerId: num(f, "centerId"),
    auto: str(f, "auto") === "1",
  });
  // Если день выплаты сегодня — зачисляем сразу, не дожидаясь фоновой проверки.
  creditDueSalaries();
  refresh();
  redirect("/income?ok=salary");
}

export async function addIncomeAction(f: FormData) {
  const acc = accountOf(f);
  const kind = str(f, "kind");
  const title = kind === "Другое" || !kind ? str(f, "title") || "Доход" : kind;
  const id = addOtherIncome({
    amountKop: kop(f, "amount"), title, cardId: acc.cardId, cashboxId: acc.cashboxId,
    centerId: num(f, "centerId"), note: str(f, "note"), at: isoDate(f, "at"),
  });
  if (kind === "Ставка") getDb().prepare("UPDATE transactions SET income_kind = 'salary' WHERE id = ?").run(id);
  refresh();
  redirect("/income?ok=income");
}

/** Поступление из банка — это доход: ставка или прочий. */
export async function markIncomeAction(f: FormData) {
  const id = num(f, "id");
  const kind = str(f, "kind") === "salary" ? "salary" : "other";
  if (id) {
    getDb()
      .prepare("UPDATE transactions SET income_kind = ?, kind = 'income', assigned_at = COALESCE(assigned_at, ?) WHERE id = ? AND amount > 0")
      .run(kind, new Date().toISOString(), id);
  }
  refresh();
  redirect(str(f, "next") || "/inbox");
}

// ---------- Транзит ----------
export async function createTransitAction(f: FormData) {
  const id = createTransit({ title: str(f, "title"), amountKop: kop(f, "amount"), note: str(f, "note") });
  const txId = num(f, "txId");
  if (txId) linkTxToTransit(txId, id);
  refresh();
  redirect(txId ? "/inbox" : "/transit");
}

export async function finishTransitAction(f: FormData) {
  const id = num(f, "id");
  if (id) finishTransit(id, str(f, "undo") !== "1");
  refresh();
  back(f);
}

export async function deleteTransitAction(f: FormData) {
  const id = num(f, "id");
  if (id) deleteTransit(id);
  refresh();
  back(f);
}

export async function linkTransitAction(f: FormData) {
  const tx = num(f, "txId");
  const tr = num(f, "transitId");
  if (tx && tr) linkTxToTransit(tx, tr);
  refresh();
  redirect(str(f, "next") || "/inbox");
}

// ---------- Касса направления ----------
export async function createCenterCashboxAction(f: FormData) {
  const centerId = num(f, "centerId");
  const name = str(f, "name");
  if (!centerId || !name) return;
  const id = createCashbox({ name, centerId, opening: kop(f, "opening") });
  refresh();
  redirect(`/cash/${id}`);
}

// ---------- Категории ----------
export async function toggleCategoryAction(f: FormData) {
  const id = num(f, "id");
  if (id) setCategoryEnabled(id, str(f, "on") === "1");
  refresh();
  back(f);
}

export async function addCategoryAction(f: FormData) {
  addCategory(str(f, "name"), str(f, "emoji"));
  refresh();
  back(f);
}

export async function renameCategoryAction(f: FormData) {
  const id = num(f, "id");
  if (id) renameCategory(id, str(f, "name"), str(f, "emoji"));
  refresh();
  back(f);
}

/** Удалить карту совсем. Операции остаются в истории, но без привязки к карте. */
export async function deleteCardAction(f: FormData) {
  const id = num(f, "id");
  if (id) deleteCard(id);
  refresh();
  redirect("/cards?deleted=1");
}

/** Поменять карту операции (отдельно от направления и категории). */
export async function setTxCardAction(f: FormData) {
  const id = num(f, "id");
  if (id && f.has("cardId")) setTxCard(id, num(f, "cardId") || null);
  refresh();
  redirect(`/inbox/${id}?card_ok=1`);
}

// ---------- Аккаунты для других (только владелец) ----------
async function flashAccount(text: string) {
  // Пароль показываем один раз: кладём в короткоживущую cookie, а не в адрес страницы.
  (await cookies()).set("dn_flash", text, { path: "/settings", maxAge: 120, httpOnly: true, sameSite: "lax" });
}

export async function createAccountAction(f: FormData) {
  if (!isOwner()) throw new Error("Создавать аккаунты может только владелец");
  const { account, password } = createAccount(str(f, "name"), str(f, "login"));
  await flashAccount(JSON.stringify({ login: account.login, name: account.name, password }));
  refresh();
  redirect("/settings?acc=1#accounts");
}

export async function resetAccountAction(f: FormData) {
  if (!isOwner()) throw new Error("Только владелец");
  const id = str(f, "id");
  const login = str(f, "login");
  const password = resetPassword(id);
  await flashAccount(JSON.stringify({ login, name: str(f, "name"), password }));
  refresh();
  redirect("/settings?acc=1#accounts");
}

export async function deleteAccountAction(f: FormData) {
  if (!isOwner()) throw new Error("Только владелец");
  deleteAccount(str(f, "id"));
  (await cookies()).set("dn_flash", "", { path: "/settings", maxAge: 0 });
  refresh();
  redirect("/settings?acc=1#accounts");
}

export async function finishWelcomeAction(f: FormData) {
  setSetting("welcome_seen", "1");
  refresh();
  redirect(str(f, "next") || "/");
}

export async function updateAccountAction(f: FormData) {
  if (!isOwner()) throw new Error("Только владелец");
  updateAccount(str(f, "id"), str(f, "name"), str(f, "login"));
  // Карточка «аккаунт готов» со старым логином больше не нужна.
  (await cookies()).set("dn_flash", "", { path: "/settings", maxAge: 0 });
  refresh();
  redirect("/settings?acc=1&acc_saved=1#accounts");
}
