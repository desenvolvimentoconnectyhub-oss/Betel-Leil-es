import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { getWhatsAppCrmData } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const result = await getWhatsAppCrmData();
  return NextResponse.json(result);
}
