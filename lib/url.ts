import { headers } from "next/headers";

/** Публичный адрес сайта: DN_PUBLIC_URL или адрес, по которому открыли страницу. */
export async function publicBase(): Promise<string> {
  // RENDER_EXTERNAL_URL Render задаёт сам — тогда DN_PUBLIC_URL указывать не нужно.
  const env = process.env.DN_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  // Хостинги (Render, Railway) передают x-forwarded-proto; без прокси сервер Next работает только по http.
  const proto = h.get("x-forwarded-proto")?.split(",")[0].trim() || "http";
  return `${proto}://${host}`;
}
