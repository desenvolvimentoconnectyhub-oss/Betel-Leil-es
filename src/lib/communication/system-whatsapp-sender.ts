import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

export const SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY = "BETEL_SYSTEM_WHATSAPP_INSTANCE_ID";
export const SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY = "BETEL_SYSTEM_WHATSAPP_AGENT_KEY";

export type SystemWhatsAppSenderOption = {
  id: string;
  agentKey: string;
  instanceName: string;
  phone: string;
  status: string;
  connected: boolean;
  providerInstanceId: string;
  updatedAt: string;
};

export type SystemWhatsAppSenderConfig = {
  instanceId: string;
  agentKey: string;
  selected?: SystemWhatsAppSenderOption;
};

export type ResolvedSystemWhatsAppSender = {
  configured: boolean;
  localInstanceId: string;
  agentKey: string;
  providerInstanceId: string;
  label: string;
  error?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isConnected(row: DbRow) {
  const status = cleanString(row.status).toLowerCase();
  if (["deleted", "archived", "inactive", "disabled"].includes(status)) return false;
  return ["connected", "open", "online", "ready", "logged", "loggedin"].includes(status) || Boolean(row.connected_at);
}

function normalizeSender(row: DbRow): SystemWhatsAppSenderOption {
  return {
    id: cleanString(row.id),
    agentKey: cleanString(row.agent_key),
    instanceName: cleanString(row.instance_name),
    phone: cleanString(row.phone),
    status: cleanString(row.status, "draft"),
    connected: isConnected(row),
    providerInstanceId: cleanString(row.provider_instance_id),
    updatedAt: cleanString(row.updated_at),
  };
}

function senderLabel(sender?: Pick<SystemWhatsAppSenderOption, "agentKey" | "instanceName" | "phone"> | null) {
  if (!sender) return "";
  const name = cleanString(sender.instanceName || sender.agentKey, "Agente WhatsApp");
  return sender.phone ? `${name} - ${sender.phone}` : name;
}

async function readConfigValues() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();

  const { data, error } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", [SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY, SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY]);

  if (error) return new Map<string, string>();
  return new Map(((data || []) as DbRow[]).map((row) => [cleanString(row.key), cleanString(row.value)]));
}

async function findSenderByIdOrProviderId(instanceId: string) {
  const supabase = getSupabaseAdminClient();
  const cleanId = cleanString(instanceId);
  if (!supabase || !cleanId) return null;

  const select = "id,agent_key,instance_name,phone,status,connected_at,provider_instance_id,updated_at";
  const byId = isUuidLike(cleanId)
    ? await supabase.from("whatsapp_instances").select(select).eq("id", cleanId).maybeSingle()
    : { data: null, error: null };

  if (byId.data && !byId.error) return normalizeSender(byId.data as DbRow);

  const { data } = await supabase
    .from("whatsapp_instances")
    .select(select)
    .eq("provider_instance_id", cleanId)
    .maybeSingle();

  return data ? normalizeSender(data as DbRow) : null;
}

