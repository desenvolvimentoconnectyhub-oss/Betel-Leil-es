import "server-only";

import { sendWhatsAppAgentReply } from "@/lib/communication/connectyhub-client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

export type WhatsAppManualReplyResult = {
  ok: boolean;
  conversationId: string;
  leadId: string;
  agentKey: string;
  providerStatus: string;
  error?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function clampText(value: string, limit = 2200) {
  const clean = value.trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 3)}...`;
}

async function insertRuntimeEvent(input: {
  agentKey: string;
  status: string;
  message: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-HUMAN-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey || null,
    event_type: "whatsapp_human_reply",
    status: input.status,
    provider: "connectyhub",
    model: "operator-panel",
    attempt: 1,
    message: input.message,
    payload: input.payload,
  });
}

export async function sendWhatsAppManualReply(input: {
  conversationId: string;
  leadId?: string;
  agentKey?: string;
  text: string;
  operatorLabel?: string;
}): Promise<WhatsAppManualReplyResult> {
  const supabase = getSupabaseAdminClient();
  const conversationId = cleanString(input.conversationId);
  const text = clampText(input.text);
  const operatorLabel = cleanString(input.operatorLabel, "Operador Betel");

  if (!supabase) {
    return {
      ok: false,
      conversationId,
      leadId: cleanString(input.leadId),
      agentKey: cleanString(input.agentKey, "multichannel-dispatch"),
      providerStatus: "missing_supabase_admin",
      error: "Supabase admin nao configurado.",
    };
  }

  if (!conversationId || !text) {
    return {
      ok: false,
      conversationId,
      leadId: cleanString(input.leadId),
      agentKey: cleanString(input.agentKey, "multichannel-dispatch"),
      providerStatus: "invalid_payload",
      error: "Conversa e mensagem sao obrigatorias.",
    };
  }

  const { data: conversationData, error: conversationError } = await supabase
    .from("whatsapp_conversations")
    .select("*")
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError || !conversationData) {
    return {
      ok: false,
      conversationId,
      leadId: cleanString(input.leadId),
      agentKey: cleanString(input.agentKey, "multichannel-dispatch"),
      providerStatus: "conversation_not_found",
      error: conversationError?.message || "Conversa nao localizada.",
    };
  }

  const conversation = asRecord(conversationData);
  const leadId = cleanString(input.leadId, cleanString(conversation.lead_id));
  const agentKey = cleanString(input.agentKey, cleanString(conversation.agent_key, "multichannel-dispatch"));
  const instanceId = cleanString(conversation.instance_id);

  const [leadResult, instanceResult] = await Promise.all([
    supabase.from("whatsapp_leads").select("*").eq("id", leadId).maybeSingle(),
    instanceId
      ? supabase.from("whatsapp_instances").select("provider_instance_id").eq("id", instanceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const lead = asRecord(leadResult.data);
  const providerInstanceId = cleanString(asRecord(instanceResult.data).provider_instance_id);
  const phone = cleanString(lead.phone);

  if (leadResult.error || instanceResult.error || !phone) {
    const error = leadResult.error?.message || instanceResult.error?.message || "Lead sem telefone.";
    return {
      ok: false,
      conversationId,
      leadId,
      agentKey,
      providerStatus: "lead_or_instance_error",
      error,
    };
  }

  const trackId = `wa-human-${conversationId}-${Date.now().toString(36)}`;
  const delivery = await sendWhatsAppAgentReply({
    agentKey,
    instanceId: providerInstanceId,
    number: phone,
    text,
    trackId,
  });
  const now = new Date().toISOString();

  await supabase.from("whatsapp_conversation_messages").insert({
    conversation_id: conversationId,
    lead_id: leadId,
    instance_id: instanceId || null,
    direction: "outbound",
    author_type: "human",
    author_label: operatorLabel,
    message_type: "text",
    text,
    provider_message_id: delivery.externalDeliveryId || null,
    payload: {
      source: "admin_whatsapp_panel",
      trackId,
      delivery,
    },
  });

  await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .update({
        human_intervention_active: true,
        assigned_to_label: operatorLabel,
        last_human_message_at: now,
        last_message_at: now,
        last_message_preview: text.slice(0, 180),
        updated_at: now,
      })
      .eq("id", conversationId),
    supabase
      .from("whatsapp_leads")
      .update({
        human_intervention_active: true,
        last_message_at: now,
        status: "human_handoff",
        updated_at: now,
      })
      .eq("id", leadId),
  ]);

  await insertRuntimeEvent({
    agentKey,
    status: delivery.providerStatus,
    message: delivery.ok ? "Mensagem humana enviada pelo painel WhatsApp." : "Tentativa de mensagem humana registrada.",
    payload: { conversationId, leadId, trackId, delivery },
  });

  return {
    ok: delivery.ok,
    conversationId,
    leadId,
    agentKey,
    providerStatus: delivery.providerStatus,
    error: delivery.errorMessage,
  };
}
