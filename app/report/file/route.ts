import { buildReport, parseScope, presetRange, reportFileName, reportXlsx } from "@/lib/report.ts";

// Скачать отчёт за период файлом Excel. Доступ — как ко всему D&N: только после входа (middleware).
export async function GET(req: Request) {
  const u = new URL(req.url);
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const def = presetRange(u.searchParams.get("p") ?? "lastweek");
  const from = ok(u.searchParams.get("from")) ?? def.from;
  const to = ok(u.searchParams.get("to")) ?? def.to;
  const r = buildReport(parseScope(u.searchParams.get("scope")), from <= to ? from : to, from <= to ? to : from);
  const file = await reportXlsx(r);
  const name = reportFileName(r);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="DN-report-${r.from}_${r.to}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
