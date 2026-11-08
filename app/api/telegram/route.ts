import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { safeEqual } from "@/lib/session.ts";
import { handleUpdate, telegramSecret } from "@/lib/telegram.ts";
import { getAccount } from "@/lib/accounts.ts";
import { MAIN, runAs } from "@/lib/tenant.ts";

// Вебхук Telegram. Telegram подписывает каждый запрос секретом, который мы задали при подключении.
export async function POST(req: Request) {
  // Бот дополнительного аккаунта подключён с адресом ?a=<id>.
  const tenant = new URL(req.url).searchParams.get("a") || MAIN;
  if (tenant !== MAIN && !getAccount(tenant)) return new NextResponse("unknown account", { status: 404 });
  return runAs(tenant, () => handle(req));
}

async function handle(req: Request) {
  const secret = telegramSecret();
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(got, secret)) return new NextResponse("unauthorized", { status: 401 });
  try {
    await handleUpdate(await req.json());
    revalidatePath("/", "layout");
  } catch (e) {
    // Отвечаем 200, иначе Telegram будет бесконечно повторять то же событие.
    console.error("Telegram update failed:", e);
  }
  return new NextResponse("ok");
}
