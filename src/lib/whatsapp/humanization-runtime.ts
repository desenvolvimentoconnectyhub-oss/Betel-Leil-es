import type {
  WhatsAppAgentChatPresence,
  WhatsAppAgentSendOptions,
} from "@/lib/communication/connectyhub-client";
import type { WillianAgentConfig } from "@/lib/communication/willian-types";

type HumanizedMode = "text" | "audio";

export type WhatsAppHumanizedPartPlan = {
  index: number;
  text: string;
  presence: WhatsAppAgentChatPresence;
  presenceDelayMs: number;
  sendOptions: WhatsAppAgentSendOptions;
};

export type WhatsAppHumanizationPlan = {
  enabled: boolean;
  mode: HumanizedMode;
  setAvailable: boolean;
  parts: WhatsAppHumanizedPartPlan[];
  summary: {
    readDelayMs: number;
    firstDelayMs: number;
    finalDelayMs: number;
    presenceMode: string;
    reason: string;
  };
};

const MAX_PROVIDER_DELAY_MS = 300000;
const MAX_TEXT_TYPING_MS = 45000;
const MAX_AUDIO_RECORDING_MS = 70000;

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function secondsToMs(value: number) {
  return Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 1000));
}

function deterministicRatio(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function jitter(value: number, seed: string, strength = 0.22) {
  if (value <= 0) return 0;
  const ratio = deterministicRatio(seed);
  const multiplier = 1 - strength / 2 + ratio * strength;
  return Math.round(value * multiplier);
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function readDelayMs(config: WillianAgentConfig, inboundText: string, seed: string) {
  if (!config.behavior.viewDelay) return 0;

  const min = secondsToMs(config.behavior.minReadSeconds);
  const max = Math.max(min, secondsToMs(config.behavior.maxReadSeconds));
  const estimated = Math.ceil(clamp(inboundText.length / 32, 1, 90)) * 1000;
  return jitter(clamp(estimated, min, max || 12000), `${seed}:read`, 0.25);
}

function baseResponseDelayMs(config: WillianAgentConfig, index: number, seed: string) {
  if (index > 0) {
    const configured = secondsToMs(config.behavior.textFollowupDelaySeconds);
    const fallback = config.behavior.composingPause ? 2600 : 1400;
    return jitter(configured || fallback, `${seed}:part:${index}:pause`, 0.35);
  }

  const configured = secondsToMs(config.behavior.responseDelaySeconds);
  const fallback = config.behavior.smartTiming ? 4500 : 1800;
  return jitter(configured || fallback, `${seed}:first-response`, 0.3);
}

function textTypingDelayMs(config: WillianAgentConfig, text: string, index: number, seed: string) {
  const configured = secondsToMs(config.behavior.typingDelaySeconds);
  const words = Math.max(1, wordCount(text));
  const rhythmWpm = clamp(config.behavior.rhythmWpm, 20, 120);
  const byRhythm = config.behavior.rhythmWpmEnabled ? (words / rhythmWpm) * 60000 : 0;
  const fallback = Math.max(1800, Math.min(6500, text.length * 18));
  const base = Math.max(configured, byRhythm, fallback);
  const capped = clamp(base, index === 0 ? 1800 : 1300, MAX_TEXT_TYPING_MS);
  return jitter(capped, `${seed}:typing:${index}`, config.behavior.typingVariation ? 0.36 : 0.12);
}

function audioRecordingDelayMs(config: WillianAgentConfig, text: string, seed: string) {
  const configured = secondsToMs(config.behavior.audioDelaySeconds);
  const words = Math.max(1, wordCount(text));
  const spoken = clamp((words / 120) * 60000, 5500, MAX_AUDIO_RECORDING_MS);
  const base = Math.max(configured, spoken);
  return jitter(base, `${seed}:audio-recording`, 0.24);
}

function isHumanizationEnabled(config: WillianAgentConfig) {
  const behavior = config.behavior;
  return Boolean(
    behavior.humanizedLanguage ||
      behavior.typingVariation ||
      behavior.composingPause ||
      behavior.viewDelay ||
      behavior.smartTiming ||
      behavior.rhythmWpmEnabled ||
      behavior.spontaneousAudio
  );
}

export function buildWhatsAppHumanizationPlan(input: {
  config: WillianAgentConfig;
  inboundText: string;
  replyParts: string[];
  mode: HumanizedMode;
  seed: string;
}): WhatsAppHumanizationPlan {
  const parts = input.replyParts.map((part) => part.trim()).filter(Boolean);
  const enabled = isHumanizationEnabled(input.config);
  const readDelay = enabled ? readDelayMs(input.config, input.inboundText, input.seed) : 0;
  const setAvailable =
    input.config.behavior.presenceMode === "natural" ||
    input.config.behavior.presenceMode === "always_online";
  let accumulatedDelay = 0;

  const plannedParts = parts.map((text, index): WhatsAppHumanizedPartPlan => {
    const baseDelay = enabled ? baseResponseDelayMs(input.config, index, input.seed) : 0;
    const activeDelay = enabled
      ? input.mode === "audio"
        ? audioRecordingDelayMs(input.config, text, input.seed)
        : textTypingDelayMs(input.config, text, index, input.seed)
      : 0;

    accumulatedDelay += (index === 0 ? readDelay : 0) + baseDelay + activeDelay;
    const delayMs = clamp(accumulatedDelay, 0, MAX_PROVIDER_DELAY_MS);

    return {
      index,
      text,
      presence: input.mode === "audio" ? "recording" : "composing",
      presenceDelayMs: delayMs,
      sendOptions: {
        delayMs,
        readChat: true,
        readMessages: input.config.behavior.viewDelay,
      },
    };
  });

  return {
    enabled,
    mode: input.mode,
    setAvailable,
    parts: plannedParts,
    summary: {
      readDelayMs: readDelay,
      firstDelayMs: plannedParts[0]?.sendOptions.delayMs || 0,
      finalDelayMs: plannedParts.at(-1)?.sendOptions.delayMs || 0,
      presenceMode: input.config.behavior.presenceMode,
      reason: enabled ? "behavior_humanization_enabled" : "behavior_humanization_disabled",
    },
  };
}
