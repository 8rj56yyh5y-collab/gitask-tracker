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
import { monobankConnected } from "@/lib/repo.ts";
import { HashOpen } from "../components/HashOpen.tsx";

const DOCS = "https://github.com/8rj56yyh5y-collab/gitask-tracker/blob/main/docs";

function SecHead({ icon, title, status, ok }: { icon: string; title: string; status: string; ok?: boolean }) {
  return (
    <span className="set-head">
      <span className="set-icon" aria-hidden>
        {icon}
      </span>
      <span className="set-title">
        <strong>{title}</strong>
        <span className={ok ? "pos-text" : "muted"}>{status}</span>
      </span>
    </span>
  );
}

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
  const monoOn = monobankConnected();
  const applePayOk = shortcutWorks();

  return (
    <div className="narrow-wide">
      <h1>Настройки</h1>
      <HashOpen />

      <details className="card set-sec" id="theme">
        <summary>
          <SecHead icon="🎨" title="Оформление" status={THEMES.find((t) => t.id === theme)?.name ?? ""} />
        </summary>
        <div className="form set-body">
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
          Тема запоминается на этом устройстве.
        </p>
        </div>
      </details>

      <details className="card set-sec" id="telegram" open={!tg.linked}>
        <summary>
          <SecHead icon="✈️" title="Уведомления в Telegram" status={tg.linked ? "Подключено ✓" : tg.connected ? "Остался один шаг" : "Не подключено"} ok={tg.linked} />
        </summary>
        <div className="form set-body">
        {sp.tg_error && <p className="danger small">{sp.tg_error}</p>}
        {!tg.connected ? (
          <>
            <p className="small">
              После каждой оплаты бот пришлёт сообщение: сумма, магазин и кнопки направлений. Нажали кнопку — операция записана.
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
            {!https && <p className="small warn-text">Подключение работает только на сайте в интернете (адрес начинается с https).</p>}
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
              Если кнопка не сработала — отправьте боту эту строку и обновите страницу:
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
        </div>
      </details>

      <details className="card set-sec" id="monobank" open={Boolean(sp.mono_error || sp.mono_ok)}>
        <summary>
          <SecHead icon="🐈‍⬛" title="Monobank" status={monoOn ? "Подключено ✓" : "Не подключено"} ok={monoOn} />
        </summary>
        <div className="form set-body">
        {sp.mono_ok && <p className="ok-text small">{sp.mono_ok}</p>}
        {sp.mono_error && <p className="danger small">{sp.mono_error}</p>}
        <p className="small">
          Все операции Monobank будут приходить сами — и оплаты, и переводы. Откройте{" "}
          <a href="https://api.monobank.ua/" className="link" target="_blank" rel="noreferrer">api.monobank.ua</a>, войдите через приложение
          Monobank, скопируйте ключ (токен) и вставьте ниже. Карты добавятся сами.
        </p>
        <form action={connectMonobankAction} className="form">
          <input name="token" required placeholder="Вставьте ключ Monobank" autoComplete="off" aria-label="Ключ Monobank" />
          <label>
            Записывать операции, начиная с
            <input name="from" type="date" defaultValue={today} max={today} min={minDay} />
          </label>
          <label className="check">
            <input type="checkbox" name="backfill" /> Подтянуть и прошлые операции с этой даты (до {MAX_BACKFILL_DAYS} дней назад)
          </label>
          <p className="muted small">
            Если не включать — будут записываться только новые операции, с сегодняшнего дня.
          </p>
          <SubmitButton className="btn btn-primary" pending="Подключаю…">
            Подключить
          </SubmitButton>
        </form>
        </div>
      </details>

      <details className="card set-sec" id="shortcuts" open={!applePayOk}>
        <summary>
          <SecHead icon="📱" title="Оплаты Apple Pay с любой карты" status={applePayOk ? "Работает ✓" : "Не настроено"} ok={applePayOk} />
        </summary>
        <div className="form set-body">
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
          Платите телефоном любой картой — iPhone сам отправит в D&amp;N сумму, магазин и карту. Настраивается один раз в приложении
          «Команды».
          {tg.linked ? " Сразу придёт сообщение в Telegram с выбором направления." : " Подключите Telegram выше — тогда сразу придёт сообщение с выбором направления."}
        </p>
        <div className="f-label small muted">Ваша личная ссылка — понадобится в шаге 2</div>
        {ingestKey ? (
          <CopyField value={`${base}/api/ingest?key=${ingestKey}`} label="ссылка для «Команд»" />
        ) : (
          <p className="danger small">Ссылка ещё не готова: на сервере не задан секретный ключ (DN_INGEST_TOKEN).</p>
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
          Чтобы D&amp;N понимал, с какой карты оплата, добавьте свои карты в <Link href="/cards" className="link">Картах</Link>. Ссылку никому не
          пересылайте — по ней можно добавлять операции в ваш D&amp;N.
        </p>
        </div>
      </details>

      <details className="card set-sec" id="ai">
        <summary>
          <SecHead icon="✨" title="Помощник ИИ" status={aiConfigured() ? "Подключён ✓" : "Не подключён"} ok={aiConfigured()} />
        </summary>
        <div className="form set-body">
        <p className="small">
          {aiConfigured() ? (
            <span className="ok-text">✓ Подключён. Разбор месяца — в «Аналитике».</span>
          ) : (
            <>ИИ посмотрит на ваши траты за месяц, сравнит с прошлым, сделает прогноз и подскажет, где можно сэкономить. Скоро подключим.</>
          )}
        </p>
        </div>
      </details>

      <form action="/logout" method="post">
        <button className="btn btn-ghost">Выйти</button>
      </form>
    </div>
  );
}
