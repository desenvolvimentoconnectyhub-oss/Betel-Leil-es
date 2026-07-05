import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SECRET_CONFIG_KEYS = new Set([
  "next_public_supabase_anon_key",
  "supabase_service_role_key",
  "r2_access_key_id",
  "r2_secret_access_key",
  "gemini_api_key",
  "inngest_event_key",
  "inngest_signing_key",
  "connectyhub_api_token",
  "connectyhub_webhook_secret",
  "resend_api_key",
  "elevenlabs_api_key",
  "betel_datazap_api_key",
  "betel_fipezap_api_key",
  "betel_datajud_api_key",
  "betel_receitaws_api_key",
  "betel_big_data_api_key",
  "betel_registry_api_key",
  "betel_infosimples_api_key",
  "betel_serpro_api_key",
  "betel_dadosgov_api_token",
]);

const ENV_ALIASES: Record<string, string[]> = {
  elevenlabs_api_key: ["ELEVENLABS_API_KEY", "ELEVEN_LABS_API_KEY"],
  gemini_api_key: ["GEMINI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function envKeysFor(configKey: string) {
  return ENV_ALIASES[configKey] || [configKey.toUpperCase()];
}

function getEnvValue(configKey: string) {
  for (const envKey of envKeysFor(configKey)) {
    const value = cleanString(process.env[envKey]);
    if (value) return value;
  }
  return "";
}

async function getAppConfigValue(configKey: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return "";

  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", configKey)
    .maybeSingle();

  if (error) return "";

  return cleanString(data?.value);
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { key?: unknown };
    const configKey = cleanString(body.key).toLowerCase();

    if (!configKey) {
      return NextResponse.json(
        { success: false, message: "Credencial nao informada." },
        { status: 400 }
      );
    }

    if (!SECRET_CONFIG_KEYS.has(configKey)) {
      return NextResponse.json(
        { success: false, message: "Esta credencial nao pode ser revelada pela manutencao." },
        { status: 403 }
      );
    }

    const value = (await getAppConfigValue(configKey)) || getEnvValue(configKey);

    if (!value) {
      return NextResponse.json(
        { success: false, message: "Credencial ainda nao configurada." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, key: configKey, value });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao revelar credencial.",
      },
      { status: 500 }
    );
  }
}
