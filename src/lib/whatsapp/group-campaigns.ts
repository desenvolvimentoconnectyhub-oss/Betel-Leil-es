import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CONNECTYHUB_PROVIDER,
  WILLIAN_AGENT_KEY,
  listConnectyHubWhatsAppGroups,
  sendWhatsAppDestinationText,
  type ConnectyHubWhatsAppGroupSummary,
} from "@/lib/communication/connectyhub-client";
import { getWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type WhatsAppCommunityReplyMode =
  | "off"
  | "mentions"
  | "relevant"
  | "observer"
  | "all"
  | "admins"
  | "approval";

export type WhatsAppCommunityDestination = {
  id: string;
  agentKey: string;
  instanceId: string;
  provider: string;
  destinationType: "group" | "channel" | "status" | "contact_list" | "lead_segment";
  jid: string;
  name: string;
  description: string;
  participantCount: number;
  adminCount: number;
  isAnnouncement: boolean;
  isCommunity: boolean;
  isAdmin: boolean;
  inviteUrl: string;
  status: "active" | "paused" | "blocked" | "archived";
  replyMode: WhatsAppCommunityReplyMode;
  respondWithMention: boolean;
  mentionAllAllowed: boolean;
  humanApprovalRequired: boolean;
  dailyMessageLimit: number;
  cooldownMinutes: number;
  lastSyncedAt: string;
  lastMessageAt: string;
  updatedAt: string;
};

export type WhatsAppCommunityCampaign = {
  id: string;
  agentKey: string;
  name: string;
  status: string;
  campaignType: string;
  approvalMode: string;
  aiEnabled: boolean;
  voiceEnabled: boolean;
  voiceId: string;
  productRef: string;
  subject: string;
  bodyText: string;
  scheduledFor: string;
  nextRunAt: string;
  dailyLimit: number;
  mentionAllRequested: boolean;
  mentionAllConfirmed: boolean;
  targetCount: number;
  sentCount: number;
  failedCount: number;
  updatedAt: string;
};

export type WhatsAppCommunityEvent = {
  id: string;
  destinationId: string;
  providerChatId: string;
  participantPhone: string;
  participantName: string;
  messageType: string;
  text: string;
  decisionStatus: string;
  occurredAt: string;
};

export type WhatsAppCommunityData = {
  ok: boolean;
  migrationRequired: boolean;
  error: string;
  metrics: {
    totalDestinations: number;
    activeDestinations: number;
    groups: number;
    channels: number;
    scheduledCampaigns: number;
    pendingApprovals: number;
    observedEvents24h: number;
  };
  destinations: WhatsAppCommunityDestination[];
  campaigns: WhatsAppCommunityCampaign[];
  recentEvents: WhatsAppCommunityEvent[];
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function asIso(value: unknown) {
  return cleanString(value);
}

function normalizeAgentKey(value: unknown) {
  return cleanString(value, WILLIAN_AGENT_KEY);
}

function destinationTypeFromJid(jid: string): WhatsAppCommunityDestination["destinationType"] {
  if (jid.includes("@newsletter")) return "channel";
  if (jid === "status" || jid.includes("status@broadcast")) return "status";
  return "group";
}

function migrationMissing(error: unknown) {
  const message = error instanceof Error ? error.message : cleanString(asRecord(error).message || error);
  return /whatsapp_group_|relation .* does not exist|schema cache/i.test(message);
}

function emptyData(error = "", migrationRequired = false): WhatsAppCommunityData {
  return {
    ok: !error,
    migrationRequired,
    error,
    metrics: {
      totalDestinations: 0,
      activeDestinations: 0,
      groups: 0,
      channels: 0,
      scheduledCampaigns: 0,
      pendingApprovals: 0,
      observedEvents24h: 0,
    },
    destinations: [],
    campaigns: [],
    recentEvents: [],
  };
}

function mapDestination(row: Record<string, unknown>): WhatsAppCommunityDestination {
  return {
    id: cleanString(row.id),
    agentKey: cleanString(row.agent_key),
    instanceId: cleanString(row.instance_id),
    provider: cleanString(row.provider, CONNECTYHUB_PROVIDER),
    destinationType: cleanString(row.destination_type, "group") as WhatsAppCommunityDestination["destinationType"],
    jid: cleanString(row.jid),
    name: cleanString(row.name, "Destino WhatsApp"),
    description: cleanString(row.description),
    participantCount: asNumber(row.participant_count),
    adminCount: asNumber(row.admin_count),
    isAnnouncement: asBoolean(row.is_announcement),
    isCommunity: asBoolean(row.is_community),
    isAdmin: asBoolean(row.is_admin),
    inviteUrl: cleanString(row.invite_url),
    status: cleanString(row.status, "paused") as WhatsAppCommunityDestination["status"],
    replyMode: cleanString(row.reply_mode, "off") as WhatsAppCommunityReplyMode,
    respondWithMention: row.respond_with_mention !== false,
    mentionAllAllowed: asBoolean(row.mention_all_allowed),
    humanApprovalRequired: asBoolean(row.human_approval_required),
    dailyMessageLimit: asNumber(row.daily_message_limit, 3),
    cooldownMinutes: asNumber(row.cooldown_minutes, 30),
    lastSyncedAt: asIso(row.last_synced_at),
    lastMessageAt: asIso(row.last_message_at),
    updatedAt: asIso(row.updated_at),
  };
}

function mapEvent(row: Record<string, unknown>): WhatsAppCommunityEvent {
  return {
    id: cleanString(row.id),
    destinationId: cleanString(row.destination_id),
    providerChatId: cleanString(row.provider_chat_id),
    participantPhone: cleanString(row.participant_phone),
    participantName: cleanString(row.participant_name),
    messageType: cleanString(row.message_type, "text"),
    text: cleanString(row.text),
    decisionStatus: cleanString(row.decision_status, "observed"),
    occurredAt: asIso(row.occurred_at),
  };
}

function mapCampaign(row: Record<string, unknown>, targets: Record<string, Array<Record<string, unknown>>>): WhatsAppCommunityCampaign {
  const campaignTargets = targets[cleanString(row.id)] || [];
  return {
    id: cleanString(row.id),
    agentKey: cleanString(row.agent_key),
    name: cleanString(row.name, "Campanha WhatsApp"),
    status: cleanString(row.status, "draft"),
    campaignType: cleanString(row.campaign_type, "single"),
    approvalMode: cleanString(row.approval_mode, "manual"),
    aiEnabled: asBoolean(row.ai_enabled),
    voiceEnabled: asBoolean(row.voice_enabled),
    voiceId: cleanString(row.voice_id),
    productRef: cleanString(row.product_ref),
    subject: cleanString(row.subject),
    bodyText: cleanString(row.body_text),
    scheduledFor: asIso(row.scheduled_for),
    nextRunAt: asIso(row.next_run_at),
    dailyLimit: asNumber(row.daily_limit, 20),
    mentionAllRequested: asBoolean(row.mention_all_requested),
    mentionAllConfirmed: asBoolean(row.mention_all_confirmed),
    targetCount: campaignTargets.length,
    sentCount: campaignTargets.filter((target) => cleanString(target.status) === "sent").length,
    failedCount: campaignTargets.filter((target) => cleanString(target.status) === "failed").length,
    updatedAt: asIso(row.updated_at),
  };
}

async function latestWhatsappInstance(supabase: SupabaseAdmin, agentKey: string) {
  const baseSelect = "id,agent_key,provider_instance_id,instance_name,status";
  const byAgent = await supabase
    .from("whatsapp_instances")
    .select(baseSelect)
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("agent_key", agentKey)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byAgent.data) return byAgent.data as Record<string, unknown>;

  const fallback = await supabase
    .from("whatsapp_instances")
    .select(baseSelect)
    .eq("provider", CONNECTYHUB_PROVIDER)
    .neq("status", "deleted")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback.data ? (fallback.data as Record<string, unknown>) : null;
}

export async function getWhatsAppCommunityData(agentKeyInput = WILLIAN_AGENT_KEY): Promise<WhatsAppCommunityData> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return emptyData("Supabase service role nao configurado.");

  const agentKey = normalizeAgentKey(agentKeyInput);

  try {
    const destinationsResult = await supabase
      .from("whatsapp_group_destinations")
      .select("*")
      .eq("agent_key", agentKey)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (destinationsResult.error) throw destinationsResult.error;

    const campaignsResult = await supabase
      .from("whatsapp_group_campaigns")
      .select("*")
      .eq("agent_key", agentKey)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(40);
    if (campaignsResult.error) throw campaignsResult.error;

    const campaignIds = (campaignsResult.data || []).map((row) => cleanString((row as Record<string, unknown>).id)).filter(Boolean);
    const targetsByCampaign: Record<string, Array<Record<string, unknown>>> = {};
    if (campaignIds.length) {
      const targetsResult = await supabase
        .from("whatsapp_group_campaign_targets")
        .select("campaign_id,status")
        .in("campaign_id", campaignIds);
      if (targetsResult.error) throw targetsResult.error;
      for (const target of targetsResult.data || []) {
        const record = target as Record<string, unknown>;
        const campaignId = cleanString(record.campaign_id);
        targetsByCampaign[campaignId] = [...(targetsByCampaign[campaignId] || []), record];
      }
    }

    const eventsResult = await supabase
      .from("whatsapp_group_message_events")
      .select("*")
      .eq("agent_key", agentKey)
      .order("occurred_at", { ascending: false })
      .limit(30);
    if (eventsResult.error) throw eventsResult.error;

    const destinations = (destinationsResult.data || []).map((row) => mapDestination(row as Record<string, unknown>));
    const campaigns = (campaignsResult.data || []).map((row) => mapCampaign(row as Record<string, unknown>, targetsByCampaign));
    const recentEvents = (eventsResult.data || []).map((row) => mapEvent(row as Record<string, unknown>));
    const since24h = Date.now() - 24 * 60 * 60 * 1000;

    return {
      ok: true,
      migrationRequired: false,
      error: "",
      metrics: {
        totalDestinations: destinations.length,
        activeDestinations: destinations.filter((destination) => destination.status === "active").length,
        groups: destinations.filter((destination) => destination.destinationType === "group").length,
        channels: destinations.filter((destination) => destination.destinationType === "channel").length,
        scheduledCampaigns: campaigns.filter((campaign) => ["scheduled", "running"].includes(campaign.status)).length,
        pendingApprovals: recentEvents.filter((event) => event.decisionStatus === "needs_approval").length,
        observedEvents24h: recentEvents.filter((event) => {
          const time = new Date(event.occurredAt).getTime();
          return Number.isFinite(time) && time >= since24h;
        }).length,
      },
      destinations,
      campaigns,
      recentEvents,
    };
  } catch (error) {
    if (migrationMissing(error)) {
      return emptyData("Migration de grupos/campanhas ainda nao aplicada no Supabase.", true);
    }
    return emptyData(error instanceof Error ? error.message : "Falha ao carregar grupos e campanhas.");
  }
}

