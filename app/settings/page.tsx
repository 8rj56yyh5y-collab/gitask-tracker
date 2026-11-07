import Link from "next/link";
import { connectMonobankAction, connectTelegramAction, disconnectTelegramAction } from "../actions.ts";
import { SubmitButton } from "../components/SubmitButton.tsx";
import { aiConfigured } from "@/lib/ai.ts";
import { telegramState } from "@/lib/telegram.ts";
import { MAX_BACKFILL_DAYS } from "@/lib/monobank.ts";
import { publicBase } from "@/lib/url.ts";

const DOCS = "https://github.com/8rj56yyh5y-collab/gitask-tracker/blob/claude/hopeful-davinci-yrcko2/docs";

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
  const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const today = ymd(new Date());
  const minDay = ymd(new Date(Date.now() - MAX_BACKFILL_DAYS * 864e5));

  return (
    <div className="narrow-wide">
      <h1>Настройки</h1>

      <section className="card form" id="telegram">
        <h2>Уведомления в Telegram</h2>
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
              Или отправьте боту: <code>/start {tg.linkCode}</code>. Потом обновите эту страницу.
            </p>
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
        <h2>Apple Pay и SMS других банков</h2>
        <p className="small">
          ПриватБанк, ПУМБ, А-Банк, Радабанк, Райффайзен — через приложение «Команды» на iPhone: после оплаты Apple Pay или
          SMS от банка операция сама попадает в D&amp;N. Пошагово — в{" "}
          <a href={`${DOCS}/IPHONE_SETUP.md`} className="link" target="_blank" rel="noreferrer">
            инструкции
          </a>
          .
        </p>
        <label>
          Адрес для «Команд»
          <input readOnly value={`${base}/api/ingest`} />
        </label>
        <label>
          Ключ (в заголовке Authorization: Bearer …)
          <input readOnly value={ingestKey || "не задан на сервере (DN_INGEST_TOKEN)"} />
        </label>
        <p className="muted small">
          Карты других банков добавьте на странице <Link href="/cards" className="link">Лимиты карт</Link> — по последним 4 цифрам
          D&amp;N узнаёт, с какой карты пришла операция.
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
