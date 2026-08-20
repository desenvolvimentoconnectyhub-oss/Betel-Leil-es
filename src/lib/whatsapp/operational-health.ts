import "server-only";

import { getActiveAIProvider, getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { WILLIAN_AGENT_KEY, getWillianInstanceState } from "@/lib/communication/connectyhub-client";
import { getWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";
import type { WillianAgentConfig, WillianInstanceState } from "@/lib/communication/willian-types";
import type { ResourceTone } from "@/lib/admin/resources";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getElevenLabsConfig } from "@/lib/voice/elevenlabs";
import type {
  WhatsAppHealthCheck,
  WhatsAppHealthCheckStatus,
  WhatsAppHealthTopItem,
  WhatsAppOperationalHealth,
} from "./operational-health-types";

type DbRow = Record<string, unknown>;
type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

const SAMPLE_LIMIT = 1000;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "sim", "on", "active", "connected"].includes(value.trim().toLowerCase());
}

function safeDateMs(value: unknown) {
  const text = cleanString(value);
  if (!text) return 0;
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function latestIso(rows: DbRow[], field: string) {
  const latest = rows.reduce((max, row) => Math.max(max, safeDateMs(row[field])), 0);
  return latest ? new Date(latest).toISOString() : "";
}

function olderThanHours(value: unknown, hours: number) {
  const ms = safeDateMs(value);
  return Boolean(ms && Date.now() - ms > hours * 60 * 60 * 1000);
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function countBy(rows: DbRow[], field: string) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = cleanString(row[field], "sem_status");
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  const text = cleanString(value);
  if (!text) return [];
  return text
    .replace(/^\{|\}$/g, "")
    .split(/[,\n;]/)
    .map((item) => item.replace(/^"|"$/g, "").trim())
    .filter(Boolean);
}

function topItems(values: string[], limit = 5): WhatsAppHealthTopItem[] {
  const counts = values.reduce<Record<string, number>>((acc, value) => {
    const label = cleanString(value, "sem_detalhe");
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function redactOperationalText(value: unknown) {
  return cleanString(value, "sem_detalhe")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[numero]")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "[email]")
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

function rowMatchesAgent(row: DbRow, field: string, agentKey: string, includeAllAgents: boolean) {
  if (includeAllAgents) return true;
  const value = cleanString(row[field]);
  if (!value) return agentKey === WILLIAN_AGENT_KEY;
  return value === agentKey;
}

async function safeRows(
  supabase: SupabaseAdmin,
  table: string,
  select: string,
  options: { limit?: number; orderBy?: string } = {}
) {
  let query = supabase.from(table).select(select).limit(options.limit || SAMPLE_LIMIT);
  if (options.orderBy) query = query.order(options.orderBy, { ascending: false });

  const { data, error } = await query;
  if (error) return { rows: [] as DbRow[], error: `${table}: ${error.message}` };
  return { rows: (data || []) as unknown as DbRow[], error: "" };
}

function normalizeRuntimeStatus(value: unknown) {
  return cleanString(value, "unknown").toLowerCase();
}

function instanceIsConnected(row: DbRow) {
  const status = normalizeRuntimeStatus(row.status);
  return (
    status === "connected" ||
    status === "open" ||
    status === "online" ||
    status === "ready" ||
    asBoolean(row.connected) ||
    Boolean(cleanString(row.connected_at))
  );
}

function stageFromLead(row: DbRow) {
  const metadata = asRecord(row.metadata);
  return cleanString(metadata.crm_stage || metadata.crmStage || metadata.stage || row.status, "entrada");
}

function buildQualitySummary(reviews: DbRow[]) {
  const scores = reviews
    .map((row) => asNumber(row.score, Number.NaN))
    .filter((score) => Number.isFinite(score));
  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recentReviews = reviews.filter((row) => safeDateMs(row.created_at) >= recentCutoff);
  const averageScore = scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const lowScore = scores.filter((score) => score > 0 && score < 62).length;
  const criticalScore = scores.filter((score) => score <= 20).length;
  const verdictCounts = countBy(reviews, "verdict");
  const flags = reviews.flatMap((row) => stringList(row.review_flags));

  return {
    totalReviews: reviews.length,
    recentReviews: recentReviews.length,
    averageScore,
    lowScore,
    criticalScore,
    handoffVerdicts: verdictCounts.handoff || 0,
    blockedVerdicts: verdictCounts.bloquear || verdictCounts.blocked || 0,
    verdictCounts,
    scoreBuckets: {
      "0_20": scores.filter((score) => score <= 20).length,
      "21_61": scores.filter((score) => score > 20 && score < 62).length,
      "62_79": scores.filter((score) => score >= 62 && score < 80).length,
      "80_100": scores.filter((score) => score >= 80).length,
    },
    topFlags: topItems(flags),
    lastReviewAt: latestIso(reviews, "created_at"),
    benchmarkReady: reviews.length >= 5 && averageScore >= 70 && criticalScore / Math.max(reviews.length, 1) <= 0.2,
  };
}

function buildFollowUpSummary(followUps: DbRow[]) {
  const statusCounts = countBy(followUps, "status");
  const sent = statusCounts.sent || 0;
  const failed = statusCounts.failed || 0;
  const retryExhausted = followUps.filter((row) => {
    const status = cleanString(row.status).toLowerCase();
    return status === "failed" && asNumber(row.attempt_count) >= asNumber(row.max_attempts, 3);
  }).length;
  const activeRows = followUps.filter((row) => ["queued", "scheduled", "running"].includes(cleanString(row.status).toLowerCase()));
  const nextScheduled = activeRows
    .map((row) => safeDateMs(row.scheduled_for))
    .filter(Boolean)
    .sort((a, b) => a - b)[0];

  return {
    total: followUps.length,
    queued: statusCounts.queued || 0,
    scheduled: statusCounts.scheduled || 0,
    running: statusCounts.running || 0,
    sent,
    skipped: statusCounts.skipped || 0,
    failed,
    cancelled: (statusCounts.cancelled || 0) + (statusCounts.canceled || 0),
    retryExhausted,
    failureRate: round(failed / Math.max(sent + failed, 1), 2),
    nextScheduledFor: nextScheduled ? new Date(nextScheduled).toISOString() : "",
    topErrors: topItems(
      followUps
        .filter((row) => ["failed", "skipped"].includes(cleanString(row.status).toLowerCase()))
        .map((row) => redactOperationalText(row.error_message))
        .filter(Boolean)
    ),
  };
}

function buildLeadSummary(leads: DbRow[]) {
  const scores = leads.map((row) => asNumber(row.qualification_score, Number.NaN)).filter((score) => Number.isFinite(score));
  const stageCounts = leads.reduce<Record<string, number>>((acc, row) => {
    const stage = stageFromLead(row);
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {});

  return {
    total: leads.length,
    optOut: leads.filter((row) => asBoolean(row.opt_out)).length,
    handoff: leads.filter((row) => asBoolean(row.human_intervention_active)).length,
    averageScore: scores.length ? round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
    hot: scores.filter((score) => score >= 70).length,
    vip: leads.filter((row) => {
      const status = cleanString(row.status).toLowerCase();
      const temperature = cleanString(row.temperature).toLowerCase();
      return asNumber(row.qualification_score) >= 85 || status === "vip" || temperature === "vip";
    }).length,
    converted: leads.filter((row) => {
      const status = cleanString(row.status).toLowerCase();
      const stage = stageFromLead(row).toLowerCase();
      return status === "converted" || status === "convertido" || stage === "convertido";
    }).length,
    statusCounts: countBy(leads, "status"),
    stageCounts,
  };
}

function buildConversationSummary(conversations: DbRow[], messages: DbRow[]) {
  const latestMessageByConversation = new Map<string, DbRow>();
  for (const message of messages) {
    const conversationId = cleanString(message.conversation_id);
    if (!conversationId) continue;
    const current = latestMessageByConversation.get(conversationId);
    if (!current || safeDateMs(message.created_at) > safeDateMs(current.created_at)) {
      latestMessageByConversation.set(conversationId, message);
    }
  }

  const openConversations = conversations.filter((row) => cleanString(row.status, "open").toLowerCase() === "open");
  const needsReply = openConversations.filter((row) => {
    const lastMessage = latestMessageByConversation.get(cleanString(row.id));
    if (!lastMessage) return false;
    const direction = cleanString(lastMessage.direction).toLowerCase();
    const authorType = cleanString(lastMessage.author_type).toLowerCase();
    return direction === "inbound" || authorType === "lead";
  }).length;
  const waitingFollowUp = openConversations.filter((row) => {
    const lastMessage = latestMessageByConversation.get(cleanString(row.id));
    if (!lastMessage) return false;
    const direction = cleanString(lastMessage.direction).toLowerCase();
    const authorType = cleanString(lastMessage.author_type).toLowerCase();
    return (direction === "outbound" || authorType === "ai" || authorType === "human") && olderThanHours(lastMessage.created_at, 24);
  }).length;

  return {
    total: conversations.length,
    open: openConversations.length,
    handoff: conversations.filter((row) => asBoolean(row.human_intervention_active)).length,
    staleOpen: openConversations.filter((row) => olderThanHours(row.last_message_at || row.updated_at, 24)).length,
    needsReply,
    waitingFollowUp,
  };
}

function buildMessagesSummary(messages: DbRow[]) {
  return {
    sampled: messages.length,
    inbound: messages.filter((row) => cleanString(row.direction).toLowerCase() === "inbound").length,
    outbound: messages.filter((row) => cleanString(row.direction).toLowerCase() === "outbound").length,
    lastMessageAt: latestIso(messages, "created_at"),
  };
}

function buildGroupSummary(destinations: DbRow[], campaigns: DbRow[]) {
  const campaignStatusCounts = countBy(campaigns, "status");
  return {
    destinationsTotal: destinations.length,
    destinationsActive: destinations.filter((row) => cleanString(row.status).toLowerCase() === "active").length,
    destinationsPaused: destinations.filter((row) => cleanString(row.status).toLowerCase() === "paused").length,
    replyEnabled: destinations.filter((row) => cleanString(row.reply_mode).toLowerCase() !== "off").length,
    approvalRequired: destinations.filter((row) => asBoolean(row.human_approval_required)).length,
    campaignsTotal: campaigns.length,
    campaignsScheduled: campaignStatusCounts.scheduled || 0,
    campaignsRunning: campaignStatusCounts.running || 0,
    campaignsCompleted: campaignStatusCounts.completed || 0,
    campaignsFailed: campaignStatusCounts.failed || 0,
  };
}

function buildMetaSummary(senders: DbRow[], templates: DbRow[], campaigns: DbRow[]) {
  const campaignStatusCounts = countBy(campaigns, "status");
  return {
    sendersTotal: senders.length,
    sendersActive: senders.filter((row) => cleanString(row.status).toLowerCase() === "active").length,
    templatesTotal: templates.length,
    templatesApproved: templates.filter((row) => cleanString(row.status).toLowerCase() === "approved").length,
    campaignsTotal: campaigns.length,
    campaignsScheduled: campaignStatusCounts.scheduled || 0,
    campaignsRunning: campaignStatusCounts.running || 0,
  };
}

function checkStatus(condition: boolean, warningCondition = false): WhatsAppHealthCheckStatus {
  if (condition) return "ok";
  return warningCondition ? "warning" : "blocked";
}

function pushUnique(list: string[], value: string) {
  if (value && !list.includes(value)) list.push(value);
}

function buildFallbackHealth(input: {
  agentConfig: WillianAgentConfig;
  instanceState: WillianInstanceState;
  aiProvider: string;
  geminiKey: string | null;
  geminiModel: string;
  elevenLabsConfigured: boolean;
  voiceReady: boolean;
  checkRemote: boolean;
  reason: string;
}): WhatsAppOperationalHealth {
  const agentKey = input.agentConfig.agentKey || WILLIAN_AGENT_KEY;
  const blockers = [input.reason || "Supabase admin nao configurado."];
  const warnings: string[] = [];
  const behavior = input.agentConfig.behavior;
  const checks: WhatsAppHealthCheck[] = [
    {
      id: "database",
      label: "Banco operacional",
      status: "blocked",
      summary: "Sem acesso admin ao Supabase.",
      action: "Configurar Supabase service role antes de operar atendimento.",
    },
  ];

  return {
    ok: false,
    generatedAt: new Date().toISOString(),
    agentKey,
    agentName: input.agentConfig.agentName,
    source: "fallback",
    readiness: {
      status: "blocked",
      score: 0,
      tone: "red",
      label: "Bloqueado",
      blockers,
      warnings,
      nextActions: blockers,
      canAutoServePrivateChats: false,
      canConvertWithFollowUp: false,
    },
    integrations: {
      supabaseConfigured: false,
      aiProvider: input.aiProvider,
      geminiConfigured: Boolean(input.geminiKey),
      geminiModel: input.geminiModel,
      connectyHubAdminConfigured: input.instanceState.adminTokenConfigured,
      connectyHubAdminLooksValid: input.instanceState.adminTokenLooksValid,
      connectyHubWebhookConfigured: Boolean(input.instanceState.webhookUrl),
      connectyHubWebhookSecretConfigured: input.instanceState.webhookSecretConfigured,
      whatsappProviderReleased: input.instanceState.whatsappProviderReleased,
      whatsappReady: input.instanceState.whatsappReady,
      elevenLabsConfigured: input.elevenLabsConfigured,
      voiceReady: input.voiceReady,
    },
    agent: {
      active: behavior.active,
      aiWindowActive: behavior.aiWindowActive,
      qualificationEnabled: input.agentConfig.qualification.enabled,
      followUpEnabled: behavior.followUpEnabled,
      turingBenchmarkEnabled: behavior.turingBenchmark,
      humanInterventionEnabled: behavior.humanIntervention,
      antiLoopEnabled: behavior.antiLoop,
      cooldownEnabled: behavior.cooldownEnabled,
      crmMemoryEnabled: input.agentConfig.memory.crmEnabled,
      leadMemoryEnabled: behavior.leadMemory,
      cloneMemoryEnabled: behavior.cloneMemory,
      groupsEnabled: behavior.groupsEnabled,
      serveGroups: behavior.serveGroups,
      channelsEnabled: behavior.channelsEnabled,
      campaignEnabled: behavior.campaignEnabled,
      maxMessagesPerConversation: behavior.maxMessagesPerConversation,
      maxFollowUps: behavior.maxFollowUps,
      followUpDelayMinutes: behavior.followUpDelayMinutes,
    },
    runtime: {
      primaryConnected: false,
      remoteChecked: input.checkRemote,
      lastError: redactOperationalText(input.instanceState.lastError),
      instances: {
        total: 0,
        connected: 0,
        activeRuntime: 0,
        pausedRuntime: 0,
        withProfile: 0,
        latestUpdatedAt: "",
        summaries: [],
      },
    },
    crm: {
      leads: {
        total: 0,
        optOut: 0,
        handoff: 0,
        averageScore: 0,
        hot: 0,
        vip: 0,
        converted: 0,
        statusCounts: {},
        stageCounts: {},
      },
      conversations: {
        total: 0,
        open: 0,
        handoff: 0,
        staleOpen: 0,
        needsReply: 0,
        waitingFollowUp: 0,
      },
      messages: {
        sampled: 0,
        inbound: 0,
        outbound: 0,
        lastMessageAt: "",
      },
    },
    followUps: {
      total: 0,
      queued: 0,
      scheduled: 0,
      running: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      cancelled: 0,
      retryExhausted: 0,
      failureRate: 0,
      nextScheduledFor: "",
      topErrors: [],
    },
    quality: {
      totalReviews: 0,
      recentReviews: 0,
      averageScore: 0,
      lowScore: 0,
      criticalScore: 0,
      handoffVerdicts: 0,
      blockedVerdicts: 0,
      verdictCounts: {},
      scoreBuckets: {},
      topFlags: [],
      lastReviewAt: "",
      benchmarkReady: false,
    },
    groups: {
      destinationsTotal: 0,
      destinationsActive: 0,
      destinationsPaused: 0,
      replyEnabled: 0,
      approvalRequired: 0,
      campaignsTotal: 0,
      campaignsScheduled: 0,
      campaignsRunning: 0,
      campaignsCompleted: 0,
      campaignsFailed: 0,
    },
    metaOfficial: {
      sendersTotal: 0,
      sendersActive: 0,
      templatesTotal: 0,
      templatesApproved: 0,
      campaignsTotal: 0,
      campaignsScheduled: 0,
      campaignsRunning: 0,
    },
    checks,
    dataWarnings: blockers,
  };
}

export async function getWhatsAppOperationalHealth(options: { agentKey?: string; checkRemote?: boolean } = {}) {
  const agentKey = cleanString(options.agentKey, WILLIAN_AGENT_KEY);
  const includeAllAgents = agentKey.toLowerCase() === "all";
  const targetAgentKey = includeAllAgents ? WILLIAN_AGENT_KEY : agentKey;
  const [agentConfig, instanceState, aiProvider, geminiKey, geminiModel, elevenLabsConfig] = await Promise.all([
    getWhatsAppAgentConfig(targetAgentKey),
    getWillianInstanceState({ checkRemote: Boolean(options.checkRemote) }),
    getActiveAIProvider(),
    getGeminiApiKey(),
    getGeminiModel(),
    getElevenLabsConfig(),
  ]);
  const supabase = getSupabaseAdminClient();
  const voiceReady = Boolean(
    elevenLabsConfig.apiKey.value &&
      (elevenLabsConfig.willianVoiceId.value || elevenLabsConfig.defaultVoiceId.value || agentConfig.behavior.selectedVoiceId)
  );

  if (!supabase) {
    return buildFallbackHealth({
      agentConfig,
      instanceState,
      aiProvider,
      geminiKey,
      geminiModel,
      elevenLabsConfigured: Boolean(elevenLabsConfig.apiKey.value),
      voiceReady,
      checkRemote: Boolean(options.checkRemote),
      reason: "Supabase admin nao configurado.",
    });
  }

  const [
    agentRows,
    instanceRows,
    leadRows,
    conversationRows,
    messageRows,
    followUpRows,
    reviewRows,
    groupDestinationRows,
    groupCampaignRows,
    metaSenderRows,
    metaTemplateRows,
    metaCampaignRows,
  ] = await Promise.all([
    safeRows(supabase, "ai_agents", "agent_key,name,status,metadata,whatsapp_behavior_config,lead_qualification_config,updated_at", {
      orderBy: "updated_at",
    }),
    safeRows(supabase, "whatsapp_instances", "agent_key,provider,status,connected_at,last_seen_at,updated_at,instance_name,phone", {
      orderBy: "updated_at",
    }),
    safeRows(
      supabase,
      "whatsapp_leads",
      "id,owner_agent_key,status,temperature,qualification_score,human_intervention_active,opt_out,last_message_at,updated_at,metadata",
      { orderBy: "updated_at" }
    ),
    safeRows(supabase, "whatsapp_conversations", "id,lead_id,agent_key,status,human_intervention_active,last_message_at,updated_at,metadata", {
      orderBy: "updated_at",
    }),
    safeRows(supabase, "whatsapp_conversation_messages", "conversation_id,direction,author_type,message_type,created_at", {
      orderBy: "created_at",
    }),
    safeRows(
      supabase,
      "whatsapp_follow_ups",
      "id,conversation_id,lead_id,instance_id,agent_key,status,reason,scheduled_for,sent_at,attempt_count,max_attempts,error_message,updated_at,created_at",
      { orderBy: "created_at" }
    ),
    safeRows(supabase, "whatsapp_agent_reviews", "id,conversation_id,lead_id,agent_key,review_type,score,verdict,review_flags,created_at", {
      orderBy: "created_at",
    }),
    safeRows(
      supabase,
      "whatsapp_group_destinations",
      "id,agent_key,status,reply_mode,destination_type,human_approval_required,daily_message_limit,cooldown_minutes,updated_at",
      { orderBy: "updated_at" }
    ),
    safeRows(
      supabase,
      "whatsapp_group_campaigns",
      "id,agent_key,status,campaign_type,approval_mode,ai_enabled,voice_enabled,mention_all_requested,mention_all_confirmed,updated_at",
      { orderBy: "updated_at" }
    ),
    safeRows(supabase, "meta_whatsapp_senders", "id,status,quality_rating,messaging_limit_tier,is_default,last_synced_at", {
      orderBy: "updated_at",
    }),
    safeRows(supabase, "meta_whatsapp_templates", "id,status,category,managed_from_panel,last_synced_at", {
      orderBy: "updated_at",
    }),
    safeRows(supabase, "meta_whatsapp_campaigns", "id,status,campaign_type,approval_status,require_opt_in,updated_at", {
      orderBy: "updated_at",
    }),
  ]);

  const dataWarnings = [
    agentRows.error,
    instanceRows.error,
    leadRows.error,
    conversationRows.error,
    messageRows.error,
    followUpRows.error,
    reviewRows.error,
    groupDestinationRows.error,
    groupCampaignRows.error,
    metaSenderRows.error,
    metaTemplateRows.error,
    metaCampaignRows.error,
  ].filter(Boolean);

  const targetAgents = agentRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const targetInstances = instanceRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const targetLeads = leadRows.rows.filter((row) => rowMatchesAgent(row, "owner_agent_key", targetAgentKey, includeAllAgents));
  const targetConversations = conversationRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const conversationIds = new Set(targetConversations.map((row) => cleanString(row.id)).filter(Boolean));
  const targetMessages = messageRows.rows.filter((row) => conversationIds.has(cleanString(row.conversation_id)));
  const targetFollowUps = followUpRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const targetReviews = reviewRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const targetGroupDestinations = groupDestinationRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const targetGroupCampaigns = groupCampaignRows.rows.filter((row) => rowMatchesAgent(row, "agent_key", targetAgentKey, includeAllAgents));
  const behavior = agentConfig.behavior;
  const targetStateInstances = (instanceState.agentInstances || []).filter((instance) => {
    if (includeAllAgents) return true;
    return !instance.agentKey || instance.agentKey === targetAgentKey || (targetAgentKey === WILLIAN_AGENT_KEY && !instance.agentKey);
  });
  const runtimeInstanceSummaries = targetStateInstances.map((instance) => ({
    agentKey: instance.agentKey || targetAgentKey,
    agentName: instance.agentName,
    instanceName: instance.instanceName,
    status: instance.status || "unknown",
    runtimeStatus: instance.runtimeStatus || "unknown",
    connected: instance.connected,
    hasPhone: Boolean(instance.phoneNumber),
    hasProfile: Boolean(instance.displayName || instance.profileImageUrl),
    connectedAt: instance.connectedAt || "",
    updatedAt: instance.updatedAt || "",
  }));
  const dbConnectedInstances = targetInstances.filter(instanceIsConnected).length;
  const stateConnectedInstances = runtimeInstanceSummaries.filter((instance) => instance.connected).length;
  const connectedInstances = Math.max(dbConnectedInstances, stateConnectedInstances);
  const primaryConnected = Boolean(instanceState.status?.connected || instanceState.status?.loggedIn || connectedInstances > 0);

  const crm = {
    leads: buildLeadSummary(targetLeads),
    conversations: buildConversationSummary(targetConversations, targetMessages),
    messages: buildMessagesSummary(targetMessages),
  };
  const followUps = buildFollowUpSummary(targetFollowUps);
  const quality = buildQualitySummary(targetReviews);
  const groups = buildGroupSummary(targetGroupDestinations, targetGroupCampaigns);
  const metaOfficial = buildMetaSummary(metaSenderRows.rows, metaTemplateRows.rows, metaCampaignRows.rows);

  const blockers: string[] = [];
  const warnings: string[] = [];
  const nextActions: string[] = [];

  if (!geminiKey) {
    pushUnique(blockers, "Gemini sem API key configurada.");
    pushUnique(nextActions, "Configurar gemini_api_key ou GEMINI_API_KEY.");
  }
  if (!instanceState.adminTokenConfigured || !instanceState.adminTokenLooksValid) {
    pushUnique(blockers, "Token administrativo da ConnectyHub ausente ou incompleto.");
    pushUnique(nextActions, "Revisar CONNECTYHUB_API_TOKEN na manutencao.");
  }
  if (!instanceState.webhookUrl || !instanceState.webhookSecretConfigured) {
    pushUnique(blockers, "Webhook ConnectyHub incompleto.");
    pushUnique(nextActions, "Configurar URL e segredo do webhook ConnectyHub.");
  }
  if (!instanceState.whatsappProviderReleased) {
    pushUnique(blockers, "Provider WhatsApp ainda nao esta liberado para operacao.");
    pushUnique(nextActions, "Liberar BETEL_WHATSAPP_PROVIDER_RELEASED=true apos validar credenciais.");
  }
  if (!primaryConnected) {
    pushUnique(blockers, "Nenhuma instancia WhatsApp conectada para atendimento.");
    pushUnique(nextActions, "Conectar uma instancia lendo o QR no painel de agentes.");
  }
  if (!behavior.active) {
    pushUnique(blockers, "Agente esta inativo.");
    pushUnique(nextActions, "Ativar o agente somente depois de conexao, auditoria e follow-up estarem saudaveis.");
  }
  if (!behavior.aiWindowActive) {
    pushUnique(blockers, "Janela IA de atendimento esta desligada.");
    pushUnique(nextActions, "Ativar a janela IA para permitir respostas automaticas monitoradas.");
  }
  if (behavior.voiceCloneEnabled && !voiceReady) {
    pushUnique(blockers, "Voz clonada habilitada sem voz pronta.");
    pushUnique(nextActions, "Selecionar ou criar uma voz ElevenLabs antes de responder em audio.");
  }
  if (behavior.turingBenchmark && quality.totalReviews >= 5 && !quality.benchmarkReady) {
    pushUnique(blockers, `Benchmark de qualidade abaixo do minimo: media ${quality.averageScore}/100.`);
    pushUnique(nextActions, "Corrigir prompt/guardrails e rodar nova auditoria IA ate media 70+.");
  }

  if (!behavior.followUpEnabled) {
    pushUnique(warnings, "Follow-up automatico esta desligado.");
    pushUnique(nextActions, "Habilitar follow-up com janela comercial e limite baixo antes de escalar.");
  }
  if (!agentConfig.qualification.enabled) {
    pushUnique(warnings, "Qualificacao comercial esta desligada.");
    pushUnique(nextActions, "Ativar qualificacao para capturar objetivo, capital, regiao e proximo passo.");
  }
  if (!behavior.humanIntervention || !behavior.alertHuman) {
    pushUnique(warnings, "Handoff humano nao esta totalmente protegido.");
    pushUnique(nextActions, "Manter intervencao humana e alerta ativo para riscos, juridico e pedido de pessoa.");
  }
  if (!behavior.antiLoop || !behavior.cooldownEnabled) {
    pushUnique(warnings, "Anti-loop/cooldown precisam ficar ativos em producao.");
    pushUnique(nextActions, "Ativar anti-loop e cooldown antes de aumentar volume.");
  }
  if (followUps.failed >= 5 && followUps.failureRate >= 0.35) {
    pushUnique(warnings, `Fila de follow-up com ${followUps.failed} falhas e taxa ${Math.round(followUps.failureRate * 100)}%.`);
    pushUnique(nextActions, "Limpar numeros invalidos, pausar falhas esgotadas e testar envio manual antes do worker.");
  }
  if (crm.conversations.needsReply > 0) {
    pushUnique(warnings, `${crm.conversations.needsReply} conversas abertas parecem aguardar resposta.`);
    pushUnique(nextActions, "Priorizar conversas com ultima mensagem do lead antes de disparar campanhas.");
  }
  if (!behavior.turingBenchmark) {
    pushUnique(warnings, "Benchmark Turing esta desligado.");
    pushUnique(nextActions, "Rodar auditoria de qualidade recorrentemente com amostras reais.");
  } else if (quality.totalReviews < 5) {
    pushUnique(warnings, "Poucas auditorias IA para validar qualidade.");
    pushUnique(nextActions, "Auditar ao menos 5 conversas recentes antes de liberar escala.");
  }
  if ((behavior.groupsEnabled || behavior.serveGroups) && groups.destinationsActive === 0) {
    pushUnique(warnings, "Grupos habilitados, mas nenhum destino ativo.");
    pushUnique(nextActions, "Ativar destinos um a um com aprovacao humana e limite diario.");
  }
  if (groups.campaignsFailed > 0) {
    pushUnique(warnings, `${groups.campaignsFailed} campanhas de grupo falharam.`);
    pushUnique(nextActions, "Revisar entregas de grupos antes de agendar nova campanha.");
  }
  if (metaOfficial.sendersTotal === 0 || metaOfficial.templatesApproved === 0) {
    pushUnique(warnings, "WhatsApp oficial Meta ainda nao esta pronto para campanhas com template/opt-in.");
    pushUnique(nextActions, "Configurar remetente oficial e templates aprovados para campanhas fora da janela de 24h.");
  }
  for (const warning of dataWarnings) {
    pushUnique(warnings, warning);
  }

  let score = 100;
  score -= blockers.length * 16;
  score -= Math.min(warnings.length * 5, 30);
  score -= followUps.failed >= 5 ? Math.min(15, Math.round(followUps.failureRate * 15)) : 0;
  score -= quality.totalReviews >= 5 ? Math.max(0, Math.round((70 - quality.averageScore) / 2)) : 8;
  score = Math.max(0, Math.min(100, score));
  const status = blockers.length ? "blocked" : warnings.length ? "attention" : "ready";
  const tone: ResourceTone = status === "ready" ? "green" : status === "attention" ? "yellow" : "red";
  const label = status === "ready" ? "Pronto" : status === "attention" ? "Atencao" : "Bloqueado";
  const canAutoServePrivateChats = status !== "blocked" && primaryConnected && behavior.active && behavior.aiWindowActive && Boolean(geminiKey);
  const canConvertWithFollowUp = canAutoServePrivateChats && behavior.followUpEnabled && agentConfig.qualification.enabled && quality.benchmarkReady;

  const checks: WhatsAppHealthCheck[] = [
    {
      id: "database",
      label: "Banco operacional",
      status: dataWarnings.length ? "warning" : "ok",
      summary: dataWarnings.length ? `${dataWarnings.length} leituras com alerta.` : "Supabase admin respondendo.",
      action: dataWarnings.length ? "Checar tabelas/migracoes do modulo WhatsApp." : "Sem acao.",
    },
    {
      id: "ai",
      label: "IA",
      status: checkStatus(Boolean(geminiKey)),
      summary: geminiKey ? `${aiProvider} / ${geminiModel}` : "Gemini nao configurado.",
      action: geminiKey ? "Sem acao." : "Configurar chave Gemini.",
    },
    {
      id: "connectyhub",
      label: "ConnectyHub",
      status: checkStatus(instanceState.whatsappReady && primaryConnected),
      summary: primaryConnected ? `${connectedInstances} instancia(s) conectada(s).` : "Sem instancia conectada.",
      action: primaryConnected ? "Manter monitoramento." : "Conectar QR e validar webhook.",
    },
    {
      id: "agent",
      label: "Agente",
      status: checkStatus(behavior.active && behavior.aiWindowActive),
      summary: behavior.active && behavior.aiWindowActive ? "Atendimento IA liberado." : "Atendimento IA pausado.",
      action: behavior.active && behavior.aiWindowActive ? "Sem acao." : "Ativar agente e janela IA apos auditoria.",
    },
    {
      id: "followups",
      label: "Follow-up",
      status: behavior.followUpEnabled && followUps.failureRate < 0.35 ? "ok" : "warning",
      summary: `${followUps.sent} enviados, ${followUps.failed} falhas.`,
      action: behavior.followUpEnabled ? "Revisar erros e limites." : "Habilitar cadencia supervisionada.",
    },
    {
      id: "quality",
      label: "Qualidade",
      status: quality.benchmarkReady ? "ok" : quality.totalReviews >= 5 ? "blocked" : "warning",
      summary: quality.totalReviews ? `Media ${quality.averageScore}/100 em ${quality.totalReviews} reviews.` : "Sem reviews suficientes.",
      action: quality.benchmarkReady ? "Manter auditoria recorrente." : "Rodar auditoria e ajustar prompt.",
    },
    {
      id: "groups",
      label: "Grupos",
      status: !behavior.groupsEnabled || groups.destinationsActive > 0 ? "ok" : "warning",
      summary: `${groups.destinationsActive}/${groups.destinationsTotal} destinos ativos.`,
      action: behavior.groupsEnabled ? "Usar aprovacao humana e limite diario." : "Manter pausado ate pronto.",
    },
    {
      id: "meta",
      label: "Meta oficial",
      status: metaOfficial.sendersActive > 0 && metaOfficial.templatesApproved > 0 ? "ok" : "warning",
      summary: `${metaOfficial.sendersActive} remetentes ativos, ${metaOfficial.templatesApproved} templates aprovados.`,
      action: "Preparar opt-in/template para escala fora da janela.",
    },
  ];

  return {
    ok: status !== "blocked",
    generatedAt: new Date().toISOString(),
    agentKey: targetAgentKey,
    agentName: agentConfig.agentName,
    source: "supabase",
    readiness: {
      status,
      score,
      tone,
      label,
      blockers,
      warnings,
      nextActions: nextActions.slice(0, 8),
      canAutoServePrivateChats,
      canConvertWithFollowUp,
    },
    integrations: {
      supabaseConfigured: true,
      aiProvider,
      geminiConfigured: Boolean(geminiKey),
      geminiModel,
      connectyHubAdminConfigured: instanceState.adminTokenConfigured,
      connectyHubAdminLooksValid: instanceState.adminTokenLooksValid,
      connectyHubWebhookConfigured: Boolean(instanceState.webhookUrl),
      connectyHubWebhookSecretConfigured: instanceState.webhookSecretConfigured,
      whatsappProviderReleased: instanceState.whatsappProviderReleased,
      whatsappReady: instanceState.whatsappReady,
      elevenLabsConfigured: Boolean(elevenLabsConfig.apiKey.value),
      voiceReady,
    },
    agent: {
      active: behavior.active,
      aiWindowActive: behavior.aiWindowActive,
      qualificationEnabled: agentConfig.qualification.enabled,
      followUpEnabled: behavior.followUpEnabled,
      turingBenchmarkEnabled: behavior.turingBenchmark,
      humanInterventionEnabled: behavior.humanIntervention,
      antiLoopEnabled: behavior.antiLoop,
      cooldownEnabled: behavior.cooldownEnabled,
      crmMemoryEnabled: agentConfig.memory.crmEnabled,
      leadMemoryEnabled: behavior.leadMemory,
      cloneMemoryEnabled: behavior.cloneMemory,
      groupsEnabled: behavior.groupsEnabled,
      serveGroups: behavior.serveGroups,
      channelsEnabled: behavior.channelsEnabled,
      campaignEnabled: behavior.campaignEnabled,
      maxMessagesPerConversation: behavior.maxMessagesPerConversation,
      maxFollowUps: behavior.maxFollowUps,
      followUpDelayMinutes: behavior.followUpDelayMinutes,
    },
    runtime: {
      primaryConnected,
      remoteChecked: Boolean(options.checkRemote),
      lastError: redactOperationalText(instanceState.lastError),
      instances: {
        total: Math.max(targetInstances.length, runtimeInstanceSummaries.length),
        connected: connectedInstances,
        activeRuntime: Math.max(
          targetAgents.filter((row) => cleanString(row.status).toLowerCase() === "active").length,
          runtimeInstanceSummaries.filter((row) => row.runtimeStatus === "active").length
        ),
        pausedRuntime: Math.max(
          targetAgents.filter((row) => ["paused", "archived"].includes(cleanString(row.status).toLowerCase())).length,
          runtimeInstanceSummaries.filter((row) => ["paused", "archived"].includes(row.runtimeStatus)).length
        ),
        withProfile: Math.max(
          targetInstances.filter((row) => Boolean(cleanString(row.phone))).length,
          runtimeInstanceSummaries.filter((row) => row.hasPhone || row.hasProfile).length
        ),
        latestUpdatedAt: latestIso([...targetInstances, ...runtimeInstanceSummaries], "updatedAt") || latestIso(targetInstances, "updated_at"),
        summaries: runtimeInstanceSummaries.slice(0, 12),
      },
    },
    crm,
    followUps,
    quality,
    groups,
    metaOfficial,
    checks: checks.map((check) => ({ ...check, status: check.status, summary: check.summary, action: check.action })),
    dataWarnings,
  } satisfies WhatsAppOperationalHealth;
}
