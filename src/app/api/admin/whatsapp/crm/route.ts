import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { getWhatsAppCrmData } from "@/lib/admin/repository";
import { reconcileExternalOutboundMessagesFromConnectyHub } from "@/lib/whatsapp/external-outbound-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  if (request.nextUrl.searchParams.get("reconcile") === "1") {
    await reconcileExternalOutboundMessagesFromConnectyHub().catch((error) => {
      console.error("[whatsapp-crm] Falha ao reconciliar mensagens externas:", error);
    });
  }

  const result = await getWhatsAppCrmData();
  return NextResponse.json(result);
}
