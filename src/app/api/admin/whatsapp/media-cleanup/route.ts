import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { cleanupExpiredWhatsAppLeadMedia } from "@/lib/whatsapp/temp-media-cleanup";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.trunc(parsed), 200));
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const result = await cleanupExpiredWhatsAppLeadMedia({
    dryRun: true,
    limit: parseLimit(url.searchParams.get("limit")),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await cleanupExpiredWhatsAppLeadMedia({
    dryRun: body.dryRun === true,
    limit: parseLimit(body.limit),
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/crm");

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