async function upsertDestinationFromGroup(input: {
  supabase: SupabaseAdmin;
  agentKey: string;
  instanceId: string;
  group: ConnectyHubWhatsAppGroupSummary;
}) {
  const now = new Date().toISOString();
  const destinationType = destinationTypeFromJid(input.group.jid);
  const basePayload = {
    agent_key: input.agentKey,
    instance_id: input.instanceId || null,
    provider: CONNECTYHUB_PROVIDER,
    destination_type: destinationType,
    jid: input.group.jid,
    name: input.group.name,
    description: input.group.description || null,
    participant_count: input.group.participantCount,
    admin_count: input.group.adminCount,
    is_announcement: input.group.isAnnouncement,
    is_community: input.group.isCommunity,
    is_admin: input.group.isAdmin,
    invite_url: input.group.inviteUrl || null,
    last_synced_at: now,
    metadata: {
      raw: input.group.raw,
      syncSource: "connectyhub_group_list",
    },
  };

  const existing = await input.supabase
    .from("whatsapp_group_destinations")
    .select("id")
    .eq("provider", CONNECTYHUB_PROVIDER)
    .eq("jid", input.group.jid)
    .maybeSingle();

  const destinationResult = existing.data
    ? await input.supabase
        .from("whatsapp_group_destinations")
        .update(basePayload)
        .eq("id", cleanString((existing.data as Record<string, unknown>).id))
        .select("id")
        .maybeSingle()
    : await input.supabase
        .from("whatsapp_group_destinations")
        .insert({
          ...basePayload,
          status: "paused",
          reply_mode: "off",
          respond_with_mention: true,
          mention_all_allowed: false,
          human_approval_required: false,
        })
        .select("id")
        .maybeSingle();

  if (destinationResult.error) throw destinationResult.error;
  const destinationId = cleanString((destinationResult.data as Record<string, unknown> | null)?.id);

  if (destinationId && input.group.participants.length) {
    const participantRows = input.group.participants
      .filter((participant) => participant.jid)
      .slice(0, 1000)
      .map((participant) => ({
        destination_id: destinationId,
        participant_jid: participant.jid,
        phone: participant.phone || null,
        display_name: participant.displayName || null,
        is_admin: participant.isAdmin,
        is_super_admin: participant.isSuperAdmin,
        metadata: {
          raw: participant.raw,
          syncedAt: now,
        },
      }));

    if (participantRows.length) {
      const participantsResult = await input.supabase
        .from("whatsapp_group_participants")
        .upsert(participantRows, { onConflict: "destination_id,participant_jid" });
      if (participantsResult.error) throw participantsResult.error;
    }
  }

  return destinationId;
}

