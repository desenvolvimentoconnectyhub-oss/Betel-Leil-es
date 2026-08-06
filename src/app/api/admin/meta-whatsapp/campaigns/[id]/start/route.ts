import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { approveMetaWhatsAppCampaign } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const META_WHATSAPP_CAMPAIGNS_COMING_SOON = true;
const META_WHATSAPP_COMING_SOON_MESSAGE = "Campanhas Meta WhatsApp estao em breve. Aprovacao e disparo ainda nao estao liberados.";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  if (META_WHATSAPP_CAMPAIGNS_COMING_SOON) {
    return NextResponse.json(
      { ok: false, error: META_WHATSAPP_COMING_SOON_MESSAGE },
      { status: 503 }
    );
  }

  try {
    const { id } = await context.params;
    const result = await approveMetaWhatsAppCampaign({ campaignId: id });
    await inngest.send({
      name: "meta-whatsapp/campaign.process",
      data: { campaignId: result.campaignId },
    });

    revalidatePath("/admin/meta-whatsapp");
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao iniciar campanha Meta WhatsApp.",
      },
      { status: 400 }
    );
  }
}
