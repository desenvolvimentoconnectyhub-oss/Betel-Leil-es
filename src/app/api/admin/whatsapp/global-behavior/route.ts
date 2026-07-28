import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getWhatsAppGlobalBehaviorConfig,
  saveWhatsAppGlobalBehaviorConfig,
} from "@/lib/communication/whatsapp-global-behavior-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function revalidateGlobalBehavior() {
  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/global-behavior");
  revalidatePath("/api/admin/whatsapp/agent-config");
  revalidatePath("/api/admin/whatsapp/crm");
}

export async function GET() {
  const config = await getWhatsAppGlobalBehaviorConfig();
  return NextResponse.json({ success: true, data: { config } });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await saveWhatsAppGlobalBehaviorConfig(body);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error || "Nao foi possivel salvar o comportamento global.", data: { config: result.config } },
      { status: 400 }
    );
  }

  revalidateGlobalBehavior();
  return NextResponse.json({ success: true, data: { config: result.config } });
}
