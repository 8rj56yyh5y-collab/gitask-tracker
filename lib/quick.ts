import { getDb } from "./db.ts";
import { getSetting } from "./settings.ts";
import { listCategories, type Category } from "./categories.ts";
import { centerTree, personalCenterIds } from "./repo.ts";

// Запись одной строкой («кофе 75») и быстрые траты в одно касание.

const norm = (s: string) => s.toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/[«»"']/g, "").replace(/\s+/g, " ").trim();

export interface QuickParse {
  /** Копейки, положительное число; 0 — суммы не нашли. */
  amount: number;
  /** Всё, кроме суммы: «кофе с собой». */
  note: string;
}

/**
 * «кофе 75», «75 кофе», «такси 146,50», «аренда 12 000», «ремонт 1,5к», «продукты 1.2k грн».
 * Сумма — первое число (пробелы между разрядами допустимы, «к»/«k» — тысячи), остальное — комментарий.
 */
export function parseQuick(text: string): QuickParse {
  const t = text.replace(/ /g, " ").trim();
  const re = /(\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(к|k|тыс\.?)?(?=\s|$|₴|грн|uah)\s*(₴|грн\.?|uah)?/i;
  const m = t.match(re);
  if (!m) return { amount: 0, note: t };
  const int = Number(m[1].replace(/ /g, ""));
  const frac = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  let kop = int * 100 + frac;
  if (m[3]) kop = Math.round((int + frac / 100) * 1000) * 100;
  const note = (t.slice(0, m.index) + " " + t.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, " ").trim();
  return { amount: kop > 0 && kop < 1e11 ? kop : 0, note };
}

/** Слова, по которым понятно, что это за трата, даже если так ещё не записывали. */
const KEYWORDS: [string, string[]][] = [
  ["Кофе", ["кофе", "капучино", "латте", "американо", "раф", "aroma", "кава", "starbucks", "кофейня"]],
  ["Кафе и рестораны", ["кофе", "обед", "ужин", "завтрак", "ресторан", "кафе", "бар", "пицца", "суши", "бургер", "mcdonald", "макдональдс", "kfc", "пузата"]],
  ["Доставка еды", ["glovo", "глово", "bolt food", "доставка еды", "rocket"]],
  ["Продукты", ["продукты", "сильпо", "атб", "novus", "новус", "metro", "ашан", "auchan", "varus", "фора", "еда", "магазин", "хлеб", "молоко"]],
  ["Такси", ["такси", "uklon", "уклон", "uber", "убер", "bolt", "болт"]],
  ["Топливо", ["бензин", "заправка", "топливо", "дизель", "газ", "wog", "окко", "okko", "socar", "upg", "shell"]],
  ["Общественный транспорт", ["метро", "автобус", "маршрутка", "трамвай", "троллейбус", "проезд", "электричка"]],
  ["Парковка", ["парковка", "паркинг"]],
  ["Аптека", ["аптека", "лекарства", "таблетки", "витамины"]],
  ["Связь и интернет", ["связь", "телефон", "интернет", "kyivstar", "киевстар", "vodafone", "водафон", "lifecell", "лайф"]],
  ["Подписки", ["подписка", "netflix", "spotify", "youtube", "apple", "icloud", "megogo", "chatgpt"]],
  ["Коммунальные услуги", ["коммуналка", "свет", "вода", "отопление", "квартплата", "электричество"]],
  ["Аренда жилья", ["аренда", "квартира"]],
  ["Одежда и обувь", ["одежда", "обувь", "кроссовки", "куртка", "футболка", "zara", "h&m"]],
  ["Красота и уход", ["стрижка", "парикмахер", "маникюр", "барбер", "косметика"]],
  ["Спорт", ["спорт", "зал", "фитнес", "тренировка", "бассейн"]],
  ["Подарки", ["подарок", "подарки", "цветы"]],
  ["Дети", ["дети", "ребенок", "садик", "школа", "игрушки"]],
  ["Животные", ["корм", "ветеринар", "кот", "собака"]],
  ["Техника и электроника", ["rozetka", "розетка", "техника", "телефон новый", "наушники", "comfy", "фокстрот"]],
  ["Кино, концерты, события", ["кино", "концерт", "театр", "билеты", "multiplex"]],
];

export interface QuickGuess extends QuickParse {
  categoryId: number | null;
  category: Pick<Category, "id" | "name" | "emoji"> | null;
  centerId: number | null;
  centerName: string | null;
  /** «card:ID» / «cash:ID» / "" */
  account: string;
  /** history — так уже записывали; word — по слову; name — по названию категории; null — не узнали. */
  how: "history" | "word" | "name" | null;
}

/** Угадываем категорию, направление и карту для строки: сначала по своей истории, потом по словам. */
export function guessQuick(text: string): QuickGuess {
  const p = parseQuick(text);
  const q = norm(p.note);
  const cats = listCategories();
  const centers = centerTree().filter((c) => !c.is_internal);
  let categoryId: number | null = null;
  let centerId: number | null = null;
  let account = "";
  let how: QuickGuess["how"] = null;
  if (q) {
    // 1) История: такой комментарий или магазин уже был — берём как тогда.
    const rows = getDb()
      .prepare(
        `SELECT category_id, cost_center_id, card_id, cashbox_id, description, counterparty FROM transactions
         WHERE amount < 0 AND category_id IS NOT NULL AND cost_center_id IS NOT NULL AND needs_note = 0
         ORDER BY occurred_at DESC LIMIT 2000`,
      )
      .all() as { category_id: number; cost_center_id: number; card_id: number | null; cashbox_id: number | null; description: string; counterparty: string }[];
    const hit = rows.find((r) => norm(r.description) === q || norm(r.counterparty) === q) ?? rows.find((r) => q.length >= 3 && (norm(r.description).startsWith(q) || norm(r.counterparty).startsWith(q)));
    if (hit && cats.some((c) => c.id === Number(hit.category_id))) {
      categoryId = Number(hit.category_id);
      centerId = Number(hit.cost_center_id);
      account = hit.card_id ? `card:${hit.card_id}` : hit.cashbox_id ? `cash:${hit.cashbox_id}` : "";
      how = "history";
    }
    // 2) Слова: «кофе», «такси», «wog»…
    if (!categoryId) {
      for (const [name, words] of KEYWORDS) {
        if (words.some((w) => q === w || q.startsWith(w + " ") || q.endsWith(" " + w) || q.includes(" " + w + " ") || (w.length >= 4 && q.includes(w)))) {
          const c = cats.find((x) => x.name === name);
          if (c) {
            categoryId = c.id;
            how = "word";
            break;
          }
        }
      }
    }
    // 3) Прямо название категории: «аптека», «подарки».
    if (!categoryId) {
      const c = cats.find((x) => norm(x.name) === q) ?? cats.find((x) => q.length >= 4 && norm(x.name).startsWith(q));
      if (c) {
        categoryId = c.id;
        how = "name";
      }
    }
  }
  if (!centerId) {
    const last = Number(getSetting("last_center")) || null;
    centerId = (last && centers.some((c) => c.id === last) ? last : null) ?? personalCenterIds()[0] ?? centers[0]?.id ?? null;
  }
  if (!account) account = getSetting("last_account") ?? "";
  const cat = categoryId ? cats.find((c) => c.id === categoryId) ?? null : null;
  return {
    ...p,
    categoryId,
    category: cat ? { id: cat.id, name: cat.name, emoji: cat.emoji } : null,
    centerId,
    centerName: centers.find((c) => c.id === centerId)?.name ?? null,
    account,
    how,
  };
}

export interface Template {
  key: string;
  title: string;
  note: string;
  amount: number;
  categoryId: number;
  emoji: string;
  centerId: number;
  account: string;
  times: number;
}

/**
 * Быстрые траты: то, что вы покупаете регулярно примерно за одни и те же деньги
 * (кофе, обед, проезд) — до 800 ₴. За 60 дней не меньше трёх раз, сумма почти не меняется.
 */
export function quickTemplates(limit = 6): Template[] {
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const rows = getDb()
    .prepare(
      `SELECT t.amount, t.counterparty, t.description, t.category_id, t.cost_center_id, t.card_id, t.cashbox_id, c.emoji
       FROM transactions t JOIN categories c ON c.id = t.category_id AND c.enabled = 1
       WHERE t.amount < 0 AND t.kind = 'expense' AND t.cost_center_id IS NOT NULL AND t.needs_note = 0 AND t.plan_id IS NULL AND t.occurred_at >= ?
       ORDER BY t.occurred_at DESC`,
    )
    .all(since) as { amount: number; counterparty: string; description: string; category_id: number; cost_center_id: number; card_id: number | null; cashbox_id: number | null; emoji: string }[];
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const title = (r.counterparty || r.description || "").trim();
    if (!title) continue;
    const k = `${norm(title)}|${r.category_id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const out: Template[] = [];
  for (const [k, list] of groups) {
    if (list.length < 3) continue;
    const sums = list.map((r) => -r.amount).sort((a, b) => a - b);
    const median = sums[Math.floor(sums.length / 2)];
    const near = sums.filter((s) => Math.abs(s - median) <= median * 0.1).length;
    if (near < 3 || median > 80_000) continue; // только мелкие ежедневные траты до 800 ₴: кофе, обед, проезд
    const last = list[0];
    out.push({
      key: k,
      title: (last.counterparty || last.description).trim(),
      note: last.description || last.counterparty,
      amount: median,
      categoryId: Number(last.category_id),
      emoji: last.emoji || "•",
      centerId: Number(last.cost_center_id),
      account: last.card_id ? `card:${last.card_id}` : last.cashbox_id ? `cash:${last.cashbox_id}` : "",
      times: list.length,
    });
  }
  return out.sort((a, b) => b.times - a.times).slice(0, limit);
}
