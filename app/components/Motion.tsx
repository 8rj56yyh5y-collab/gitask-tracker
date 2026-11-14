"use client";
import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Число «набегает» от нуля при открытии — 0,6 секунды. Текст сумм не меняется, только анимация. */
export function CountUp({ value, format }: { value: number; format: "money" | "int" }) {
  const [v, setV] = useState(value);
  const first = useRef(true);
  useEffect(() => {
    if (!first.current || reduced()) return;
    first.current = false;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      setV(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  if (format === "int") return <>{v.toLocaleString("ru-RU")}</>;
  const abs = Math.abs(v) / 100;
  return (
    <>
      {v < 0 ? "−" : ""}
      {abs.toLocaleString("ru-RU", abs >= 1000 || Number.isInteger(abs) ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
    </>
  );
}

/** Конфетти — один раз, когда случилось хорошее: всё разобрано, копилка собрана. */
export function Confetti({ id }: { id: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    try {
      if (reduced() || sessionStorage.getItem(`confetti:${id}`)) return;
      sessionStorage.setItem(`confetti:${id}`, "1");
    } catch {
      /* без хранилища — просто покажем */
    }
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const W = (c.width = window.innerWidth * devicePixelRatio);
    const H = (c.height = window.innerHeight * devicePixelRatio);
    const colors = ["#3654ff", "#6a3bff", "#12a150", "#f59e0b", "#ec4899", "#0ea5e9"];
    const parts = Array.from({ length: 120 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * W * 0.3,
      y: H * 0.35,
      vx: (Math.random() - 0.5) * 18 * devicePixelRatio,
      vy: (-Math.random() * 16 - 6) * devicePixelRatio,
      r: (Math.random() * 5 + 3) * devicePixelRatio,
      c: colors[Math.floor(Math.random() * colors.length)],
      a: Math.random() * Math.PI,
    }));
    const start = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.5 * devicePixelRatio;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.a += 0.15;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        ctx.restore();
      }
      if (t - start < 2200) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return <canvas ref={ref} className="confetti" aria-hidden />;
}

/**
 * Карточку разбора можно смахнуть: вправо — «✓ Верно» (нажимается кнопка подтверждения),
 * влево — открыть, чтобы поправить. Кнопки остаются — свайп лишь быстрее.
 */
export function Swipe({ children, yesSelector = ".review-yes", editHref }: { children: React.ReactNode; yesSelector?: string; editHref: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState<0 | 1 | -1>(0);
  const st = useRef<{ x: number; y: number; lock: "x" | "y" | null } | null>(null);
  const canYes = () => Boolean(ref.current?.querySelector(yesSelector));
  return (
    <div
      ref={ref}
      className={`swipe ${gone ? "is-gone" : ""}`}
      style={{ transform: gone ? `translateX(${gone * 120}%) rotate(${gone * 6}deg)` : dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : undefined }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        st.current = { x: t.clientX, y: t.clientY, lock: null };
      }}
      onTouchMove={(e) => {
        const s = st.current;
        if (!s) return;
        const t = e.touches[0];
        const mx = t.clientX - s.x;
        const my = t.clientY - s.y;
        if (!s.lock) s.lock = Math.abs(mx) > Math.abs(my) + 6 ? "x" : Math.abs(my) > 10 ? "y" : null;
        if (s.lock === "x") setDx(mx > 0 && !canYes() ? Math.min(mx, 40) : mx);
      }}
      onTouchEnd={() => {
        const s = st.current;
        st.current = null;
        if (!s || s.lock !== "x") return setDx(0);
        if (dx > 110 && canYes()) {
          setGone(1);
          setTimeout(() => ref.current?.querySelector<HTMLButtonElement>(yesSelector)?.click(), 180);
        } else if (dx < -110) {
          setGone(-1);
          setTimeout(() => (window.location.href = editHref), 180);
        } else setDx(0);
      }}
    >
      <span className="swipe-hint swipe-yes" style={{ opacity: Math.max(0, Math.min(1, dx / 110)) }} aria-hidden>
        ✓ Верно
      </span>
      <span className="swipe-hint swipe-edit" style={{ opacity: Math.max(0, Math.min(1, -dx / 110)) }} aria-hidden>
        Изменить ✎
      </span>
      {children}
    </div>
  );
}
