import { centerTree } from "@/lib/repo.ts";

/** Выбор направления (с вложенными). */
export function CenterSelect({ name = "centerId", defaultValue, none = "— без направления —" }: { name?: string; defaultValue?: number | null; none?: string }) {
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
