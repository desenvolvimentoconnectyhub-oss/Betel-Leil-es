import { NextResponse } from "next/server";
import { getMaintenanceStatus } from "@/lib/maintenance/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await getMaintenanceStatus());
}
