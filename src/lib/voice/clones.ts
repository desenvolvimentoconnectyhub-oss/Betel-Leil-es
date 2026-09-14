import "server-only";
import { createHash } from "node:crypto";
import { getConnectyHubVoiceConfig, saveConnectyHubVoiceSelection } from "./config";
import { listConnectyHubVoiceModels } from "./connectyhub";
import { claimVoiceOperation, recordVoiceReceipt } from "./receipts";
import { ConnectyHubVoiceError, fetchConnectyHubVoice } from "./transport";

export async function createConnectyHubVoiceClone(input: { operationId: string; name: string; authorized: boolean; files: File[] }) {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!input.authorized) throw new ConnectyHubVoiceError("Confirme o direito e o consentimento para clonar esta voz.", "consent_required", 422);
  if (name.length < 2 || name.length > 80) throw new ConnectyHubVoiceError("Nome da voz: entre 2 e 80 caracteres.", "invalid_name", 422);
  if (!input.files.length || input.files.length > 5 || input.files.some(file => !file.size || (!file.type.startsWith("audio/") && file.type !== "video/mp4")) || input.files.reduce((n, file) => n + file.size, 0) > 3 * 1024 * 1024) {
    throw new ConnectyHubVoiceError("Envie de uma a cinco amostras de audio, com ate 3 MB no total.", "invalid_samples", 422);
  }
  const config = await getConnectyHubVoiceConfig();
  // The free catalog read confirms the wallet with the same credential snapshot.
  await listConnectyHubVoiceModels(config);
  const fingerprints = await Promise.all(input.files.map(async file => ({ type: file.type, hash: createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex") })));
  const saved = await claimVoiceOperation({ operationId: input.operationId, body: JSON.stringify({ name, consent_accepted: true, remove_background_noise: false, files: fingerprints }),
    projectId: config.projectId.value, billingOrganizationId: config.billingOrganizationId.value, modelId: "instant_voice_clone", voiceId: "new-private-clone" });
  let generationId = saved.generation_id;
  let credits = saved.charged_credits;
  let recorded = false;
  try {
    const form = new FormData();
    form.set("name", name); form.set("consent_accepted", "true"); form.set("remove_background_noise", "false");
    input.files.forEach(file => form.append("files", file, file.name));
    const payload = await (await fetchConnectyHubVoice("/voices", { body: form, operationId: input.operationId, timeoutMs: 100_000, config })).json();
    const clone = payload.clone;
    generationId = payload.generation?.id || clone?.generation_id || generationId;
    if (!generationId || !/^[a-f0-9-]{36}$/i.test(generationId)) throw new ConnectyHubVoiceError("Clone aguarda recibo. Consulte a mesma operacao; nao crie outro clone.", "clone_receipt_pending", 409);
    const generation = payload.generation || await (await fetchConnectyHubVoice(`/generations/${generationId}`, { config })).json();
    if (generation.project_id !== config.projectId.value || generation.billing_organization_id !== config.billingOrganizationId.value ||
        generation.operation !== "voice_clone" || !Number.isFinite(generation.usage?.credits) || generation.usage.credits < 0 ||
        (clone && clone.project_id !== config.projectId.value)) throw new ConnectyHubVoiceError("Recibo de clonagem divergente da conta Betel.", "receipt_mismatch", 502, generationId);
    credits = generation.usage.credits;
    await recordVoiceReceipt(input.operationId, { generation_id: generationId, status: generation.status === "completed" ? "completed" : generation.status === "failed" ? "failed" : "uncertain", charged_credits: credits, audio_expires_at: null });
    recorded = true;
    if (generation.status !== "completed" || !clone || !["ready", "verification_required"].includes(clone.status) || typeof clone.voice_id !== "string" || !clone.voice_id) {
      throw new ConnectyHubVoiceError("Clonagem ainda nao disponivel. Consulte a mesma operacao sem criar outro clone.", "clone_pending", 409, generationId);
    }
    await saveConnectyHubVoiceSelection(clone.voice_id);
    return { voiceId: clone.voice_id, requiresVerification: clone.status === "verification_required", generationId, chargedCredits: credits };
  } catch (error) {
    if (!recorded && saved.status !== "completed") {
      generationId ||= error instanceof ConnectyHubVoiceError && /^[a-f0-9-]{36}$/i.test(error.generationId || "") ? error.generationId! : null;
      await recordVoiceReceipt(input.operationId, { generation_id: generationId, status: "uncertain", charged_credits: credits, audio_expires_at: null });
    }
    throw error;
  }
}
