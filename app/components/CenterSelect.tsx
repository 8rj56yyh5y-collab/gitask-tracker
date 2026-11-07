import { centerTree } from "@/lib/repo.ts";

/** Выбор категории (с подкатегориями). */
export function CenterSelect({ name = "centerId", defaultValue, none = "— без категории —" }: { name?: string; defaultValue?: number | null; none?: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""}>
      <option value="">{none}</option>
      {centerTree().map((c) => (
        <option key={c.id} value={c.id}>
          {"  ".repeat(c.depth)}
          {c.name}
        </option>
      ))}
    </select>
  );
}
