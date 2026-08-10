import { NextResponse } from "next/server";
import { listAuctionOpportunitiesForAdmin } from "@/lib/admin/repository";
import { getCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) {
    return NextResponse.json({ success: false, message: "Nao autenticado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") || 50);
  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50;
  const opportunities = await listAuctionOpportunitiesForAdmin(admin, safeLimit);

  return NextResponse.json({
    success: true,
    source: opportunities.source,
    reason: opportunities.reason,
    count: opportunities.data.length,
    data: opportunities.data,
  });
}
