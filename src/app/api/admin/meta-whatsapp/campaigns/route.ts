import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { createMetaWhatsAppCampaign, getMetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const META_WHATSAPP_CAMPAIGNS_COMING_SOON = true;
const META_WHATSAPP_COMING_SOON_MESSAGE = "Campanhas Meta WhatsApp estao em breve. Criacao e disparo ainda nao estao liberados.";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "1" || value === "on") return true;
  if (value === "false" || value === "0") return false;
  return fallback;
}

function asNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function revalidateMetaWhatsApp() {
  revalidatePath("/admin/meta-whatsapp");
}

export async function GET() {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const data = await getMetaWhatsAppDashboardData();
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  if (META_WHATSAPP_CAMPAIGNS_COMING_SOON) {
    return NextResponse.json(
      { ok: false, error: META_WHATSAPP_COMING_SOON_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await createMetaWhatsAppCampaign({
      name: cleanString(body.name),
      campaignType: cleanString(body.campaignType, "marketing"),
      senderId: cleanString(body.senderId),
      templateId: cleanString(body.templateId),
      contactListId: cleanString(body.contactListId),
      language: cleanString(body.language),
      scheduledFor: cleanString(body.scheduledFor),
      requireOptIn: asBoolean(body.requireOptIn, true),
      rateLimitPerMinute: asNumber(body.rateLimitPerMinute, 60),
      dailyLimitPerNumber: asNumber(body.dailyLimitPerNumber, 1000),
    });

    revalidateMetaWhatsApp();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao criar campanha Meta WhatsApp.",
      },
      { status: 400 }
    );
  }
}
