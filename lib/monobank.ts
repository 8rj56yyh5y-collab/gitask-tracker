import { getDb } from "./db.ts";
import { createCard, listCards } from "./repo.ts";

// Подключение Monobank по личному токену (https://api.monobank.ua/):
// берём список счетов, добавляем карты и регистрируем вебхук — дальше операции приходят сами.
// Сам токен не сохраняется.

const API = () => process.env.DN_MONO_API ?? "https://api.monobank.ua";

interface MonoAccount {
  id: string;
  maskedPan?: string[];
  type?: string;
  currencyCode?: number;
}

export interface MonoResult {
  owner: string;
  added: number;
  linked: number;
}

export async function connectMonobank(token: string, webhookUrl: string): Promise<MonoResult> {
  const info = await fetch(`${API()}/personal/client-info`, {
    headers: { "X-Token": token },
    signal: AbortSignal.timeout(15_000),
  });
  if (info.status === 403 || info.status === 401) throw new Error("Monobank не принял токен — проверьте, что скопировали его целиком.");
  if (info.status === 429) throw new Error("Monobank разрешает этот запрос раз в минуту — подождите минуту и попробуйте снова.");
  if (!info.ok) throw new Error(`Monobank ответил ошибкой ${info.status}.`);
  const client = (await info.json()) as { name?: string; accounts?: MonoAccount[] };

  const cards = listCards();
  let added = 0;
  let linked = 0;
  for (const acc of client.accounts ?? []) {
    const pan = acc.maskedPan?.[0];
    if (!pan) continue; // банки (копилки) без карты пропускаем
    const last4 = pan.slice(-4);
    const existing = cards.find((c) => c.last4 === last4);
    if (existing) {
      getDb().prepare("UPDATE cards SET mono_account_id = ? WHERE id = ?").run(acc.id, existing.id);
      linked++;
    } else {
      createCard({
        bank: "Monobank",
        last4,
        owner: client.name ?? "",
        kind: acc.type === "fop" ? "fop" : "personal",
        monthly_limit: 0,
        mono_account_id: acc.id,
      });
      added++;
    }
  }

  const hook = await fetch(`${API()}/personal/webhook`, {
    method: "POST",
    headers: { "X-Token": token, "Content-Type": "application/json" },
    body: JSON.stringify({ webHookUrl: webhookUrl }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!hook.ok) throw new Error(`Карты добавлены, но Monobank не принял адрес для уведомлений (ошибка ${hook.status}). Проверьте, что сайт доступен из интернета.`);
  return { owner: client.name ?? "", added, linked };
}
