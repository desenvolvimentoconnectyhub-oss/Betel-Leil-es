import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const ENV_FALLBACKS: Record<string, string[]> = {
  openai_api_key: ["OPENAI_API_KEY"],
};

export function normalizeGeminiModel(model?: string | null) {
  return String(model || "").trim().replace(/^models\//, "");
}

function normalizeConfigValue(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function getEnvFallback(key: string) {
  const envKeys = ENV_FALLBACKS[key] || [key.toUpperCase()];

  for (const envKey of envKeys) {
    const value = normalizeConfigValue(process.env[envKey]);
    if (value) return value;
  }

  return null;
}

export async function getAIConfig(key: string) {
  const supabase = getSupabaseAdminClient();

  if (supabase) {
    try {
      const { data } = await supabase
        .from("app_config")
        .select("value")
        .eq("key", key)
        .maybeSingle();

      const value = normalizeConfigValue(data?.value);
      if (value) return value;
    } catch {
      // The Betel schema may not exist yet during first-run maintenance.
    }
  }

  return getEnvFallback(key);
}

export async function getGeminiApiKey() {
  const key = await getAIConfig("connectyhub_llm_api_key");
  return key?.startsWith("chy_ai_") ? key : null;
}

export async function getGeminiModel() {
  return normalizeGeminiModel(await getAIConfig("connectyhub_llm_model")) || "flash-3.5";
}

export async function getActiveAIProvider() {
  return "connectyhub";
}