async function findSenderByAgentKey(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  const cleanKey = cleanString(agentKey);
  if (!supabase || !cleanKey) return null;

  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id,agent_key,instance_name,phone,status,connected_at,provider_instance_id,updated_at")
    .eq("agent_key", cleanKey)
    .neq("status", "deleted")
    .not("provider_instance_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data ? normalizeSender(data as DbRow) : null;
}

export async function listSystemWhatsAppSenderOptions(): Promise<SystemWhatsAppSenderOption[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("id,agent_key,instance_name,phone,status,connected_at,provider_instance_id,updated_at")
    .neq("status", "deleted")
    .not("provider_instance_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) return [];
  return ((data || []) as DbRow[]).map(normalizeSender).filter((sender) => sender.id && sender.providerInstanceId);
}

export async function getSystemWhatsAppSenderConfig(): Promise<SystemWhatsAppSenderConfig> {
  const config = await readConfigValues();
  const instanceId = cleanString(config.get(SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY));
  const agentKey = cleanString(config.get(SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY));
  const selected = instanceId ? await findSenderByIdOrProviderId(instanceId) : agentKey ? await findSenderByAgentKey(agentKey) : null;

  return {
    instanceId,
    agentKey,
    selected: selected || undefined,
  };
}

export async function saveSystemWhatsAppSenderConfig(input: {
  instanceId: string;
  operatorLabel: string;
}): Promise<{ ok: boolean; error?: string; data?: SystemWhatsAppSenderConfig }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const instanceId = cleanString(input.instanceId);
  const operatorLabel = cleanString(input.operatorLabel, "Admin Betel");

  if (!instanceId) {
    const { error } = await supabase
      .from("app_config")
      .delete()
      .in("key", [SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY, SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY]);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { instanceId: "", agentKey: "" } };
  }

  const selected = await findSenderByIdOrProviderId(instanceId);
  if (!selected) return { ok: false, error: "Agente WhatsApp nao encontrado." };
  if (!selected.providerInstanceId) return { ok: false, error: "Agente WhatsApp sem instancia ConnectyHub vinculada." };
  if (!selected.connected) return { ok: false, error: "Selecione um agente WhatsApp conectado." };

  const { error } = await supabase.from("app_config").upsert(
    [
      {
        key: SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY,
        value: selected.id,
        description: `Instancia WhatsApp local que envia mensagens automaticas do sistema. Atualizado por ${operatorLabel}.`,
        is_secret: false,
      },
      {
        key: SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY,
        value: selected.agentKey,
        description: `Agente WhatsApp responsavel pelas mensagens automaticas do sistema. Atualizado por ${operatorLabel}.`,
        is_secret: false,
      },
    ],
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { instanceId: selected.id, agentKey: selected.agentKey, selected } };
}

export async function resolveSystemWhatsAppSender(input?: {
  senderInstanceId?: string;
  senderAgentKey?: string;
}): Promise<ResolvedSystemWhatsAppSender> {
  const explicitInstanceId = cleanString(input?.senderInstanceId);
  const explicitAgentKey = cleanString(input?.senderAgentKey);
  const config = explicitInstanceId || explicitAgentKey ? null : await readConfigValues();
  const configuredInstanceId = explicitInstanceId || cleanString(config?.get(SYSTEM_WHATSAPP_INSTANCE_ID_CONFIG_KEY));
  const configuredAgentKey = explicitAgentKey || cleanString(config?.get(SYSTEM_WHATSAPP_AGENT_KEY_CONFIG_KEY));
  const configured = Boolean(configuredInstanceId || configuredAgentKey);

  if (!configured) {
    return {
      configured: false,
      localInstanceId: "",
      agentKey: "",
      providerInstanceId: "",
      label: "",
    };
  }

  const selected = configuredInstanceId
    ? await findSenderByIdOrProviderId(configuredInstanceId)
    : await findSenderByAgentKey(configuredAgentKey);

  if (!selected) {
    return {
      configured: true,
      localInstanceId: configuredInstanceId,
      agentKey: configuredAgentKey,
      providerInstanceId: "",
      label: configuredAgentKey || configuredInstanceId,
      error: "Agente WhatsApp configurado como remetente do sistema nao foi encontrado.",
    };
  }

  if (!selected.providerInstanceId || !selected.connected) {
    return {
      configured: true,
      localInstanceId: selected.id,
      agentKey: selected.agentKey,
      providerInstanceId: "",
      label: senderLabel(selected),
      error: "Agente WhatsApp configurado como remetente do sistema nao esta conectado.",
    };
  }

  return {
    configured: true,
    localInstanceId: selected.id,
    agentKey: selected.agentKey,
    providerInstanceId: selected.providerInstanceId,
    label: senderLabel(selected),
  };
}
