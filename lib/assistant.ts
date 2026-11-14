import Anthropic from "@anthropic-ai/sdk";
import { aiConfigured } from "./ai.ts";
import { getDb } from "./db.ts";
import { personalCenterIds } from "./repo.ts";
import { listPlans } from "./plans.ts";
import { listGoals } from "./goals.ts";
import { categoryBudgets } from "./catbudget.ts";
import { detectSubscriptions, safeToSpend } from "./insights.ts";

// ИИ-помощник: отвечает на вопросы о ваших деньгах по вашим же данным.
// В ИИ уходят операции (дата, сумма, магазин, категория, комментарий) — без номеров карт.

const MODEL = "claude-opus-5-5";

const SYSTEM = `Ты — помощник в приложении D&N для учёта денег (Украина, гривны).
Отвечаешь на вопросы пользователя о его деньгах. Данные пользователя — в JSON в первом сообщении.
Правила:
- Отвечай по-русски, коротко и по делу: сначала прямой ответ (цифра или вывод), потом 1–3 строки пояснения.
- Считай аккуратно по данным. Суммы пиши в гривнах с пробелами между тысячами: 12 500 ₴.
- Если в данных нет того, что спрашивают, — так и скажи и подскажи, что записать, чтобы ответ появился.
- «Мои» деньги — направления из списка «личные_направления»; если человек спрашивает про «мои траты», считай только их.
- Советы давай конкретные, по его тратам (категории, магазины, подписки), без общих фраз.
- Без markdown-таблиц и заголовков; можно короткий список с «•».`;

const uah = (kop: number) => Math.round(kop / 100);
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Всё, что нужно помощнику, — компактно: операции за полгода, планы, копилки, лимиты, подписки. */
export function assistantContext(now = new Date()) {
  const since = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT t.occurred_at, t.amount, t.kind, t.counterparty, t.description, t.income_kind, c.name AS cat, cc.name AS center, k.bank AS bank, cb.name AS box
       FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id
       LEFT JOIN cards k ON k.id = t.card_id LEFT JOIN cashboxes cb ON cb.id = t.cashbox_id
       WHERE t.occurred_at >= ? AND t.transit_id IS NULL ORDER BY t.occurred_at DESC LIMIT 1500`,
    )
    .all(since) as { occurred_at: string; amount: number; kind: string; counterparty: string; description: string; income_kind: string | null; cat: string | null; center: string | null; bank: string | null; box: string | null }[];
  const personal = (getDb().prepare(`SELECT name FROM cost_centers WHERE id IN (${personalCenterIds().join(",") || "NULL"})`).all() as { name: string }[]).map((r) => r.name);
  const safe = safeToSpend(now);
  return {
    сегодня: ymd(now.toISOString()),
    личные_направления: personal,
    можно_потратить_до_конца_месяца: safe.known ? uah(safe.left) : null,
    операции: rows.map((r) =>
      [ymd(r.occurred_at), uah(r.amount), r.kind === "internal" ? "перевод" : r.kind === "income" ? "доход" : "расход", r.counterparty || "", r.cat ?? "", r.center ?? "", r.description && r.description !== r.counterparty ? r.description : "", r.bank ?? (r.box ? `наличные: ${r.box}` : "")].join(" | "),
    ),
    формат_операции: "дата | сумма ₴ (минус — расход) | тип | где/кому | категория | чьи деньги | комментарий | карта",
    платежи_к_оплате: listPlans("open", 100, "out").map((p) => ({ что: p.title, осталось: uah(p.total - p.paid), срок: p.due_date })),
    мне_должны: listPlans("open", 100, "in").filter((p) => p.kind !== "salary").map((p) => ({ что: p.title, осталось: uah(p.total - p.paid), срок: p.due_date })),
    копилки: listGoals().map((g) => ({ цель: g.name, собрано: uah(g.saved), нужно: uah(g.target), срок: g.deadline })),
    лимиты_категорий_этот_месяц: categoryBudgets(now).map((b) => ({ категория: b.name, лимит: uah(b.limit), потрачено: uah(b.spent) })),
    найденные_подписки: detectSubscriptions(now).map((s) => ({ где: s.counterparty, в_месяц: uah(s.amount) })),
  };
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** Ответ помощника. history — предыдущие реплики разговора (последние 10). */
export async function askAssistant(history: ChatTurn[], question: string): Promise<string> {
  if (!aiConfigured()) throw new Error("ИИ не подключён: на сервере не задан ключ ANTHROPIC_API_KEY.");
  const q = question.trim().slice(0, 1000);
  if (!q) throw new Error("Напишите вопрос");
  const client = new Anthropic();
  const ctx = assistantContext();
  const past = history.slice(-10).filter((t) => t.text.trim());
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: `Мои данные:\n${JSON.stringify(ctx)}` },
    { role: "assistant", content: "Данные получил. Спрашивайте." },
    ...past.map((t) => ({ role: t.role, content: t.text.slice(0, 4000) }) as Anthropic.Beta.BetaMessageParam),
    { role: "user", content: q },
  ];
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages,
  });
  if (response.stop_reason === "refusal") throw new Error("ИИ не смог ответить на этот вопрос. Попробуйте спросить иначе.");
  const text = response.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("ИИ вернул пустой ответ. Попробуйте ещё раз.");
  return text;
}
