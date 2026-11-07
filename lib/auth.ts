// Ключ для приёма операций из «Команд» iOS и вебхука Monobank.
// Задаётся в переменной окружения DN_INGEST_TOKEN (см. .env.example).

export function ingestTokenOk(provided: string | null | undefined): boolean {
  const expected = process.env.DN_INGEST_TOKEN;
  if (!expected || expected.length < 16) return false;
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

export function bearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (h?.toLowerCase().startsWith("bearer ")) return h.slice(7).trim();
  return new URL(req.url).searchParams.get("key");
}
