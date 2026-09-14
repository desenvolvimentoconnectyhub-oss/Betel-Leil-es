import { NextRequest, NextResponse } from "next/server";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { GoogleGenerativeAI, readConnectyHubAI, type ConnectyHubReceipt } from "@/lib/ai/connectyhub-llm";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  const model = await getGeminiModel();
  try {
    const response = await readConnectyHubAI("/models");
    return NextResponse.json({ success: true, active_provider: "connectyhub", checked_at: new Date().toISOString(), connectyhub: { configured: true, model, status: response.ok ? "ok" : response.status === 401 ? "invalid_key" : "error", message: response.ok ? "Acesso ao catalogo confirmado. Saldo e geracao ainda nao testados." : "ConnectyHub IA HTTP " + response.status } });
  } catch { return NextResponse.json({ success: true, active_provider: "connectyhub", connectyhub: { configured: false, model, status: "missing_key", message: "Configure a chave de IA ConnectyHub da conta Betel." } }); }
}
export async function POST(request: NextRequest) {
  const model = await getGeminiModel();
  try {
    const body = await request.json();
    if (typeof body.operationId !== "string" || !/^[a-f0-9-]{36}$/.test(body.operationId)) return NextResponse.json({ success: false, message: "Identificador de teste invalido." }, { status: 400 });
    const key = await getGeminiApiKey();
    if (!key) throw new Error("Configure a chave de IA ConnectyHub da Betel.");
    const result = await new GoogleGenerativeAI(key).getGenerativeModel({ model, generationConfig: { temperature: 0, maxOutputTokens: 256, ...{ thinkingConfig: { thinkingLevel: "minimal" } } } }).generateContent("Teste sintetico de integracao Betel. Responda apenas OK.", { idempotencyKey: body.operationId });
    const receipt = (result.response as unknown as { connectyhub: ConnectyHubReceipt }).connectyhub;
    const response = await readConnectyHubAI("/requests/" + receipt.request_id);
    const operation = response.ok ? await response.json() : null;
    const confirmed = operation?.status === "completed" && Number(operation.charged_credits) === receipt.credits;
    return NextResponse.json({ success: true, active_provider: "connectyhub", checked_at: new Date().toISOString(), connectyhub: { configured: true, model, status: confirmed ? "ok" : "error", message: confirmed ? "Resposta: " + result.response.text() + ". Creditos confirmados: " + receipt.credits + ". Solicitacao: " + receipt.request_id : "Resposta recebida; consumo aguarda conciliacao. Solicitacao: " + receipt.request_id, receipt, operation } });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Falha no teste ConnectyHub." }, { status: 503 }); }
}
