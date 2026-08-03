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

export async function resolveWhatsAppVoiceResponse(input: {
  config: WillianAgentConfig;
  generatedText: string;
  inboundMessageType?: string;
  inboundMimeType?: string;
  seed?: string;
  forceAudio?: boolean;
  source?: WhatsAppVoiceResponseSource;
  maxAudioChars?: number;
}): Promise<WhatsAppVoiceDecision> {
  const { config } = input;
  const behavior = config.behavior;
  const generatedText = cleanString(input.generatedText);
  const maxAudioChars = Math.max(160, Math.min(input.maxAudioChars || 900, 1800));
  const modelId = cleanString(behavior.audioModelId, "eleven_multilingual_v2");

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
  if (generatedText.length > maxAudioChars) {
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
  if (
    behavior.conversationMode === "mirror" &&
    isWhatsAppAudioMessage(input.inboundMessageType || "", input.inboundMimeType || "")
  ) {
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
