import { NextResponse } from "next/server";
import { bearer, ingestTokenOk } from "@/lib/auth.ts";
import { findCard, insertTx } from "@/lib/repo.ts";
import { revalidatePath } from "next/cache";
import { notifyNewTx } from "@/lib/telegram.ts";

// Вебхук Monobank (личный API, https://api.monobank.ua/docs/).
// Регистрируется на адрес https://<домен>/api/monobank?key=<DN_INGEST_TOKEN>.
// Monobank проверяет адрес GET-запросом, а операции присылает POST-ом:
// { type: "StatementItem", data: { account, statementItem: { id, time, description, mcc, amount, currencyCode, ... } } }

const CURRENCY: Record<number, string> = { 980: "UAH", 840: "USD", 978: "EUR" };

export async function GET(req: Request) {
  if (!ingestTokenOk(bearer(req))) return new NextResponse("unauthorized", { status: 401 });
  return new NextResponse("ok");
}

export async function POST(req: Request) {
  if (!ingestTokenOk(bearer(req))) return new NextResponse("unauthorized", { status: 401 });
  let body: {
    type?: string;
    data?: {
      account?: string;
      statementItem?: {
        id?: string;
        time?: number;
        description?: string;
        comment?: string;
        amount?: number;
        operationAmount?: number;
        currencyCode?: number;
        counterName?: string;
      };
    };
  };
  try {
    body = await req.json();
  } catch {
    return new NextResponse("bad json", { status: 400 });
  }
  const item = body.data?.statementItem;
  // Отвечаем 200 даже на неизвестные события, иначе Monobank будет повторять и может отключить вебхук.
  if (body.type !== "StatementItem" || !item?.id || typeof item.amount !== "number") return new NextResponse("ignored");

  const card = findCard({ monoAccount: body.data?.account ?? null });
  // amount — в валюте счёта (её и списали с карты, она идёт в лимиты),
  // currencyCode/operationAmount — валюта и сумма самой покупки. Для покупок в валюте пишем оригинал в комментарий.
  const opCurrency = CURRENCY[item.currencyCode ?? 980] ?? String(item.currencyCode);
  const foreign =
    item.currencyCode && item.currencyCode !== 980 && typeof item.operationAmount === "number"
      ? `${(Math.abs(item.operationAmount) / 100).toFixed(2)} ${opCurrency}`
      : "";
  const { id, duplicate } = insertTx({
    amountKop: item.amount,
    currency: "UAH",
    occurredAt: new Date((item.time ?? Date.now() / 1000) * 1000).toISOString(),
    cardId: card?.id ?? null,
    counterparty: item.counterName || item.description || "",
    description: [item.comment, foreign].filter(Boolean).join(" · "),
    source: "monobank",
    externalId: `mono:${item.id}`,
    raw: JSON.stringify(body),
  });
  if (!duplicate) await notifyNewTx(id);
  revalidatePath("/", "layout");
  return new NextResponse("ok");
}
