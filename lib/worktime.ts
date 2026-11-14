// Перевод суммы в «часы работы» — без базы, чтобы работало и на телефоне (в форме записи).

/** «≈ 2,5 ч работы», «≈ 25 мин работы», «≈ 3 дня работы». Пусто, если цена часа неизвестна (rate = 0). */
export function inWorkTimeAt(amountKop: number, rate: number): string {
  if (!rate || !amountKop) return "";
  const h = Math.abs(amountKop) / rate;
  if (h < 1) return `≈ ${Math.max(1, Math.round(h * 60))} мин работы`;
  if (h < 8) return `≈ ${(Math.round(h * 2) / 2).toLocaleString("ru-RU")} ч работы`;
  const d = h / 8;
  const n = Math.round(d * 2) / 2;
  return `≈ ${n.toLocaleString("ru-RU")} ${n === 1 ? "день" : n < 5 ? "дня" : "дней"} работы`;
}
