import "server-only";

import { createHash } from "node:crypto";
import {
  sendWhatsAppAgentMediaReply,
  type ConnectyHubDeliveryResult,
  type WhatsAppAgentSendOptions,
} from "@/lib/communication/connectyhub-client";
import type { WillianAgentConfig } from "@/lib/communication/willian-types";
import { getElevenLabsConfig, synthesizeElevenLabsPreview } from "@/lib/voice/elevenlabs";

export type WhatsAppVoiceResponseSource = "runtime" | "followup";

export type WhatsAppVoiceDecision = {
  mode: "text" | "audio";
  audioRequested: boolean;
  reason: string;
  fallbackReason?: string;
  voiceId?: string;
  modelId?: string;
  maxAudioChars: number;
};

export type WhatsAppVoiceDeliveryResult = ConnectyHubDeliveryResult & {
  voiceId?: string;
  modelId?: string;
  contentType?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function deterministicRatio(seed: string) {
  const hash = createHash("sha256").update(seed || "betel-whatsapp-voice").digest("hex").slice(0, 8);
  return Number.parseInt(hash, 16) / 0xffffffff;
}

function configuredVoiceId(config: WillianAgentConfig, fallback = "") {
  const voiceId = cleanString(config.behavior.selectedVoiceId);
  return voiceId === "clone-willian" ? cleanString(fallback) : voiceId;
}

function isUnconfirmedDeliveryError(error: unknown) {
  const message = (error instanceof Error ? `${error.name} ${error.message}` : String(error || "")).toLowerCase();
  return (
    message.includes("abort") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("network")
  );
}

async function resolveConfiguredVoiceId(config: WillianAgentConfig) {
  const selectedVoiceId = configuredVoiceId(config);
  if (selectedVoiceId) return selectedVoiceId;

  try {
    const elevenLabsConfig = await getElevenLabsConfig();
    return configuredVoiceId(config, elevenLabsConfig.willianVoiceId.value);
  } catch {
    return "";
  }
}

export function isWhatsAppAudioMessage(messageType: string, mimeType = "") {
  const type = `${messageType} ${mimeType}`.toLowerCase();
  return type.includes("audio") || type.includes("ptt") || type.includes("myaudio") || type.includes("ogg");
}

function normalizeVoiceRequestText(text: string) {
  return cleanString(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function leadRequestedWhatsAppAudioReply(text: string) {
  const normalized = normalizeVoiceRequestText(text);
  if (!normalized || !/\b(audio|voz|falado|gravacao)\b/.test(normalized)) return false;
  if (/\b(nao|sem)\s+(me\s+)?(manda|envia|responde|grave|grava|faca)\b.{0,50}\b(audio|voz)\b/.test(normalized)) {
    return false;
  }

  return [
    /\b(me\s+)?(manda|mande|envia|envie|responde|responda|explica|explique|fala|grave|grava|gravar)\b.{0,80}\b(audio|voz)\b/,
    /\b(pode|consegue|da\s+pra|tem\s+como)\b.{0,80}\b(mandar|enviar|responder|explicar|falar|gravar)\b.{0,80}\b(audio|voz)\b/,
    /\b(quero|queria|prefiro|preciso|gostaria)\b.{0,80}\b(audio|voz)\b/,
    /\b(em|por|via)\s+(audio|voz)\b/,
    /\b(nao\s+consigo|nao\s+vou\s+conseguir|dificil)\b.{0,80}\bler\b.{0,80}\b(audio|ouvir|escutar)\b/,
  ].some((pattern) => pattern.test(normalized));
}

export async function resolveWhatsAppVoiceResponse(input: {
  config: WillianAgentConfig;
  generatedText: string;
  inboundText?: string;
  inboundMessageType?: string;
  inboundMimeType?: string;
  seed?: string;
  forceAudio?: boolean;
  source?: WhatsAppVoiceResponseSource;
  maxAudioChars?: number;
  allowSplitAudio?: boolean;
  maxAudioParts?: number;
}): Promise<WhatsAppVoiceDecision> {
  const { config } = input;
  const behavior = config.behavior;
  const generatedText = cleanString(input.generatedText);
  const maxAudioChars = Math.max(1200, Math.min(input.maxAudioChars || 2000, 2000));
  const maxAudioParts = Math.max(1, Math.min(input.maxAudioParts || 1, 4));
  const modelId = cleanString(behavior.audioModelId, "eleven_multilingual_v2");
  const leadAudioRequested = leadRequestedWhatsAppAudioReply(input.inboundText || "");
  const inboundIsAudio = isWhatsAppAudioMessage(input.inboundMessageType || "", input.inboundMimeType || "");

  const textDecision = (reason: string, fallbackReason?: string): WhatsAppVoiceDecision => ({
    mode: "text",
    audioRequested: false,
    reason,
    fallbackReason,
    maxAudioChars,
  });

  if (!generatedText) return textDecision("empty_reply");
  if (behavior.conversationMode === "always_text" && !input.forceAudio) return textDecision("conversation_mode_text");
  if (!behavior.voiceCloneEnabled) return textDecision("voice_clone_disabled");
  if (!behavior.voiceCloneConsent) return textDecision("missing_voice_consent");
  if (behavior.voiceCloneStatus === "inactive") return textDecision("voice_clone_inactive");
  const voiceId = await resolveConfiguredVoiceId(config);
  if (!voiceId) return textDecision("missing_voice_id", "Selecione ou clone uma voz antes de usar audio.");
  if (generatedText.length > maxAudioChars && (!input.allowSplitAudio || generatedText.length > maxAudioChars * maxAudioParts)) {
    return textDecision("reply_too_long_for_audio", `Resposta com ${generatedText.length} caracteres.`);
  }

  const audioDecision = (reason: string): WhatsAppVoiceDecision => ({
    mode: "audio",
    audioRequested: true,
    reason,
    voiceId,
    modelId,
    maxAudioChars,
  });

  if (input.forceAudio) return audioDecision("forced_audio");
  if (behavior.conversationMode === "always_audio") return audioDecision("conversation_mode_audio");
  if (leadAudioRequested) return audioDecision("lead_requested_audio");
  if (behavior.conversationMode === "mirror" && inboundIsAudio) {
    const audioToTextPct = clampPercent(behavior.audioToTextChancePct);
    if (!leadAudioRequested && audioToTextPct > 0) {
      const ratio = deterministicRatio(`${input.source || "runtime"}:${input.seed || generatedText}:${voiceId}:audio-to-text`);
      if (ratio * 100 < audioToTextPct) return textDecision(`mirror_audio_to_text_${audioToTextPct}pct`);
    }

    return audioDecision("mirror_inbound_audio");
  }

  if (behavior.spontaneousAudio && clampPercent(behavior.audioChancePct) > 0) {
    const pct = clampPercent(behavior.audioChancePct);
    const ratio = deterministicRatio(`${input.source || "runtime"}:${input.seed || generatedText}:${voiceId}`);
    if (ratio * 100 < pct) return audioDecision(`spontaneous_audio_${pct}pct`);
  }

  return textDecision("text_preferred");
}

export async function sendWhatsAppAgentVoiceReply(input: {
  agentKey: string;
  instanceId?: string;
  number: string;
  text: string;
  trackId: string;
  decision: WhatsAppVoiceDecision;
  sendOptions?: WhatsAppAgentSendOptions;
  synthesisTimeoutMs?: number;
}): Promise<WhatsAppVoiceDeliveryResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();

  if (input.decision.mode !== "audio" || !input.decision.voiceId) {
    return {
      ok: false,
      providerStatus: "audio_not_requested",
      endpointConfigured: false,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: input.decision.fallbackReason || input.decision.reason,
    };
  }

  let audio: Awaited<ReturnType<typeof synthesizeElevenLabsPreview>>;

  try {
    audio = await synthesizeElevenLabsPreview({
      voiceId: input.decision.voiceId,
      modelId: input.decision.modelId,
      text: input.text,
      maxChars: input.decision.maxAudioChars,
      timeoutMs: input.synthesisTimeoutMs,
    });
  } catch (error) {
    return {
      ok: false,
      providerStatus: "audio_synthesis_failed",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Falha ao gerar audio.",
      voiceId: input.decision.voiceId,
      modelId: input.decision.modelId,
    };
  }

  try {
    const delivery = await sendWhatsAppAgentMediaReply({
      agentKey: input.agentKey,
      instanceId: input.instanceId,
      number: input.number,
      type: "myaudio",
      file: `data:${audio.contentType || "audio/mpeg"};base64,${audio.audioBase64}`,
      trackId: input.trackId,
      sendOptions: input.sendOptions,
    });

    return {
      ok: true,
      providerStatus: "connectyhub_audio_accepted",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      externalDeliveryId: delivery.externalDeliveryId,
      responsePreview: JSON.stringify(delivery.payload).slice(0, 500),
      voiceId: audio.voiceId,
      modelId: audio.modelId,
      contentType: audio.contentType,
    };
  } catch (error) {
    const deliveryUnconfirmed = isUnconfirmedDeliveryError(error);
    return {
      ok: false,
      providerStatus: deliveryUnconfirmed ? "audio_delivery_unconfirmed" : "audio_delivery_failed",
      endpointConfigured: true,
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      deliveryUnconfirmed,
      errorMessage: error instanceof Error ? error.message : "Falha ao enviar audio.",
      voiceId: input.decision.voiceId,
      modelId: input.decision.modelId,
      contentType: audio.contentType,
    };
  }
}
