import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getWillianAgentConfig,
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

export async function GET() {
  const config = await getWillianAgentConfig();
  return NextResponse.json({ success: true, data: { config } });
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await saveWillianAgentConfig(body);
  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: result.error || "Nao foi possivel salvar o Willian.", data: { config: result.config } },
      { status: 400 }
    );
  }

  revalidateWillianConfig();
  return NextResponse.json({ success: true, data: { config: result.config } });
}
