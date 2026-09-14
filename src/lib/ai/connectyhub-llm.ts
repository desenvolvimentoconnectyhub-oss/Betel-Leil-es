import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { GenerateContentRequest, GenerateContentResult, ModelParams, Part, RequestOptions } from "@google/generative-ai";
import { getAIConfig, getGeminiApiKey, getGeminiModel } from "./config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export { DynamicRetrievalMode, SchemaType, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
export type { Part, Content, GenerateContentResult } from "@google/generative-ai";
export const CONNECTYHUB_LLM_ORIGIN = "https://www.connectyhub.com.br";

export async function readConnectyHubAI(path: string) {
  if (!/^\/(models|prices|requests\/[a-f0-9-]+)$/.test(path)) throw new Error("Recurso de IA invalido.");
  const key = await getGeminiApiKey();
  if (!key) throw new Error("Configure a chave de IA ConnectyHub da Betel.");
  return fetch(`${CONNECTYHUB_LLM_ORIGIN}/api/v1/ai${path}`, {
    headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error",
  });
}

export type ConnectyHubReceipt = { request_id?: string; project_id?: string; credits?: number };

export function generationResultIssue(payload: { promptFeedback?: { blockReason?: string }; candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }) {
  const candidate = payload.candidates?.[0];
  if (payload.promptFeedback?.blockReason) return "Resposta bloqueada pelo provedor";
  if (candidate?.finishReason !== "STOP") return "Geracao incompleta: " + (candidate?.finishReason || "sem motivo de termino");
  const text = (candidate.content?.parts || []).filter(part => !part.thought).map(part => part.text || "").join("");
  return text.trim() ? "" : "Geracao encerrada sem conteudo util";
}

export function contentRequest(params: ModelParams, input: string | Array<string | Part> | GenerateContentRequest) {
  const request: GenerateContentRequest = typeof input === "string" || Array.isArray(input)
    ? { contents: [{ role: "user", parts: (Array.isArray(input) ? input : [input]).map(part => typeof part === "string" ? { text: part } : part) }] }
    : input;
  const instruction = request.systemInstruction ?? params.systemInstruction;
  return {
    ...params, ...request, model: undefined,
    systemInstruction: typeof instruction === "string" ? { parts: [{ text: instruction }] }
      : instruction && "text" in instruction ? { parts: [instruction] } : instruction,
  };
}

// This compatibility surface keeps existing text, JSON, audio, image and
// grounding callers on one server-only gateway. It has no provider fallback.
export class GoogleGenerativeAI {
  constructor(private readonly apiKey: string) {
    if (!apiKey.startsWith("chy_ai_")) throw new Error("A IA Betel exige uma chave ConnectyHub chy_ai_ do seu projeto.");
  }

  getGenerativeModel(params: ModelParams) {
    return {
      generateContent: async (input: string | Array<string | Part> | GenerateContentRequest, options: RequestOptions & { idempotencyKey?: string } = {}): Promise<GenerateContentResult> => {
        const [model, projectId, billingOrganizationId] = await Promise.all([
          getGeminiModel(), getAIConfig("connectyhub_llm_project_id"), getAIConfig("connectyhub_llm_billing_organization_id"),
        ]);
        if (!projectId || !billingOrganizationId) throw new Error("Confirme o projeto e a organizacao pagadora da conta Betel na manutencao antes de consumir IA.");
        const db = getSupabaseAdminClient();
        if (!db) throw new Error("Registro de consumo de IA indisponivel.");
        const operationId = options.idempotencyKey || randomUUID();
        if (!/^[a-zA-Z0-9_-]{8,120}$/.test(operationId)) throw new Error("Identificador de operacao invalido.");
        const body = JSON.stringify(contentRequest(params, input));
        const contentHash = createHash("sha256").update(model + body).digest("hex");
        const claim = await db.from("llm_operation_receipts").insert({ id: operationId, content_hash: contentHash, model, project_id: projectId, billing_organization_id: billingOrganizationId, status: "processing" });
        if (claim.error) throw new Error("Operacao de IA ja registrada ou registro indisponivel. Consulte o recibo antes de repetir.");
        let receipt: ConnectyHubReceipt = {};
        let receiptSaved = false;
        try {
          const response = await fetch(`${CONNECTYHUB_LLM_ORIGIN}/api/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST", redirect: "error", cache: "no-store",
            headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": operationId },
            body, signal: AbortSignal.timeout(options.timeout || 60_000),
          });
          const payload = await response.json();
          receipt = { ...payload.connectyhub, request_id: payload.connectyhub?.request_id || response.headers.get("x-request-id") || payload.error?.request_id || undefined };
          if (!response.ok) throw new Error(`ConnectyHub IA HTTP ${response.status}: ${typeof payload.error === "object" ? payload.error?.code || payload.error?.status || "erro" : "acesso indisponivel"}. Operacao ${operationId}${receipt.request_id ? "; solicitacao " + receipt.request_id : ""}.`);
          if (!receipt.request_id || receipt.project_id !== projectId || !Number.isFinite(receipt.credits)) throw new Error("Recibo de IA ausente ou projeto divergente. Consumo requer conciliacao.");
          const resultIssue = generationResultIssue(payload);
          const saved = await db.from("llm_operation_receipts").update({ status: "completed", result_status: resultIssue ? "unusable" : "usable", request_id: receipt.request_id, charged_credits: receipt.credits, completed_at: new Date().toISOString() }).eq("id", operationId);
          if (saved.error) throw new Error("Resposta recebida; falha ao registrar o consumo. Consulte a operacao antes de repetir.");
          receiptSaved = true;
          if (resultIssue) throw new Error(`${resultIssue}. Consumo confirmado: ${receipt.credits} creditos; solicitacao ${receipt.request_id}. Revise o limite/configuracao antes de uma nova geracao; nao houve repeticao automatica.`);
          return { response: { ...payload, text: () => {
            const candidate = payload.candidates?.[0];
            if (payload.promptFeedback?.blockReason || ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT"].includes(candidate?.finishReason)) throw new Error("A resposta foi bloqueada pelo provedor de IA.");
            const text = (candidate?.content?.parts || []).filter((part: { thought?: boolean }) => !part.thought).map((part: { text?: string }) => part.text || "").join("");
            if (!text.trim()) throw new Error("ConnectyHub retornou resposta sem texto: " + (candidate?.finishReason || "EMPTY") + ". Consulte o recibo antes de repetir.");
            return text;
          } } } as GenerateContentResult;
        } catch (error) {
          if (!receiptSaved) await db.from("llm_operation_receipts").update({ status: "uncertain", request_id: receipt.request_id || null, charged_credits: receipt.credits ?? null }).eq("id", operationId);
          throw error;
        }
      },
    };
  }
}
