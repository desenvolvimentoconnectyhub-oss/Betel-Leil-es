import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

export type WhatsAppLeadAction =
  | "pause_ai"
  | "resume_ai"
  | "opt_out"
  | "clear_opt_out"
  | "cancel_followups"
  | "schedule_followup"
  | "review_good"
  | "review_bad"
  | "update_internal_context"
  | "update_crm_stage";

export type WhatsAppLeadActionResult = {
  ok: boolean;
  action: WhatsAppLeadAction;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function actionLabel(action: WhatsAppLeadAction) {
  const labels: Record<WhatsAppLeadAction, string> = {
    pause_ai: "Atendimento assumido por humano.",
    resume_ai: "IA retomada para esta conversa.",
    opt_out: "Lead marcado como opt-out.",
    clear_opt_out: "Opt-out removido do lead.",
    cancel_followups: "Follow-ups pendentes cancelados.",
    schedule_followup: "Follow-up manual preparado.",
    review_good: "Avaliacao positiva registrada.",
    review_bad: "Avaliacao critica registrada e conversa enviada para humano.",
    update_internal_context: "Contexto interno atualizado.",
    update_crm_stage: "Etapa do CRM atualizada.",
  };
  return labels[action];
}

type CrmStage = "entrada" | "qualificando" | "quente" | "handoff" | "convertido" | "perdido";

const crmStageSettings: Record<CrmStage, { status: string; classification: string; temperature: string; nextAction: string }> = {
  entrada: {
    status: "novo",
    classification: "entrada",
    temperature: "frio",
    nextAction: "Abrir conversa e coletar primeira necessidade do lead.",
  },
  qualificando: {
    status: "qualificando",
    classification: "qualificando",
    temperature: "morno",
    nextAction: "Coletar capital, regiao, objetivo e prazo, uma pergunta por vez.",
  },
  quente: {
    status: "qualificado",
    classification: "quente",
    temperature: "quente",
    nextAction: "Priorizar atendimento consultivo e apresentar proximo passo aderente.",
  },
  handoff: {
    status: "human_handoff",
    classification: "handoff_humano",
    temperature: "quente",
    nextAction: "Humano assumir a conversa e registrar decisao no CRM.",
  },
  convertido: {
    status: "convertido",
    classification: "cliente",
    temperature: "quente",
    nextAction: "Registrar conversao e encaminhar pos-atendimento operacional.",
  },
  perdido: {
    status: "perdido",
    classification: "perdido",
    temperature: "frio",
    nextAction: "Nao insistir; manter historico e motivo de perda.",
  },
};

function normalizeCrmStage(value: unknown): CrmStage | "" {
  const text = cleanString(value).toLowerCase();
  if (text in crmStageSettings) return text as CrmStage;
  return "";
}

function cleanStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  const text = cleanString(value);
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function insertRuntimeEvent(input: {
  agentKey: string;
  action: WhatsAppLeadAction;
  status: string;
  message: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-ACTION-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey || null,
    event_type: `whatsapp_lead_${input.action}`,
    status: input.status,
    provider: "connectyhub",
    model: "operator-panel",
    attempt: 1,
    message: input.message,
    payload: input.payload,
  });
}

