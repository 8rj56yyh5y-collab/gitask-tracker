import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { unassignedSummary } from "@/lib/repo.ts";
import { SwRegister } from "./sw-register.tsx";
import { Nav, TopNav } from "./components/Nav.tsx";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionValid } from "@/lib/session.ts";
import { THEME_COOKIE, lookOf, normalizeTheme } from "@/lib/theme.ts";
import { NAV_COOKIE, parseNav } from "@/lib/nav.ts";
import { isSimple } from "@/lib/mode.ts";
import { accountSessionOk, currentAccountName } from "@/lib/accounts.ts";

export const metadata: Metadata = {
  title: "D&N",
  description: "Учёт денег: ни один платёж без записи",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "D&N", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#eef0f6",
};

/** Шрифты: Inter и Inter Tight — «Стекло» и «Графит»; Manrope и Unbounded — «Классика». */
function Fonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Inter+Tight:wght@500;600;700;800&family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@500;600;700&display=swap" />
    </>
  );
}

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const session = jar.get(SESSION_COOKIE)?.value;
  const signed = await sessionValid(session);
  // Аккаунт удалили или сбросили ему пароль — старый вход больше не действует.
  const stale = signed && !accountSessionOk(session);
  const authed = signed && !stale;
  const theme = normalizeTheme(jar.get(THEME_COOKIE)?.value);
  // «Как в телефоне» — без атрибута: цвета берутся из настройки телефона.
  const themeAttr = theme === "system" ? undefined : theme;
  if (!authed) {
    // Страница входа: без меню и без данных.
    return (
      <html lang="ru" data-theme={themeAttr} data-look={lookOf(theme)}>
        <head>
          <Fonts />
        </head>
        <body>
          <header className="top">
            <span className="brand">D&amp;N</span>
          </header>
          <main className="wrap">
            {stale ? (
              <form action="/logout" method="post" className="card form">
                <strong>Вход устарел</strong>
                <p className="muted small" style={{ margin: 0 }}>Пароль этого аккаунта сменили или аккаунт удалён. Войдите заново.</p>
                <button className="btn btn-primary">Войти заново</button>
              </form>
            ) : (
              children
            )}
          </main>
        </body>
      </html>
    );
  }
  const { count } = unassignedSummary();
  const accName = currentAccountName();
  return (
    <html lang="ru" data-theme={themeAttr} data-look={lookOf(theme)}>
      <head>
        <Fonts />
      </head>
      <body>
        <header className="top top-v2">
          <Link href="/" className="brand">
            D&amp;N
          </Link>
          <Link href="/search" className="top-search" aria-label="Поиск">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <span>Поиск по всему</span>
          </Link>
          <TopNav />
          <Link href="/more" className="top-ava" aria-label="Профиль и все разделы" title={accName ? `Аккаунт: ${accName}` : "Профиль и все разделы"}>
            {(accName || "Я").trim().charAt(0).toUpperCase()}
          </Link>
        </header>
        <main className="wrap">{children}</main>
        <Nav pending={count} items={parseNav(jar.get(NAV_COOKIE)?.value)} simple={isSimple()} />
        <SwRegister />
      </body>
    </html>
  );
}
