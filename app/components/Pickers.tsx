import Link from "next/link";
import { centerTree, listCards } from "@/lib/repo.ts";
import { listCashboxes } from "@/lib/cash.ts";
import { cardStyle } from "@/lib/banks.ts";
import { label as catLabel, listCategories } from "@/lib/categories.ts";

export type ChipOption = { value: string | number; label: string; color?: string | null; hint?: string; sub?: boolean };

/** Выбор одного варианта крупными кнопками-«чипами» (вместо выпадающего списка). */
export function ChipPicker({
  name,
  options,
  defaultValue,
  required,
  label,
}: {
  name: string;
  options: ChipOption[];
  defaultValue?: string | number | null;
  required?: boolean;
  label?: string;
}) {
  return (
    <fieldset className="chips-field">
      {label && <legend>{label}</legend>}
      <div className="chips">
        {options.map((o, i) => (
          <label key={`${o.value}-${i}`} className={`chip-opt ${o.sub ? "is-sub" : ""}`} title={o.hint}>
            <input type="radio" name={name} value={o.value} defaultChecked={String(defaultValue ?? "") === String(o.value)} required={required} />
            {o.color && <i className="chip-dot" style={{ background: o.color }} />}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Направления: сначала подсказанные, затем все; вложенные — сразу после своего. */
export function CenterChips({
  name = "centerId",
  defaultValue,
  required,
  label = "На что",
  first = [],
  withNone,
  includeInternal = true,
}: {
  name?: string;
  defaultValue?: number | null;
  required?: boolean;
  label?: string;
  first?: number[];
  withNone?: string;
  includeInternal?: boolean;
}) {
  // Переводы между своими картами — в конце списка: выбирают их редко.
  const all = centerTree().filter((c) => includeInternal || !c.is_internal);
  const tree = [...all.filter((c) => !c.is_internal), ...all.filter((c) => c.is_internal)];
  const ordered = [...first.map((id) => tree.find((c) => c.id === id)).filter((c) => c !== undefined), ...tree.filter((c) => !first.includes(c.id))];
  const opts: ChipOption[] = ordered.map((c) => ({ value: c.id, label: c.name, color: c.color, sub: c.depth > 0 && !first.includes(c.id) }));
  if (withNone) opts.unshift({ value: "", label: withNone });
  return <ChipPicker name={name} options={opts} defaultValue={defaultValue ?? (withNone ? "" : undefined)} required={required} label={label} />;
}

/** Карта или касса: «card:ID» / «cash:ID». */
export function AccountChips({ name = "account", defaultValue = "", label = "Откуда", none = "Не указано" }: { name?: string; defaultValue?: string; label?: string; none?: string | null }) {
  const opts: ChipOption[] = [];
  if (none) opts.push({ value: "", label: none });
  for (const b of listCashboxes()) opts.push({ value: `cash:${b.id}`, label: `💵 ${b.name}`, color: null });
  for (const c of listCards()) opts.push({ value: `card:${c.id}`, label: `${c.bank} •${c.last4}`, color: cardStyle(c).color });
  return <ChipPicker name={name} options={opts} defaultValue={defaultValue} label={label} />;
}

/** Вкладки-ссылки сверху формы: «Расход · Доход · Перевод». */
export function SegTabs({ tabs, active }: { tabs: { id: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="segtabs" aria-label="Тип операции">
      {tabs.map((t) => (
        <Link key={t.id} href={t.href} className={`segtab ${t.id === active ? "is-on" : ""}`} aria-current={t.id === active ? "page" : undefined} replace scroll={false}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Категории «на что именно»: подсказанные (✨ ИИ, история, частые) сразу, остальные — под «Все категории». */
export function CategoryChips({
  name = "categoryId",
  defaultValue,
  suggested = [],
  aiId,
  required,
  label = "Категория — на что именно",
}: {
  name?: string;
  defaultValue?: number | null;
  suggested?: number[];
  aiId?: number | null;
  required?: boolean;
  label?: string;
}) {
  const all = listCategories();
  const top = [...new Set([...(aiId ? [aiId] : []), ...suggested, ...(defaultValue ? [defaultValue] : [])])]
    .map((id) => all.find((c) => c.id === id))
    .filter((c) => c !== undefined)
    .slice(0, 8);
  const rest = all.filter((c) => !top.some((t) => t.id === c.id));
  const picked = defaultValue ?? aiId ?? null;
  const chip = (c: (typeof all)[number]) => (
    <label key={c.id} className="chip-opt">
      <input type="radio" name={name} value={c.id} defaultChecked={picked === c.id} required={required} />
      <span>
        {c.id === aiId ? "✨ " : ""}
        {catLabel(c)}
      </span>
    </label>
  );
  return (
    <fieldset className="chips-field">
      <legend>{label}</legend>
      <div className="chips">{top.map(chip)}</div>
      {rest.length > 0 && (
        <details className="more-fields more-cats">
          <summary>Все категории ({all.length})</summary>
          <div className="chips" style={{ marginTop: 10 }}>
            {rest.map(chip)}
          </div>
          <Link href="/categories" className="muted small chips-manage">
            Настроить список ›
          </Link>
        </details>
      )}
    </fieldset>
  );
}

/** Карта операции: «OTP Bank •7777» кнопками; «Не с карты» — значение 0. */
export function CardChips({ name = "cardId", defaultValue, label = "С какой карты" }: { name?: string; defaultValue?: number | null; label?: string }) {
  const opts: ChipOption[] = listCards().map((c) => ({
    value: c.id,
    label: `${c.bank} •${c.last4}${c.owner ? ` · ${c.owner}` : ""}`,
    color: cardStyle(c).color,
  }));
  opts.push({ value: 0, label: "💵 Наличными / не с карты" });
  return <ChipPicker name={name} options={opts} defaultValue={defaultValue ?? undefined} label={label} />;
}