async function resolveTargets(input: {
  leadId?: string;
  conversationId?: string;
  agentKey?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { error: "Supabase admin nao configurado." };

  let conversationId = cleanString(input.conversationId);
  let leadId = cleanString(input.leadId);
  let agentKey = cleanString(input.agentKey, "multichannel-dispatch");
  let conversation: DbRow = {};
  let lead: DbRow = {};

  if (conversationId) {
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("id", conversationId)
      .maybeSingle();
    if (error) return { error: error.message };
    conversation = asRecord(data);
    leadId = leadId || cleanString(conversation.lead_id);
    agentKey = cleanString(conversation.agent_key, agentKey);
  }

  if (!conversationId && leadId) {
    const { data, error } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("lead_id", leadId)
      .neq("status", "closed")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { error: error.message };
    conversation = asRecord(data);
    conversationId = cleanString(conversation.id);
    agentKey = cleanString(conversation.agent_key, agentKey);
  }

  if (leadId) {
    const { data, error } = await supabase.from("whatsapp_leads").select("*").eq("id", leadId).maybeSingle();
    if (error) return { error: error.message };
    lead = asRecord(data);
    agentKey = cleanString(lead.owner_agent_key, agentKey);
  }

  if (!leadId && !conversationId) return { error: "Lead ou conversa nao informado." };

  return { supabase, conversationId, leadId, agentKey, conversation, lead };
}

async function updateLeadProfile(input: {
  leadId: string;
  agentKey: string;
  stage: string;
  classification: string;
  nextAction: string;
  score: number;
  metadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.leadId) return;

  await supabase.from("whatsapp_lead_profiles").upsert(
    {
      lead_id: input.leadId,
      agent_key: input.agentKey || null,
      crm_stage: input.stage,
      classification: input.classification,
      lead_score: input.score,
      next_action: input.nextAction,
      last_contact_at: new Date().toISOString(),
      metadata: input.metadata,
    },
    { onConflict: "lead_id" }
  );
}

export async function runWhatsAppLeadAction(input: {
  action: WhatsAppLeadAction;
  leadId?: string;
  conversationId?: string;
  agentKey?: string;
  note?: string;
  internalNote?: string;
  internalTags?: unknown;
  assignedToLabel?: string;
  crmStage?: string;
  reviewedByLabel?: string;
  scheduledFor?: string;
}): Promise<WhatsAppLeadActionResult> {
  const target = await resolveTargets(input);
  if ("error" in target) {
    return {
      ok: false,
      action: input.action,
      message: "Nao foi possivel executar a acao.",
      error: target.error,
    };
  }

  const { supabase, conversationId, leadId, agentKey, conversation, lead } = target;
  const now = new Date().toISOString();
  const note = cleanString(input.note);
  const leadMetadata = asRecord(lead.metadata);
  const conversationMetadata = asRecord(conversation.metadata);
  const score = asNumber(lead.qualification_score, 0);
  const message = actionLabel(input.action);

  if (input.action === "update_internal_context") {
    const internalNote = cleanString(input.internalNote, note);
    const internalTags = cleanStringList(input.internalTags);
    const assignedToLabel = cleanString(input.assignedToLabel);
    const updatedByLabel = cleanString(input.reviewedByLabel, "Painel WhatsApp");
    const operatorContext = {
      internal_note: internalNote || null,
      internal_tags: internalTags,
      assigned_to_label: assignedToLabel || null,
      updated_at: now,
      updated_by_label: updatedByLabel,
    };

    if (conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          assigned_to_label: assignedToLabel || null,
          metadata: {
            ...conversationMetadata,
            internal_note: internalNote || null,
            internal_tags: internalTags,
            operator_context: {
              ...asRecord(conversationMetadata.operator_context),
              ...operatorContext,
            },
          },
          updated_at: now,
        })
        .eq("id", conversationId);
      if (error) return { ok: false, action: input.action, message, error: error.message };
    }

    if (leadId) {
      const { error } = await supabase
        .from("whatsapp_leads")
        .update({
          metadata: {
            ...leadMetadata,
            internal_note: internalNote || null,
            internal_tags: internalTags,
            operator_context: {
              ...asRecord(leadMetadata.operator_context),
              ...operatorContext,
            },
          },
          updated_at: now,
        })
        .eq("id", leadId);
      if (error) return { ok: false, action: input.action, message, error: error.message };
    }

    await insertRuntimeEvent({
      agentKey,
      action: input.action,
      status: "ok",
      message,
      payload: { leadId, conversationId, internalTags, assignedToLabel: assignedToLabel || null, updatedByLabel },
    });

    return { ok: true, action: input.action, message };
  }

  if (input.action === "update_crm_stage") {
    const crmStage = normalizeCrmStage(input.crmStage);
    if (!crmStage) {
      return { ok: false, action: input.action, message, error: "Etapa de CRM invalida." };
    }

    const settings = crmStageSettings[crmStage];
    const updatedByLabel = cleanString(input.reviewedByLabel, "Painel WhatsApp");
    const crmPayload = {
      crm_stage: crmStage,
      crm_stage_label: settings.classification,
      updated_at: now,
      updated_by_label: updatedByLabel,
    };

    if (conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          human_intervention_active: crmStage === "handoff" ? true : asRecord(conversation).human_intervention_active,
          metadata: {
            ...conversationMetadata,
            crm_stage: crmStage,
            crm_stage_updated_at: now,
            crm_stage_updated_by: updatedByLabel,
            crm: {
              ...asRecord(conversationMetadata.crm),
              ...crmPayload,
            },
          },
          updated_at: now,
        })
        .eq("id", conversationId);
      if (error) return { ok: false, action: input.action, message, error: error.message };
    }

    if (leadId) {
      const { error } = await supabase
        .from("whatsapp_leads")
        .update({
          human_intervention_active: crmStage === "handoff" ? true : asRecord(lead).human_intervention_active,
          status: settings.status,
          temperature: settings.temperature,
          metadata: {
            ...leadMetadata,
            crm_stage: crmStage,
            crm_stage_updated_at: now,
            crm_stage_updated_by: updatedByLabel,
            crm: {
              ...asRecord(leadMetadata.crm),
              ...crmPayload,
            },
          },
          updated_at: now,
        })
        .eq("id", leadId);
      if (error) return { ok: false, action: input.action, message, error: error.message };

      await updateLeadProfile({
        leadId,
        agentKey,
        stage: crmStage,
        classification: settings.classification,
        score,
        nextAction: settings.nextAction,
        metadata: {
          ...asRecord(asRecord(leadMetadata.crm).profile),
          source: "admin_whatsapp_panel",
          lastAction: input.action,
          crmStage,
          note: note || null,
          updatedAt: now,
          updatedByLabel,
        },
      });
    }

    await insertRuntimeEvent({
      agentKey,
      action: input.action,
      status: "ok",
      message,
      payload: { leadId, conversationId, crmStage, updatedByLabel },
    });

    return { ok: true, action: input.action, message, data: { crmStage } };
  }

  if (input.action === "pause_ai" || input.action === "review_bad") {
    if (conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          human_intervention_active: true,
          assigned_to_label: "humano",
          last_human_message_at: now,
          metadata: {
            ...conversationMetadata,
            human_intervention: {
              active: true,
              reason: input.action === "review_bad" ? "review_bad" : "operator_pause",
              note: note || null,
              source: "admin_whatsapp_panel",
              started_at: now,
            },
          },
          updated_at: now,
        })
        .eq("id", conversationId);
      if (error) return { ok: false, action: input.action, message, error: error.message };
    }

    if (leadId) {
      const { error } = await supabase
        .from("whatsapp_leads")
        .update({
          human_intervention_active: true,
          status: "human_handoff",
          metadata: {
            ...leadMetadata,
            human_handoff_reason: input.action === "review_bad" ? "review_bad" : "operator_pause",
            human_handoff_note: note || null,
            human_handoff_at: now,
          },
          updated_at: now,
        })
        .eq("id", leadId);
      if (error) return { ok: false, action: input.action, message, error: error.message };

      await updateLeadProfile({
        leadId,
        agentKey,
        stage: "handoff",
        classification: "handoff_humano",
        score,
        nextAction: "Humano assumir a conversa e registrar decisao no CRM.",
        metadata: {
          source: "admin_whatsapp_panel",
          lastAction: input.action,
          note: note || null,
          updatedAt: now,
        },
      });
    }
  }

  if (input.action === "resume_ai") {
    if (conversationId) {
      const { error } = await supabase
        .from("whatsapp_conversations")
        .update({
          human_intervention_active: false,
          ai_paused_until: null,
          assigned_to_label: null,
          metadata: {
            ...conversationMetadata,
            human_intervention: {
              active: false,
              source: "admin_whatsapp_panel",
              resumed_at: now,
              note: note || null,
            },
          },
          updated_at: now,
        })
        .eq("id", conversationId);
      if (error) return { ok: false, action: input.action, message, error: error.message };
    }

    if (leadId) {
      const { error } = await supabase
        .from("whatsapp_leads")
        .update({
          human_intervention_active: false,
          status: score >= 70 ? "qualificado" : "qualificando",
          metadata: {
            ...leadMetadata,
            ai_resumed_at: now,
            ai_resumed_note: note || null,
          },
          updated_at: now,
        })
        .eq("id", leadId);
      if (error) return { ok: false, action: input.action, message, error: error.message };

      await updateLeadProfile({
        leadId,
        agentKey,
        stage: score >= 70 ? "quente" : "qualificando",
        classification: score >= 70 ? "quente" : "morno",
        score,
        nextAction: "IA retomada; seguir qualificacao com uma pergunta por vez.",
        metadata: {
          source: "admin_whatsapp_panel",
          lastAction: input.action,
          note: note || null,
          updatedAt: now,
        },
      });
    }
  }

  if (input.action === "opt_out" || input.action === "clear_opt_out") {
    const optOut = input.action === "opt_out";
    if (leadId) {
      const { error } = await supabase
        .from("whatsapp_leads")
        .update({
          opt_out: optOut,
          status: optOut ? "opt_out" : "qualificando",
          metadata: {
            ...leadMetadata,
            opt_out_source: "admin_whatsapp_panel",
            opt_out_note: note || null,
            opt_out_updated_at: now,
          },
          updated_at: now,
        })
        .eq("id", leadId);
      if (error) return { ok: false, action: input.action, message, error: error.message };

      await updateLeadProfile({
        leadId,
        agentKey,
        stage: optOut ? "perdido" : "qualificando",
        classification: optOut ? "opt_out" : "morno",
        score,
        nextAction: optOut ? "Respeitar opt-out; nao enviar nova mensagem." : "Opt-out removido; retomar somente se houver contexto valido.",
        metadata: {
          source: "admin_whatsapp_panel",
          lastAction: input.action,
          note: note || null,
          updatedAt: now,
        },
      });
    }

    if (optOut && conversationId) {
      await supabase
        .from("whatsapp_follow_ups")
        .update({ status: "cancelled", error_message: "lead_opt_out", updated_at: now })
        .eq("conversation_id", conversationId)
        .in("status", ["queued", "scheduled", "running"]);
    }
  }

  if (input.action === "cancel_followups") {
    const query = supabase
      .from("whatsapp_follow_ups")
      .update({ status: "cancelled", error_message: note || "operator_cancelled", updated_at: now })
      .in("status", ["queued", "scheduled", "running"]);

    const { error } = conversationId
      ? await query.eq("conversation_id", conversationId)
      : await query.eq("lead_id", leadId);
    if (error) return { ok: false, action: input.action, message, error: error.message };
  }

  if (input.action === "schedule_followup") {
    if (!conversationId || !leadId) {
      return { ok: false, action: input.action, message, error: "Conversa e lead sao obrigatorios para follow-up." };
    }

    const { data: existing, error: existingError } = await supabase
      .from("whatsapp_follow_ups")
      .select("id,status")
      .eq("conversation_id", conversationId)
      .in("status", ["queued", "scheduled", "running"])
      .limit(1);
    if (existingError) return { ok: false, action: input.action, message, error: existingError.message };

    if ((existing || []).length) {
      return {
        ok: true,
        action: input.action,
        message: "Ja existe follow-up pendente para esta conversa.",
        data: { existingFollowUpId: cleanString(asRecord(existing?.[0]).id) },
      };
    }

    const { data, error } = await supabase
      .from("whatsapp_follow_ups")
      .insert({
        conversation_id: conversationId,
        lead_id: leadId,
        instance_id: cleanString(conversation.instance_id) || null,
        agent_key: agentKey || null,
        status: "scheduled",
        reason: "manual_panel",
        response_mode: "mirror",
        scheduled_for: cleanString(input.scheduledFor, now),
        payload: {
          source: "admin_whatsapp_panel",
          note: note || null,
          createdAt: now,
        },
      })
      .select("id")
      .maybeSingle();
    if (error) return { ok: false, action: input.action, message, error: error.message };
    await insertRuntimeEvent({
      agentKey,
      action: input.action,
      status: "scheduled",
      message,
      payload: { leadId, conversationId, followUpId: cleanString(data?.id), note: note || null },
    });
    return { ok: true, action: input.action, message, data: { followUpId: cleanString(data?.id) } };
  }

  if (input.action === "review_good" || input.action === "review_bad") {
    if (!conversationId) {
      return { ok: false, action: input.action, message, error: "Conversa obrigatoria para registrar avaliacao." };
    }

    const { data: lastOutbound } = await supabase
      .from("whatsapp_conversation_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const verdict = input.action === "review_good" ? "aprovado" : "precisa_revisao";
    const { error } = await supabase.from("whatsapp_agent_reviews").insert({
      conversation_id: conversationId,
      lead_id: leadId || null,
      message_id: cleanString(lastOutbound?.id) || null,
      agent_key: agentKey || null,
      review_type: "operator_quality",
      score: input.action === "review_good" ? 95 : 35,
      verdict,
      metrics: {
        naturalidade: input.action === "review_good" ? 9 : 3,
        utilidade: input.action === "review_good" ? 9 : 4,
        contexto: input.action === "review_good" ? 9 : 4,
        transparencia: 8,
      },
      review_flags: input.action === "review_good" ? ["aprovado_operador"] : ["revisar_prompt", "handoff_humano"],
      notes: note || null,
      reviewed_by_label: cleanString(input.reviewedByLabel, "Painel WhatsApp"),
    });
    if (error) return { ok: false, action: input.action, message, error: error.message };
  }

  await insertRuntimeEvent({
    agentKey,
    action: input.action,
    status: "ok",
    message,
    payload: { leadId, conversationId, note: note || null },
  });

  return { ok: true, action: input.action, message };
}
