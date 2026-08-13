import { NextResponse } from "next/server";
import { adminCanUploadMarketAnalysisBatches } from "@/lib/admin/access";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { buildMarketAnalysisBatchCsvExport } from "@/lib/scraper/market-analysis-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireScraperExportApi() {
  const authorization = await requireAdminApi();
  if (authorization.response || !authorization.admin) return authorization.response;

  if (!adminCanUploadMarketAnalysisBatches(authorization.admin)) {
    return NextResponse.json(
      { ok: false, error: "Apenas administradores ou usuarios da Operacao podem exportar lotes de analise." },
      { status: 403 }
    );
  }

  return null;
}

export async function GET(request: Request) {
  const forbidden = await requireScraperExportApi();
  if (forbidden) return forbidden;

  const url = new URL(request.url);
  const format = url.searchParams.get("format") || "csv";
  const batchId = url.searchParams.get("batchId") || "";

  if (format !== "csv") {
    return NextResponse.json({ ok: false, error: "Formato indisponivel. Use CSV." }, { status: 400 });
  }

  const result = await buildMarketAnalysisBatchCsvExport({ batchId });
  if (!result.ok || !result.data) {
    return NextResponse.json({ ok: false, error: result.error || "Falha ao exportar analises." }, { status: 400 });
  }

  return new Response(result.data.content, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="${result.data.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
      "X-Export-Row-Count": String(result.data.rowCount),
    },
  });
}
