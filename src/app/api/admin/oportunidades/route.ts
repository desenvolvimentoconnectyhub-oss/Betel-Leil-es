import { NextResponse } from "next/server";
import { listAuctionOpportunities } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const opportunities = await listAuctionOpportunities(safeLimit);

  return NextResponse.json({
    success: true,
    source: opportunities.source,
    reason: opportunities.reason,
    count: opportunities.data.length,
    data: opportunities.data,
  });
}
