import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { reviewWhatsAppConversations } from "@/lib/whatsapp/quality-reviewer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 12) {
  const parsed = typeof value === "number" ? value : Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), 40));
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
  return false;
}

function revalidateWhatsAppPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/agent-config");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/reviews");
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const result = await reviewWhatsAppConversations({
    dryRun: true,
    limit: asNumber(url.searchParams.get("limit"), 12),
    agentKey: cleanString(url.searchParams.get("agentKey")),
    autoHandoff: asBoolean(url.searchParams.get("autoHandoff")),
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await reviewWhatsAppConversations({
    dryRun: asBoolean(body.dryRun),
    limit: asNumber(body.limit, 12),
    agentKey: cleanString(body.agentKey),
    autoHandoff: body.autoHandoff !== false,
  });

  if (!result.dryRun) revalidateWhatsAppPaths();

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
