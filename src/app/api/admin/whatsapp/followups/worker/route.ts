import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { processWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || 10);
  if (!Number.isFinite(parsed)) return 10;
  return Math.max(1, Math.min(Math.trunc(parsed), 50));
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const result = await processWhatsAppFollowUps({
    dryRun: true,
    limit: parseLimit(url.searchParams.get("limit")),
    allowQuietHours: url.searchParams.get("allowQuietHours") === "true",
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await processWhatsAppFollowUps({
    dryRun: body.dryRun === true,
    limit: parseLimit(body.limit),
    allowQuietHours: body.allowQuietHours === true,
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/crm");

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
