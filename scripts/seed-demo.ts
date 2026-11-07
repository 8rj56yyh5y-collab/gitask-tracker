// Заполняет базу демо-данными, чтобы посмотреть интерфейс.
// Запуск: npm run demo   (только на пустой базе; --force — добавить всё равно)
import { getDb } from "../lib/db.ts";
import * as repo from "../lib/repo.ts";

process.env.TZ ||= "Europe/Kyiv";
const db = getDb();
const count = (db.prepare("SELECT COUNT(*) AS n FROM transactions").get() as { n: number }).n;
if (count > 0 && !process.argv.includes("--force")) {
  console.log(`В базе уже ${count} операций — демо не добавлено (используйте --force).`);
  process.exit(0);
}

const center = (name: string) => repo.listCenters().find((c) => c.name.startsWith(name))!.id;
const points = center("Приёмные пункты");
for (const [name, color] of [["Пункт Житомир", "#d97706"], ["Пункт Бердичев", "#b45309"]] as const) {
  repo.createCenter(name, points, color, 0, false);
}
db.prepare("UPDATE cost_centers SET monthly_budget = ? WHERE id = ?").run(25_000_00, center("Отдел продаж"));
const personal = center("Личные");
repo.createCenter("Продукты", personal, "#a855f7", 12_000_00, false);
repo.createCenter("Топливо", personal, "#7c3aed", 25_000_00, false);

const cards: [string, string, string, string, number][] = [
  ["ПриватБанк", "1234", "я", "personal", 30_000_00],
  ["ПУМБ", "5678", "я", "fop", 30_000_00],
  ["Monobank", "9012", "я", "personal", 30_000_00],
  ["Райффайзен", "3456", "руководитель", "personal", 30_000_00],
  ["А-Банк", "7890", "Иван", "personal", 30_000_00],
];
for (const [bank, last4, owner, kind, limit] of cards) {
  repo.createCard({ bank, last4, owner, kind, monthly_limit: limit, mono_account_id: null });
}
const card = (last4: string) => repo.findCard({ last4 })!.id;

const now = new Date();
const at = (day: number, hour: number) => {
  const d = new Date(now.getFullYear(), now.getMonth(), Math.min(day, now.getDate()), hour, (day * 7) % 60);
  return (d > now ? now : d).toISOString();
};

// [день, час, сумма ₴ (минус — расход), карта, категория | null, контрагент, для кого, источник]
const txs: [number, number, number, string, string | null, string, string, string][] = [
  [1, 9, -12_400, "1234", "Пункт Житомир", "Петренко О. (лом)", "", "sms"],
  [1, 14, -850, "1234", "Отдел продаж", "WOG", "", "applepay"],
  [2, 10, -19_500, "5678", "Пункт Бердичев", "Металбаза", "", "sms"],
  [2, 18, -1_240, "9012", "Продукты", "Сільпо", "", "monobank"],
  [2, 8, -4_800, "1234", "Топливо", "WOG", "", "applepay"],
  [3, 19, -5_200, "9012", "Топливо", "OKKO", "", "monobank"],
  [3, 11, -5_000, "3456", "Руководитель", "Ресторан Канапа", "руководитель", "applepay"],
  [3, 16, 45_000, "5678", null, "ТОВ Втормет", "", "sms"],
  [4, 9, -8_000, "1234", "Внутренние переводы", "Перевод на ПУМБ *5678", "", "manual"],
  [4, 12, -13_000, "5678", "Пункт Житомир", "Іван К. (лом)", "", "sms"],
  [4, 15, -2_300, "9012", "Отдел продаж", "OKKO", "", "monobank"],
  [5, 10, -3_600, "5678", "ФОП (налоги", "Єдиний податок", "", "manual"],
  [5, 13, -31_200, "9012", "Пункт Бердичев", "Постачальник Сидоренко", "", "monobank"],
  [5, 19, -640, "1234", "Продукты", "АТБ", "", "applepay"],
  [6, 9, -4_500, "7890", null, "Нова пошта", "", "sms"],
  [6, 11, -9_800, "3456", null, "Шевченко М.", "", "applepay"],
  [6, 12, -415, "9012", null, "Steam", "", "monobank"],
  [6, 13, -1_150, "1234", null, "WOG", "", "applepay"],
];
for (const [day, hour, uah, last4, centerName, counterparty, forWhom, source] of txs) {
  repo.insertTx({
    occurredAt: at(day, hour),
    amountKop: uah * 100,
    cardId: card(last4),
    costCenterId: centerName ? center(centerName) : null,
    counterparty,
    forWhom,
    source,
  });
}
// Прошлые 5 месяцев — для аналитики и сравнения (суммы условные).
const history: [string, number][] = [
  ["Пункт Житомир", 52_000], ["Пункт Бердичев", 41_000], ["Отдел продаж", 14_000],
  ["Продукты", 9_500], ["Топливо", 18_000], ["Руководитель", 7_000], ["ФОП (налоги", 3_600],
];
let past = 0;
for (let back = 1; back <= 5; back++) {
  const factor = [1, 0.92, 1.08, 0.85, 0.97][back - 1];
  for (const [i, [name, base]] of history.entries()) {
    for (const part of [0.6, 0.4]) {
      const d = new Date(now.getFullYear(), now.getMonth() - back, 3 + i * 3 + (part < 0.5 ? 1 : 0), 12);
      repo.insertTx({
        occurredAt: d.toISOString(),
        amountKop: -Math.round((base * factor * part) / 10) * 1000,
        cardId: card(["1234", "5678", "9012"][i % 3]),
        costCenterId: center(name),
        counterparty: name,
        source: "import",
      });
      past++;
    }
  }
  // Поступление от покупателя лома — сразу с категорией, чтобы не висело в «Нужно записать».
  repo.insertTx({
    occurredAt: new Date(now.getFullYear(), now.getMonth() - back, 20, 12).toISOString(),
    amountKop: Math.round(180_000 * factor) * 100,
    cardId: card("5678"),
    costCenterId: center("Отдел продаж"),
    kind: "income",
    counterparty: "ТОВ Втормет",
    source: "import",
  });
}

console.log(`Демо готово: ${cards.length} карт, ${txs.length} операций в этом месяце и ${past} за прошлые 5 месяцев.`);
