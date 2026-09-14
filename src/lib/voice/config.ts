import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ConfigValue = { value: string; source: "app_config" | "env" | "legacy" | "default" | "missing" };
export const CONNECTYHUB_VOICE_ORIGIN = "https://www.connectyhub.com.br";
const keys = [
  "connectyhub_voice_api_key", "connectyhub_voice_project_id", "connectyhub_voice_billing_organization_id",
  "connectyhub_voice_default_model_id", "connectyhub_voice_default_voice_id", "connectyhub_voice_agent_voice_id",
  "connectyhub_llm_project_id", "connectyhub_llm_billing_organization_id",
  "elevenlabs_default_model_id", "elevenlabs_default_voice_id", "elevenlabs_willian_voice_id",
];
const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function getConnectyHubVoiceConfig() {
  const db = getSupabaseAdminClient();
  const values = new Map<string, string>();
  if (db) {
    const { data, error } = await db.from("app_config").select("key,value").in("key", keys.flatMap(key => [key, key.toUpperCase()]));
    if (error) throw new Error("Nao foi possivel consultar a configuracao ConnectyHub Voz.");
    for (const row of data || []) if (clean(row.value)) values.set(row.key.toLowerCase(), clean(row.value));
  }
  const read = (key: string): ConfigValue => {
    const saved = values.get(key);
    if (saved) return { value: saved, source: "app_config" };
    const env = clean(process.env[key.toUpperCase()]);
    return { value: env, source: env ? "env" : "missing" };
  };
  const prefer = (key: string, fallbackKey?: string, fallback = ""): ConfigValue => {
    const current = read(key);
    if (current.value) return current;
    const previous = fallbackKey ? read(fallbackKey) : undefined;
    if (previous?.value) return { value: previous.value, source: fallbackKey?.startsWith("elevenlabs_") ? "legacy" : previous.source };
    return { value: fallback, source: fallback ? "default" : "missing" };
  };
  return {
    // Voice credentials are independent. Never reuse WhatsApp or provider secrets.
    apiKey: read("connectyhub_voice_api_key"),
    projectId: prefer("connectyhub_voice_project_id", "connectyhub_llm_project_id"),
    billingOrganizationId: prefer("connectyhub_voice_billing_organization_id", "connectyhub_llm_billing_organization_id"),
    defaultModelId: prefer("connectyhub_voice_default_model_id", "elevenlabs_default_model_id", "eleven_multilingual_v2"),
    defaultVoiceId: prefer("connectyhub_voice_default_voice_id", "elevenlabs_default_voice_id"),
    willianVoiceId: prefer("connectyhub_voice_agent_voice_id", "elevenlabs_willian_voice_id"),
  };
}

export async function saveConnectyHubVoiceSelection(voiceId: string) {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error("Configuracao de voz indisponivel.");
  const { error } = await db.from("app_config").upsert({
    key: "connectyhub_voice_agent_voice_id", value: voiceId,
    description: "Voz selecionada no catalogo publico ConnectyHub da Betel.",
    is_secret: false, updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw new Error("Nao foi possivel salvar a voz selecionada.");
}
