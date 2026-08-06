import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import {
  getConnectyHubWhatsappAgentControlStatus,
  sendWhatsAppAgentChatPresence,
  sendWhatsAppAgentReply,
  setWhatsAppAgentInstancePresence,
  type ConnectyHubDeliveryResult,
} from "@/lib/communication/connectyhub-client";
import { getWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";
import {
  buildWhatsAppGlobalRuntimePrompt,
  getWhatsAppGlobalBehaviorConfig,
} from "@/lib/communication/whatsapp-global-behavior-config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  loadWhatsAppOpportunityContext,
} from "@/lib/whatsapp/betel-advisory-context";
import { buildWhatsAppAgentKnowledgeContext } from "@/lib/whatsapp/agent-knowledge";
import {
  resolveWhatsAppVoiceResponse,
  sendWhatsAppAgentVoiceReply,
} from "@/lib/whatsapp/voice-response";
import {
  buildWhatsAppHumanizationPlan,
  type WhatsAppHumanizationPlan,
} from "@/lib/whatsapp/humanization-runtime";
import {
  describeFollowUpWindow,
  isInsideFollowUpWindow,
  nextFollowUpWindowDate,
} from "@/lib/whatsapp/follow-up-window";

type DbRow = Record<string, unknown>;

export type WhatsAppFollowUpWorkerItem = {
  followUpId: string;
  conversationId: string;
  leadId: string;
  agentKey: string;
  status: string;
  providerStatus: string;
  textPreview: string;
  error?: string;
};

