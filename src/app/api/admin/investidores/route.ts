import { NextResponse } from "next/server";
import { listInvestorProfiles } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const investors = await listInvestorProfiles(safeLimit);

  return NextResponse.json({
    success: true,
    source: investors.source,
    reason: investors.reason,
    count: investors.data.length,
    data: investors.data,
  });
}
