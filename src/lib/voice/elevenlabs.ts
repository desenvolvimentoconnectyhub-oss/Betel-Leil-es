import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ConfigSource = "app_config" | "env" | "default" | "missing";

type ConfigValue = {
  value: string;
  source: ConfigSource;
};

export type ElevenLabsConfig = {
  apiKey: ConfigValue;
  baseUrl: ConfigValue;
  defaultModelId: ConfigValue;
  defaultVoiceId: ConfigValue;
  willianVoiceId: ConfigValue;
};

export type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
};

export type ElevenLabsSubscription = {
  tier: string;
  characterCount: number;
  characterLimit: number | null;
};

export type ElevenLabsVoiceCloneResult = {
  voiceId: string;
  requiresVerification: boolean;
};

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

const CONFIG_KEYS = [
  "elevenlabs_api_key",
  "elevenlabs_api_base_url",
  "elevenlabs_default_model_id",
  "elevenlabs_default_voice_id",
  "elevenlabs_willian_voice_id",
];

const ENV_FALLBACKS: Record<string, string[]> = {
  elevenlabs_api_key: ["ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"],
  elevenlabs_api_base_url: ["ELEVENLABS_API_BASE_URL", "ELEVEN_LABS_API_BASE_URL"],
  elevenlabs_default_model_id: ["ELEVENLABS_DEFAULT_MODEL_ID", "ELEVEN_LABS_DEFAULT_MODEL_ID"],
  elevenlabs_default_voice_id: ["ELEVENLABS_DEFAULT_VOICE_ID", "ELEVEN_LABS_DEFAULT_VOICE_ID"],
  elevenlabs_willian_voice_id: ["ELEVENLABS_WILLIAN_VOICE_ID", "ELEVEN_LABS_WILLIAN_VOICE_ID"],
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeBaseUrl(value: string) {
  const clean = cleanString(value).replace(/\/+$/, "");
  if (!clean) return "";
  return clean.includes("://") ? clean : `https://${clean}`;
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function configAliases(key: string) {
  const envKeys = ENV_FALLBACKS[key] || [key.toUpperCase()];
  return [...new Set([key, key.toLowerCase(), ...envKeys])];
}

async function readAppConfig(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  const values = new Map<string, string>();

  if (!supabase || keys.length === 0) return values;

  try {
    const { data } = await supabase
      .from("app_config")
      .select("key,value")
      .in("key", [...new Set(keys.flatMap(configAliases))]);

    for (const row of data || []) {
      const key = cleanString((row as Record<string, unknown>).key);
      const value = cleanString((row as Record<string, unknown>).value);
      if (key && value) values.set(key, value);
    }
  } catch {
    // app_config may not exist during first setup.
  }

  return values;
}

function getEnvValue(key: string) {
  for (const envKey of ENV_FALLBACKS[key] || [key.toUpperCase()]) {
    const value = cleanString(process.env[envKey]);
    if (value) return value;
  }
  return "";
}

function getConfigValue(
  key: string,
  appConfig: Map<string, string>,
  fallback = ""
): ConfigValue {
  for (const alias of configAliases(key)) {
    const value = cleanString(appConfig.get(alias));
    if (value) return { value, source: "app_config" };
  }

  const envValue = getEnvValue(key);
  if (envValue) return { value: envValue, source: "env" };
  if (fallback) return { value: fallback, source: "default" };
  return { value: "", source: "missing" };
}

export async function getElevenLabsConfig(): Promise<ElevenLabsConfig> {
  const appConfig = await readAppConfig(CONFIG_KEYS);

  return {
    apiKey: getConfigValue("elevenlabs_api_key", appConfig),
    baseUrl: {
      ...getConfigValue("elevenlabs_api_base_url", appConfig, DEFAULT_BASE_URL),
      value: normalizeBaseUrl(getConfigValue("elevenlabs_api_base_url", appConfig, DEFAULT_BASE_URL).value),
    },
    defaultModelId: getConfigValue("elevenlabs_default_model_id", appConfig, DEFAULT_MODEL_ID),
    defaultVoiceId: getConfigValue("elevenlabs_default_voice_id", appConfig),
    willianVoiceId: getConfigValue("elevenlabs_willian_voice_id", appConfig),
  };
}

export async function upsertElevenLabsConfigValue(key: string, value: string, secret = false) {
  const supabase = getSupabaseAdminClient();
  const cleanKey = cleanString(key).toLowerCase();
  const cleanValue = cleanString(value);

  if (!supabase || !cleanKey || !cleanValue) return;

  await supabase.from("app_config").upsert(
    {
      key: cleanKey,
      value: cleanValue,
      description: "Configuracao da integracao ElevenLabs para vozes IA.",
      is_secret: secret,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );
}

function requireElevenLabsConfig(config: ElevenLabsConfig) {
  if (!config.apiKey.value) {
    throw new Error("ELEVENLABS_API_KEY nao configurada.");
  }

  return {
    apiKey: config.apiKey.value,
    baseUrl: config.baseUrl.value || DEFAULT_BASE_URL,
  };
}

async function elevenLabsFetch(path: string, init: RequestInit = {}) {
  const config = await getElevenLabsConfig();
  const required = requireElevenLabsConfig(config);
  const headers = new Headers(init.headers);
  headers.set("xi-api-key", required.apiKey);

  const res = await fetch(`${required.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal || AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = cleanString(
      asRecord(asRecord(data).detail).message ||
        asRecord(data).message ||
        asRecord(data).error ||
        res.statusText
    );
    throw new Error(`ElevenLabs retornou ${res.status}${detail ? `: ${detail}` : "."}`);
  }

  return res;
}

export async function testElevenLabsConnection() {
  const res = await elevenLabsFetch("/v1/user/subscription");
  const data = asRecord(await res.json());

  return {
    tier: cleanString(data.tier, "plano ativo"),
    characterCount: normalizeNumber(data.character_count),
    characterLimit:
      data.character_limit === null || data.character_limit === undefined
        ? null
        : normalizeNumber(data.character_limit),
  } satisfies ElevenLabsSubscription;
}

function normalizeVoice(value: unknown): ElevenLabsVoice | null {
  const row = asRecord(value);
  const voiceId = cleanString(row.voice_id || row.voiceId);
  const name = cleanString(row.name);
  if (!voiceId || !name) return null;

  const labels = asRecord(row.labels);
  const normalizedLabels: Record<string, string> = {};
  for (const [key, labelValue] of Object.entries(labels)) {
    const cleanValue = cleanString(labelValue);
    if (cleanValue) normalizedLabels[key] = cleanValue;
  }

  return {
    voiceId,
    name,
    category: cleanString(row.category),
    description: cleanString(row.description),
    previewUrl: cleanString(row.preview_url || row.previewUrl),
    labels: normalizedLabels,
  };
}

export async function listElevenLabsVoices() {
  const res = await elevenLabsFetch("/v2/voices?page_size=100");
  const data = asRecord(await res.json());
  const voices = Array.isArray(data.voices) ? data.voices : [];

  return voices
    .map(normalizeVoice)
    .filter((voice): voice is ElevenLabsVoice => Boolean(voice));
}

export async function createElevenLabsVoiceClone(input: {
  name: string;
  description?: string;
  files: File[];
}) {
  const form = new FormData();
  form.set("name", cleanString(input.name, "Agente Betel"));

  const description = cleanString(input.description);
  if (description) form.set("description", description);

  form.set("labels", JSON.stringify({ project: "betel", agent: "willian", source: "agent" }));

  for (const file of input.files) {
    form.append("files[]", file, file.name || "willian-sample.mp3");
  }

  const res = await elevenLabsFetch("/v1/voices/add", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const data = asRecord(await res.json());
  const voiceId = cleanString(data.voice_id || data.voiceId);

  if (!voiceId) throw new Error("ElevenLabs nao retornou voice_id.");

  await upsertElevenLabsConfigValue("elevenlabs_willian_voice_id", voiceId);

  return {
    voiceId,
    requiresVerification: Boolean(data.requires_verification || data.requiresVerification),
  } satisfies ElevenLabsVoiceCloneResult;
}

export async function synthesizeElevenLabsPreview(input: {
  voiceId?: string;
  text?: string;
  modelId?: string;
}) {
  const config = await getElevenLabsConfig();
  const voiceId = cleanString(input.voiceId || config.willianVoiceId.value || config.defaultVoiceId.value);
  const modelId = cleanString(input.modelId || config.defaultModelId.value, DEFAULT_MODEL_ID);
  const text = cleanString(
    input.text,
    "Ola, aqui e a Betel. Estou validando a voz de atendimento."
  ).slice(0, 400);

  if (!voiceId) {
    throw new Error("Nenhum voice_id configurado para gerar audio.");
  }

  const res = await elevenLabsFetch(`/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: "POST",
    headers: {
      Accept: "audio/mpeg",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
        style: 0.2,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(45000),
  });

  const contentType = res.headers.get("content-type") || "audio/mpeg";
  const audioBase64 = Buffer.from(await res.arrayBuffer()).toString("base64");

  return {
    contentType,
    audioBase64,
    voiceId,
    modelId,
  };
}
