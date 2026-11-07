/** Одна строка под заголовком: что это за раздел и зачем он. */
export function Hint({ children }: { children: React.ReactNode }) {
  return <p className="page-hint">{children}</p>;
}
