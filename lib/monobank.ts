import { getDb } from "./db.ts";
import { createCard, findCard, insertTx, listCards, type Card } from "./repo.ts";

// Подключение Monobank по личному токену (https://api.monobank.ua/):
// берём список счетов, добавляем карты и регистрируем вебхук — дальше операции приходят сами.
// Операции ведутся с выбранной даты; прошлые подтягиваются, только если это выбрано.
// Сам токен не сохраняется (кроме времени фоновой загрузки прошлых операций — он живёт только в памяти).

const API = () => process.env.DN_MONO_API ?? "https://api.monobank.ua";
/** Monobank отдаёт выписку не чаще раза в 60 секунд. В тестах задержку можно уменьшить. */
const STATEMENT_PAUSE_MS = () => Number(process.env.DN_MONO_PAUSE_MS ?? 61_000);
/** Выписка за один запрос — не больше 31 суток. */
const CHUNK_SEC = 31 * 24 * 3600;
/** Насколько далеко назад разрешаем подтянуть прошлые операции. */
export const MAX_BACKFILL_DAYS = 92;

const CURRENCY: Record<number, string> = { 980: "UAH", 840: "USD", 978: "EUR" };

interface MonoAccount {
  id: string;
  maskedPan?: string[];
  type?: string;
  currencyCode?: number;
}

export interface MonoItem {
  id?: string;
  time?: number;
  description?: string;
  comment?: string;
  amount?: number;
  operationAmount?: number;
  currencyCode?: number;
  counterName?: string;
}

export interface MonoOptions {
  /** С какого момента вести операции. По умолчанию — сейчас. */
  from?: Date;
  /** Загрузить прошлые операции начиная с `from`. */
  backfill?: boolean;
  /** Дождаться окончания загрузки прошлых операций (для тестов); иначе она идёт в фоне. */
  wait?: boolean;
}

export interface MonoResult {
  owner: string;
  added: number;
  linked: number;
  from: string;
  /** Сколько счетов поставлено в очередь на загрузку прошлых операций. */
  backfillAccounts: number;
  /** Сколько прошлых операций записано (только при `wait`). */
  backfilled?: number;
}

/**
 * Записывает операцию Monobank. Пропускает операции до даты, с которой ведётся карта,
 * и повторы (по id операции). Возвращает id новой операции или null.
 */
export function saveMonoItem(account: string | null | undefined, item: MonoItem): { id: number; duplicate: boolean } | null {
  if (!item?.id || typeof item.amount !== "number") return null;
  const card = findCard({ monoAccount: account ?? null });
  const at = new Date((item.time ?? Date.now() / 1000) * 1000);
  if (card?.track_from && at < new Date(card.track_from)) return null;
  // amount — в валюте счёта (её и списали с карты, она идёт в лимиты),
  // currencyCode/operationAmount — валюта и сумма самой покупки. Для покупок в валюте пишем оригинал в комментарий.
  const opCurrency = CURRENCY[item.currencyCode ?? 980] ?? String(item.currencyCode);
  const foreign =
    item.currencyCode && item.currencyCode !== 980 && typeof item.operationAmount === "number"
      ? `${(Math.abs(item.operationAmount) / 100).toFixed(2)} ${opCurrency}`
      : "";
  return insertTx({
    amountKop: item.amount,
    currency: "UAH",
    occurredAt: at.toISOString(),
    cardId: card?.id ?? null,
    counterparty: item.counterName || item.description || "",
    description: [item.comment, foreign].filter(Boolean).join(" · "),
    source: "monobank",
    externalId: `mono:${item.id}`,
  });
}

export async function connectMonobank(token: string, webhookUrl: string, opts: MonoOptions = {}): Promise<MonoResult> {
  const now = new Date();
  let from = opts.from && !Number.isNaN(opts.from.getTime()) ? opts.from : now;
  if (from > now) from = now;
  const oldest = new Date(now.getTime() - MAX_BACKFILL_DAYS * 864e5);
  if (opts.backfill && from < oldest) from = oldest;

  const info = await fetch(`${API()}/personal/client-info`, {
    headers: { "X-Token": token },
    signal: AbortSignal.timeout(15_000),
  });
  if (info.status === 403 || info.status === 401) throw new Error("Monobank не принял токен — проверьте, что скопировали его целиком.");
  if (info.status === 429) throw new Error("Monobank разрешает этот запрос раз в минуту — подождите минуту и попробуйте снова.");
  if (!info.ok) throw new Error(`Monobank ответил ошибкой ${info.status}.`);
  const client = (await info.json()) as { name?: string; accounts?: MonoAccount[] };

  const cards = listCards();
  const db = getDb();
  let added = 0;
  let linked = 0;
  const accounts: string[] = [];
  for (const acc of client.accounts ?? []) {
    const pan = acc.maskedPan?.[0];
    if (!pan) continue; // банки (копилки) без карты пропускаем
    const last4 = pan.slice(-4);
    const existing = cards.find((c: Card) => c.last4 === last4);
    if (existing) {
      db.prepare("UPDATE cards SET mono_account_id = ?, track_from = ? WHERE id = ?").run(acc.id, from.toISOString(), existing.id);
      linked++;
    } else {
      // Если основная карта Monobank уже есть — новая карта входит в неё (у банка один лимит).
      const main = listCards().find((c: Card) => c.bank === "Monobank" && !c.parent_id);
      createCard({ bank: "Monobank", last4, owner: client.name ?? "", kind: acc.type === "fop" ? "fop" : "personal", monthly_limit: 0, mono_account_id: acc.id });
      db.prepare("UPDATE cards SET track_from = ?, parent_id = ? WHERE mono_account_id = ?").run(from.toISOString(), main?.id ?? null, acc.id);
      added++;
    }
    accounts.push(acc.id);
  }

  const hook = await fetch(`${API()}/personal/webhook`, {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ webHookUrl: webhookUrl }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!hook.ok) throw new Error(`Карты добавлены, но Monobank не принял адрес для уведомлений (ошибка ${hook.status}). Проверьте, что сайт доступен из интернета.`);

  const backfillAccounts = opts.backfill && from < now ? accounts.length : 0;
  const result: MonoResult = { owner: client.name ?? "", added, linked, from: from.toISOString(), backfillAccounts };
  if (backfillAccounts && opts.wait) result.backfilled = await backfill(token, accounts, from, now);
  else if (backfillAccounts) {
    // В фоне: Monobank отдаёт выписку раз в минуту, на несколько счетов уходит несколько минут.
    backfill(token, accounts, from, now).catch((e) => console.error("Monobank backfill failed:", e));
  }
  return result;
}

/** Загружает прошлые операции по счетам с `from` до `to`, кусками по 31 дню, с паузой между запросами. */
export async function backfill(token: string, accounts: string[], from: Date, to: Date): Promise<number> {
  let saved = 0;
  let first = true;
  for (const acc of accounts) {
    for (let start = Math.floor(from.getTime() / 1000); start < Math.floor(to.getTime() / 1000); start += CHUNK_SEC) {
      const end = Math.min(start + CHUNK_SEC, Math.floor(to.getTime() / 1000));
      if (!first) await new Promise((r) => setTimeout(r, STATEMENT_PAUSE_MS()));
      first = false;
      const res = await fetch(`${API()}/personal/statement/${encodeURIComponent(acc)}/${start}/${end}`, {
        headers: { "X-Token": token },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error(`Monobank statement ${res.status} for account ${acc}`);
        continue;
      }
      for (const item of (await res.json()) as MonoItem[]) if (saveMonoItem(acc, item)?.duplicate === false) saved++;
    }
  }
  return saved;
}
