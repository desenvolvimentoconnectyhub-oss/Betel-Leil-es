import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  createMetaWhatsAppTemplate,
  deleteMetaWhatsAppTemplate,
  getMetaWhatsAppDashboardData,
  syncMetaWhatsAppTemplates,
} from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(asRecord(value))
      .map(([key, item]) => [key, cleanString(item)] as const)
      .filter(([, item]) => Boolean(item))
  );
}

function templateBody(body: Record<string, unknown>) {
  return {
    name: cleanString(body.name),
    category: cleanString(body.category, "MARKETING"),
    language: cleanString(body.language, "pt_BR"),
    headerType: cleanString(body.headerType, "none") as "none" | "text" | "image" | "video" | "document",
    headerText: cleanString(body.headerText),
    headerMediaHandle: cleanString(body.headerMediaHandle),
    bodyText: cleanString(body.bodyText),
    footerText: cleanString(body.footerText),
    buttons: Array.isArray(body.buttons) ? body.buttons : [],
    variableExamples: asStringRecord(body.variableExamples),
  };
}

function revalidateMetaWhatsApp() {
  revalidatePath("/admin/meta-whatsapp");
  revalidatePath("/admin/meta-whatsapp-templates");
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

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = cleanString(body.action, "create");

    if (action === "sync") {
      const result = await syncMetaWhatsAppTemplates();
      revalidateMetaWhatsApp();
      return NextResponse.json({ ok: true, result });
    }

    if (action === "delete") {
      const result = await deleteMetaWhatsAppTemplate({ id: cleanString(body.id) });
      revalidateMetaWhatsApp();
      return NextResponse.json({ ok: true, result });
    }

    const result = await createMetaWhatsAppTemplate(templateBody(body));
    revalidateMetaWhatsApp();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao operar templates Meta.",
      },
      { status: 400 }
    );
  }
}
