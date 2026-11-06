import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { publicBase } from "@/lib/url.ts";
import { SESSION_COOKIE, SESSION_MAX_AGE, appPassword, safeEqual, sessionToken } from "@/lib/session.ts";

async function login(f: FormData) {
  "use server";
  const password = appPassword();
  const given = String(f.get("password") ?? "");
  const rawNext = String(f.get("next") ?? "/");
  // Только внутренние адреса, чтобы ссылка входа не уводила на чужой сайт.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  if (!password || !safeEqual(await sessionToken(given), await sessionToken(password))) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(password), {
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
          {error && <div className="danger">Неверный пароль</div>}
          <input type="hidden" name="next" value={next ?? "/"} />
          <label>
            Пароль
            <input name="password" type="password" required autoFocus autoComplete="current-password" />
          </label>
          <button className="btn btn-primary">Войти</button>
        </form>
      )}
    </>
  );
}
