import "server-only";
import { getConnectyHubVoiceConfig } from "./config";
import { ConnectyHubVoiceError, fetchConnectyHubVoice } from "./transport";
import { buildVoiceRequest, type VoiceSynthesisInput } from "./request";
import { claimVoiceOperation, recordVoiceReceipt, voiceOperationId } from "./receipts";
import { assertLeadWorkActive } from "@/lib/whatsapp/lead-reset";

export type ConnectyHubVoice = { voiceId: string; name: string; category: string; description: string; previewUrl: string; labels: Record<string, string>; status: string };
export type ConnectyHubVoiceModel = { modelId: string; name: string; available: boolean; creditsPerCharacter: number | null; minimumCredits: number | null };
type VoiceGeneration = {
  id: string; project_id: string; billing_organization_id: string; operation: string; status: string; voice_id: string; model_id: string;
  usage: { credits: number; reserved_credits: number; quoted_credits: number };
  audio: { content_type: string; bytes: number } | null; error?: { code: string } | null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === "string" ? value : "";
async function json(response: Response): Promise<Record<string, unknown>> {
  try { return record(await response.json()); }
  catch { throw new ConnectyHubVoiceError("Resposta invalida da API de Voz. Consulte a mesma operacao.", "invalid_response", 502); }
}

export async function listConnectyHubVoices(): Promise<ConnectyHubVoice[]> {
  const config = await getConnectyHubVoiceConfig();
  const payload = await json(await fetchConnectyHubVoice("/voices", { config }));
  assertVoiceIdentity(payload, config);
  if (!Array.isArray(payload.voices)) throw new Error("Catalogo de vozes invalido.");
  return payload.voices.map(record).map((row): ConnectyHubVoice => ({
    voiceId: text(row.voice_id), name: text(row.name), category: text(row.kind),
    status: text(row.status), description: row.kind === "private" ? "Voz privada do projeto Betel" : "Voz do catalogo ConnectyHub",
    previewUrl: "", labels: row.language ? { language: text(row.language) } : {},
  })).filter(voice => voice.voiceId && voice.name && voice.status === "ready");
}

function assertVoiceIdentity(payload: Record<string, unknown>, config: Awaited<ReturnType<typeof getConnectyHubVoiceConfig>>) {
  if (payload.project_id !== config.projectId.value || payload.billing_organization_id !== config.billingOrganizationId.value) {
    throw new ConnectyHubVoiceError("A chave de Voz nao corresponde ao projeto e a conta pagadora Betel configurados.", "voice_identity_mismatch", 403);
  }
}

export async function listConnectyHubVoiceModels(config?: Awaited<ReturnType<typeof getConnectyHubVoiceConfig>>): Promise<ConnectyHubVoiceModel[]> {
  const identity = config || await getConnectyHubVoiceConfig();
  const payload = await json(await fetchConnectyHubVoice("/models", { config: identity }));
  assertVoiceIdentity(payload, identity);
  if (!Array.isArray(payload.models)) throw new Error("Catalogo de modelos de Voz invalido.");
  return payload.models.map(record).map(row => ({ modelId: text(row.model_id), name: text(row.name), available: row.available === true,
    creditsPerCharacter: typeof row.credits_per_character === "number" ? row.credits_per_character : null,
    minimumCredits: typeof row.minimum_credits === "number" ? row.minimum_credits : null,
  }));
}

export async function testConnectyHubVoiceConnection() {
  const [voices, models] = await Promise.all([listConnectyHubVoices(), listConnectyHubVoiceModels()]);
  return { voiceCount: voices.length, modelCount: models.filter(model => model.available).length };
}

async function readVoiceAudio(generationId: string, config: Awaited<ReturnType<typeof getConnectyHubVoiceConfig>>) {
  const audio = await fetchConnectyHubVoice(`/generations/${generationId}/audio`, { timeoutMs: 20_000, config });
  if (!audio.headers.get("content-type")?.toLowerCase().startsWith("audio/")) throw new ConnectyHubVoiceError("A API de Voz retornou um arquivo invalido.", "invalid_audio", 502, generationId);
  const bytes = Buffer.from(await audio.arrayBuffer());
  if (!bytes.length || bytes.length > 12_582_912) throw new ConnectyHubVoiceError("O audio retornado esta vazio ou excede o limite.", "invalid_audio", 502, generationId);
  return { contentType: audio.headers.get("content-type")!, audioBase64: bytes.toString("base64") };
}

export async function previewConnectyHubClone(voiceId: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId)) throw new ConnectyHubVoiceError("Voz invalida.", "invalid_voice", 422);
  const config = await getConnectyHubVoiceConfig();
  await listConnectyHubVoiceModels(config);
  const modelId = "eleven_multilingual_v2";
  const operationId = voiceOperationId(`included-clone-preview:${config.projectId.value}:${voiceId}`);
  const saved = await claimVoiceOperation({ operationId, body: JSON.stringify({ operation: "voice_clone_preview", voiceId }), projectId: config.projectId.value,
    billingOrganizationId: config.billingOrganizationId.value, voiceId, modelId });
  let generationId = saved.generation_id;
  let recorded = false;
  try {
    const response = generationId ? await fetchConnectyHubVoice(`/generations/${generationId}`, { config })
      : await fetchConnectyHubVoice(`/voices/${voiceId}/preview`, { body: "{}", operationId, config, timeoutMs: 55_000 });
    const generation = await json(response) as unknown as VoiceGeneration;
    assertVoiceIdentity(generation as unknown as Record<string, unknown>, config);
    if (!/^[a-f0-9-]{36}$/i.test(generation.id || "") || generation.operation !== "voice_clone_preview" || generation.voice_id !== voiceId || generation.model_id !== modelId || generation.usage?.credits !== 0) {
      throw new ConnectyHubVoiceError("Recibo da previa incluida divergente. Consulte a operacao.", "receipt_mismatch", 502);
    }
    generationId = generation.id;
    await recordVoiceReceipt(operationId, { generation_id: generationId, status: generation.status === "completed" ? "completed" : generation.status === "failed" ? "failed" : "uncertain", charged_credits: 0, audio_expires_at: null });
    recorded = true;
    if (generation.status !== "completed") throw new ConnectyHubVoiceError("Previa incluida pendente. Consulte novamente a mesma previa.", "generation_pending", 409, generationId);
    return { ...await readVoiceAudio(generationId, config), voiceId, modelId, generationId, operationId, chargedCredits: 0 };
  } catch (error) {
    if (!recorded && saved.status !== "completed") await recordVoiceReceipt(operationId, { generation_id: generationId, status: "uncertain", charged_credits: null, audio_expires_at: null });
    throw error;
  }
}