export async function syncWhatsAppCommunityDestinations(input: {
  agentKey?: string;
  force?: boolean;
  noParticipants?: boolean;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase service role nao configurado.");

  const agentKey = normalizeAgentKey(input.agentKey);
  const instance = await latestWhatsappInstance(supabase, agentKey);
  const instanceId = cleanString(instance?.id);
  const providerInstanceId = cleanString(instance?.provider_instance_id);

  const remote = await listConnectyHubWhatsAppGroups({
    agentKey,
    instanceId: providerInstanceId,
    force: input.force,
    noParticipants: input.noParticipants,
    limit: 1000,
  });

  let synced = 0;
  for (const group of remote.groups) {
    const destinationId = await upsertDestinationFromGroup({
      supabase,
      agentKey,
      instanceId,
      group,
    });
    if (destinationId) synced += 1;
  }

  return {
    ok: true,
    agentKey,
    instanceId,
    providerInstanceId: remote.instanceId,
    synced,
    groups: remote.groups.length,
    data: await getWhatsAppCommunityData(agentKey),
  };
}

export async function updateWhatsAppCommunityDestination(input: {
  id: string;
  status?: string;
  replyMode?: string;
  respondWithMention?: boolean;
  mentionAllAllowed?: boolean;
  humanApprovalRequired?: boolean;
  dailyMessageLimit?: number;
  cooldownMinutes?: number;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase service role nao configurado.");

  const payload: Record<string, unknown> = {};
  if (input.status) payload.status = input.status;
  if (input.replyMode) payload.reply_mode = input.replyMode;
  if (typeof input.respondWithMention === "boolean") payload.respond_with_mention = input.respondWithMention;
  if (typeof input.mentionAllAllowed === "boolean") payload.mention_all_allowed = input.mentionAllAllowed;
  if (typeof input.humanApprovalRequired === "boolean") payload.human_approval_required = input.humanApprovalRequired;
  if (typeof input.dailyMessageLimit === "number") payload.daily_message_limit = Math.max(1, Math.min(250, Math.trunc(input.dailyMessageLimit)));
  if (typeof input.cooldownMinutes === "number") payload.cooldown_minutes = Math.max(1, Math.min(1440, Math.trunc(input.cooldownMinutes)));

  if (!cleanString(input.id) || !Object.keys(payload).length) {
    throw new Error("Destino ou alteracao ausente.");
  }

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .update(payload)
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) throw error;

  return {
    ok: true,
    destination: mapDestination(data as Record<string, unknown>),
  };
}

export async function createWhatsAppCommunityCampaign(input: {
  agentKey?: string;
  name: string;
  bodyText: string;
  destinationIds?: string[];
  destinationJids?: string[];
  campaignType?: string;
  approvalMode?: string;
  scheduledFor?: string;
  dailyLimit?: number;
  mentionAllRequested?: boolean;
  mentionAllConfirmed?: boolean;
  aiEnabled?: boolean;
  voiceEnabled?: boolean;
  voiceId?: string;
  productRef?: string;
  subject?: string;
  prompt?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) throw new Error("Supabase service role nao configurado.");

  const agentKey = normalizeAgentKey(input.agentKey);
  const name = cleanString(input.name, "Campanha WhatsApp");
  const bodyText = cleanString(input.bodyText);
  if (!bodyText) throw new Error("Informe a mensagem da campanha.");
  if (input.mentionAllRequested && !input.mentionAllConfirmed) {
    throw new Error("Mencionar todos exige confirmacao extra antes de agendar.");
  }

  const selectedIds = [...new Set((input.destinationIds || []).map((value) => cleanString(value)).filter(Boolean))];
  const selectedJids = [...new Set((input.destinationJids || []).map((value) => cleanString(value)).filter(Boolean))];
  let destinationRows: Array<Record<string, unknown>> = [];

  if (selectedIds.length) {
    const destinationsResult = await supabase
      .from("whatsapp_group_destinations")
      .select("id,jid,destination_type,status")
      .in("id", selectedIds);
    if (destinationsResult.error) throw destinationsResult.error;
    destinationRows = (destinationsResult.data || []) as Array<Record<string, unknown>>;
  }

  for (const jid of selectedJids) {
    if (!destinationRows.some((row) => cleanString(row.jid) === jid)) {
      destinationRows.push({ id: null, jid, destination_type: destinationTypeFromJid(jid), status: "external" });
    }
  }

  if (!destinationRows.length) throw new Error("Escolha pelo menos um grupo ou canal.");

  const scheduledFor = cleanString(input.scheduledFor) || new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: campaign, error: campaignError } = await supabase
    .from("whatsapp_group_campaigns")
    .insert({
      agent_key: agentKey,
      name,
      status: "scheduled",
      campaign_type: cleanString(input.campaignType, "single"),
      approval_mode: cleanString(input.approvalMode, "manual"),
      ai_enabled: Boolean(input.aiEnabled),
      voice_enabled: Boolean(input.voiceEnabled),
      voice_id: cleanString(input.voiceId) || null,
      product_ref: cleanString(input.productRef) || null,
      subject: cleanString(input.subject) || null,
      prompt: cleanString(input.prompt) || null,
      body_text: bodyText,
      scheduled_for: scheduledFor,
      next_run_at: scheduledFor,
      daily_limit: Math.max(1, Math.min(250, Math.trunc(input.dailyLimit || 20))),
      mention_all_requested: Boolean(input.mentionAllRequested),
      mention_all_confirmed: Boolean(input.mentionAllConfirmed),
      metadata: {
        createdFrom: "whatsapp_agent_panel",
      },
    })
    .select("*")
    .maybeSingle();
  if (campaignError) throw campaignError;

  const campaignId = cleanString((campaign as Record<string, unknown> | null)?.id);
  const targetRows = destinationRows.map((row) => ({
    campaign_id: campaignId,
    destination_id: cleanString(row.id) || null,
    destination_jid: cleanString(row.jid),
    destination_type: cleanString(row.destination_type, "group"),
    status: "scheduled",
    metadata: {
      sourceStatus: cleanString(row.status),
    },
  }));

  const targetsResult = await supabase.from("whatsapp_group_campaign_targets").insert(targetRows);
  if (targetsResult.error) throw targetsResult.error;

  return {
    ok: true,
    campaignId,
    targets: targetRows.length,
    data: await getWhatsAppCommunityData(agentKey),
  };
}

