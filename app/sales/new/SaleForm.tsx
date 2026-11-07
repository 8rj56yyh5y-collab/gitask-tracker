"use client";
import { useMemo, useState } from "react";
import { priceFor, splitSale, type Tier } from "@/lib/pricing.ts";

export interface SaleProduct {
  id: number;
  name: string;
  unit: string;
  tiers: Tier[];
  salesRate: number;
  mpRate: number;
}

const money = (kop: number) => `${(kop / 100).toLocaleString("uk-UA", { maximumFractionDigits: 2 })} ₴`;
const pct = (v: number) => `${v.toLocaleString("ru-RU")}%`;

/** Живой расчёт продажи: цена по наборам, комиссии, доля компании. Окончательно считает сервер. */
export function SaleForm({ products, base, children }: { products: SaleProduct[]; base: "gross" | "net"; children: React.ReactNode }) {
  const [pid, setPid] = useState(products[0]?.id ?? 0);
  const [qty, setQty] = useState("1");
  const [custom, setCustom] = useState("");
  const [channel, setChannel] = useState<"direct" | "mp">("direct");
  const p = products.find((x) => x.id === pid);
  const n = Number(qty.replace(",", ".")) || 0;
  const price = useMemo(() => (p ? priceFor(n, p.tiers) : null), [p, n]);
  const customKop = Math.round((Number(custom.replace(/\s/g, "").replace(",", ".")) || 0) * 100);
  const total = customKop > 0 ? customKop : (price?.total ?? 0);
  const split = p ? splitSale(total, p.salesRate, p.mpRate, channel, base) : null;

  return (
    <>
      <label>
        Товар
        <select name="productId" value={pid} onChange={(e) => setPid(Number(e.target.value))}>
          {products.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {p && p.tiers.length > 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          Цены: {p.tiers.map((t) => `${t.qty} ${p.unit} — ${money(t.price)}`).join(" · ")}
        </p>
      )}
      <div className="grid-2-tight">
        <label>
          Количество{p ? `, ${p.unit}` : ""}
          <input name="qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} required />
        </label>
        <label>
          Своя сумма, ₴
          <input name="total" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={price ? String(price.total / 100) : "по каталогу"} />
        </label>
      </div>
      <div className="seg2" role="radiogroup" aria-label="Где продано">
        <label>
          <input type="radio" name="channel" value="direct" checked={channel === "direct"} onChange={() => setChannel("direct")} /> Вживую
        </label>
        <label>
          <input type="radio" name="channel" value="mp" checked={channel === "mp"} onChange={() => setChannel("mp")} /> Маркетплейс{p ? ` · ${pct(p.mpRate)}` : ""}
        </label>
      </div>
      {children}
      {p && split && total > 0 ? (
        <div className="kv" aria-live="polite">
          <div className="row-between">
            <span>
              Сумма продажи
              {price && !customKop && price.parts.length > 0 && (
                <span className="small"> ({price.parts.map((x) => `${x.count}×${x.qty}`).join(" + ")})</span>
              )}
            </span>
            <span>{money(total)}</span>
          </div>
          {channel === "mp" && (
            <div className="row-between">
              <span>Комиссия маркетплейса {pct(p.mpRate)}</span>
              <span>−{money(split.mpFee)}</span>
            </div>
          )}
          <div className="row-between">
            <span>
              Ваш доход — комиссия отдела {pct(p.salesRate)}
              {base === "net" && channel === "mp" ? " (после маркетплейса)" : ""}
            </span>
            <strong>{money(split.commission)}</strong>
          </div>
          <div className="row-between total">
            <span>Отдать компании</span>
            <span>{money(split.company)}</span>
          </div>
        </div>
      ) : (
        <p className="muted small">Укажите количество — здесь появится расчёт.</p>
      )}
    </>
  );
}
