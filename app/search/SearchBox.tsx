"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

/** Строка поиска: ищет на ходу, пока человек печатает (с короткой паузой). */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    if (q === initial) return;
    const t = setTimeout(() => start(() => router.replace(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search", { scroll: false })), 250);
    return () => clearTimeout(t);
  }, [q, initial, router]);
  return (
    <form className="search-box" role="search" onSubmit={(e) => e.preventDefault()}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input
        ref={ref}
        id="search-q"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Например: кофе, OTP, 250, аренда, норма"
        aria-label="Что найти"
        autoComplete="off"
        enterKeyHint="search"
      />
      {pending && <span className="search-spin" aria-hidden />}
    </form>
  );
}
