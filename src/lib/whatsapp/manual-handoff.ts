import "server-only";

import { inngest } from "@/inngest/client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type DbRow = Record<string, unknown>;

export const MANUAL_HANDOFF_LEASE_MINUTES = 60;
export const MANUAL_HANDOFF_AUTO_RESUME_MINUTES = 5;
export const MANUAL_HANDOFF_AUTO_RESUME_REASON = "manual_handoff_auto_resume";
export const MANUAL_HANDOFF_AUTO_RESUME_EVENT = "whatsapp/manual-handoff.auto-resume";

const ACTIVE_FOLLOW_UP_STATUSES = ["queued", "scheduled", "running"];

type ManualHandoffState = {
  active: boolean;
  reason: string;
  source: string;
  operatorLabel: string;
  startedAt: string;
  lastManualAt: string;
  activeUntil: string;
  pendingInboundAt: string;
  pendingEventId: string;
  pendingTextPreview: string;
  autoResumeAfter: string;
  autoResumeFollowUpId: string;
  leaseMinutes: number;
  autoResumeMinutes: number;
};

export type ManualHandoffRuntimeDecision =
  | {
      action: "hold";
      reason: string;
      scheduledFor?: string;
      followUpId?: string;
      eventQueued?: boolean;
    }
  | {
      action: "resume";
      reason: string;
    };

export type ManualHandoffAutoResumeDecision =
  | {
      action: "proceed";
      reason: string;
      latestInboundAt: string;
    }
  | {
      action: "reschedule";
      reason: string;
      scheduledFor: string;
      latestInboundAt: string;
      eventQueued: boolean;
    }
  | {
      action: "skip";
      reason: string;
    };

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function timestamp(value: unknown) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function addMinutes(value: unknown, minutes: number) {
  const base = timestamp(value) || Date.now();
  return new Date(base + minutes * 60_000).toISOString();
}

