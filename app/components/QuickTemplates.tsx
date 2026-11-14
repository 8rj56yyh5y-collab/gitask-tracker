import { templateAction } from "../actions.ts";
import { quickTemplates } from "@/lib/quick.ts";
import { formatMoney } from "@/lib/money.ts";

/** Быстрые траты: то, что вы покупаете регулярно, — записать одним касанием. */
export function QuickTemplates({ next = "/" }: { next?: string }) {
  const list = quickTemplates(6);
  if (!list.length) return null;
  return (
    <div className="tpl-strip" aria-label="Быстрые траты">
      {list.map((t) => (
        <form key={t.key} action={templateAction}>
          <input type="hidden" name="key" value={t.key} />
          <input type="hidden" name="next" value={next} />
          <button className="tpl" title={`Записать: ${t.title}, ${formatMoney(t.amount)}`}>
            <span className="tpl-ico" aria-hidden>
              {t.emoji}
            </span>
            <span className="tpl-text">
              <b>{t.title}</b>
              <span>{formatMoney(t.amount)}</span>
            </span>
          </button>
        </form>
      ))}
    </div>
  );
}
