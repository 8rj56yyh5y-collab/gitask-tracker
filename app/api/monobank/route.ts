import { NextResponse } from "next/server";
import { bearer } from "@/lib/auth.ts";
import { tenantForKey } from "@/lib/accounts.ts";
import { currentTenant, runAs } from "@/lib/tenant.ts";
import { saveMonoItem } from "@/lib/monobank.ts";
import { revalidatePath } from "next/cache";
import { notifyNewTx } from "@/lib/telegram.ts";
import { suggestForTx } from "@/lib/suggest.ts";
import { matchPlanForTx } from "@/lib/plans.ts";
import { matchReceiptForTx } from "@/lib/shopping.ts";

// Вебхук Monobank (личный API, https://api.monobank.ua/docs/).
// Регистрируется на адрес https://<домен>/api/monobank?key=<DN_INGEST_TOKEN>.
// Monobank проверяет адрес GET-запросом, а операции присылает POST-ом:
// { type: "StatementItem", data: { account, statementItem: { id, time, description, mcc, amount, currencyCode, ... } } }

export async function GET(req: Request) {
  if (!tenantForKey(bearer(req))) return new NextResponse("unauthorized", { status: 401 });
  return new NextResponse("ok");
}

export async function POST(req: Request) {
  const tenant = tenantForKey(bearer(req));
  if (!tenant) return new NextResponse("unauthorized", { status: 401 });
  return runAs(tenant, () => handle(req));
}

async function handle(req: Request) {
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
    if (matchReceiptForTx(saved.id)) {
      revalidatePath("/", "layout");
      return new NextResponse("ok");
    }
    // Monobank ждёт быстрый ответ: подсказку ИИ и уведомление делаем в фоне.
    const id = saved.id;
    const tenant = currentTenant();
    void runAs(tenant, async () => {
      await suggestForTx(id).catch(() => {});
      await notifyNewTx(id).catch(() => {});
    });
  }
  revalidatePath("/", "layout");
  return new NextResponse("ok");
}
