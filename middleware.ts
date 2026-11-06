import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionValid } from "./lib/session.ts";

// Всё, кроме входа, статики и API приёма операций (у них свой ключ), — только после входа.
export async function middleware(req: NextRequest) {
  if (await sessionValid(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/") url.searchParams.set("next", next);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/ingest|api/monobank|api/telegram|_next/|manifest.webmanifest|icon.svg|sw.js|favicon.ico).*)"],
};
