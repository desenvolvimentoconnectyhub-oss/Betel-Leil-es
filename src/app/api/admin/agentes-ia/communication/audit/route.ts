import { NextResponse } from "next/server";
import { getCommunicationAuditData } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asNumber(value: string | null, fallback = 50) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await getCommunicationAuditData({
    channel: url.searchParams.get("channel") || "all",
    status: url.searchParams.get("status") || "all",
    eventType: url.searchParams.get("eventType") || "all",
    limit: asNumber(url.searchParams.get("limit"), 50),
  });

  return NextResponse.json({
    success: true,
    source: result.source,
    reason: result.reason,
    data: result.data,
  });
}
