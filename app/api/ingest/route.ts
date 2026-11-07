import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { bearer, ingestTokenOk } from "@/lib/auth.ts";
import { parseAmount, toKop } from "@/lib/money.ts";
import { parseBankMessage } from "@/lib/sms.ts";
import { findCard, insertTx, monobankConnected } from "@/lib/repo.ts";
import { detectBank } from "@/lib/banks.ts";
import { revalidatePath } from "next/cache";
import { notifyNewTx } from "@/lib/telegram.ts";
import { matchPlanForTx } from "@/lib/plans.ts";
import { noteShortcutSignal } from "@/lib/setup.ts";

// Приём операций из «Команд» iOS.
//   Проще всего: POST https://<сайт>/api/ingest?key=<ключ> с телом «Форма»: amount, merchant, card
//   (ключ в ссылке, без заголовков). Так же принимается JSON и заголовок Authorization: Bearer <ключ>.
//   Apple Pay:  { "source": "applepay", "amount": "₴250,00", "merchant": "АТБ", "card": "ПриватБанк •••• 1234" }
//   SMS банка:  { "source": "sms", "text": "Oplata 250.00 UAH ATB *1234 ..." }
// Ответ: { id, url } — по url сразу выбирается категория; в Telegram приходит сообщение с кнопками.

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const type = req.headers.get("content-type") ?? "";
  try {
    if (type.includes("application/json")) return await req.json();
    if (type.includes("form")) return Object.fromEntries([...(await req.formData()).entries()].map(([k, v]) => [k, String(v)]));
    const text = await req.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!ingestTokenOk(bearer(req))) {
    noteShortcutSignal("bad_key");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await readBody(req);
  if (!body) {
    noteShortcutSignal("no_data");
    return NextResponse.json({ error: "Не удалось прочитать данные: нужна форма или JSON" }, { status: 400 });
  }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const source = s("source") === "sms" || (!s("amount") && s("text")) ? "sms" : "applepay";

  let amount: number | null;
  let direction: "in" | "out" = s("direction") === "in" ? "in" : "out";
  let currency = "UAH";
  let counterparty = s("merchant");
  let last4: string | null = null;
  let cardHint = s("card");

  if (source === "sms") {
    const p = parseBankMessage(s("text"));
    if (!p) return NextResponse.json({ error: "Не удалось найти сумму в сообщении", ignored: true }, { status: 422 });
    amount = p.amount;
    direction = p.direction;
    currency = p.currency;
    counterparty ||= p.merchant ?? "";
    last4 = p.cardLast4;
    cardHint ||= p.bank ?? "";
  } else {
    amount = parseAmount(s("amount"));
    if (!amount) {
      noteShortcutSignal("no_amount", cardHint);
      return NextResponse.json({ error: "Не удалось разобрать сумму" }, { status: 422 });
    }
  }

  // Оплаты Monobank приходят от самого банка — из «Команд» их не записываем, иначе будет дубль.
  if (source === "applepay" && detectBank(cardHint) === "Monobank" && monobankConnected()) {
    noteShortcutSignal("mono_skip", cardHint);
    return NextResponse.json({ ignored: true, reason: "Monobank присылает эту операцию сам" });
  }
  const card = findCard({ last4, hint: cardHint });
  const now = new Date();
  // Защита от дублей — только если «Команда» прислала свой id. Без него два одинаковых
  // платежа подряд (например, два перевода по 5 000 ₴) — это две разные операции, их нельзя терять.
  const clientId = s("id");
  const externalId = clientId
    ? `${source}:` + createHash("sha256").update(clientId).digest("hex").slice(0, 32)
    : null;

  const { id, duplicate } = insertTx({
    amountKop: (direction === "in" ? 1 : -1) * toKop(amount),
    currency,
    cardId: card?.id ?? null,
    counterparty,
    description: card ? "" : cardHint,
    source,
    externalId,
    raw: JSON.stringify(body),
    occurredAt: now.toISOString(),
  });

  noteShortcutSignal("ok", cardHint);
  if (!duplicate) {
    // Это оплата запланированного платежа? Тогда он закроется сам и операция получит его категорию.
    matchPlanForTx(id);
    await notifyNewTx(id);
  }
  revalidatePath("/", "layout");
  const base = process.env.DN_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || new URL(req.url).origin;
  return NextResponse.json({ id, duplicate, url: `${base}/inbox/${id}` });
}