function nextRunAfter(campaignType: string, from: Date) {
  const next = new Date(from);
  if (campaignType === "daily" || campaignType === "fixed" || campaignType === "ai" || campaignType === "voice" || campaignType === "mixed") {
    next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  if (campaignType === "weekly") {
    next.setDate(next.getDate() + 7);
    return next.toISOString();
  }
  if (campaignType === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next.toISOString();
  }
  return "";
}

export async function processWhatsAppCommunityCampaigns(input: { limit?: number; dryRun?: boolean } = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, processed: 0, sent: 0, failed: 0, error: "Supabase service role nao configurado." };

  const now = new Date();
  const campaignsResult = await supabase
    .from("whatsapp_group_campaigns")
    .select("*")
    .in("status", ["scheduled", "running"])
    .order("updated_at", { ascending: true })
    .limit(Math.max(1, Math.min(50, input.limit || 10)));
  if (campaignsResult.error) {
    return { ok: false, processed: 0, sent: 0, failed: 0, error: campaignsResult.error.message };
  }

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const campaignRow of (campaignsResult.data || []) as Array<Record<string, unknown>>) {
    const campaignId = cleanString(campaignRow.id);
    const agentKey = normalizeAgentKey(campaignRow.agent_key);
    const dueAt = cleanString(campaignRow.next_run_at || campaignRow.scheduled_for);
    const dueTime = dueAt ? new Date(dueAt).getTime() : 0;
    if (!dueTime || dueTime > now.getTime()) continue;

    processed += 1;
    const config = await getWhatsAppAgentConfig(agentKey).catch(() => null);
    if (!config?.behavior.campaignEnabled) {
      await supabase
        .from("agent_runtime_events")
        .insert({
          run_id: null,
          run_code: `WHATSAPP-CAMPAIGN-${Date.now().toString(36).toUpperCase()}`,
          agent_key: agentKey,
          event_type: "whatsapp_group_campaign_skipped",
          status: "campaign_disabled",
          provider: CONNECTYHUB_PROVIDER,
          model: "campaign-worker",
          attempt: 1,
          message: "Campanha WhatsApp ignorada porque campaignEnabled esta desligado no agente.",
          payload: { campaignId },
        });
      continue;
    }

    const bodyText = cleanString(campaignRow.body_text);
    const campaignType = cleanString(campaignRow.campaign_type, "single");
    const dailyLimit = Math.max(1, Math.min(250, asNumber(campaignRow.daily_limit, 20)));

    const targetsResult = await supabase
      .from("whatsapp_group_campaign_targets")
      .select("*")
      .eq("campaign_id", campaignId)
      .in("status", ["scheduled", "pending", "failed"])
      .limit(dailyLimit);
    if (targetsResult.error || !bodyText) {
      failed += 1;
      await supabase
        .from("whatsapp_group_campaigns")
        .update({ status: "failed", metadata: { error: targetsResult.error?.message || "Mensagem vazia." } })
        .eq("id", campaignId);
      continue;
    }

    for (const targetRow of (targetsResult.data || []) as Array<Record<string, unknown>>) {
      const targetId = cleanString(targetRow.id);
      const destinationJid = cleanString(targetRow.destination_jid);
      const trackId = `betel-group-campaign-${campaignId}-${targetId}-${Date.now()}`;
      let deliveryPayload: Record<string, unknown> = {};
      let deliveryStatus = "sent";
      let errorMessage = "";

      if (!input.dryRun) {
        const delivery = await sendWhatsAppDestinationText({
          agentKey,
          destinationJid,
          text: bodyText,
          trackId,
          sendOptions: {
            delayMs: 1500,
            readChat: true,
          },
        });
        deliveryPayload = delivery as unknown as Record<string, unknown>;
        deliveryStatus = delivery.ok ? "sent" : "failed";
        errorMessage = delivery.errorMessage || "";
      }

      const deliveryResult = await supabase
        .from("whatsapp_group_campaign_deliveries")
        .insert({
          campaign_id: campaignId,
          target_id: targetId,
          destination_id: cleanString(targetRow.destination_id) || null,
          provider_message_id: cleanString(deliveryPayload.externalDeliveryId) || null,
          delivery_status: input.dryRun ? "skipped" : deliveryStatus,
          payload: deliveryPayload,
          error_message: errorMessage || null,
          scheduled_for: dueAt || null,
          sent_at: deliveryStatus === "sent" && !input.dryRun ? new Date().toISOString() : null,
          attempt_count: 1,
        });
      if (deliveryResult.error) errorMessage = deliveryResult.error.message;

      await supabase
        .from("whatsapp_group_campaign_targets")
        .update({
          status: input.dryRun ? "skipped" : deliveryStatus,
          last_error: errorMessage || null,
          sent_at: deliveryStatus === "sent" && !input.dryRun ? new Date().toISOString() : null,
        })
        .eq("id", targetId);

      if (deliveryStatus === "sent") sent += 1;
      else failed += 1;
    }

    const nextRunAt = nextRunAfter(campaignType, now);
    await supabase
      .from("whatsapp_group_campaigns")
      .update({
        status: nextRunAt ? "scheduled" : "completed",
        last_run_at: new Date().toISOString(),
        next_run_at: nextRunAt || null,
      })
      .eq("id", campaignId);
  }

  return { ok: failed === 0, processed, sent, failed, timestamp: new Date().toISOString() };
}