export async function synthesizeConnectyHubVoice(input: VoiceSynthesisInput) {
  const config = await getConnectyHubVoiceConfig();
  if (!config.apiKey.value || !config.projectId.value || !config.billingOrganizationId.value) throw new Error("Configure a chave, o projeto e a conta pagadora ConnectyHub Voz da Betel.");
  let body: ReturnType<typeof buildVoiceRequest>;
  try { body = buildVoiceRequest(input, { voiceId: config.willianVoiceId.value || config.defaultVoiceId.value, modelId: config.defaultModelId.value }); }
  catch (error) { throw new ConnectyHubVoiceError(error instanceof Error ? error.message : "Parametros invalidos.", "invalid_input", 422); }
  const saved = await claimVoiceOperation({ operationId: input.operationId, body: JSON.stringify(body), projectId: config.projectId.value,
    billingOrganizationId: config.billingOrganizationId.value, voiceId: body.voice_id, modelId: body.model_id });
  let generationId = saved.generation_id;
  let credits = saved.charged_credits;
  let completed = saved.status === "completed";
  let receiptRecorded = false;
  try {
    await assertLeadWorkActive();
    if (!generationId) {
      const models = await listConnectyHubVoiceModels(config);
      if (!models.some(model => model.modelId === body.model_id && model.available)) throw new ConnectyHubVoiceError("Modelo de Voz indisponivel no catalogo da conta Betel.", "model_unavailable", 422);
      await assertLeadWorkActive();
    }
    // A known request is read. An unknown request is replayed with exactly the
    // same idempotency key and body; the public API never dispatches it twice.
    const response = generationId
      ? await fetchConnectyHubVoice(`/generations/${generationId}`, { config })
      : await fetchConnectyHubVoice("/generations", { body: JSON.stringify(body), operationId: input.operationId, timeoutMs: input.timeoutMs || 55_000, config });
    const generation = await json(response) as unknown as VoiceGeneration;
    if (!/^[a-f0-9-]{36}$/i.test(generation.id || "") || generation.project_id !== config.projectId.value ||
        generation.operation !== "text_to_speech" || generation.voice_id !== body.voice_id || generation.model_id !== body.model_id ||
        generation.billing_organization_id !== config.billingOrganizationId.value ||
        !Number.isFinite(generation.usage?.credits) || generation.usage.credits < 0) {
      throw new ConnectyHubVoiceError("Recibo de Voz ausente ou divergente. Consulte a operacao antes de gerar novamente.", "receipt_mismatch", 502);
    }
    generationId = generation.id;
    credits = generation.usage.credits;
    completed = generation.status === "completed";
    await recordVoiceReceipt(input.operationId, { generation_id: generationId, status: completed ? "completed" : generation.status === "failed" ? "failed" : "uncertain", charged_credits: credits, audio_expires_at: null });
    receiptRecorded = true;
    if (!completed) throw new ConnectyHubVoiceError(`Geracao ${generationId}: ${generation.status}. Consulte este teste novamente; nenhum novo audio sera gerado automaticamente.`, generation.error?.code || "generation_pending", generation.status === "failed" ? 422 : 409, generationId);
    return { ...await readVoiceAudio(generationId, config), voiceId: body.voice_id, modelId: body.model_id,
      generationId, operationId: input.operationId, chargedCredits: credits };
  } catch (error) {
    if (!completed && !receiptRecorded) {
      generationId ||= error instanceof ConnectyHubVoiceError && /^[a-f0-9-]{36}$/i.test(error.generationId || "") ? error.generationId! : null;
      await recordVoiceReceipt(input.operationId, { generation_id: generationId, status: "uncertain", charged_credits: credits, audio_expires_at: null });
    }
    throw error;
  }
}
