import { addCategoryAction, toggleCategoryAction } from "../actions.ts";
import { Hint } from "../components/Hint.tsx";
import { label, listCategories } from "@/lib/categories.ts";

export default function Categories() {
  const all = listCategories(true);
  const on = all.filter((c) => c.enabled);
  const off = all.filter((c) => !c.enabled);
  const groups = [...new Set(off.map((c) => c.grp || "Другое"))];
  const next = "/categories";

  const Toggle = ({ id, text, enable }: { id: number; text: string; enable: boolean }) => (
    <form action={toggleCategoryAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="on" value={enable ? "1" : "0"} />
      <input type="hidden" name="next" value={next} />
      <button className={`cat-chip ${enable ? "is-off" : "is-on"}`} title={enable ? "Добавить в мой список" : "Убрать из моего списка"}>
        {text}
        <span aria-hidden>{enable ? "+" : "×"}</span>
      </button>
    </form>
  );

  return (
    <div className="narrow-wide">
      <h1>Категории</h1>
      <Hint>
        Категория — на что именно ушли деньги: продукты, такси, аренда. Её выбирают после направления — в Telegram и при записи операции. Оставьте
        только нужные, остальные можно включить в любой момент.
      </Hint>

      <section className="card">
        <h2>Мой список · {on.length}</h2>
        <p className="muted small" style={{ marginTop: 0 }}>Нажмите на категорию, чтобы убрать её из списка. Записанные операции не пропадут.</p>
        <div className="cat-chips">
          {on.map((c) => (
            <Toggle key={c.id} id={c.id} text={label(c)} enable={false} />
          ))}
        </div>
      </section>

      <form action={addCategoryAction} className="card form">
        <h2>Своя категория</h2>
        <input type="hidden" name="next" value={next} />
        <div className="input-row">
          <input name="emoji" placeholder="🙂" aria-label="Значок (эмодзи)" style={{ maxWidth: 70, textAlign: "center" }} />
          <input name="name" required placeholder="например, Рыбалка" aria-label="Название категории" />
          <button className="btn btn-primary btn-sm">Добавить</button>
        </div>
      </form>

      {groups.length > 0 && (
        <section className="card">
          <h2>Можно добавить</h2>
          {groups.map((g) => (
            <div key={g} className="cat-group">
              <div className="cat-group-title">{g}</div>
              <div className="cat-chips">
                {off
                  .filter((c) => (c.grp || "Другое") === g)
                  .map((c) => (
                    <Toggle key={c.id} id={c.id} text={label(c)} enable />
                  ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
