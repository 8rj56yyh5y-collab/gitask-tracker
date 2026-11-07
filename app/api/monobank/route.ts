import { NextResponse } from "next/server";
import { bearer, ingestTokenOk } from "@/lib/auth.ts";
import { saveMonoItem } from "@/lib/monobank.ts";
import { revalidatePath } from "next/cache";
import { notifyNewTx } from "@/lib/telegram.ts";
import { suggestForTx } from "@/lib/suggest.ts";
import { matchPlanForTx } from "@/lib/plans.ts";

// Вебхук Monobank (личный API, https://api.monobank.ua/docs/).
// Регистрируется на адрес https://<домен>/api/monobank?key=<DN_INGEST_TOKEN>.
// Monobank проверяет адрес GET-запросом, а операции присылает POST-ом:
// { type: "StatementItem", data: { account, statementItem: { id, time, description, mcc, amount, currencyCode, ... } } }

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

  // Операции до даты, с которой ведётся карта, пропускаются.
  const saved = saveMonoItem(body.data?.account, item);
  if (saved && !saved.duplicate) {
    matchPlanForTx(saved.id);
    // Monobank ждёт быстрый ответ: подсказку ИИ и уведомление делаем в фоне.
    const id = saved.id;
    void (async () => {
      await suggestForTx(id).catch(() => {});
      await notifyNewTx(id).catch(() => {});
    })();
  }
  revalidatePath("/", "layout");
  return new NextResponse("ok");
}
