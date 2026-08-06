import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { parseMetaWhatsAppContactFile } from "@/lib/meta-whatsapp/contact-list-parser";
import { getMetaWhatsAppDashboardData, importMetaWhatsAppContactList } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const META_WHATSAPP_CAMPAIGNS_COMING_SOON = true;
const META_WHATSAPP_COMING_SOON_MESSAGE = "Campanhas Meta WhatsApp estao em breve. Importacao de listas ainda nao esta liberada.";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === "on";
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

  if (META_WHATSAPP_CAMPAIGNS_COMING_SOON) {
    return NextResponse.json(
      { ok: false, error: META_WHATSAPP_COMING_SOON_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Envie um arquivo .csv, .txt ou .xlsx.");

    const parsed = await parseMetaWhatsAppContactFile(file);
    if (!parsed.rows.length) throw new Error("Nenhum contato encontrado no arquivo.");

    const result = await importMetaWhatsAppContactList({
      name: cleanString(formData.get("name"), parsed.filename.replace(/\.[^.]+$/, "")),
      sourceFilename: parsed.filename,
      sourceType: parsed.sourceType,
      rows: parsed.rows,
      optInConfirmed: asBoolean(formData.get("optInConfirmed")),
      optInSource: cleanString(formData.get("optInSource"), "upload_painel_meta_whatsapp"),
    });

    revalidateMetaWhatsApp();
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao importar lista Meta WhatsApp.",
      },
      { status: 400 }
    );
  }
}
