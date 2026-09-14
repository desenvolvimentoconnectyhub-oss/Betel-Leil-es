export type VoiceSynthesisInput = {
  operationId: string; voiceId?: string; text: string; modelId?: string; maxChars?: number; timeoutMs?: number;
};

// Public ConnectyHub VoiceInput schema. Keep the existing approved voice settings.
export function buildVoiceRequest(input: VoiceSynthesisInput, defaults: { voiceId: string; modelId: string }) {
  const voiceId = (input.voiceId || defaults.voiceId).trim();
  const modelId = (input.modelId || defaults.modelId).trim();
  const text = input.text.replace(/\s+/g, " ").trim();
  const limit = Math.max(1, Math.min(input.maxChars || 2500, 4800));
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(voiceId) || voiceId === "clone-willian") throw new Error("Selecione uma voz do catalogo ConnectyHub antes de gerar audio.");
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(modelId)) throw new Error("Selecione um modelo de Voz valido.");
  if (!text || text.length > limit) throw new Error(`O audio deve conter entre 1 e ${limit} caracteres. Divida a resposta antes de gerar.`);
  return { text, voice_id: voiceId, model_id: modelId, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } };
}
