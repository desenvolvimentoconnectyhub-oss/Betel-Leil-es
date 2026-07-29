import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getConnectyHubWhatsappAgentControlStatus } from "@/lib/communication/connectyhub-client";
import { getWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";
import { describeFollowUpWindow, nextFollowUpWindowDate } from "@/lib/whatsapp/follow-up-window";

type DbRow = Record<string, unknown>;

export type WhatsAppFollowUpCandidate = {
  conversationId: string;
  leadId: string;
  agentKey: string;
  leadName: string;
  phone: string;
  score: number;
  reason: string;
  scheduledFor: string;
  lastOutboundAt: string;
  followUpCount: number;
};

export type WhatsAppFollowUpPlannerResult = {
  ok: boolean;
  dryRun: boolean;
  eligibleCount: number;
  queuedCount: number;
  skippedCount: number;
  candidates: WhatsAppFollowUpCandidate[];
  queuedIds: string[];
  errors: string[];
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function isPresentString(value: string | undefined): value is string {
  return Boolean(value);
}

function timestamp(value: unknown) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function createdAt(message: DbRow) {
  return cleanString(message.occurred_at, cleanString(message.created_at));
}

function latestMessage(messages: DbRow[]) {
  return [...messages].sort((left, right) => timestamp(createdAt(right)) - timestamp(createdAt(left)))[0];
}

function addMinutes(value: string, minutes: number) {
  const base = timestamp(value) || Date.now();
  return new Date(base + minutes * 60_000).toISOString();
}

function isOpenStatus(status: string) {
  const normalized = status.toLowerCase();
  return !["closed", "fechado", "archived", "arquivado", "deleted"].includes(normalized);
}

function normalizeFollowUpReason(score: number) {
  if (score >= 85) return "vip_no_reply";
  if (score >= 70) return "hot_lead_no_reply";
  return "lead_no_reply";
}

export async function planWhatsAppFollowUps(input: {
  dryRun?: boolean;
  limit?: number;
  agentKey?: string;
} = {}): Promise<WhatsAppFollowUpPlannerResult> {
  const supabase = getSupabaseAdminClient();
  const dryRun = input.dryRun !== false;
  const limit = Math.max(1, Math.min(Math.trunc(input.limit || 50), 200));

  if (!supabase) {
    return {
      ok: false,
      dryRun,
      eligibleCount: 0,
      queuedCount: 0,
      skippedCount: 0,
      candidates: [],
      queuedIds: [],
      errors: ["Supabase admin nao configurado."],
    };
  }

  let conversationsQuery = supabase
    .from("whatsapp_conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(limit * 3);

  if (input.agentKey) conversationsQuery = conversationsQuery.eq("agent_key", input.agentKey);

  const { data: conversationData, error: conversationsError } = await conversationsQuery;
  if (conversationsError) {
    return {
      ok: false,
      dryRun,
      eligibleCount: 0,
      queuedCount: 0,
      skippedCount: 0,
      candidates: [],
      queuedIds: [],
      errors: [conversationsError.message],
    };
  }

  const conversations = ((conversationData || []) as DbRow[]).filter((row) => cleanString(row.id));
  const conversationIds = conversations.map((row) => cleanString(row.id)).filter(Boolean);
  const leadIds = [...new Set(conversations.map((row) => cleanString(row.lead_id)).filter(Boolean))];

  if (!conversationIds.length || !leadIds.length) {
    return {
      ok: true,
      dryRun,
      eligibleCount: 0,
      queuedCount: 0,
      skippedCount: 0,
      candidates: [],
      queuedIds: [],
      errors: [],
    };
  }

  const [leadsResult, messagesResult, followUpsResult] = await Promise.all([
    supabase.from("whatsapp_leads").select("*").in("id", leadIds),
    supabase.from("whatsapp_conversation_messages").select("*").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(limit * 12),
    supabase.from("whatsapp_follow_ups").select("*").in("conversation_id", conversationIds).in("status", ["queued", "scheduled", "running", "sent"]),
  ]);

  const errors = [leadsResult.error, messagesResult.error, followUpsResult.error]
    .map((error) => error?.message)
    .filter(isPresentString);

  if (leadsResult.error || messagesResult.error) {
    return {
      ok: false,
      dryRun,
      eligibleCount: 0,
      queuedCount: 0,
      skippedCount: conversations.length,
      candidates: [],
      queuedIds: [],
      errors,
    };
  }

  const leadsById = new Map(((leadsResult.data || []) as DbRow[]).map((lead) => [cleanString(lead.id), lead]));
  const messagesByConversation = new Map<string, DbRow[]>();
  const followUpsByConversation = new Map<string, DbRow[]>();

  for (const message of ((messagesResult.data || []) as DbRow[])) {
    const conversationId = cleanString(message.conversation_id);
    if (!conversationId) continue;
    messagesByConversation.set(conversationId, [...(messagesByConversation.get(conversationId) || []), message]);
  }

  if (!followUpsResult.error) {
    for (const followUp of ((followUpsResult.data || []) as DbRow[])) {
      const conversationId = cleanString(followUp.conversation_id);
      if (!conversationId) continue;
      followUpsByConversation.set(conversationId, [...(followUpsByConversation.get(conversationId) || []), followUp]);
    }
  }

  const configByAgent = new Map<string, Awaited<ReturnType<typeof getWhatsAppAgentConfig>>>();
  const controlStatusByAgent = new Map<string, string>();
  const candidates: WhatsAppFollowUpCandidate[] = [];
  let skippedCount = 0;

  for (const conversation of conversations) {
    if (candidates.length >= limit) break;

    const conversationId = cleanString(conversation.id);
    const leadId = cleanString(conversation.lead_id);
    const lead = leadsById.get(leadId);
    const agentKey = cleanString(conversation.agent_key, cleanString(lead?.owner_agent_key, "multichannel-dispatch"));
    const status = cleanString(conversation.status, "open");

    if (!lead || !isOpenStatus(status)) {
      skippedCount += 1;
      continue;
    }

    if (asBoolean(lead.opt_out) || asBoolean(lead.human_intervention_active) || asBoolean(conversation.human_intervention_active)) {
      skippedCount += 1;
      continue;
    }

    if (!controlStatusByAgent.has(agentKey)) {
      controlStatusByAgent.set(agentKey, await getConnectyHubWhatsappAgentControlStatus({ agentKey }));
    }
    if (controlStatusByAgent.get(agentKey) === "paused") {
      skippedCount += 1;
      continue;
    }

    if (!configByAgent.has(agentKey)) {
      configByAgent.set(agentKey, await getWhatsAppAgentConfig(agentKey));
    }
    const config = configByAgent.get(agentKey);
    if (!config?.behavior.followUpEnabled) {
      skippedCount += 1;
      continue;
    }

    const pendingOrSentFollowUps = followUpsByConversation.get(conversationId) || [];
    const sentFollowUps = pendingOrSentFollowUps.filter((followUp) => cleanString(followUp.status) === "sent").length;
    const followUpCount = Math.max(asNumber(conversation.follow_up_count, 0), sentFollowUps);
    if (followUpCount >= config.behavior.maxFollowUps) {
      skippedCount += 1;
      continue;
    }
    if (pendingOrSentFollowUps.some((followUp) => ["queued", "scheduled", "running"].includes(cleanString(followUp.status)))) {
      skippedCount += 1;
      continue;
    }

    const messages = messagesByConversation.get(conversationId) || [];
    const lastMessage = latestMessage(messages);
    if (!lastMessage || cleanString(lastMessage.direction) === "inbound") {
      skippedCount += 1;
      continue;
    }

    const lastOutboundAt = createdAt(lastMessage);
    const delayMinutes = Math.max(30, Math.min(config.behavior.followUpDelayMinutes || 120, 7 * 24 * 60));
    const dueAt = addMinutes(lastOutboundAt, delayMinutes);
    if (timestamp(dueAt) > Date.now()) {
      skippedCount += 1;
      continue;
    }

    const followUpWindow = describeFollowUpWindow({
      start: config.behavior.followUpWindowStart,
      end: config.behavior.followUpWindowEnd,
      timezone: config.behavior.timezone,
    });
    const scheduledFor = nextFollowUpWindowDate(new Date(Date.now() + 5 * 60_000), followUpWindow).toISOString();
    const score = Math.round(asNumber(lead.qualification_score, 0));
    candidates.push({
      conversationId,
      leadId,
      agentKey,
      leadName: cleanString(lead.name, "Lead WhatsApp"),
      phone: cleanString(lead.phone),
      score,
      reason: normalizeFollowUpReason(score),
      scheduledFor,
      lastOutboundAt,
      followUpCount,
    });
  }

  if (dryRun || !candidates.length) {
    return {
      ok: true,
      dryRun,
      eligibleCount: candidates.length,
      queuedCount: 0,
      skippedCount,
      candidates,
      queuedIds: [],
      errors,
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("whatsapp_follow_ups")
    .insert(
      candidates.map((candidate) => ({
        conversation_id: candidate.conversationId,
        lead_id: candidate.leadId,
        agent_key: candidate.agentKey,
        status: "scheduled",
        reason: candidate.reason,
        response_mode: "mirror",
        scheduled_for: candidate.scheduledFor,
        payload: {
          source: "whatsapp_follow_up_planner",
          lastOutboundAt: candidate.lastOutboundAt,
          previousFollowUpCount: candidate.followUpCount,
          score: candidate.score,
          followUpWindow: configByAgent.has(candidate.agentKey)
            ? describeFollowUpWindow({
                start: configByAgent.get(candidate.agentKey)?.behavior.followUpWindowStart,
                end: configByAgent.get(candidate.agentKey)?.behavior.followUpWindowEnd,
                timezone: configByAgent.get(candidate.agentKey)?.behavior.timezone,
              })
            : null,
        },
      }))
    )
    .select("id");

  if (insertError) {
    return {
      ok: false,
      dryRun,
      eligibleCount: candidates.length,
      queuedCount: 0,
      skippedCount,
      candidates,
      queuedIds: [],
      errors: [...errors, insertError.message].filter(isPresentString),
    };
  }

  return {
    ok: true,
    dryRun,
    eligibleCount: candidates.length,
    queuedCount: ((inserted || []) as DbRow[]).length,
    skippedCount,
    candidates,
    queuedIds: ((inserted || []) as DbRow[]).map((row) => cleanString(row.id)).filter(isPresentString),
    errors,
  };
}
