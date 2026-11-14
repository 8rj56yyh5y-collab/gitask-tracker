"use client";
import { useFormStatus } from "react-dom";

/** Кнопка формы, которая показывает «идёт работа», пока сервер отвечает. name/value — какая из кнопок нажата. */
export function SubmitButton({
  children,
  pending,
  className = "btn btn-primary",
  name,
  value,
}: {
  children: React.ReactNode;
  pending?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} name={name} value={value}>
      {busy ? (pending ?? "Сохраняю…") : children}
    </button>
  );
}
