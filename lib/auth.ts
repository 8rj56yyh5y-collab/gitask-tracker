// Ключ для приёма операций из «Команд» iOS и вебхука Monobank.
// Задаётся в переменной окружения DN_INGEST_TOKEN (см. .env.example).

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function ingestTokenOk(provided: string | null | undefined): boolean {
  const expected = process.env.DN_INGEST_TOKEN;
  if (!expected || expected.length < 16 || !provided) return false;
  // Ключ, созданный Render, может содержать «+», а в ссылке «+» превращается в пробел — принимаем и так.
  return sameText(provided, expected) || sameText(provided.replace(/ /g, "+"), expected);
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return new URL(req.url).searchParams.get("key");
}
