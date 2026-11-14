import Link from "next/link";
import { monthRecap } from "@/lib/recap.ts";
import { formatMoney } from "@/lib/money.ts";

const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10,
    m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? few : many;
};

/** «Итоги месяца» — короткие карточки-сторис, листаются пальцем. */
export default async function RecapPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const sp = await searchParams;
  const now = new Date();
  // По умолчанию — прошлый месяц: он уже закончился.
  const [y, mo] = /^\d{4}-\d{2}$/.test(sp.m ?? "") ? sp.m!.split("-").map(Number) : [new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear(), new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1];
  const r = monthRecap(y, mo - 1);
  const current = now.getFullYear() === y && now.getMonth() === mo - 1;
  const diff = r.prevSpent ? Math.round((r.spent / r.prevSpent - 1) * 100) : null;
  const net = r.income - r.spent;
  const day = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  const mKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  if (!r.count) {
    return (
      <div className="narrow">
        <h1>Итоги · {r.title}</h1>
        <div className="empty">
          <div className="empty-icon">✨</div>
          <strong>В этом месяце трат пока нет</strong>
          <p>Итоги появятся, когда будут записанные траты.</p>
          <Link href={`/recap?m=${mKey(new Date(y, mo - 2, 1))}`} className="btn btn-sm">
            ‹ Предыдущий месяц
          </Link>
        </div>
      </div>
    );
  }

  const slides: { cls: string; kicker: string; big: string; text: string; extra?: React.ReactNode }[] = [
    {
      cls: "s1",
      kicker: current ? `${r.title} · пока что` : r.title,
      big: formatMoney(r.spent),
      text: `столько ушло моих денег за ${current ? `${r.days} дн.` : "месяц"} · ${r.count} ${plural(r.count, "трата", "траты", "трат")}`,
      extra:
        diff !== null ? (
          <span className="rc-pill">{diff === 0 ? "столько же, как месяцем раньше" : diff > 0 ? `на ${diff}% больше, чем месяцем раньше` : `на ${-diff}% меньше, чем месяцем раньше 👏`}</span>
        ) : null,
    },
  ];
  if (r.topCats.length)
    slides.push({
      cls: "s2",
      kicker: "Больше всего — на",
      big: `${r.topCats[0].emoji} ${r.topCats[0].name}`,
      text: `${formatMoney(r.topCats[0].s)} · ${r.topCats[0].share}% всех трат`,
      extra: (
        <ol className="rc-list">
          {r.topCats.slice(1).map((c) => (
            <li key={c.name}>
              {c.emoji} {c.name} — {formatMoney(c.s)} ({c.share}%)
            </li>
          ))}
        </ol>
      ),
    });
  if (r.favPlace) slides.push({ cls: "s3", kicker: "Любимое место", big: r.favPlace.name, text: `${r.favPlace.n} раз · ${formatMoney(r.favPlace.s)} за месяц` });
  if (r.biggest) slides.push({ cls: "s4", kicker: "Самая крупная трата", big: formatMoney(r.biggest.amount), text: `${r.biggest.title} · ${day(r.biggest.date)}` });
  if (r.weekday) slides.push({ cls: "s5", kicker: "Самый «дорогой» день недели", big: r.weekday.name, text: `в среднем ${formatMoney(Math.round(r.weekday.avg))} за день${r.noSpendDays ? ` · а ещё ${r.noSpendDays} дн. совсем без трат 🌿` : ""}` });
  if (r.income > 0)
    slides.push({
      cls: net >= 0 ? "s6" : "s7",
      kicker: net >= 0 ? "Итог месяца" : "Итог месяца",
      big: `${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net))}`,
      text: net >= 0 ? `доходы ${formatMoney(r.income)} − траты ${formatMoney(r.spent)}. Можно отложить в копилку 🎯` : `траты больше доходов на ${formatMoney(-net)}`,
      extra:
        net > 0 ? (
          <Link href="/goals" className="rc-cta">
            Отложить в копилку ›
          </Link>
        ) : null,
    });

  return (
    <div className="recap-page">
      <div className="recap-top">
        <Link href={`/recap?m=${mKey(new Date(y, mo - 2, 1))}`} className="cal-arrow" aria-label="Предыдущий месяц">
          ‹
        </Link>
        <strong>Итоги · {r.title}</strong>
        {current ? (
          <span className="cal-arrow is-off" aria-hidden>
            ›
          </span>
        ) : (
          <Link href={`/recap?m=${mKey(new Date(y, mo, 1))}`} className="cal-arrow" aria-label="Следующий месяц">
            ›
          </Link>
        )}
      </div>
      <div className="recap" tabIndex={0} aria-label="Итоги месяца, листайте вбок">
        {slides.map((s, i) => (
          <section key={i} className={`rc ${s.cls}`}>
            <span className="rc-step">
              {i + 1} / {slides.length}
            </span>
            <span className="rc-kicker">{s.kicker}</span>
            <strong className="rc-big">{s.big}</strong>
            <span className="rc-text">{s.text}</span>
            {s.extra}
            {i < slides.length - 1 && <span className="rc-next">листайте ›</span>}
          </section>
        ))}
      </div>
      <p className="muted small" style={{ textAlign: "center" }}>
        Считаются только ваши личные деньги. <Link href="/calendar" className="link">Календарь трат ›</Link>
      </p>
    </div>
  );
}
