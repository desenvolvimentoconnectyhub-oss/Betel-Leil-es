import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { planWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-planner";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function parseLimit(value: string | null) {
  const parsed = Number(value || 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(Math.trunc(parsed), 200));
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const result = await planWhatsAppFollowUps({
    dryRun: true,
    limit: parseLimit(url.searchParams.get("limit")),
    agentKey: cleanString(url.searchParams.get("agentKey")),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await planWhatsAppFollowUps({
    dryRun: body.dryRun === true,
    limit: typeof body.limit === "number" ? body.limit : parseLimit(cleanString(body.limit)),
    agentKey: cleanString(body.agentKey),
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/health");

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
