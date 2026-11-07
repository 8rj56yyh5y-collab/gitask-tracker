import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { bearer, ingestTokenOk } from "@/lib/auth.ts";
import { parseAmount, toKop } from "@/lib/money.ts";
import { parseBankMessage } from "@/lib/sms.ts";
import { findCard, insertTx } from "@/lib/repo.ts";
import { revalidatePath } from "next/cache";
import { notifyNewTx } from "@/lib/telegram.ts";

// Приём операций из «Команд» iOS.
//   Apple Pay:  { "source": "applepay", "amount": "₴250,00", "merchant": "АТБ", "card": "ПриватБанк •••• 1234" }
//   SMS банка:  { "source": "sms", "text": "Oplata 250.00 UAH ATB *1234 ..." }
// Ответ: { id, url } — «Команда» открывает url, где сразу выбирается категория.

export async function POST(req: Request) {
  if (!ingestTokenOk(bearer(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Нужен JSON" }, { status: 400 });
  }
  const s = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const source = s("source") === "sms" ? "sms" : "applepay";

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
    if (!amount) return NextResponse.json({ error: "Не удалось разобрать сумму" }, { status: 422 });
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

  if (!duplicate) await notifyNewTx(id);
  revalidatePath("/", "layout");
  const base = process.env.DN_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || new URL(req.url).origin;
  return NextResponse.json({ id, duplicate, url: `${base}/inbox/${id}` });
}
