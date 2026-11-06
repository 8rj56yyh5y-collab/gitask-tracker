import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { unassignedSummary } from "@/lib/repo.ts";
import { SwRegister } from "./sw-register.tsx";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionValid } from "@/lib/session.ts";

export const metadata: Metadata = {
  title: "D&N",
  description: "Учёт денег: ни один платёж без записи",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "D&N", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const authed = await sessionValid((await cookies()).get(SESSION_COOKIE)?.value);
  if (!authed) {
    // Страница входа: без меню и без данных.
    return (
      <html lang="ru">
        <body>
          <header className="top">
            <span className="brand">D&amp;N</span>
          </header>
          <main className="wrap">{children}</main>
        </body>
      </html>
    );
  }
  const { count } = unassignedSummary();
  return (
    <html lang="ru">
      <body>
        <header className="top">
          <Link href="/" className="brand">D&amp;N</Link>
          <Link href="/new" className="btn btn-primary btn-sm">+ Операция</Link>
        </header>
        <main className="wrap">{children}</main>
        <nav className="tabs">
          <Link href="/">Главная</Link>
          <Link href="/inbox">
            Разнести{count > 0 && <span className="badge">{count}</span>}
          </Link>
          <Link href="/cards">Лимиты</Link>
          <Link href="/centers">Подразделения</Link>
          <Link href="/history">История</Link>
        </nav>
        <SwRegister />
      </body>
    </html>
  );
}
