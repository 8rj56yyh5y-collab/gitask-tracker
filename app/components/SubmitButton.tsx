"use client";
import { useFormStatus } from "react-dom";

/** Кнопка формы, которая показывает «идёт работа», пока сервер отвечает. */
export function SubmitButton({ children, pending, className = "btn btn-primary" }: { children: React.ReactNode; pending?: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy}>
      {busy ? (pending ?? "Сохраняю…") : children}
    </button>
  );
}
