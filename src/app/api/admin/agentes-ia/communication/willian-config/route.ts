import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getWhatsAppAgentConfig,
  getWillianAgentConfig,
  saveWhatsAppAgentConfig,
  saveWillianAgentConfig,
} from "@/lib/communication/willian-agent-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function revalidateWillianConfig() {
  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication/willian-config");
}

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agentKey = cleanString(url.searchParams.get("agentKey"));
  const config = agentKey ? await getWhatsAppAgentConfig(agentKey) : await getWillianAgentConfig();
  return NextResponse.json({ success: true, data: { config } });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const bodyRecord = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const result = cleanString(bodyRecord.agentKey)
    ? await saveWhatsAppAgentConfig(bodyRecord)
    : await saveWillianAgentConfig(body);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error || "Nao foi possivel salvar o agente de WhatsApp.", data: { config: result.config } },
      { status: 400 }
    );
  }

  revalidateWillianConfig();
  return NextResponse.json({ success: true, data: { config: result.config } });
}