function clampText(value: string, limit = 180) {
  const clean = value.trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 3)}...`;
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function messageCreatedAt(message: DbRow) {
  return cleanString(message.occurred_at, cleanString(message.created_at));
}

function orderedMessages(messages: DbRow[]) {
  return [...messages].sort((left, right) => timestamp(messageCreatedAt(left)) - timestamp(messageCreatedAt(right)));
}

function latestInboundMessage(messages: DbRow[]) {
  return [...orderedMessages(messages)].reverse().find((message) => cleanString(message.direction) === "inbound");
}

function latestOutboundAfter(messages: DbRow[], after: string) {
  const afterMs = timestamp(after);
  if (!afterMs) return undefined;
  return orderedMessages(messages).find(
    (message) => cleanString(message.direction) === "outbound" && timestamp(messageCreatedAt(message)) > afterMs
  );
}

function latestManualHandoffState(...metadataSources: unknown[]): ManualHandoffState {
  const metadata = metadataSources.reduce<DbRow>((acc, source) => ({ ...acc, ...asRecord(source) }), {});
  const nested = asRecord(
    firstDefined(
      metadata.human_intervention,
      metadata.humanIntervention,
      metadata.manual_handoff,
      metadata.manualHandoff
    )
  );
  const leaseMinutes = asNumber(
    firstDefined(nested.lease_minutes, nested.leaseMinutes, metadata.human_handoff_lease_minutes),
    MANUAL_HANDOFF_LEASE_MINUTES
  );
  const autoResumeMinutes = asNumber(
    firstDefined(nested.auto_resume_minutes, nested.autoResumeMinutes, metadata.human_handoff_auto_resume_minutes),
    MANUAL_HANDOFF_AUTO_RESUME_MINUTES
  );

  return {
    active: asBoolean(firstDefined(nested.active, metadata.human_handoff_active)),
    reason: cleanString(firstDefined(nested.reason, metadata.human_handoff_reason)),
    source: cleanString(firstDefined(nested.source, metadata.human_handoff_source)),
    operatorLabel: cleanString(firstDefined(nested.operator_label, nested.operatorLabel, metadata.human_handoff_operator_label)),
    startedAt: cleanString(firstDefined(nested.started_at, nested.startedAt, metadata.human_handoff_started_at)),
    lastManualAt: cleanString(firstDefined(nested.last_manual_at, nested.lastManualAt, metadata.human_handoff_last_manual_at)),
    activeUntil: cleanString(firstDefined(nested.active_until, nested.activeUntil, metadata.human_handoff_until)),
    pendingInboundAt: cleanString(
      firstDefined(nested.pending_inbound_at, nested.pendingInboundAt, metadata.human_handoff_pending_inbound_at)
    ),
    pendingEventId: cleanString(
      firstDefined(nested.pending_event_id, nested.pendingEventId, metadata.human_handoff_pending_event_id)
    ),
    pendingTextPreview: cleanString(
      firstDefined(nested.pending_text_preview, nested.pendingTextPreview, metadata.human_handoff_pending_text_preview)
    ),
    autoResumeAfter: cleanString(
      firstDefined(nested.auto_resume_after, nested.autoResumeAfter, metadata.human_handoff_auto_resume_after)
    ),
    autoResumeFollowUpId: cleanString(
      firstDefined(
        nested.auto_resume_follow_up_id,
        nested.autoResumeFollowUpId,
        metadata.human_handoff_auto_resume_follow_up_id
      )
    ),
    leaseMinutes: Math.max(1, leaseMinutes),
    autoResumeMinutes: Math.max(1, autoResumeMinutes),
  };
}

function mergeManualHandoffMetadata(metadata: unknown, state: Partial<ManualHandoffState> & DbRow) {
  const current = asRecord(metadata);
  const previous = asRecord(
    firstDefined(
      current.human_intervention,
      current.humanIntervention,
      current.manual_handoff,
      current.manualHandoff
    )
  );
  const next = {
    ...previous,
    ...state,
  };

  return {
    ...current,
    human_intervention: next,
    humanIntervention: next,
    human_handoff_active: next.active ?? null,
    human_handoff_reason: next.reason ?? null,
    human_handoff_source: next.source ?? null,
    human_handoff_started_at: next.started_at ?? null,
    human_handoff_last_manual_at: next.last_manual_at ?? null,
    human_handoff_until: next.active_until ?? null,
    human_handoff_pending_inbound_at: next.pending_inbound_at ?? null,
    human_handoff_pending_event_id: next.pending_event_id ?? null,
    human_handoff_pending_text_preview: next.pending_text_preview ?? null,
    human_handoff_auto_resume_after: next.auto_resume_after ?? null,
    human_handoff_auto_resume_follow_up_id: next.auto_resume_follow_up_id ?? null,
    human_handoff_released_at: next.resumed_at ?? null,
    human_handoff_release_reason: next.release_reason ?? null,
  };
}

async function cancelPendingManualAutoResume(
  supabase: SupabaseAdminClient,
  conversationId: string,
  reason: string,
  now: string
) {
  if (!conversationId) return;
  await supabase
    .from("whatsapp_follow_ups")
    .update({ status: "cancelled", error_message: reason, updated_at: now })
    .eq("conversation_id", conversationId)
    .eq("reason", MANUAL_HANDOFF_AUTO_RESUME_REASON)
    .in("status", ACTIVE_FOLLOW_UP_STATUSES);
}

export function isManualHandoffAutoResumeFollowUp(followUp: DbRow) {
  const payload = asRecord(followUp.payload);
  return (
    cleanString(followUp.reason) === MANUAL_HANDOFF_AUTO_RESUME_REASON ||
    cleanString(payload.source) === MANUAL_HANDOFF_AUTO_RESUME_REASON
  );
}

export async function requestManualHandoffAutoResumeEvent(input: {
  followUpId: string;
  conversationId: string;
  leadId: string;
  agentKey: string;
  scheduledFor: string;
}) {
  const followUpId = cleanString(input.followUpId);
  if (!followUpId) return false;

  try {
    await inngest.send({
      name: MANUAL_HANDOFF_AUTO_RESUME_EVENT,
      data: {
        followUpId,
        conversationId: cleanString(input.conversationId) || null,
        leadId: cleanString(input.leadId) || null,
        agentKey: cleanString(input.agentKey) || null,
        scheduledFor: cleanString(input.scheduledFor) || null,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function markManualReplyHandoff(
  supabase: SupabaseAdminClient,
  input: {
    conversationId: string;
    leadId?: string;
    agentKey: string;
    operatorLabel?: string;
    reason?: string;
    source?: string;
    note?: string;
    now?: string;
    lastMessagePreview?: string;
  }
) {
  const conversationId = cleanString(input.conversationId);
  const leadId = cleanString(input.leadId);
  const now = cleanString(input.now, new Date().toISOString());
  const activeUntil = addMinutes(now, MANUAL_HANDOFF_LEASE_MINUTES);
  const operatorLabel = cleanString(input.operatorLabel, "Operador Betel");
  const [conversationResult, leadResult] = await Promise.all([
    conversationId
      ? supabase.from("whatsapp_conversations").select("metadata").eq("id", conversationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    leadId
      ? supabase.from("whatsapp_leads").select("metadata").eq("id", leadId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const conversationMetadata = asRecord(asRecord(conversationResult.data).metadata);
  const leadMetadata = asRecord(asRecord(leadResult.data).metadata);
  const previousState = latestManualHandoffState(conversationMetadata, leadMetadata);
  const state = {
    active: true,
    reason: cleanString(input.reason, "manual_reply"),
    source: cleanString(input.source, "admin_whatsapp_panel"),
    note: cleanString(input.note) || null,
    agent_key: cleanString(input.agentKey) || null,
    operator_label: operatorLabel,
    started_at: previousState.active ? previousState.startedAt || now : now,
    last_manual_at: now,
    active_until: activeUntil,
    lease_minutes: MANUAL_HANDOFF_LEASE_MINUTES,
    auto_resume_minutes: MANUAL_HANDOFF_AUTO_RESUME_MINUTES,
    pending_inbound_at: null,
    pending_event_id: null,
    pending_text_preview: null,
    auto_resume_after: null,
    auto_resume_follow_up_id: null,
    resumed_at: null,
    release_reason: null,
  };
  const errors = [conversationResult.error?.message, leadResult.error?.message].filter(Boolean);

  await cancelPendingManualAutoResume(supabase, conversationId, "manual_reply_reset_handoff_timer", now);

  const conversationPatch: DbRow = {
    human_intervention_active: true,
    assigned_to_label: operatorLabel,
    last_human_message_at: now,
    metadata: mergeManualHandoffMetadata(conversationMetadata, state),
    updated_at: now,
  };
  const preview = cleanString(input.lastMessagePreview);
  if (preview) {
    conversationPatch.last_message_at = now;
    conversationPatch.last_message_preview = clampText(preview, 180);
  }

  const leadPatch: DbRow = {
    human_intervention_active: true,
    status: "human_handoff",
    metadata: mergeManualHandoffMetadata(leadMetadata, state),
    updated_at: now,
  };
  if (preview) leadPatch.last_message_at = now;

  const [conversationUpdate, leadUpdate] = await Promise.all([
    conversationId
      ? supabase.from("whatsapp_conversations").update(conversationPatch).eq("id", conversationId)
      : Promise.resolve({ error: null }),
    leadId
      ? supabase.from("whatsapp_leads").update(leadPatch).eq("id", leadId)
      : Promise.resolve({ error: null }),
  ]);

  const updateErrors = [conversationUpdate.error?.message, leadUpdate.error?.message].filter(Boolean);
  return {
    ok: !errors.length && !updateErrors.length,
    activeUntil,
    errors: [...errors, ...updateErrors],
  };
}

export async function releaseManualHandoffForAi(
  supabase: SupabaseAdminClient,
  input: {
    conversationId: string;
    leadId?: string;
    agentKey?: string;
    reason: string;
    source?: string;
    followUpId?: string;
    eventId?: string;
    now?: string;
  }
) {
  const conversationId = cleanString(input.conversationId);
  const leadId = cleanString(input.leadId);
  const now = cleanString(input.now, new Date().toISOString());
  const [conversationResult, leadResult] = await Promise.all([
    conversationId
      ? supabase
          .from("whatsapp_conversations")
          .select("metadata")
          .eq("id", conversationId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    leadId
      ? supabase
          .from("whatsapp_leads")
          .select("metadata,qualification_score,status")
          .eq("id", leadId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const conversationMetadata = asRecord(asRecord(conversationResult.data).metadata);
  const leadRow = asRecord(leadResult.data);
  const leadMetadata = asRecord(leadRow.metadata);
  const state = {
    active: false,
    source: cleanString(input.source, MANUAL_HANDOFF_AUTO_RESUME_REASON),
    agent_key: cleanString(input.agentKey) || null,
    event_id: cleanString(input.eventId) || null,
    follow_up_id: cleanString(input.followUpId) || null,
    resumed_at: now,
    release_reason: cleanString(input.reason),
    pending_inbound_at: null,
    pending_event_id: null,
    pending_text_preview: null,
    auto_resume_after: null,
    auto_resume_follow_up_id: null,
  };
  const score = asNumber(leadRow.qualification_score, 0);
  const nextLeadStatus = score >= 70 ? "qualificado" : "qualificando";

  await Promise.all([
    conversationId
      ? supabase
          .from("whatsapp_conversations")
          .update({
            human_intervention_active: false,
            ai_paused_until: null,
            assigned_to_label: null,
            metadata: mergeManualHandoffMetadata(conversationMetadata, state),
            updated_at: now,
          })
          .eq("id", conversationId)
      : Promise.resolve({ error: null }),
    leadId
      ? supabase
          .from("whatsapp_leads")
          .update({
            human_intervention_active: false,
            status: nextLeadStatus,
            metadata: mergeManualHandoffMetadata(leadMetadata, state),
            updated_at: now,
          })
          .eq("id", leadId)
      : Promise.resolve({ error: null }),
  ]);
}

export async function handleInboundDuringManualHandoff(
  supabase: SupabaseAdminClient,
  input: {
    conversationId: string;
    leadId: string;
    instanceId?: string;
    agentKey: string;
    eventId?: string;
    inboundText?: string;
    receivedAt?: string;
  }
): Promise<ManualHandoffRuntimeDecision> {
  const conversationId = cleanString(input.conversationId);
  const leadId = cleanString(input.leadId);
  const agentKey = cleanString(input.agentKey, "multichannel-dispatch");
  const receivedAt = cleanString(input.receivedAt, new Date().toISOString());
  const nowMs = timestamp(receivedAt) || Date.now();
  const [conversationResult, leadResult] = await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .select("id,instance_id,metadata,human_intervention_active,last_human_message_at")
      .eq("id", conversationId)
      .maybeSingle(),
    supabase
      .from("whatsapp_leads")
      .select("id,metadata,human_intervention_active,qualification_score,status")
      .eq("id", leadId)
      .maybeSingle(),
  ]);
  const conversation = asRecord(conversationResult.data);
  const lead = asRecord(leadResult.data);
  const conversationMetadata = asRecord(conversation.metadata);
  const leadMetadata = asRecord(lead.metadata);
  const state = latestManualHandoffState(conversationMetadata, leadMetadata);
  const active =
    asBoolean(conversation.human_intervention_active) ||
    asBoolean(lead.human_intervention_active) ||
    state.active;

  if (!active) return { action: "resume", reason: "manual_handoff_not_active" };

  const fallbackActiveUntil = timestamp(conversation.last_human_message_at)
    ? new Date(timestamp(conversation.last_human_message_at) + MANUAL_HANDOFF_LEASE_MINUTES * 60_000).toISOString()
    : "";
  const activeUntil = state.activeUntil || fallbackActiveUntil;
  if (activeUntil && timestamp(activeUntil) <= nowMs) {
    await releaseManualHandoffForAi(supabase, {
      conversationId,
      leadId,
      agentKey,
      eventId: cleanString(input.eventId),
      reason: "manual_handoff_lease_expired",
      source: "connectyhub_webhook",
      now: receivedAt,
    });
    return { action: "resume", reason: "manual_handoff_lease_expired" };
  }

  const scheduledFor = addMinutes(receivedAt, MANUAL_HANDOFF_AUTO_RESUME_MINUTES);
  const pendingTextPreview = clampText(cleanString(input.inboundText), 180);
  await cancelPendingManualAutoResume(supabase, conversationId, "new_inbound_during_manual_handoff", receivedAt);
  const { data: followUpRow, error: followUpError } = await supabase
    .from("whatsapp_follow_ups")
    .insert({
      conversation_id: conversationId,
      lead_id: leadId,
      instance_id: cleanString(input.instanceId, cleanString(conversation.instance_id)) || null,
      agent_key: agentKey || null,
      status: "scheduled",
      reason: MANUAL_HANDOFF_AUTO_RESUME_REASON,
      response_mode: "mirror",
      scheduled_for: scheduledFor,
      max_attempts: 2,
      payload: {
        source: MANUAL_HANDOFF_AUTO_RESUME_REASON,
        eventId: cleanString(input.eventId) || null,
        pendingInboundAt: receivedAt,
        pendingTextPreview: pendingTextPreview || null,
        humanHandoffActiveUntil: activeUntil || null,
        autoResumeMinutes: MANUAL_HANDOFF_AUTO_RESUME_MINUTES,
        leaseMinutes: MANUAL_HANDOFF_LEASE_MINUTES,
      },
    })
    .select("id")
    .maybeSingle();

  if (followUpError) {
    return { action: "hold", reason: `auto_resume_schedule_failed:${followUpError.message}` };
  }

  const followUpId = cleanString(followUpRow?.id);
  const eventQueued = await requestManualHandoffAutoResumeEvent({
    followUpId,
    conversationId,
    leadId,
    agentKey,
    scheduledFor,
  });
  const pendingState = {
    active: true,
    reason: state.reason || "manual_reply",
    source: state.source || "admin_whatsapp_panel",
    agent_key: agentKey || null,
    operator_label: state.operatorLabel || null,
    started_at: state.startedAt || receivedAt,
    last_manual_at: state.lastManualAt || cleanString(conversation.last_human_message_at) || null,
    active_until: activeUntil || null,
    lease_minutes: MANUAL_HANDOFF_LEASE_MINUTES,
    auto_resume_minutes: MANUAL_HANDOFF_AUTO_RESUME_MINUTES,
    pending_inbound_at: receivedAt,
    pending_event_id: cleanString(input.eventId) || null,
    pending_text_preview: pendingTextPreview || null,
    auto_resume_after: scheduledFor,
    auto_resume_follow_up_id: followUpId || null,
    auto_resume_event_queued: eventQueued,
  };

  await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .update({
        metadata: mergeManualHandoffMetadata(conversationMetadata, pendingState),
        updated_at: receivedAt,
      })
      .eq("id", conversationId),
    supabase
      .from("whatsapp_leads")
      .update({
        metadata: mergeManualHandoffMetadata(leadMetadata, pendingState),
        updated_at: receivedAt,
      })
      .eq("id", leadId),
  ]);

  return {
    action: "hold",
    reason: "manual_handoff_waiting_human_reply",
    scheduledFor,
    followUpId,
    eventQueued,
  };
}

export async function evaluateManualHandoffAutoResume(input: {
    followUp: DbRow;
    lead: DbRow;
    conversation: DbRow;
    messages: DbRow[];
    now?: string;
}): Promise<ManualHandoffAutoResumeDecision> {
  const now = cleanString(input.now, new Date().toISOString());
  const nowMs = timestamp(now) || Date.now();
  const followUp = input.followUp;
  const conversationId = cleanString(followUp.conversation_id, cleanString(input.conversation.id));
  const leadId = cleanString(followUp.lead_id, cleanString(input.lead.id));
  const agentKey = cleanString(followUp.agent_key, cleanString(input.conversation.agent_key, "multichannel-dispatch"));
  const latestInbound = latestInboundMessage(input.messages);

  if (!latestInbound) return { action: "skip", reason: "manual_handoff_no_pending_inbound" };

  const latestInboundAt = messageCreatedAt(latestInbound);
  const latestInboundAtMs = timestamp(latestInboundAt);
  if (!latestInboundAtMs) return { action: "skip", reason: "manual_handoff_invalid_pending_inbound" };

  const answeredAfterInbound = latestOutboundAfter(input.messages, latestInboundAt);
  if (answeredAfterInbound) return { action: "skip", reason: "manual_handoff_already_answered" };

  const autoResumeMinutes = Math.max(
    1,
    asNumber(asRecord(input.conversation.metadata).human_handoff_auto_resume_minutes, MANUAL_HANDOFF_AUTO_RESUME_MINUTES)
  );
  if (nowMs - latestInboundAtMs < autoResumeMinutes * 60_000) {
    const scheduledFor = addMinutes(latestInboundAt, autoResumeMinutes);
    const eventQueued = await requestManualHandoffAutoResumeEvent({
      followUpId: cleanString(followUp.id),
      conversationId,
      leadId,
      agentKey,
      scheduledFor,
    });
    return {
      action: "reschedule",
      reason: "manual_handoff_newer_inbound_waiting_window",
      scheduledFor,
      latestInboundAt,
      eventQueued,
    };
  }

  return {
    action: "proceed",
    reason: MANUAL_HANDOFF_AUTO_RESUME_REASON,
    latestInboundAt,
  };
}