export type WhatsAppFollowUpWorkerResult = {
  ok: boolean;
  dryRun: boolean;
  requested: number;
  processed: WhatsAppFollowUpWorkerItem[];
  skipped: WhatsAppFollowUpWorkerItem[];
  failed: WhatsAppFollowUpWorkerItem[];
  errors: string[];
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function timestamp(value: unknown) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampText(value: string, maxLength = 1000) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function firstName(value: string) {
  return cleanString(value).split(/\s+/)[0] || "";
}

function messageCreatedAt(message: DbRow) {
  return cleanString(message.occurred_at, cleanString(message.created_at));
}

function orderedRecentMessages(messages: DbRow[]) {
  return [...messages]
    .sort((left, right) => timestamp(messageCreatedAt(left)) - timestamp(messageCreatedAt(right)))
    .slice(-12);
}

function historyForPrompt(messages: DbRow[]) {
  const history = orderedRecentMessages(messages)
    .map((message) => {
      const direction = cleanString(message.direction);
      const side = direction === "outbound" ? "Atendente" : "Lead";
      const text = cleanString(message.text, cleanString(message.transcript));
      return text ? `${side}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");

  return history || "Sem historico textual suficiente.";
}

function extractProfileSummary(profile: DbRow) {
  const parts = [
    cleanString(profile.investment_goal) ? `Objetivo: ${cleanString(profile.investment_goal)}` : "",
    cleanString(profile.urgency) ? `Urgencia: ${cleanString(profile.urgency)}` : "",
    cleanString(profile.experience_level) ? `Experiencia: ${cleanString(profile.experience_level)}` : "",
    asNumber(profile.budget_max) ? `Capital: R$ ${Math.round(asNumber(profile.budget_max)).toLocaleString("pt-BR")}` : "",
    Array.isArray(profile.preferred_regions) && profile.preferred_regions.length
      ? `Regioes: ${profile.preferred_regions.map((item) => cleanString(item)).filter(Boolean).join(", ")}`
      : "",
    Array.isArray(profile.property_types) && profile.property_types.length
      ? `Tipos: ${profile.property_types.map((item) => cleanString(item)).filter(Boolean).join(", ")}`
      : "",
  ].filter(Boolean);

  return parts.join(" | ") || "Perfil ainda incompleto.";
}

function fallbackFollowUpText(input: {
  leadName: string;
  score: number;
  reason: string;
  profile: DbRow;
}) {
  const name = firstName(input.leadName);
  const prefix = name ? `${name}, ` : "";
  const profileSummary = extractProfileSummary(input.profile).toLowerCase();

  if (input.reason.includes("vip") || input.score >= 85) {
    return `${prefix}passando rapidinho pra retomar seu atendimento. Pelo que vc comentou, parece um perfil bem aderente pra olhar com cuidado.\n\nQuer que eu siga pela faixa de investimento ou pela regiao primeiro?`;
  }

  if (input.reason.includes("hot") || input.score >= 70) {
    return `${prefix}so retomando aqui. Vi que vc tem interesse real em leilao e queria entender melhor antes de te mandar algo.\n\nFaz mais sentido eu filtrar por regiao ou por valor de investimento?`;
  }

  if (profileSummary.includes("perfil ainda incompleto")) {
    return `${prefix}passando pra continuar de onde paramos.\n\nMe fala so uma coisa: vc busca imovel pra investir, morar ou revender?`;
  }

  return `${prefix}retomando nossa conversa por aqui.\n\nQuer que eu te ajude a filtrar uma oportunidade de leilao dentro do seu perfil?`;
}

async function generateFollowUpText(input: {
  lead: DbRow;
  profile: DbRow;
  messages: DbRow[];
  agentKey: string;
  reason: string;
  score: number;
}) {
  const fallback = fallbackFollowUpText({
    leadName: cleanString(input.lead.name),
    score: input.score,
    reason: input.reason,
    profile: input.profile,
  });
  const apiKey = await getGeminiApiKey();
  const modelName = await getGeminiModel();

  if (!apiKey) return { text: fallback, model: "fallback-template", fallback: true };

  try {
    const config = await getWhatsAppAgentConfig(input.agentKey);
    const globalBehavior = await getWhatsAppGlobalBehaviorConfig();
    const globalBehaviorPrompt = buildWhatsAppGlobalRuntimePrompt(globalBehavior, config.globalPrompt);
    const agentKnowledge = buildWhatsAppAgentKnowledgeContext(config);
    const supabase = getSupabaseAdminClient();
    const opportunitiesContext = supabase
      ? await loadWhatsAppOpportunityContext(supabase, {
          profile: input.profile,
          inboundText: historyForPrompt(input.messages),
          limit: 5,
        })
      : "Supabase admin nao configurado; nao carregue oportunidades especificas.";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = [
      globalBehaviorPrompt,
      "",
      "Voce escreve follow-up curto para WhatsApp da Betel Leiloes.",
      "O lead sabe que pode estar falando com uma maquina; mesmo assim, a resposta precisa ser util, natural e objetiva.",
      "Nao use markdown, bullets, promessa de lucro, parecer juridico ou texto formal.",
      "Uma ou duas mensagens curtas, uma pergunta por vez.",
      "",
      `Nome do agente: ${config.agentName}`,
      `Tom: ${config.cloneProfile.tone}`,
      `Produto: ${config.qualification.product}`,
      `Objetivo comercial: ${config.qualification.commercialGoal}`,
      "",
      "Memoria operacional do agente:",
      agentKnowledge.memory,
      "",
      "Base de conhecimento do agente:",
      agentKnowledge.knowledge,
      "",
      "Imoveis reais analisados:",
      opportunitiesContext,
      "",
      `Lead: ${cleanString(input.lead.name, "Lead WhatsApp")}`,
      `Telefone: ${cleanString(input.lead.phone)}`,
      `Score: ${input.score}`,
      `Motivo do follow-up: ${input.reason}`,
      `Perfil CRM: ${extractProfileSummary(input.profile)}`,
      "",
      "Historico recente:",
      historyForPrompt(input.messages),
      "",
      "Escreva somente o texto que sera enviado no WhatsApp.",
    ].join("\n");

    const result = await model.generateContent(prompt);
    const text = clampText(result.response.text(), 900);
    return { text: text || fallback, model: modelName, fallback: !text };
  } catch {
    return { text: fallback, model: "fallback-template", fallback: true };
  }
}

async function insertRuntimeEvent(input: {
  agentKey: string;
  eventType: string;
  status: string;
  message: string;
  payload: Record<string, unknown>;
  model?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-FUP-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey || null,
    event_type: input.eventType,
    status: input.status,
    provider: "connectyhub",
    model: input.model || "follow-up-worker",
    attempt: 1,
    message: input.message,
    payload: input.payload,
  });
}

async function startFollowUpHumanizationSignals(input: {
  agentKey: string;
  instanceId: string;
  number: string;
  followUpId: string;
  conversationId: string;
  leadId: string;
  plan: WhatsAppHumanizationPlan;
}) {
  const signalPromises: Array<Promise<ConnectyHubDeliveryResult>> = [];

  if (input.plan.setAvailable) {
    signalPromises.push(
      setWhatsAppAgentInstancePresence({
        agentKey: input.agentKey,
        instanceId: input.instanceId,
        presence: "available",
      })
    );
  }

  for (const part of input.plan.parts) {
    if (part.presenceDelayMs <= 0) continue;
    signalPromises.push(
      sendWhatsAppAgentChatPresence({
        agentKey: input.agentKey,
        instanceId: input.instanceId,
        number: input.number,
        presence: part.presence,
        delayMs: input.plan.mode === "audio" ? part.presenceDelayMs + 12000 : part.presenceDelayMs,
      })
    );
  }

  const signals = await Promise.all(signalPromises);
  if (signals.length) {
    await insertRuntimeEvent({
      agentKey: input.agentKey,
      eventType: "whatsapp_followup_humanization_signals",
      status: signals.every((signal) => signal.ok) ? "accepted" : "partial",
      message: "Sinais de presenca e temporizacao enviados antes do follow-up WhatsApp.",
      payload: {
        followUpId: input.followUpId,
        conversationId: input.conversationId,
        leadId: input.leadId,
        plan: {
          ...input.plan.summary,
          mode: input.plan.mode,
          enabled: input.plan.enabled,
        },
        signals,
      },
    });
  }

  return signals;
}

function skippedItem(followUp: DbRow, reason: string): WhatsAppFollowUpWorkerItem {
  return {
    followUpId: cleanString(followUp.id),
    conversationId: cleanString(followUp.conversation_id),
    leadId: cleanString(followUp.lead_id),
    agentKey: cleanString(followUp.agent_key),
    status: reason,
    providerStatus: "skipped",
    textPreview: "",
  };
}

export async function processWhatsAppFollowUps(input: {
  dryRun?: boolean;
  limit?: number;
  allowQuietHours?: boolean;
} = {}): Promise<WhatsAppFollowUpWorkerResult> {
  const supabase = getSupabaseAdminClient();
  const dryRun = input.dryRun === true;
  const limit = Math.max(1, Math.min(Math.trunc(input.limit || 10), 50));

  if (!supabase) {
    return {
      ok: false,
      dryRun,
      requested: limit,
      processed: [],
      skipped: [],
      failed: [],
      errors: ["Supabase admin nao configurado."],
    };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("whatsapp_follow_ups")
    .select("*")
    .in("status", ["queued", "scheduled"])
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      dryRun,
      requested: limit,
      processed: [],
      skipped: [],
      failed: [],
      errors: [error.message],
    };
  }

  const followUps = ((data || []) as DbRow[]).filter((row) => cleanString(row.id));
  const processed: WhatsAppFollowUpWorkerItem[] = [];
  const skipped: WhatsAppFollowUpWorkerItem[] = [];
  const failed: WhatsAppFollowUpWorkerItem[] = [];

  for (const followUp of followUps) {
    const followUpId = cleanString(followUp.id);
    const conversationId = cleanString(followUp.conversation_id);
    const leadId = cleanString(followUp.lead_id);
    const agentKey = cleanString(followUp.agent_key, "multichannel-dispatch");
    const attemptCount = asNumber(followUp.attempt_count, 0) + 1;
    const maxAttempts = asNumber(followUp.max_attempts, 3);

    const [leadResult, conversationResult, messagesResult, profileResult] = await Promise.all([
      supabase.from("whatsapp_leads").select("*").eq("id", leadId).maybeSingle(),
      supabase.from("whatsapp_conversations").select("*").eq("id", conversationId).maybeSingle(),
      supabase
        .from("whatsapp_conversation_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(16),
      supabase.from("whatsapp_lead_profiles").select("*").eq("lead_id", leadId).maybeSingle(),
    ]);

    const lead = asRecord(leadResult.data);
    const conversation = asRecord(conversationResult.data);
    const profile = asRecord(profileResult.data);
    const messages = ((messagesResult.data || []) as DbRow[]).filter((row) => cleanString(row.id));
    const instanceId = cleanString(followUp.instance_id, cleanString(conversation.instance_id));
    const instanceResult = instanceId
      ? await supabase.from("whatsapp_instances").select("provider_instance_id").eq("id", instanceId).maybeSingle()
      : { data: null, error: null };
    const providerInstanceId = cleanString(asRecord(instanceResult.data).provider_instance_id);

    if (leadResult.error || conversationResult.error || messagesResult.error || instanceResult.error) {
      const message =
        leadResult.error?.message ||
        conversationResult.error?.message ||
        messagesResult.error?.message ||
        instanceResult.error?.message ||
        "load_failed";
      await supabase
        .from("whatsapp_follow_ups")
        .update({
          status: attemptCount >= maxAttempts ? "failed" : "queued",
          attempt_count: attemptCount,
          error_message: message,
          scheduled_for: new Date(Date.now() + 30 * 60_000).toISOString(),
        })
        .eq("id", followUpId);
      failed.push({ ...skippedItem(followUp, "load_failed"), error: message });
      continue;
    }

    if (!leadId || !conversationId || !cleanString(lead.phone)) {
      await supabase.from("whatsapp_follow_ups").update({ status: "skipped", error_message: "missing_lead_or_phone" }).eq("id", followUpId);
      skipped.push(skippedItem(followUp, "missing_lead_or_phone"));
      continue;
    }

    if (asBoolean(lead.opt_out) || asBoolean(lead.human_intervention_active) || asBoolean(conversation.human_intervention_active)) {
      await supabase.from("whatsapp_follow_ups").update({ status: "skipped", error_message: "lead_paused_or_handoff" }).eq("id", followUpId);
      skipped.push(skippedItem(followUp, "lead_paused_or_handoff"));
      continue;
    }

    const controlStatus = await getConnectyHubWhatsappAgentControlStatus({ agentKey });
    if (controlStatus === "paused") {
      await supabase.from("whatsapp_follow_ups").update({ status: "skipped", error_message: "agent_paused" }).eq("id", followUpId);
      skipped.push(skippedItem(followUp, "agent_paused"));
      continue;
    }

    const lastMessage = orderedRecentMessages(messages).at(-1);
    if (lastMessage && cleanString(lastMessage.direction) === "inbound") {
      await supabase.from("whatsapp_follow_ups").update({ status: "skipped", error_message: "lead_already_replied" }).eq("id", followUpId);
      skipped.push(skippedItem(followUp, "lead_already_replied"));
      continue;
    }

    const config = await getWhatsAppAgentConfig(agentKey);
    const followUpWindow = describeFollowUpWindow({
      start: config.behavior.followUpWindowStart,
      end: config.behavior.followUpWindowEnd,
      timezone: config.behavior.timezone,
    });

    if (!input.allowQuietHours && !isInsideFollowUpWindow(new Date(), followUpWindow)) {
      const nextScheduledFor = nextFollowUpWindowDate(new Date(Date.now() + 10 * 60_000), followUpWindow).toISOString();
      await supabase
        .from("whatsapp_follow_ups")
        .update({
          status: "scheduled",
          scheduled_for: nextScheduledFor,
          error_message: null,
        })
        .eq("id", followUpId);
      skipped.push({
        ...skippedItem(followUp, "outside_followup_window"),
        error: `Reagendado para ${nextScheduledFor}; janela ${followUpWindow.start}-${followUpWindow.end} ${followUpWindow.timezone}.`,
      });
      continue;
    }

    const score = asNumber(profile.lead_score, asNumber(lead.qualification_score, 0));
    const generated = await generateFollowUpText({
      lead,
      profile,
      messages,
      agentKey,
      reason: cleanString(followUp.reason, "lead_no_reply"),
      score,
    });

    if (dryRun) {
      processed.push({
        followUpId,
        conversationId,
        leadId,
        agentKey,
        status: "dry_run",
        providerStatus: "not_sent",
        textPreview: clampText(generated.text, 180),
      });
      continue;
    }

    await supabase
      .from("whatsapp_follow_ups")
      .update({ status: "running", attempt_count: attemptCount, error_message: null })
      .eq("id", followUpId);

    const trackId = `wa-fup-${followUpId}`;
    const responseMode = cleanString(followUp.response_mode, "text");
    const voiceDecision = await resolveWhatsAppVoiceResponse({
      config,
      generatedText: generated.text,
      forceAudio: responseMode === "audio",
      seed: `${agentKey}:${followUpId}:${conversationId}:${leadId}:${generated.text}`,
      source: "followup",
    });
    const humanizationPlan = buildWhatsAppHumanizationPlan({
      config,
      inboundText: historyForPrompt(messages),
      replyParts: [generated.text],
      mode: voiceDecision.mode === "audio" ? "audio" : "text",
      seed: `${agentKey}:${followUpId}:${conversationId}:${leadId}:${generated.text}`,
    });
    await startFollowUpHumanizationSignals({
      agentKey,
      instanceId: providerInstanceId,
      number: cleanString(lead.phone),
      followUpId,
      conversationId,
      leadId,
      plan: humanizationPlan,
    });
    const audioDelivery = voiceDecision.mode === "audio"
      ? await sendWhatsAppAgentVoiceReply({
          agentKey,
          instanceId: providerInstanceId,
          number: cleanString(lead.phone),
          text: generated.text,
          trackId: `${trackId}-audio`,
          decision: voiceDecision,
          sendOptions: humanizationPlan.parts[0]?.sendOptions,
        })
      : null;
    const audioDeliveryUnconfirmed = Boolean(audioDelivery?.deliveryUnconfirmed);
    const audioDeliveryAccepted = Boolean(audioDelivery && (audioDelivery.ok || audioDeliveryUnconfirmed));
    const delivery = audioDeliveryAccepted && audioDelivery
      ? {
          ok: true,
          providerStatus: audioDelivery.providerStatus,
          externalDeliveryId: audioDelivery.externalDeliveryId,
          errorMessage: audioDeliveryUnconfirmed ? audioDelivery.errorMessage || "Confirmacao de audio pendente." : "",
          deliveryUnconfirmed: audioDeliveryUnconfirmed,
        }
      : await sendWhatsAppAgentReply({
          agentKey,
          instanceId: providerInstanceId,
          number: cleanString(lead.phone),
          text: generated.text,
          trackId,
          sendOptions: humanizationPlan.parts[0]?.sendOptions,
        });
    const deliveryMode = audioDeliveryAccepted ? "audio" : "text";
    const sentAt = new Date().toISOString();

    await supabase.from("whatsapp_conversation_messages").insert({
      conversation_id: conversationId,
      lead_id: leadId,
      instance_id: instanceId || null,
      direction: "outbound",
      author_type: "ai",
      author_label: agentKey,
      message_type: deliveryMode,
      text: generated.text,
      transcript: deliveryMode === "audio" ? generated.text : null,
      media_mime_type: deliveryMode === "audio" ? "audio/mpeg" : null,
      provider_message_id: delivery.externalDeliveryId || null,
      payload: {
        source: "whatsapp_follow_up_worker",
        followUpId,
        trackId,
        generatedBy: generated.model,
        fallback: generated.fallback,
        deliveryMode,
        voiceDecision,
        audioRequested: voiceDecision.audioRequested,
        audioDeliveryUnconfirmed,
        audioFallbackReason:
          audioDelivery && !audioDelivery.ok
            ? audioDelivery.errorMessage || audioDelivery.providerStatus
            : voiceDecision.fallbackReason || null,
        audioDelivery,
        delivery,
        humanizationPlan: {
          ...humanizationPlan.summary,
          mode: humanizationPlan.mode,
          enabled: humanizationPlan.enabled,
          fallbackToText: voiceDecision.mode === "audio" && !audioDelivery?.ok && !audioDeliveryUnconfirmed,
        },
      },
    });

    if (deliveryMode === "audio") {
      await supabase.from("generated_media").insert({
        agent_key: agentKey,
        lead_id: leadId,
        conversation_id: conversationId,
        provider: "elevenlabs/connectyhub",
        media_type: "audio",
        transcript: generated.text,
        metadata: {
          source: "whatsapp_follow_up_worker",
          followUpId,
          trackId: `${trackId}-audio`,
          delivery: audioDelivery || delivery,
          voiceDecision,
        },
      });
    }

    if (delivery.ok) {
      await Promise.all([
        supabase
          .from("whatsapp_follow_ups")
          .update({
            status: "sent",
            sent_at: sentAt,
            error_message: null,
          })
          .eq("id", followUpId),
        supabase
          .from("whatsapp_conversations")
          .update({
            follow_up_count: asNumber(conversation.follow_up_count, 0) + 1,
            last_follow_up_at: sentAt,
            last_message_at: sentAt,
            last_message_preview: clampText(generated.text, 180),
            updated_at: sentAt,
          })
          .eq("id", conversationId),
        supabase.from("whatsapp_leads").update({ last_message_at: sentAt, updated_at: sentAt }).eq("id", leadId),
      ]);

      await insertRuntimeEvent({
        agentKey,
        eventType: "whatsapp_follow_up_sent",
        status: delivery.providerStatus,
        message: "Follow-up enviado pelo atendente WhatsApp.",
        model: generated.model,
        payload: { followUpId, conversationId, leadId, delivery, audioDelivery, fallback: generated.fallback, voiceDecision },
      });

      processed.push({
        followUpId,
        conversationId,
        leadId,
        agentKey,
        status: "sent",
        providerStatus: delivery.providerStatus,
        textPreview: clampText(generated.text, 180),
      });
    } else {
      const failedFinal = attemptCount >= maxAttempts;
      await supabase
        .from("whatsapp_follow_ups")
        .update({
          status: failedFinal ? "failed" : "queued",
          error_message: delivery.errorMessage || delivery.providerStatus,
          scheduled_for: failedFinal
            ? cleanString(followUp.scheduled_for, now)
            : nextFollowUpWindowDate(new Date(Date.now() + 45 * 60_000), followUpWindow).toISOString(),
        })
        .eq("id", followUpId);

      await insertRuntimeEvent({
        agentKey,
        eventType: "whatsapp_follow_up_failed",
        status: delivery.providerStatus,
        message: "Falha ao enviar follow-up pelo WhatsApp.",
        model: generated.model,
        payload: { followUpId, conversationId, leadId, delivery, audioDelivery, voiceDecision },
      });

      failed.push({
        followUpId,
        conversationId,
        leadId,
        agentKey,
        status: failedFinal ? "failed" : "queued",
        providerStatus: delivery.providerStatus,
        textPreview: clampText(generated.text, 180),
        error: delivery.errorMessage || delivery.providerStatus,
      });
    }
  }

  return {
    ok: failed.length === 0,
    dryRun,
    requested: followUps.length,
    processed,
    skipped,
    failed,
    errors: [],
  };
}
