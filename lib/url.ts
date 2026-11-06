import { headers } from "next/headers";

/** Публичный адрес сайта: DN_PUBLIC_URL или адрес, по которому открыли страницу. */
export async function publicBase(): Promise<string> {
  const env = process.env.DN_PUBLIC_URL;
  if (env) return env.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
