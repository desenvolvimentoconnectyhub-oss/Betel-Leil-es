import { NextResponse } from "next/server";
import { getAgentOfficeData } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const result = await getAgentOfficeData();

  return NextResponse.json({
    success: true,
    source: result.source,
    reason: result.reason,
    data: result.data,
  });
}
