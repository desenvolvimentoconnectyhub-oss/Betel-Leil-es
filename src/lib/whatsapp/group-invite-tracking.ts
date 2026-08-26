import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  normalizeWhatsAppNumber,
  sendWhatsAppAgentReply,
  type ConnectyHubDeliveryResult,
  type WhatsAppActionButtonInput,
} from "@/lib/communication/connectyhub-client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  WhatsAppSdrAppointmentSettings,
  WhatsAppSdrAppointmentSummary,
} from "@/lib/whatsapp/sdr-appointment-types";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type BetelGroupInviteOutcome = "scheduled" | "disqualified";

export type BetelGroupInviteTrackingPayload = {
  v: 1;
  trackId: string;
  leadId: string;
  conversationId: string | null;
  appointmentId: string | null;
  agentKey: string;
  outcome: BetelGroupInviteOutcome;
  groupUrl: string;
  createdAt: string;
};

export type BetelGroupInviteTrackingClick = {
  clickedAt: string;
  ip: string;
  forwardedFor: string;
  country: string;
  region: string;
  city: string;
  latitude: string;
  longitude: string;
  timezone: string;
  browser: string;
  os: string;
  deviceType: string;
  userAgent: string;
  referer: string;
};

export type BetelGroupInviteSendInput = {
  agentKey: string;
  providerInstanceId: string | null;
  leadId: string | null;
  conversationId: string | null;
  leadPhone: string;
  leadName: string;
  settings: WhatsAppSdrAppointmentSettings;
  outcome: BetelGroupInviteOutcome;
  appointment?: WhatsAppSdrAppointmentSummary | null;
  reason?: string;
  eventId?: string;
};

export type BetelGroupInviteSendResult = {
  ok: boolean;
  status:
    | "sent"
    | "delivery_unconfirmed"
    | "disabled"
    | "duplicate"
    | "missing_context"
    | "invalid_group_url"
    | "delivery_failed";
  text?: string;
  trackId?: string;
  trackingUrl?: string;
  groupUrl?: string;
  delivery?: ConnectyHubDeliveryResult;
  error?: string;
};

const GROUP_INVITE_SENT_SOURCE = "whatsapp_group_invite_sent";
const GROUP_INVITE_CLICK_SOURCE = "whatsapp_group_invite_click";
const GROUP_INVITE_FAILED_SOURCE = "whatsapp_group_invite_send_failed";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "yes", "sim", "on"].includes(value.trim().toLowerCase());
  return false;
}

function leadFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] || "tudo bem";
}

function publicAppUrl() {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const fallbackVercel = vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//i, "")}` : "";
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackVercel
  ).replace(/\/+$/g, "");
}

