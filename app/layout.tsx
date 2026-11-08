import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { unassignedSummary } from "@/lib/repo.ts";
import { SwRegister } from "./sw-register.tsx";
import { Nav, TopNav } from "./components/Nav.tsx";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionValid } from "@/lib/session.ts";
import { THEME_COOKIE, normalizeTheme } from "@/lib/theme.ts";
import { NAV_COOKIE, parseNav } from "@/lib/nav.ts";
import { accountSessionOk, currentAccountName } from "@/lib/accounts.ts";

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
      <html lang="ru" data-theme={themeAttr}>
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
    <html lang="ru" data-theme={themeAttr}>
      <body>
        <header className="top">
          <Link href="/" className="brand">
            D&amp;N
          </Link>
          {accName && <span className="acc-badge" title="Вы вошли в аккаунт">👤 {accName}</span>}
          <TopNav />
        </header>
        <main className="wrap">{children}</main>
        <Nav pending={count} items={parseNav(jar.get(NAV_COOKIE)?.value)} />
        <SwRegister />
      </body>
    </html>
  );
}
