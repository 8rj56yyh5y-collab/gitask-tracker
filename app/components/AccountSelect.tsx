import { listCashboxes } from "@/lib/cash.ts";
import { listCards } from "@/lib/repo.ts";

/** Выбор карты или кассы: значения «card:ID» / «cash:ID». */
export function AccountSelect({ name = "account", defaultValue = "", none, label }: { name?: string; defaultValue?: string; none?: string; label?: string }) {
  const cards = listCards();
  const boxes = listCashboxes();
  return (
    <select name={name} defaultValue={defaultValue} aria-label={label}>
      {none !== undefined && <option value="">{none}</option>}
      {boxes.length > 0 && (
        <optgroup label="Кассы">
          {boxes.map((b) => (
            <option key={`b${b.id}`} value={`cash:${b.id}`}>
              {b.name}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Карты">
        {cards.map((c) => (
          <option key={`c${c.id}`} value={`card:${c.id}`}>
            {c.bank} •••• {c.last4}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
