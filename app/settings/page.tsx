import Link from "next/link";
import {
  connectMonobankAction,
  connectTelegramAction,
  createAccountAction,
  deleteAccountAction,
  disconnectTelegramAction,
  setUiModeAction,
  setHourRateAction,
  toggleWeekSummaryAction,
  resetAccountAction,
  setNavAction,
  updateAccountAction,
  setThemeAction,
} from "../actions.ts";
import { accountPassword, currentIngestKey, isOwner, listAccounts } from "@/lib/accounts.ts";
import { NAV_COOKIE, NAV_ITEMS, NAV_MAX, parseNav } from "@/lib/nav.ts";
import { SubmitButton } from "../components/SubmitButton.tsx";
import { CopyField } from "../components/CopyField.tsx";
import { aiConfigured } from "@/lib/ai.ts";
import { telegramState } from "@/lib/telegram.ts";
import { getSetting } from "@/lib/settings.ts";
import { uiMode } from "@/lib/mode.ts";
import { FaceIdToggle } from "../components/AppLock.tsx";
import { hourRate } from "@/lib/hours.ts";
import { formatMoney } from "@/lib/money.ts";
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
  searchParams: Promise<{ tg_error?: string; mono_error?: string; mono_ok?: string; nav_ok?: string; acc?: string; acc_saved?: string; acc_open?: string }>;
}) {
  const sp = await searchParams;
  const tg = telegramState();
  const weekOn = getSetting("week_summary") !== "off";
  const base = await publicBase();
  const https = base.startsWith("https://");
  const ingestKey = currentIngestKey();
  const owner = isOwner();
  const accounts = owner ? listAccounts() : [];
  const theme = normalizeTheme((await cookies()).get(THEME_COOKIE)?.value);
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mode = uiMode();
  const rate = hourRate();
  const ownRate = Boolean(getSetting("hour_rate"));
  const today = ymd(new Date());
  const minDay = ymd(new Date(Date.now() - MAX_BACKFILL_DAYS * 864e5));
  const monoOn = monobankConnected();
  const nav = parseNav((await cookies()).get(NAV_COOKIE)?.value);
  const applePayOk = shortcutWorks();

  return (
    <div className="narrow-wide">
      <h1>Настройки</h1>
      <HashOpen />

      <FaceIdToggle />

      <form action={setHourRateAction} className="card hour-card" id="hours">
        <span>
          <strong>⏱ Цена часа вашей работы</strong>
          <span className="muted small">
            {rate
              ? ` Сейчас: ${formatMoney(rate)} в час${ownRate ? "" : " — посчитано из ставки (÷ 168 часов)"}. Под тратами D&N пишет, сколько это часов работы.`
              : " Впишите — и под тратами появится «≈ 2,5 ч работы». Или добавьте ставку в «Доходах»: посчитается сама."}
          </span>
        </span>
        <span className="fc-start-row">
          <input name="rate" inputMode="decimal" placeholder={rate ? String(Math.round(rate / 100)) : "например, 250"} aria-label="Цена часа, ₴" />
          <button className="btn btn-sm">Сохранить</button>
          {ownRate && (
            <button className="btn btn-sm btn-ghost" name="reset" value="1">
              По ставке
            </button>
          )}
        </span>
      </form>

      <section className="card mode-card" id="mode">
        <div className="mode-head">
          <strong>Как пользоваться D&amp;N</strong>
          <span className="muted small">Можно переключать в любой момент — данные не меняются.</span>
        </div>
        <div className="mode-opts">
          {(["simple", "full"] as const).map((m) => (
            <form key={m} action={setUiModeAction}>
              <input type="hidden" name="mode" value={m} />
              <button className={`mode-opt ${mode === m ? "is-on" : ""}`} aria-pressed={mode === m}>
                <span className="mode-ico" aria-hidden>
                  {m === "simple" ? "🌱" : "🧰"}
                </span>
                <b>{m === "simple" ? "Простой" : "Расширенный"}</b>
                <span className="small">
                  {m === "simple"
                    ? "Трата — это сумма, категория и комментарий. Всё записывается в «мои деньги»."
                    : "Плюс «чьи деньги» (мои, работы, семьи), наличные в кассах, чужие деньги, продажи, норма трат."}
                </span>
              </button>
            </form>
          ))}
        </div>
      </section>

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

      <details className="card set-sec" id="nav" open={Boolean(sp.nav_ok)}>
        <summary>
          <SecHead icon="🧭" title="Нижнее меню" status={nav.map((id) => NAV_ITEMS.find((i) => i.id === id)?.label).join(" · ")} />
        </summary>
        <form action={setNavAction} className="form set-body">
          <p className="small" style={{ margin: 0 }}>
            Выберите до {NAV_MAX} разделов, которые нужны вам под рукой. Кнопка «＋» есть всегда, а всё остальное находится через поиск сверху и профиль.
          </p>
          {sp.nav_ok && <p className="small pos-text" style={{ margin: 0 }}>Сохранено ✓ Меню внизу обновилось.</p>}
          <div className="chips">
            {NAV_ITEMS.map((i) => (
              <label key={i.id} className="chip-opt chip-check">
                <input type="checkbox" name="nav" value={i.id} defaultChecked={nav.includes(i.id)} />
                <span>{i.label}</span>
              </label>
            ))}
          </div>
          <div className="row-gap" style={{ margin: 0 }}>
            <button className="btn btn-primary">Сохранить меню</button>
            <button className="btn btn-ghost btn-sm" name="reset" value="1">Вернуть как было</button>
          </div>
        </form>
      </details>

      <Link href="/categories" className="card set-sec add-link">
        <span className="set-head" style={{ flex: 1 }}>
          <span className="set-icon" aria-hidden>🗂</span>
          <span className="set-title">
            <strong>Категории</strong>
            <span className="muted">На что именно: продукты, такси, аренда…</span>
          </span>
        </span>
      </Link>

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
        {tg.linked && (
          <form action={toggleWeekSummaryAction} className="row-between week-toggle">
            <input type="hidden" name="on" value={weekOn ? "0" : "1"} />
            <span>
              <strong>📊 Итог недели</strong>
              <span className="muted small"> — по понедельникам: сколько потрачено, на что больше всего, что заметил D&amp;N</span>
            </span>
            <button className="btn btn-sm">{weekOn ? "Выключить" : "Включить"}</button>
          </form>
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

      {owner && (
        <details className="card set-sec" id="accounts" open={Boolean(sp.acc)}>
          <summary>
            <SecHead icon="👥" title="Доступ для других" status={accounts.length ? `аккаунтов: ${accounts.length}` : "только вы"} />
          </summary>
          <div className="form set-body">
            <p className="small" style={{ margin: 0 }}>
              Дайте D&amp;N попробовать другим. У каждого — свой вход и <b>свои данные</b>: ваши карты и операции они не увидят, а вы — их.
            </p>
            {sp.acc_saved && <p className="small pos-text" style={{ margin: 0 }}>Сохранено ✓ Если меняли логин — сообщите человеку новый, пароль прежний.</p>}
            {accounts.map((a) => (
              <div key={a.id} className="acc-row">
                <span className="set-title">
                  <strong>{a.name}</strong>
                  <span className="muted">логин: {a.login}</span>
                </span>
                <details className="acc-login" open={sp.acc_open === a.id}>
                  <summary className="btn btn-sm btn-primary">Данные для входа</summary>
                  <div className="acc-login-body">
                    {(() => {
                      const pw = accountPassword(a.id);
                      return pw ? (
                        <>
                          <CopyField value={`D&N — учёт денег\nСайт: ${base}\nЛогин: ${a.login}\nПароль: ${pw}`} label={`данные для входа: ${a.name}`} />
                          <p className="muted small" style={{ margin: 0 }}>Нажмите кнопку справа — сообщение скопируется, его можно отправить в Telegram.</p>
                        </>
                      ) : (
                        <p className="small" style={{ margin: 0 }}>
                          Пароль этого аккаунта не сохранился (аккаунт создан до обновления). Нажмите <b>«Новый пароль»</b> — и данные для входа
                          появятся здесь.
                        </p>
                      );
                    })()}
                  </div>
                </details>
                <details className="acc-edit">
                  <summary className="btn btn-sm">Изменить</summary>
                  <form action={updateAccountAction} className="form acc-edit-form">
                    <input type="hidden" name="id" value={a.id} />
                    <div className="grid-2-tight">
                      <label>
                        Имя
                        <input name="name" required defaultValue={a.name} />
                      </label>
                      <label>
                        Логин (латиницей)
                        <input name="login" required defaultValue={a.login} pattern="[a-zA-Z0-9._\-]{3,30}" autoCapitalize="none" />
                      </label>
                    </div>
                    <button className="btn btn-primary btn-sm">Сохранить</button>
                  </form>
                </details>
                <form action={resetAccountAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="login" value={a.login} />
                  <input type="hidden" name="name" value={a.name} />
                  <button className="btn btn-sm">Новый пароль</button>
                </form>
                <details className="acc-del">
                  <summary className="btn btn-sm btn-ghost danger">Удалить</summary>
                  <form action={deleteAccountAction} className="acc-del-confirm">
                    <input type="hidden" name="id" value={a.id} />
                    <span className="small">Удалить «{a.name}» вместе со всеми его данными?</span>
                    <button className="btn btn-sm danger-btn">Да, удалить</button>
                  </form>
                </details>
              </div>
            ))}
            <form action={createAccountAction} className="form">
              <div className="grid-2-tight">
                <label>
                  Имя
                  <input name="name" required placeholder="например, Олег" />
                </label>
                <label>
                  Логин (латиницей)
                  <input name="login" required pattern="[a-zA-Z0-9._\-]{3,30}" autoCapitalize="none" placeholder="oleg" />
                </label>
              </div>
              <button className="btn btn-primary">Создать аккаунт</button>
              <p className="muted small" style={{ margin: 0 }}>Пароль придумается сам. Посмотреть и скопировать его можно в любой момент — кнопка «Данные для входа».</p>
            </form>
          </div>
        </details>
      )}

      <form action="/logout" method="post">
        <button className="btn btn-ghost">Выйти</button>
      </form>
    </div>
  );
}