export async function recordWhatsAppGroupMessageEvent(input: {
  agentKey: string;
  instanceId: string;
  webhookEventId?: string;
  destinationJid: string;
  destinationName?: string;
  providerMessageId?: string;
  participantJid?: string;
  participantPhone?: string;
  participantName?: string;
  messageType?: string;
  text?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  occurredAt?: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, reason: "missing_supabase" };

  const agentKey = normalizeAgentKey(input.agentKey);
  const destinationJid = cleanString(input.destinationJid);
  if (!destinationJid) return { ok: false, reason: "missing_destination" };

  try {
    const existing = await supabase
      .from("whatsapp_group_destinations")
      .select("*")
      .eq("provider", CONNECTYHUB_PROVIDER)
      .eq("jid", destinationJid)
      .maybeSingle();
    if (existing.error) throw existing.error;

    let destination = existing.data ? mapDestination(existing.data as Record<string, unknown>) : null;
    if (!destination) {
      const inserted = await supabase
        .from("whatsapp_group_destinations")
        .insert({
          agent_key: agentKey,
          instance_id: cleanString(input.instanceId) || null,
          provider: CONNECTYHUB_PROVIDER,
          destination_type: destinationTypeFromJid(destinationJid),
          jid: destinationJid,
          name: cleanString(input.destinationName, destinationJid),
          status: "paused",
          reply_mode: "off",
          last_message_at: input.occurredAt || new Date().toISOString(),
          metadata: {
            createdFrom: "group_webhook_event",
          },
        })
        .select("*")
        .maybeSingle();
      if (inserted.error) throw inserted.error;
      destination = mapDestination(inserted.data as Record<string, unknown>);
    }

    const existingEvent = input.providerMessageId
      ? await supabase
          .from("whatsapp_group_message_events")
          .select("id")
          .eq("provider", CONNECTYHUB_PROVIDER)
          .eq("provider_message_id", input.providerMessageId)
          .maybeSingle()
      : null;

    if (existingEvent?.data) {
      return { ok: true, skipped: true, reason: "duplicate_group_event", destinationId: destination.id };
    }

    const shouldQueueApproval = destination.status === "active" && (destination.replyMode === "approval" || destination.humanApprovalRequired);
    const decisionStatus = shouldQueueApproval ? "needs_approval" : "observed";
    const occurredAt = input.occurredAt || new Date().toISOString();
    const eventResult = await supabase
      .from("whatsapp_group_message_events")
      .insert({
        destination_id: destination.id || null,
        instance_id: cleanString(input.instanceId) || null,
        agent_key: agentKey,
        webhook_event_id: cleanString(input.webhookEventId) || null,
        provider: CONNECTYHUB_PROVIDER,
        provider_message_id: cleanString(input.providerMessageId) || null,
        provider_chat_id: destinationJid,
        participant_jid: cleanString(input.participantJid) || null,
        participant_phone: cleanString(input.participantPhone) || null,
        participant_name: cleanString(input.participantName) || null,
        message_type: cleanString(input.messageType, "text"),
        text: cleanString(input.text) || null,
        media_url: cleanString(input.mediaUrl) || null,
        media_mime_type: cleanString(input.mediaMimeType) || null,
        decision_status: decisionStatus,
        response_due_at: shouldQueueApproval ? new Date(Date.now() + Math.max(destination.cooldownMinutes, 3) * 60 * 1000).toISOString() : null,
        occurred_at: occurredAt,
        metadata: {
          payload: input.payload || {},
          observer: {
            replyMode: destination.replyMode,
            destinationStatus: destination.status,
            automaticReplyEnabled: false,
          },
        },
      })
      .select("id")
      .maybeSingle();
    if (eventResult.error) throw eventResult.error;

    await supabase
      .from("whatsapp_group_destinations")
      .update({ last_message_at: occurredAt })
      .eq("id", destination.id);

    return {
      ok: true,
      destinationId: destination.id,
      eventId: cleanString((eventResult.data as Record<string, unknown> | null)?.id),
      decisionStatus,
    };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Falha ao registrar evento de grupo.",
    };
  }
}
