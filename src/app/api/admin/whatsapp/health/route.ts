import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { getWhatsAppOperationalHealth } from "@/lib/whatsapp/operational-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const health = await getWhatsAppOperationalHealth({
    agentKey: cleanString(url.searchParams.get("agentKey")),
    checkRemote: asBoolean(url.searchParams.get("remote")),
  });

  return NextResponse.json({ success: true, data: { health } });
}
