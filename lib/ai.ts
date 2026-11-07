import Anthropic from "@anthropic-ai/sdk";
import { centerStats, compareWithPrevMonth, monthKey, monthlyTotals } from "./repo.ts";

// Разбор месяца от ИИ (Claude). Работает, только если задан ANTHROPIC_API_KEY.
// В модель уходят только суммы по категориям и месяцам — без номеров карт и имён получателей.

const MODEL = "claude-opus-5-5";

const SYSTEM = `Ты — финансовый помощник в приложении D&N для учёта расходов (Украина, гривны).
Пользователь учитывает личные и рабочие траты по категориям.
Тебе дают данные за месяц в JSON. Напиши короткий разбор на русском языке, без вступлений, в таком порядке:
1. Прогноз: сколько уйдёт до конца месяца всего и по крупным категориям (если месяц ещё идёт).
2. Что изменилось относительно прошлого месяца: заметный рост и снижение, с суммами и процентами.
3. Риски по лимитам: где лимит превышен или будет превышен при текущем темпе.
4. Два-три конкретных совета, что проверить или сократить.
Пиши простыми словами, суммы — в гривнах с пробелами между тысячами (например, 12 500 ₴).
Не выдумывай данных, которых нет в JSON. Если данных мало (начало месяца, мало операций), так и скажи.
Ответ — обычный текст, пункты с новой строки, без markdown-таблиц.`;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const uah = (kop: number) => Math.round(kop / 100);

/** Данные для разбора: только агрегаты, в гривнах. */
export function buildMonthSummary(d: Date) {
  const now = new Date();
  const isCurrent = monthKey(d) === monthKey(now);
  const stats = [...centerStats(d).values()].filter((s) => !s.is_internal && s.spent > 0);
  return {
    месяц: monthKey(d),
    месяц_идёт: isCurrent,
    день_месяца: isCurrent ? now.getDate() : null,
    дней_в_месяце: new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),
    последние_12_месяцев: monthlyTotals(12, d).map((m) => ({ месяц: m.key, расход: uah(m.expense), поступления: uah(m.income) })),
    сравнение_с_прошлым_месяцем: compareWithPrevMonth(d).map((c) => ({
      категория: c.name,
      этот_месяц: uah(c.current),
      прошлый_месяц: uah(c.previous),
      изменение_процентов: c.changePct,
    })),
    категории: stats.map((s) => ({
      категория: s.name,
      вложена_в: s.parent_id ? (centerStats(d).get(s.parent_id)?.name ?? null) : null,
      потрачено: uah(s.spent),
      лимит: s.budget ? uah(s.budget) : null,
      прогноз_на_месяц: isCurrent ? uah(s.forecast) : null,
      статус_лимита: s.status,
    })),
  };
}

/** Запрашивает у Claude разбор месяца. Бросает понятную ошибку, если ИИ не настроен или отказал. */
export async function analyzeMonth(d: Date): Promise<string> {
  if (!aiConfigured()) throw new Error("ИИ не подключён: задайте ANTHROPIC_API_KEY на сервере.");
  const client = new Anthropic();
  const summary = buildMonthSummary(d);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // Если основная модель откажется отвечать по соображениям безопасности, API сам повторит запрос на запасной.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [{ role: "user", content: `Данные за месяц:\n${JSON.stringify(summary, null, 2)}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("ИИ не смог подготовить разбор. Попробуйте позже.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("ИИ вернул пустой ответ. Попробуйте ещё раз.");
  return text;
}
