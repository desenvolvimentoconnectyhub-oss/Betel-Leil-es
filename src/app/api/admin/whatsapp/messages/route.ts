import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { sendWhatsAppManualReply } from "@/lib/whatsapp/manual-reply";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function revalidateWhatsAppPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/health");
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = await sendWhatsAppManualReply({
    conversationId: cleanString(body.conversationId),
    leadId: cleanString(body.leadId),
    agentKey: cleanString(body.agentKey),
    text: cleanString(body.text),
    operatorLabel: cleanString(body.operatorLabel, authorization.admin?.name || "Operador Betel"),
  });

  revalidateWhatsAppPaths();

  return NextResponse.json(
    {
      success: result.ok,
      data: result,
      error: result.error,
    },
    { status: result.ok ? 200 : 400 }
  );
}
