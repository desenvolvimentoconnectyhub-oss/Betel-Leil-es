import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type VoiceReceipt = {
  id: string; content_hash: string; project_id: string; billing_organization_id: string;
  voice_id: string; model_id: string; generation_id: string | null;
  status: "requested" | "completed" | "uncertain" | "failed";
  charged_credits: number | null; audio_expires_at: string | null;
};
function database() {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error("Registro de consumo de Voz indisponivel.");
  return db;
}

export function voiceOperationId(trackId: string) {
  return `betel_voice_${createHash("sha256").update(trackId).digest("hex")}`;
}

export async function claimVoiceOperation(input: {
  operationId: string; body: string; projectId: string; billingOrganizationId: string; voiceId: string; modelId: string;
}): Promise<VoiceReceipt> {
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(input.operationId)) throw new Error("Identificador de operacao de Voz invalido.");
  const db = database();
  const receipt = {
    id: input.operationId, content_hash: createHash("sha256").update(input.body).digest("hex"),
    project_id: input.projectId, billing_organization_id: input.billingOrganizationId,
    voice_id: input.voiceId, model_id: input.modelId, status: "requested" as const,
  };
  const inserted = await db.from("voice_operation_receipts").insert(receipt).select("*").single();
  if (!inserted.error) return inserted.data as VoiceReceipt;
  if (inserted.error.code !== "23505") throw new Error("Nao foi possivel registrar a operacao de Voz antes da geracao.");
  const previous = await db.from("voice_operation_receipts").select("*").eq("id", input.operationId).single();
  if (previous.error || !previous.data) throw new Error("Recibo de Voz indisponivel. Consulte a operacao antes de repetir.");
  for (const key of ["content_hash", "project_id", "billing_organization_id", "voice_id", "model_id"] as const) {
    if (previous.data[key] !== receipt[key]) throw new Error("Operacao de Voz ja usada com outra configuracao ou conteudo.");
  }
  return previous.data as VoiceReceipt;
}

export async function recordVoiceReceipt(operationId: string, patch: Pick<VoiceReceipt, "generation_id" | "status" | "charged_credits" | "audio_expires_at">) {
  const db = database();
  // A failed download must never erase a confirmed charge or completed synthesis.
  let query = db.from("voice_operation_receipts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", operationId);
  if (patch.status !== "completed") query = query.neq("status", "completed");
  const { error } = await query;
  if (error) throw new Error(`Falha ao registrar recibo de Voz. Consulte a operacao ${operationId} antes de gerar novamente.`);
}
