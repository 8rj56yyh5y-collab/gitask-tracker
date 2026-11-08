import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { publicBase } from "@/lib/url.ts";
import { SESSION_COOKIE, SESSION_MAX_AGE, appPassword, safeEqual, sessionToken } from "@/lib/session.ts";
import { checkLogin } from "@/lib/accounts.ts";
import { accountCookieValue } from "@/lib/tenant.ts";

async function login(f: FormData) {
  "use server";
  const password = appPassword();
  const given = String(f.get("password") ?? "");
  const loginName = String(f.get("login") ?? "").trim();
  const rawNext = String(f.get("next") ?? "/");
  // Только внутренние адреса, чтобы ссылка входа не уводила на чужой сайт.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  let value: string | null = null;
  if (loginName && loginName.toLowerCase() !== "owner") {
    const acc = checkLogin(loginName, given);
    if (acc) value = accountCookieValue(acc.id, acc.ver);
  } else if (password && safeEqual(await sessionToken(given), await sessionToken(password))) {
    value = await sessionToken(password);
  }
  if (!value) redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  (await cookies()).set(SESSION_COOKIE, value, {
    httpOnly: true,
    // Только по https: при запуске с ноутбука по Wi-Fi (http) iPhone иначе не сохранит вход.
    secure: (await publicBase()).startsWith("https://"),
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  redirect(next);
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = Boolean(appPassword());
  return (
    <>
      <h1>Вход</h1>
      {!configured ? (
        <div className="card alert alert-on">
          Пароль не задан. Укажите переменную окружения <code>DN_APP_PASSWORD</code> (минимум 6 символов) и перезапустите
          сервер.
        </div>
      ) : (
        <form action={login} className="card form">
          {error && <div className="danger">Неверный логин или пароль</div>}
          <input type="hidden" name="next" value={next ?? "/"} />
          <label>
            Логин
            <input name="login" autoCapitalize="none" autoCorrect="off" autoComplete="username" placeholder="если вам дали логин" />
          </label>
          <label>
            Пароль
            <input name="password" type="password" required autoComplete="current-password" />
          </label>
          <button className="btn btn-primary">Войти</button>
        </form>
      )}
    </>
  );
}
