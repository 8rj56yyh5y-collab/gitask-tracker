import Link from "next/link";
import { connectMonobankAction, connectTelegramAction, disconnectTelegramAction, setThemeAction } from "../actions.ts";
import { SubmitButton } from "../components/SubmitButton.tsx";
import { CopyField } from "../components/CopyField.tsx";
import { aiConfigured } from "@/lib/ai.ts";
import { telegramState } from "@/lib/telegram.ts";
import { MAX_BACKFILL_DAYS } from "@/lib/monobank.ts";
import { publicBase } from "@/lib/url.ts";
import { cookies } from "next/headers";
import { THEMES, THEME_COOKIE, normalizeTheme } from "@/lib/theme.ts";
import { SIGNAL_TEXT, lastShortcutSignal, shortcutWorks } from "@/lib/setup.ts";

const DOCS = "https://github.com/8rj56yyh5y-collab/gitask-tracker/blob/main/docs";

export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ tg_error?: string; mono_error?: string; mono_ok?: string }>;
}) {
  const sp = await searchParams;
  const tg = telegramState();
  const base = await publicBase();
  const https = base.startsWith("https://");
  const ingestKey = process.env.DN_INGEST_TOKEN ?? "";
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = ymd(new Date());
  const minDay = ymd(new Date(Date.now() - MAX_BACKFILL_DAYS * 864e5));

  return (
    <div className="narrow-wide">
      <h1>Настройки</h1>

      <section className="card form" id="theme">
        <h2>Оформление</h2>
        {/* У каждой темы своя форма: значение нажатой кнопки в общей форме до сервера не доходит. */}
        <div className="themes">
          {THEMES.map((t) => (
            <form key={t.id} action={setThemeAction}>
              <input type="hidden" name="theme" value={t.id} />
              <button className={`theme-opt ${theme === t.id ? "is-on" : ""}`} aria-pressed={theme === t.id} style={{ width: "100%" }}>
                <span className="theme-swatch" style={{ background: t.bg }}>
                  <i style={{ background: t.accent }} />
                </span>
                <span className="small">{t.name}</span>
              </button>
            </form>
          ))}
        </div>
        <p className="muted small" style={{ margin: 0 }}>
          Сохраняется на этом устройстве.
        </p>
      </section>

      <section className="card form" id="telegram">
        <h2>Уведомления в Telegram — чтобы не забыть записать</h2>
        {sp.tg_error && <p className="danger small">{sp.tg_error}</p>}
        {!tg.connected ? (
          <>
            <p className="small">
              После каждой операции бот пришлёт сообщение с кнопками категорий — нажали, и операция записана.
            </p>
            <ol className="small steps">
              <li>
                В Telegram откройте <a href="https://t.me/BotFather" className="link">@BotFather</a>, отправьте{" "}
                <code>/newbot</code>, придумайте имя.
              </li>
              <li>BotFather пришлёт токен — длинную строку с двоеточием. Вставьте её сюда:</li>
            </ol>
            <form action={connectTelegramAction} className="inline">
              <input name="token" required placeholder="1234567890:AA…" autoComplete="off" />
              <SubmitButton className="btn btn-primary btn-sm" pending="Подключаю…">
                Подключить
              </SubmitButton>
            </form>
            {!https && <p className="small warn-text">Подключить получится, когда сайт будет открыт по https (в интернете).</p>}
          </>
        ) : !tg.linked ? (
          <>
            <p className="small">
              Бот <strong>@{tg.botName}</strong> подключён. Остался один шаг — привязать ваш чат:
            </p>
            <a href={`https://t.me/${tg.botName}?start=${tg.linkCode}`} className="btn btn-primary" target="_blank" rel="noreferrer">
              Открыть бота и нажать «Старт»
            </a>
            <p className="muted small">
              Или отправьте боту эту строку, потом обновите страницу:
            </p>
            <CopyField value={`/start ${tg.linkCode}`} label="команда для бота" />
          </>
        ) : (
          <p className="small">
            <span className="ok-text">✓ Подключено</span> — уведомления приходят от <strong>@{tg.botName}</strong>.
          </p>
        )}
        {tg.connected && (
          <form action={disconnectTelegramAction}>
            <button className="btn btn-ghost btn-sm">Отключить Telegram</button>
          </form>
        )}
      </section>

      <section className="card form" id="monobank">
        <h2>Monobank — автоматически</h2>
        {sp.mono_ok && <p className="ok-text small">{sp.mono_ok}</p>}
        {sp.mono_error && <p className="danger small">{sp.mono_error}</p>}
        <p className="small">
          Откройте <a href="https://api.monobank.ua/" className="link" target="_blank" rel="noreferrer">api.monobank.ua</a>, войдите
          через приложение Monobank и скопируйте токен. D&amp;N сам добавит все карты и будет получать каждую операцию с выбранного дня.
          Токен не сохраняется.
        </p>
        <form action={connectMonobankAction} className="form">
          <input name="token" required placeholder="Токен Monobank" autoComplete="off" aria-label="Токен Monobank" />
          <label>
            Вести операции с
            <input name="from" type="date" defaultValue={today} max={today} min={minDay} />
          </label>
          <label className="check">
            <input type="checkbox" name="backfill" /> Загрузить прошлые операции с этой даты (не дальше {MAX_BACKFILL_DAYS} дней)
          </label>
          <p className="muted small">
            По умолчанию — с сегодняшнего дня: старые операции не подтягиваются, только новые.
          </p>
          <SubmitButton className="btn btn-primary" pending="Подключаю…">
            Подключить
          </SubmitButton>
        </form>
      </section>

      <section className="card form" id="shortcuts">
        <h2>Оплаты Apple Pay — с любой карты</h2>
        {(() => {
          const sig = lastShortcutSignal();
          const works = shortcutWorks();
          const good = sig ? sig.result === "ok" || sig.result === "mono_skip" : works;
          return (
            <div className={`card ${good ? "alert-ok" : sig ? "alert-on" : ""}`} style={{ margin: 0 }}>
              <strong>{good ? "Работает ✓" : sig ? "Есть проблема" : "Ещё не было ни одной оплаты через «Команды»"}</strong>
              <div className="small">
                {sig ? (
                  <>
                    Последний сигнал: {new Date(sig.at).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    {sig.card && ` · ${sig.card}`} — {SIGNAL_TEXT[sig.result]}
                  </>
                ) : works ? (
                  "Операции Apple Pay уже приходили."
                ) : (
                  "Если вы уже настроили — оплатите что-нибудь телефоном. Если и после этого здесь пусто, значит запрос до D&N не дошёл: проверьте ссылку в шаге 2. Если iPhone пишет «Сбой автоматизации» — пришлите текст ошибки."
                )}
              </div>
            </div>
          );
        })()}
        <p className="small" style={{ margin: 0 }}>
          После оплаты телефоном iPhone сам отправит в D&amp;N сумму, магазин и карту. Карту D&amp;N узнает по названию банка.
          {tg.linked ? " Сразу придёт сообщение в Telegram с выбором категории." : " Подключите Telegram выше — тогда сразу придёт сообщение с выбором категории."}
        </p>
        <div className="f-label small muted">Ваша ссылка для «Команд» (в ней уже есть ваш секретный ключ)</div>
        {ingestKey ? (
          <CopyField value={`${base}/api/ingest?key=${ingestKey}`} label="ссылка для «Команд»" />
        ) : (
          <p className="danger small">Ключ не задан на сервере (DN_INGEST_TOKEN).</p>
        )}
        <ol className="small steps">
          <li>
            «Команды» → <b>Автоматизация</b> → <b>+</b> → <b>Транзакция</b>. Карты — <b>все</b>, <b>Запускать сразу</b> → Далее.
          </li>
          <li>
            <b>Новая пустая автоматизация</b> → <b>Добавить действие</b> → <b>Получить содержимое URL</b>. Вставьте ссылку выше.
          </li>
          <li>
            Нажмите <b>›</b> у действия: <b>Метод</b> — POST, <b>Тело запроса</b> — <b>JSON</b>. Добавьте три поля «Текст»:
            <br />
            <code>amount</code> → «Ввод команды» → <b>Сумма</b>; <code>merchant</code> → <b>Продавец</b>; <code>card</code> → <b>Карта или пропуск</b>.
          </li>
          <li>
            <b>Готово</b>. Оплатите что-нибудь телефоном — операция появится в «Истории»{tg.linked ? " и в Telegram" : ""}.
          </li>
        </ol>
        <p className="muted small" style={{ margin: 0 }}>
          Добавьте карты в разделе <Link href="/cards" className="link">Карты</Link>: если карта банка одна, D&amp;N сам поймёт, с какой она. Ссылка содержит
          секретный ключ — не пересылайте её никому.
        </p>
      </section>

      <section className="card form">
        <h2>ИИ</h2>
        <p className="small">
          {aiConfigured() ? (
            <span className="ok-text">✓ Подключён — разбор месяца в «Аналитике».</span>
          ) : (
            <>Не подключён. Задайте на сервере ключ ANTHROPIC_API_KEY (console.anthropic.com).</>
          )}
        </p>
      </section>

      <form action="/logout" method="post">
        <button className="btn btn-ghost">Выйти</button>
      </form>
    </div>
  );
}
