import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WILLIAN_GLOBAL_PROMPT } from "./willian-types";
import {
  DEFAULT_WHATSAPP_GLOBAL_BEHAVIOR_CONFIG,
  normalizeWhatsAppGlobalBehaviorConfig,
  type WhatsAppGlobalBehaviorConfig,
} from "./whatsapp-global-behavior-types";

const WHATSAPP_GLOBAL_BEHAVIOR_CONFIG_KEY = "BETEL_WHATSAPP_GLOBAL_BEHAVIOR";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isDefaultLegacyGlobalPrompt(value: string) {
  return normalizeText(value) === normalizeText(DEFAULT_WILLIAN_GLOBAL_PROMPT);
}

export async function getWhatsAppGlobalBehaviorConfig(): Promise<WhatsAppGlobalBehaviorConfig> {
  const supabase = getSupabaseAdminClient();
  const fallback = normalizeWhatsAppGlobalBehaviorConfig(DEFAULT_WHATSAPP_GLOBAL_BEHAVIOR_CONFIG);

  if (!supabase) return fallback;

  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", WHATSAPP_GLOBAL_BEHAVIOR_CONFIG_KEY)
    .maybeSingle();

  if (!data?.value || typeof data.value !== "string") return fallback;

  try {
    return normalizeWhatsAppGlobalBehaviorConfig(JSON.parse(data.value));
  } catch {
    return fallback;
  }
}

export async function saveWhatsAppGlobalBehaviorConfig(input: unknown) {
  const supabase = getSupabaseAdminClient();
  const config = normalizeWhatsAppGlobalBehaviorConfig({
    ...normalizeWhatsAppGlobalBehaviorConfig(input),
    updatedAt: new Date().toISOString(),
  });

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Salvamento real exige service role.",
      config,
    };
  }

  const { error } = await supabase.from("app_config").upsert(
    {
      key: WHATSAPP_GLOBAL_BEHAVIOR_CONFIG_KEY,
      value: JSON.stringify(config),
      description: "Regra mae global dos agentes WhatsApp da Betel.",
      is_secret: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message, config };

  return { ok: true, config };
}

export function buildWhatsAppGlobalRuntimePrompt(config: WhatsAppGlobalBehaviorConfig, agentGlobalPrompt?: string) {
  if (!config.active) return cleanString(agentGlobalPrompt, DEFAULT_WILLIAN_GLOBAL_PROMPT);

  const customAgentGlobalPrompt = cleanString(agentGlobalPrompt);
  const shouldAppendAgentGlobalPrompt =
    customAgentGlobalPrompt && !isDefaultLegacyGlobalPrompt(customAgentGlobalPrompt);

  return [
    "CAMADA GLOBAL DO SISTEMA WHATSAPP",
    config.platformPrompt,
    "",
    "CAMADA GLOBAL DA BETEL",
    config.companyPrompt,
    "",
    "REGRAS OPERACIONAIS GOVERNADAS PELO SISTEMA",
    config.actionRules,
    shouldAppendAgentGlobalPrompt
      ? ["", "COMPLEMENTO GLOBAL LEGADO/ESPECIFICO DO AGENTE", customAgentGlobalPrompt].join("\n")
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