function trackingSecret() {
  return (
    process.env.BETEL_GROUP_INVITE_TRACKING_SECRET?.trim() ||
    process.env.SDR_APPOINTMENT_ACTION_SECRET?.trim() ||
    process.env.CONNECTYHUB_WEBHOOK_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

function encodePayload(payload: BetelGroupInviteTrackingPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodePayload(encoded: string): BetelGroupInviteTrackingPayload | null {
  if (!encoded || encoded.length > 3000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as unknown;
    const record = asRecord(parsed);
    const outcome = asString(record.outcome);
    if (record.v !== 1 || !asString(record.trackId) || !asString(record.leadId)) return null;
    if (outcome !== "scheduled" && outcome !== "disqualified") return null;

    return {
      v: 1,
      trackId: asString(record.trackId),
      leadId: asString(record.leadId),
      conversationId: asString(record.conversationId) || null,
      appointmentId: asString(record.appointmentId) || null,
      agentKey: asString(record.agentKey),
      outcome,
      groupUrl: asString(record.groupUrl),
      createdAt: asString(record.createdAt),
    };
  } catch {
    return null;
  }
}

function signEncodedPayload(encoded: string) {
  const secret = trackingSecret();
  if (!secret || !encoded) return "";
  return createHmac("sha256", secret).update(encoded).digest("hex").slice(0, 64);
}

export function verifyBetelGroupInvitePayload(encoded: string, signature: string) {
  const expected = signEncodedPayload(encoded);
  if (!expected || !signature || expected.length !== signature.length) return null;

  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  } catch {
    return null;
  }

  return decodePayload(encoded);
}

function normalizeGroupUrl(value: unknown) {
  const clean = asString(value);
  if (!clean || !/^https?:\/\//i.test(clean)) return "";

  try {
    const url = new URL(clean);
    if (url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function isSafeGroupDestination(value: string) {
  const url = normalizeGroupUrl(value);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "chat.whatsapp.com" || host === "whatsapp.com" || host === "www.whatsapp.com") {
      return parsed.toString();
    }
  } catch {
    return "";
  }

  return "";
}

export function safeBetelGroupDestination(value: string) {
  return isSafeGroupDestination(value);
}

function renderGroupInviteText(input: BetelGroupInviteSendInput, trackingUrl: string, groupUrl: string) {
  const appointment = input.appointment || null;
  const template =
    input.outcome === "scheduled"
      ? input.settings.messageTemplates.leadGroupInviteAfterScheduled
      : input.settings.messageTemplates.leadGroupInviteAfterDisqualified;
  const replacements: Record<string, string> = {
    lead_nome: input.leadName || "Lead",
    lead_primeiro_nome: leadFirstName(input.leadName || "Lead"),
    lead_telefone: normalizeWhatsAppNumber(input.leadPhone) || "nao informado",
    horario: appointment?.scheduleLabel || "",
    resumo: appointment?.conversationSummary || "",
    resumo_sdr: appointment?.sdrBriefing || appointment?.conversationSummary || "",
    grupo_betel_link: trackingUrl || groupUrl,
    grupo_betel_botao: input.settings.groupInvite.buttonLabel,
  };

  return template
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => replacements[key] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function buildBetelGroupInviteTrackingUrl(input: {
  leadId: string;
  conversationId: string | null;
  appointmentId: string | null;
  agentKey: string;
  outcome: BetelGroupInviteOutcome;
  groupUrl: string;
  trackId?: string;
}) {
  const groupUrl = isSafeGroupDestination(input.groupUrl);
  if (!groupUrl) return { trackId: input.trackId || "", trackingUrl: "", groupUrl: "" };

  const baseUrl = publicAppUrl();
  const trackId = input.trackId || `betel-group-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  if (!baseUrl || !trackingSecret()) return { trackId, trackingUrl: groupUrl, groupUrl };

  const payload = encodePayload({
    v: 1,
    trackId,
    leadId: input.leadId,
    conversationId: input.conversationId,
    appointmentId: input.appointmentId,
    agentKey: input.agentKey,
    outcome: input.outcome,
    groupUrl,
    createdAt: new Date().toISOString(),
  });
  const signature = signEncodedPayload(payload);
  const url = new URL("/api/whatsapp/group-invite", baseUrl);
  url.searchParams.set("t", payload);
  url.searchParams.set("s", signature);
  return { trackId, trackingUrl: url.toString(), groupUrl };
}

function inviteEnabledForOutcome(settings: WhatsAppSdrAppointmentSettings, outcome: BetelGroupInviteOutcome) {
  if (!settings.groupInvite.enabled) return false;
  if (outcome === "scheduled") return settings.groupInvite.sendAfterScheduled;
  return settings.groupInvite.sendAfterDisqualified;
}

async function readMetadataTargets(
  supabase: SupabaseAdminClient,
  input: { leadId: string; conversationId: string | null },
) {
  const [leadResult, conversationResult, profileResult] = await Promise.all([
    supabase.from("whatsapp_leads").select("metadata").eq("id", input.leadId).maybeSingle(),
    input.conversationId
      ? supabase.from("whatsapp_conversations").select("metadata").eq("id", input.conversationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("whatsapp_lead_profiles").select("metadata").eq("lead_id", input.leadId).maybeSingle(),
  ]);

  return {
    leadMetadata: asRecord(asRecord(leadResult.data).metadata),
    conversationMetadata: asRecord(asRecord(conversationResult.data).metadata),
    profileMetadata: asRecord(asRecord(profileResult.data).metadata),
  };
}

function mergeInviteMetadata(metadata: unknown, event: Record<string, unknown>) {
  const current = asRecord(metadata);
  const currentInvite = asRecord(current.betel_group_invite || current.betelGroupInvite);
  const previousEvents = Array.isArray(current.betel_group_invite_events)
    ? (current.betel_group_invite_events as unknown[])
    : Array.isArray(current.betelGroupInviteEvents)
      ? (current.betelGroupInviteEvents as unknown[])
      : [];
  const events = [...previousEvents, event].slice(-30);
  const nextInvite = {
    ...currentInvite,
    lastEvent: event,
    lastOutcome: event.outcome ?? currentInvite.lastOutcome ?? null,
    lastSentAt: event.eventType === "sent" ? event.at : currentInvite.lastSentAt ?? null,
    lastClickAt: event.eventType === "click" ? event.at : currentInvite.lastClickAt ?? null,
    lastTrackId: event.trackId ?? currentInvite.lastTrackId ?? null,
  };

  return {
    ...current,
    betel_group_invite: nextInvite,
    betelGroupInvite: nextInvite,
    betel_group_invite_events: events,
    betelGroupInviteEvents: events,
  };
}

async function updateMetadataWithInviteEvent(
  supabase: SupabaseAdminClient,
  input: {
    leadId: string;
    conversationId: string | null;
    event: Record<string, unknown>;
  },
) {
  const targets = await readMetadataTargets(supabase, {
    leadId: input.leadId,
    conversationId: input.conversationId,
  });
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("whatsapp_leads")
      .update({
        metadata: mergeInviteMetadata(targets.leadMetadata, input.event),
        updated_at: now,
      })
      .eq("id", input.leadId),
    input.conversationId
      ? supabase
          .from("whatsapp_conversations")
          .update({
            metadata: mergeInviteMetadata(targets.conversationMetadata, input.event),
            updated_at: now,
          })
          .eq("id", input.conversationId)
      : Promise.resolve(),
    supabase
      .from("whatsapp_lead_profiles")
      .update({
        metadata: mergeInviteMetadata(targets.profileMetadata, input.event),
        updated_at: now,
      })
      .eq("lead_id", input.leadId),
  ]);
}

async function hasRecentGroupInviteSent(
  supabase: SupabaseAdminClient,
  input: { leadId: string; appointmentId: string | null; outcome: BetelGroupInviteOutcome },
) {
  const { data, error } = await supabase
    .from("whatsapp_lead_files")
    .select("id, metadata, created_at")
    .eq("lead_id", input.leadId)
    .eq("source", GROUP_INVITE_SENT_SOURCE)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error || !Array.isArray(data)) return false;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60_000;

  return data.some((row) => {
    const metadata = asRecord(asRecord(row).metadata);
    const createdAt = new Date(asString(asRecord(row).created_at)).getTime();
    const sameOutcome = asString(metadata.outcome) === input.outcome;
    const sameAppointment = input.appointmentId && asString(metadata.appointmentId) === input.appointmentId;
    const recentDisqualified =
      input.outcome === "disqualified" && sameOutcome && Number.isFinite(createdAt) && createdAt >= sevenDaysAgo;
    return Boolean(sameAppointment || recentDisqualified);
  });
}

async function insertLeadFileEvent(
  supabase: SupabaseAdminClient,
  input: {
    source: string;
    leadId: string;
    conversationId: string | null;
    trackId: string;
    fileUrl: string;
    metadata: Record<string, unknown>;
  },
) {
  await supabase.from("whatsapp_lead_files").insert({
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    storage_key: `whatsapp/group-invite/${input.leadId}/${input.trackId}-${input.source}.json`,
    file_url: input.fileUrl || null,
    mime_type: "application/json",
    source: input.source,
    metadata: input.metadata,
  });
}

async function insertConversationInviteMessage(
  supabase: SupabaseAdminClient,
  input: {
    leadId: string;
    conversationId: string | null;
    agentKey: string;
    text: string;
    actionButton: WhatsAppActionButtonInput;
    delivery: ConnectyHubDeliveryResult;
    trackId: string;
    outcome: BetelGroupInviteOutcome;
    eventId?: string;
  },
) {
  if (!input.conversationId) return;

  await supabase.from("whatsapp_conversation_messages").insert({
    conversation_id: input.conversationId,
    lead_id: input.leadId,
    direction: "outbound",
    author_type: "ai",
    author_label: "Evelyn",
    message_type: "text",
    text: input.text,
    delivery_status: input.delivery.providerStatus || (input.delivery.ok ? "sent" : "failed"),
    provider_message_id: input.delivery.externalDeliveryId || null,
    payload: {
      kind: "betel_group_invite_message",
      eventId: input.eventId || null,
      outcome: input.outcome,
      trackId: input.trackId,
      action_button: input.actionButton,
      delivery: input.delivery,
    },
  });
}

function acceptedDelivery(delivery: ConnectyHubDeliveryResult) {
  return delivery.ok || asBoolean(delivery.deliveryUnconfirmed);
}

function revalidateWhatsAppViews() {
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/agenda");
  revalidatePath("/admin/mensagens");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/appointments");
}

export async function sendBetelGroupInvite(input: BetelGroupInviteSendInput): Promise<BetelGroupInviteSendResult> {
  const supabase = getSupabaseAdminClient();
  const leadId = asString(input.leadId);
  const leadPhone = normalizeWhatsAppNumber(input.leadPhone);

  if (!inviteEnabledForOutcome(input.settings, input.outcome)) return { ok: false, status: "disabled" };
  if (!supabase || !leadId || !leadPhone) return { ok: false, status: "missing_context" };

  const groupUrl = isSafeGroupDestination(input.settings.groupInvite.groupUrl);
  if (!groupUrl) return { ok: false, status: "invalid_group_url" };

  const appointmentId = input.appointment?.id ?? null;
  if (
    await hasRecentGroupInviteSent(supabase, {
      leadId,
      appointmentId,
      outcome: input.outcome,
    })
  ) {
    return { ok: true, status: "duplicate", groupUrl };
  }

  const tracking = buildBetelGroupInviteTrackingUrl({
    leadId,
    conversationId: input.conversationId,
    appointmentId,
    agentKey: input.agentKey,
    outcome: input.outcome,
    groupUrl,
  });
  const trackingUrl = input.settings.groupInvite.trackingEnabled ? tracking.trackingUrl : groupUrl;
  const actionButton: WhatsAppActionButtonInput = {
    footerText: input.settings.groupInvite.footerText,
    choices: [
      {
        label: input.settings.groupInvite.buttonLabel,
        url: trackingUrl || groupUrl,
      },
    ],
  };
  const text = renderGroupInviteText(input, trackingUrl, groupUrl);
  const trackId = tracking.trackId || `betel-group-${leadId}-${Date.now().toString(36)}`;
  const delivery = await sendWhatsAppAgentReply({
    agentKey: input.agentKey,
    instanceId: input.providerInstanceId || undefined,
    number: leadPhone,
    text,
    trackId,
    actionButton,
  });
  const sentAt = new Date().toISOString();
  const status = acceptedDelivery(delivery)
    ? delivery.deliveryUnconfirmed
      ? "delivery_unconfirmed"
      : "sent"
    : "delivery_failed";
  const metadata = {
    kind: "betel_group_invite",
    eventType: acceptedDelivery(delivery) ? "sent" : "failed",
    at: sentAt,
    sentAt,
    outcome: input.outcome,
    reason: input.reason || null,
    eventId: input.eventId || null,
    appointmentId,
    scheduleLabel: input.appointment?.scheduleLabel ?? null,
    scheduledFor: input.appointment?.scheduledFor ?? null,
    trackId,
    leadName: input.leadName || "Lead",
    leadPhone,
    text,
    groupUrl,
    trackingUrl,
    buttonLabel: input.settings.groupInvite.buttonLabel,
    trackingEnabled: input.settings.groupInvite.trackingEnabled,
    delivery,
  };

  await insertConversationInviteMessage(supabase, {
    leadId,
    conversationId: input.conversationId,
    agentKey: input.agentKey,
    text,
    actionButton,
    delivery,
    trackId,
    outcome: input.outcome,
    eventId: input.eventId,
  });

  await insertLeadFileEvent(supabase, {
    source: acceptedDelivery(delivery) ? GROUP_INVITE_SENT_SOURCE : GROUP_INVITE_FAILED_SOURCE,
    leadId,
    conversationId: input.conversationId,
    trackId,
    fileUrl: trackingUrl || groupUrl,
    metadata,
  });

  await updateMetadataWithInviteEvent(supabase, {
    leadId,
    conversationId: input.conversationId,
    event: metadata,
  });

  revalidateWhatsAppViews();

  if (!acceptedDelivery(delivery)) {
    return {
      ok: false,
      status,
      text,
      trackId,
      trackingUrl,
      groupUrl,
      delivery,
      error: delivery.errorMessage || delivery.providerStatus,
    };
  }

  return { ok: true, status, text, trackId, trackingUrl, groupUrl, delivery };
}

function decodeHeaderValue(value: string) {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function headerValue(headers: Headers, keys: string[]) {
  for (const key of keys) {
    const value = asString(headers.get(key));
    if (value) return value;
  }
  return "";
}

function firstIp(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean)[0] || "";
}

function parseUserAgent(userAgent: string) {
  const normalized = userAgent.toLowerCase();
  const browser =
    normalized.includes("edg/")
      ? "Edge"
      : normalized.includes("opr/") || normalized.includes("opera")
        ? "Opera"
        : normalized.includes("firefox/")
          ? "Firefox"
          : normalized.includes("safari/") && !normalized.includes("chrome/")
            ? "Safari"
            : normalized.includes("chrome/")
              ? "Chrome"
              : normalized.includes("whatsapp")
                ? "WhatsApp"
                : "Nao identificado";
  const os =
    normalized.includes("android")
      ? "Android"
      : normalized.includes("iphone") || normalized.includes("ipad") || normalized.includes("ios")
        ? "iOS"
        : normalized.includes("windows")
          ? "Windows"
          : normalized.includes("mac os")
            ? "macOS"
            : normalized.includes("linux")
              ? "Linux"
              : "Nao identificado";
  const deviceType =
    normalized.includes("ipad") || normalized.includes("tablet")
      ? "tablet"
      : normalized.includes("mobile") || normalized.includes("android") || normalized.includes("iphone")
        ? "mobile"
        : "desktop";

  return { browser, os, deviceType };
}

export function buildBetelGroupInviteClickFromRequest(request: Request): BetelGroupInviteTrackingClick {
  const headers = request.headers;
  const forwardedFor = headerValue(headers, ["x-forwarded-for", "x-vercel-forwarded-for"]);
  const ip = firstIp(
    headerValue(headers, ["cf-connecting-ip", "x-real-ip"]) ||
      forwardedFor ||
      headerValue(headers, ["x-client-ip"]),
  );
  const userAgent = headerValue(headers, ["user-agent"]);
  const parsed = parseUserAgent(userAgent);

  return {
    clickedAt: new Date().toISOString(),
    ip,
    forwardedFor,
    country: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-country", "cf-ipcountry"])),
    region: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-country-region", "x-vercel-ip-region"])),
    city: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-city"])),
    latitude: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-latitude"])),
    longitude: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-longitude"])),
    timezone: decodeHeaderValue(headerValue(headers, ["x-vercel-ip-timezone"])),
    browser: parsed.browser,
    os: parsed.os,
    deviceType: parsed.deviceType,
    userAgent,
    referer: headerValue(headers, ["referer", "referrer"]),
  };
}

export async function recordBetelGroupInviteClick(input: {
  payload: BetelGroupInviteTrackingPayload;
  click: BetelGroupInviteTrackingClick;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.payload.leadId) return;

  const event = {
    kind: "betel_group_invite",
    eventType: "click",
    at: input.click.clickedAt,
    clickedAt: input.click.clickedAt,
    outcome: input.payload.outcome,
    appointmentId: input.payload.appointmentId,
    trackId: input.payload.trackId,
    agentKey: input.payload.agentKey,
    groupUrl: input.payload.groupUrl,
    tracking: {
      ip: input.click.ip,
      forwardedFor: input.click.forwardedFor,
      referer: input.click.referer,
    },
    geo: {
      country: input.click.country,
      region: input.click.region,
      city: input.click.city,
      latitude: input.click.latitude,
      longitude: input.click.longitude,
      timezone: input.click.timezone,
    },
    device: {
      browser: input.click.browser,
      os: input.click.os,
      deviceType: input.click.deviceType,
      userAgent: input.click.userAgent,
    },
  };

  await insertLeadFileEvent(supabase, {
    source: GROUP_INVITE_CLICK_SOURCE,
    leadId: input.payload.leadId,
    conversationId: input.payload.conversationId,
    trackId: input.payload.trackId,
    fileUrl: input.payload.groupUrl,
    metadata: event,
  });

  await updateMetadataWithInviteEvent(supabase, {
    leadId: input.payload.leadId,
    conversationId: input.payload.conversationId,
    event,
  });

  revalidateWhatsAppViews();
}
