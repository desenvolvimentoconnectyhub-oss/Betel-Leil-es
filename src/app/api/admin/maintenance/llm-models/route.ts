import { NextResponse } from "next/server";
import { getGeminiModel } from "@/lib/ai/config";
import { readConnectyHubAI } from "@/lib/ai/connectyhub-llm";
export const dynamic = "force-dynamic";
export async function GET() {
  const current = await getGeminiModel();
  try {
    const response = await readConnectyHubAI("/models");
    if (!response.ok) return NextResponse.json({ success: false, current, models: [], message: "ConnectyHub IA HTTP " + response.status }, { status: response.status });
    const payload = await response.json();
    const models = (payload.data || []).filter((model: { usable_with_key?: boolean }) => model.usable_with_key === true).map((model: { id: string; name?: string; description?: string }) => ({ id: model.id, name: model.name || model.id, description: model.description || "Modelo vinculado a chave ConnectyHub" }));
    return NextResponse.json({ success: true, current, models, total: models.length });
  } catch { return NextResponse.json({ success: false, current, models: [], message: "Configure a chave ConnectyHub de IA da Betel." }); }
}
