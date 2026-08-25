import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppNumber, sendWhatsAppAgentReply } from "@/lib/communication/connectyhub-client";
import type { WillianAgentConfig } from "@/lib/communication/willian-types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppMeetingScheduleCandidate } from "@/lib/whatsapp/conversation-runtime";
import type {
  SdrLeadConfirmationStatus,
  SdrAppointmentStatus,
  WhatsAppSdrAppointmentData,
  WhatsAppSdrAppointmentMetrics,
  WhatsAppSdrAppointmentRecipient,
  WhatsAppSdrAppointmentSettings,
  WhatsAppSdrAppointmentSummary,
} from "@/lib/whatsapp/sdr-appointment-types";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

type AppointmentRow = Record<string, unknown>;
type LeadRow = Record<string, unknown>;
type ConversationRow = Record<string, unknown>;
type ProfileRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

export type SdrRuntimeAppointmentResult = {
  ok: boolean;
  status:
    | "scheduled"
    | "rescheduled"
    | "already_scheduled"
    | "needs_time"
    | "outside_business_hours"
    | "slot_full"
    | "missing_notification_user"
    | "error";
  appointment: WhatsAppSdrAppointmentSummary | null;
  promptContext: string;
  suggestions: string[];
  error?: string;
};

export type CreateSdrAppointmentFromRuntimeInput = {
  agentKey: string;
  config: WillianAgentConfig;
  conversationId: string | null;
  decisionMeetingSchedule: WhatsAppMeetingScheduleCandidate | null | undefined;
  inboundText: string;
  instanceId: string | null;
  providerInstanceId: string | null;
  leadId: string | null;
  leadPhone: string;
};

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const DEFAULT_BUSINESS_START_HOUR = 8;
const DEFAULT_BUSINESS_END_HOUR = 19;
const DEFAULT_MAX_BOOKINGS_PER_HOUR = 2;
const ACTIVE_STATUSES: SdrAppointmentStatus[] = ["pending_confirmation", "scheduled", "notified"];
const RESCHEDULE_REQUESTED_STATUS: SdrLeadConfirmationStatus = "reschedule_requested";
const MAX_SUMMARY_LENGTH = 900;
const MAX_BRIEFING_LENGTH = 1200;
const CONFIRMATION_ACTIONS = new Set(["confirm", "reschedule"]);

const datePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: DEFAULT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DEFAULT_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DEFAULT_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
});

const shortTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: DEFAULT_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text.length > 0 ? text : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampText(value: string, limit: number): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function localParts(date = new Date()) {
  const parts = Object.fromEntries(datePartsFormatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function addLocalDays(parts: ReturnType<typeof localParts>, days: number) {
  const utcNoon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 15, 0, 0, 0));
  return localParts(utcNoon);
}

function localDateTimeToIso(parts: { year: number; month: number; day: number; hour: number; minute?: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour + 3, parts.minute ?? 0, 0, 0)).toISOString();
}

function hourBucketIso(scheduledFor: string) {
  const parts = localParts(new Date(scheduledFor));
  return localDateTimeToIso({ ...parts, minute: 0 });
}

function reminderDueAtIso(scheduledFor: string) {
  return new Date(Date.parse(scheduledFor) - 5 * 60_000).toISOString();
}

function confirmationDueAtIso(scheduledFor: string) {
  const scheduledAt = Date.parse(scheduledFor);
  const parts = localParts(new Date(scheduledFor));
  const noonConfirmation = localDateTimeToIso({ ...parts, hour: 12, minute: 30 });
  const thirtyMinutesBefore = scheduledAt - 30 * 60_000;
  const dueAt =
    Date.parse(noonConfirmation) < thirtyMinutesBefore
      ? noonConfirmation
      : new Date(scheduledAt - 2 * 60 * 60_000).toISOString();

  return dueAt;
}

function sameLocalDay(left: Date, right: Date) {
  const a = localParts(left);
  const b = localParts(right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

function formatAppointmentDateTime(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  if (sameLocalDay(date, today)) return `hoje as ${shortTimeFormatter.format(date)}`;

  const tomorrowParts = addLocalDays(localParts(today), 1);
  const appointmentParts = localParts(date);
  if (
    appointmentParts.year === tomorrowParts.year &&
    appointmentParts.month === tomorrowParts.month &&
    appointmentParts.day === tomorrowParts.day
  ) {
    return `amanha as ${shortTimeFormatter.format(date)}`;
  }

  return dateTimeFormatter.format(date).replace(".", "");
}

function normalizePhone(value: unknown) {
  return normalizeWhatsAppNumber(asString(value));
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

function appointmentActionSecret() {
  return (
    process.env.SDR_APPOINTMENT_ACTION_SECRET?.trim() ||
    process.env.CONNECTYHUB_WEBHOOK_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function signSdrAppointmentAction(appointmentId: string, action: string) {
  const secret = appointmentActionSecret();
  if (!secret || !appointmentId || !CONFIRMATION_ACTIONS.has(action)) return "";
  return createHmac("sha256", secret).update(`${appointmentId}:${action}`).digest("hex").slice(0, 48);
}

export function verifySdrAppointmentActionToken(appointmentId: string, action: string, token: string) {
  const expected = signSdrAppointmentAction(appointmentId, action);
  if (!expected || !token || expected.length !== token.length) return false;

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  } catch {
    return false;
  }
}

function sdrAppointmentActionUrl(appointmentId: string, action: "confirm" | "reschedule") {
  const baseUrl = publicAppUrl();
  const token = signSdrAppointmentAction(appointmentId, action);
  if (!baseUrl || !token) return "";
  const url = new URL(`/api/whatsapp/sdr-appointments/${encodeURIComponent(appointmentId)}/respond`, baseUrl);
  url.searchParams.set("action", action);
  url.searchParams.set("token", token);
  return url.toString();
}

function leadFirstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] || "tudo bem";
}

function normalizeRecipient(row: Record<string, unknown>): WhatsAppSdrAppointmentRecipient {
  return {
    id: asString(row.id),
    displayName: asString(row.display_name) || asString(row.displayName) || asString(row.email) || "Usuario",
    email: asString(row.email),
    phone: normalizePhone(row.phone),
    role: asString(row.role) || "user",
    status: asString(row.status) || "active",
  };
}

function emptySettings(): WhatsAppSdrAppointmentSettings {
  return {
    notificationAdminUserId: null,
    notificationAdminUserName: null,
    notificationAdminUserPhone: null,
    timezone: DEFAULT_TIMEZONE,
    businessStartHour: DEFAULT_BUSINESS_START_HOUR,
    businessEndHour: DEFAULT_BUSINESS_END_HOUR,
    maxBookingsPerHour: DEFAULT_MAX_BOOKINGS_PER_HOUR,
    updatedAt: null,
  };
}

function normalizeSettings(
  row: Record<string, unknown> | null | undefined,
  recipient: WhatsAppSdrAppointmentRecipient | null,
): WhatsAppSdrAppointmentSettings {
  const fallback = emptySettings();
  if (!row) return { ...fallback, notificationAdminUserId: recipient?.id ?? null, notificationAdminUserName: recipient?.displayName ?? null, notificationAdminUserPhone: recipient?.phone ?? null };

  const notificationAdminUserId = recipient?.id ?? asNullableString(row.notification_admin_user_id) ?? null;
  return {
    notificationAdminUserId,
    notificationAdminUserName: recipient?.displayName ?? null,
    notificationAdminUserPhone: recipient?.phone ?? null,
    timezone: asString(row.timezone) || fallback.timezone,
    businessStartHour: asNumber(row.business_start_hour, fallback.businessStartHour),
    businessEndHour: asNumber(row.business_end_hour, fallback.businessEndHour),
    maxBookingsPerHour: asNumber(row.max_bookings_per_hour, fallback.maxBookingsPerHour),
    updatedAt: asNullableString(row.updated_at),
  };
}

async function maybeReadSettingsRow(supabase: SupabaseAdminClient) {
  const { data, error } = await supabase
    .from("whatsapp_sdr_settings")
    .select("notification_admin_user_id, timezone, business_start_hour, business_end_hour, max_bookings_per_hour, updated_at")
    .eq("id", true)
    .maybeSingle();

  if (error) return null;
  return asRecord(data);
}

async function getRecipientById(supabase: SupabaseAdminClient, id: string | null) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("admin_users")
    .select("id, display_name, email, phone, role, status")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  const recipient = normalizeRecipient(asRecord(data));
  return recipient.phone ? recipient : null;
}

export async function listSdrAppointmentRecipients(): Promise<WhatsAppSdrAppointmentRecipient[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, display_name, email, phone, role, status")
    .eq("status", "active")
    .order("display_name", { ascending: true });

  if (error || !Array.isArray(data)) return [];
  return data.map((row) => normalizeRecipient(asRecord(row))).filter((recipient) => recipient.phone.length >= 10);
}

async function resolveNotificationRecipient(supabase: SupabaseAdminClient, settingsRow: Record<string, unknown> | null) {
  const configuredId = asNullableString(settingsRow?.notification_admin_user_id);
  const configuredRecipient = await getRecipientById(supabase, configuredId);
  if (configuredRecipient) return configuredRecipient;

  const recipients = await listSdrAppointmentRecipients();
  return recipients[0] ?? null;
}

export async function getWhatsAppSdrAppointmentSettings(): Promise<WhatsAppSdrAppointmentSettings> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return emptySettings();

  const row = await maybeReadSettingsRow(supabase);
  const recipient = await resolveNotificationRecipient(supabase, row);
  return normalizeSettings(row, recipient);
}

export async function saveWhatsAppSdrAppointmentSettings(input: {
  notificationAdminUserId: string | null;
}): Promise<WhatsAppSdrAppointmentSettings> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return emptySettings();

  const selectedRecipient = input.notificationAdminUserId
    ? await getRecipientById(supabase, input.notificationAdminUserId)
    : null;

  await supabase.from("whatsapp_sdr_settings").upsert(
    {
      id: true,
      notification_admin_user_id: selectedRecipient?.id ?? null,
      timezone: DEFAULT_TIMEZONE,
      business_start_hour: DEFAULT_BUSINESS_START_HOUR,
      business_end_hour: DEFAULT_BUSINESS_END_HOUR,
      max_bookings_per_hour: DEFAULT_MAX_BOOKINGS_PER_HOUR,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  return getWhatsAppSdrAppointmentSettings();
}

async function mapRecipientsById(ids: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || ids.length === 0) return new Map<string, WhatsAppSdrAppointmentRecipient>();

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, display_name, email, phone, role, status")
    .in("id", ids);

  const map = new Map<string, WhatsAppSdrAppointmentRecipient>();
  if (error || !Array.isArray(data)) return map;

  data.forEach((row) => {
    const recipient = normalizeRecipient(asRecord(row));
    map.set(recipient.id, recipient);
  });

  return map;
}

export function summarizeSdrAppointmentRow(
  row: AppointmentRow,
  recipientsById = new Map<string, WhatsAppSdrAppointmentRecipient>(),
): WhatsAppSdrAppointmentSummary {
  const assignedAdminUserId = asNullableString(row.assigned_admin_user_id);
  const assigned = assignedAdminUserId ? recipientsById.get(assignedAdminUserId) ?? null : null;

  return {
    id: asString(row.id),
    leadId: asString(row.lead_id),
    conversationId: asNullableString(row.conversation_id),
    instanceId: asNullableString(row.instance_id),
    agentKey: asNullableString(row.agent_key),
    assignedAdminUserId,
    assignedAdminName: assigned?.displayName ?? null,
    assignedAdminPhone: assigned?.phone ?? null,
    status: (asString(row.status) || "scheduled") as SdrAppointmentStatus,
    scheduledFor: asString(row.scheduled_for),
    timezone: asString(row.timezone) || DEFAULT_TIMEZONE,
    hourBucket: asString(row.hour_bucket),
    slotPosition: asNumber(row.slot_position, 1),
    leadName: asString(row.lead_name) || "Lead",
    leadPhone: normalizePhone(row.lead_phone),
    leadEmail: asNullableString(row.lead_email),
    scheduleLabel: asString(row.schedule_label),
    conversationSummary: asString(row.conversation_summary),
    sdrBriefing: asString(row.sdr_briefing),
    qualificationSnapshot: asRecord(row.qualification_snapshot),
    notificationPayload: asRecord(row.notification_payload),
    leadConfirmationStatus: (asString(row.lead_confirmation_status) || "pending") as SdrLeadConfirmationStatus,
    leadConfirmationRequestedAt: asNullableString(row.lead_confirmation_requested_at),
    leadConfirmedAt: asNullableString(row.lead_confirmed_at),
    leadRescheduleRequestedAt: asNullableString(row.lead_reschedule_requested_at),
    confirmationDueAt: asNullableString(row.confirmation_due_at),
    confirmationSentAt: asNullableString(row.confirmation_sent_at),
    adminConfirmationNotifiedAt: asNullableString(row.admin_confirmation_notified_at),
    leadReminderSentAt: asNullableString(row.lead_reminder_sent_at),
    adminReminderSentAt: asNullableString(row.admin_reminder_sent_at),
    reminderDueAt: asNullableString(row.reminder_due_at),
    rescheduleNote: asNullableString(row.reschedule_note),
    notifiedAt: asNullableString(row.notified_at),
    completedAt: asNullableString(row.completed_at),
    cancelledAt: asNullableString(row.cancelled_at),
    cancellationReason: asNullableString(row.cancellation_reason),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export async function getWhatsAppSdrAppointments(input: {
  from?: string;
  to?: string;
  limit?: number;
} = {}): Promise<WhatsAppSdrAppointmentSummary[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  let query = supabase
    .from("whatsapp_sdr_appointments")
    .select("*")
    .order("scheduled_for", { ascending: true })
    .limit(input.limit ?? 200);

  if (input.from) query = query.gte("scheduled_for", input.from);
  if (input.to) query = query.lte("scheduled_for", input.to);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];

  const adminIds = Array.from(
    new Set(
      data
        .map((row) => asNullableString(asRecord(row).assigned_admin_user_id))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const recipientsById = await mapRecipientsById(adminIds);

  return data.map((row) => summarizeSdrAppointmentRow(asRecord(row), recipientsById));
}

function metricsForAppointments(
  appointments: WhatsAppSdrAppointmentSummary[],
  maxBookingsPerHour = DEFAULT_MAX_BOOKINGS_PER_HOUR,
): WhatsAppSdrAppointmentMetrics {
  const now = new Date();
  const active = appointments.filter((appointment) => ACTIVE_STATUSES.includes(appointment.status));
  const today = active.filter((appointment) => sameLocalDay(new Date(appointment.scheduledFor), now)).length;
  const upcoming = active.filter((appointment) => Date.parse(appointment.scheduledFor) >= Date.now()).length;
  const buckets = new Map<string, number>();
  active.forEach((appointment) => buckets.set(appointment.hourBucket, (buckets.get(appointment.hourBucket) ?? 0) + 1));

  return {
    today,
    upcoming,
    active: active.length,
    fullHours: Array.from(buckets.values()).filter((count) => count >= maxBookingsPerHour).length,
  };
}

export async function getWhatsAppSdrAgendaData(): Promise<WhatsAppSdrAppointmentData> {
  const start = localParts();
  const from = localDateTimeToIso({ ...addLocalDays(start, -1), hour: 0, minute: 0 });
  const to = localDateTimeToIso({ ...addLocalDays(start, 14), hour: 23, minute: 59 });

  const [settings, recipients, appointments] = await Promise.all([
    getWhatsAppSdrAppointmentSettings(),
    listSdrAppointmentRecipients(),
    getWhatsAppSdrAppointments({ from, to, limit: 500 }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    settings,
    recipients,
    appointments,
    metrics: metricsForAppointments(appointments, settings.maxBookingsPerHour),
  };
}

function parseRelativeSchedule(normalized: string) {
  const minuteMatch = normalized.match(/\b(?:daqui\s+a|em)\s+(\d{1,3})\s+min/);
  if (minuteMatch) {
    const minutes = Math.max(1, Math.min(240, Number(minuteMatch[1])));
    return new Date(Date.now() + minutes * 60_000).toISOString();
  }

  if (/\b(agora|ja pode|pode ligar|pode chamar|pode ser agora)\b/.test(normalized)) {
    return new Date(Date.now() + 5 * 60_000).toISOString();
  }

  return null;
}

function extractExplicitTime(normalized: string) {
  const wordHours: Record<string, number> = {
    uma: 1,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
  };

  const wordMatch = normalized.match(
    /\b(uma|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s*(?:h)?\s*(?:da|de)?\s*(manha|tarde|noite)\b/,
  );
  if (wordMatch) {
    let hour = wordHours[wordMatch[1]] ?? 0;
    const period = wordMatch[2];
    if ((period === "tarde" || period === "noite") && hour < 12) hour += 12;
    if (period === "manha" && hour === 12) hour = 0;
    return { hour, minute: 0 };
  }

  const periodMatch = normalized.match(/\b([1-9]|1[0-2])\s*(?:h)?\s*(?:da|de)?\s*(manha|tarde|noite)\b/);
  if (periodMatch) {
    let hour = Number(periodMatch[1]);
    const period = periodMatch[2];
    if ((period === "tarde" || period === "noite") && hour < 12) hour += 12;
    if (period === "manha" && hour === 12) hour = 0;
    return { hour, minute: 0 };
  }

  const colonMatch = normalized.match(/(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?!\d)/);
  if (colonMatch) return { hour: Number(colonMatch[1]), minute: Number(colonMatch[2]) };

  const hourMatch = normalized.match(/(?<!\d)([01]?\d|2[0-3])\s*h(?:\s*([0-5]\d))?(?!\d)/);
  if (hourMatch) return { hour: Number(hourMatch[1]), minute: hourMatch[2] ? Number(hourMatch[2]) : 0 };

  return null;
}

function parsePortugueseScheduleDateTime(text: string, meetingSchedule?: WhatsAppMeetingScheduleCandidate | null) {
  const normalized = normalizeText(text);
  const relative = parseRelativeSchedule(normalized);
  if (relative) return relative;

  if (meetingSchedule?.dueMinutes != null && /\b(agora|5\s+min|cinco\s+min)\b/.test(normalized)) {
    return new Date(Date.now() + meetingSchedule.dueMinutes * 60_000).toISOString();
  }

  const time = extractExplicitTime(normalized);
  if (!time) return null;

  const now = localParts();
  let dayOffset = 0;
  if (normalized.includes("depois de amanha")) dayOffset = 2;
  else if (normalized.includes("amanha")) dayOffset = 1;

  let day = addLocalDays(now, dayOffset);
  let scheduledFor = localDateTimeToIso({ ...day, hour: time.hour, minute: time.minute });

  if (dayOffset === 0 && Date.parse(scheduledFor) <= Date.now() + 2 * 60_000) {
    day = addLocalDays(now, 1);
    scheduledFor = localDateTimeToIso({ ...day, hour: time.hour, minute: time.minute });
  }

  return scheduledFor;
}

function isInsideBusinessHours(iso: string, settings: WhatsAppSdrAppointmentSettings) {
  const parts = localParts(new Date(iso));
  return parts.hour >= settings.businessStartHour && parts.hour < settings.businessEndHour;
}

async function getUsedSlotPositions(supabase: SupabaseAdminClient, bucket: string, excludeAppointmentId?: string) {
  let query = supabase
    .from("whatsapp_sdr_appointments")
    .select("id, slot_position")
    .eq("hour_bucket", bucket)
    .in("status", ACTIVE_STATUSES);

  if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);

  const { data, error } = await query;

  if (error || !Array.isArray(data)) return { error: error?.message ?? null, used: new Set<number>() };
  return {
    error: null,
    used: new Set(data.map((row) => asNumber(asRecord(row).slot_position, 1))),
  };
}

async function chooseSlotPosition(
  supabase: SupabaseAdminClient,
  bucket: string,
  maxBookingsPerHour: number,
  excludeAppointmentId?: string,
): Promise<{ available: true; slotPosition: number } | { available: false; error?: string }> {
  const { used, error } = await getUsedSlotPositions(supabase, bucket, excludeAppointmentId);
  if (error) return { available: false, error };

  for (let slotPosition = 1; slotPosition <= maxBookingsPerHour; slotPosition += 1) {
    if (!used.has(slotPosition)) return { available: true, slotPosition };
  }

  return { available: false };
}

async function suggestAvailableAppointments(
  supabase: SupabaseAdminClient,
  requestedFor: string,
  settings: WhatsAppSdrAppointmentSettings,
  limit = 3,
) {
  const suggestions: string[] = [];
  const requestedParts = localParts(new Date(requestedFor));

  for (let dayOffset = 0; dayOffset < 8 && suggestions.length < limit; dayOffset += 1) {
    const day = addLocalDays(requestedParts, dayOffset);
    for (
      let hour = settings.businessStartHour;
      hour < settings.businessEndHour && suggestions.length < limit;
      hour += 1
    ) {
      const candidate = localDateTimeToIso({ ...day, hour, minute: 0 });
      if (Date.parse(candidate) <= Date.now() + 10 * 60_000) continue;

      const bucket = hourBucketIso(candidate);
      const slot = await chooseSlotPosition(supabase, bucket, settings.maxBookingsPerHour);
      if (slot.available) suggestions.push(formatAppointmentDateTime(candidate));
    }
  }

  return suggestions;
}

async function readLeadData(supabase: SupabaseAdminClient, leadId: string) {
  const [leadResult, profileResult] = await Promise.all([
    supabase.from("whatsapp_leads").select("*").eq("id", leadId).maybeSingle(),
    supabase.from("whatsapp_lead_profiles").select("*").eq("lead_id", leadId).maybeSingle(),
  ]);

  return {
    lead: asRecord(leadResult.data) as LeadRow,
    profile: asRecord(profileResult.data) as ProfileRow,
  };
}

async function readConversationData(supabase: SupabaseAdminClient, conversationId: string | null) {
  if (!conversationId) return { conversation: {}, messages: [] as MessageRow[] };

  const [conversationResult, messagesResult] = await Promise.all([
    supabase.from("whatsapp_conversations").select("*").eq("id", conversationId).maybeSingle(),
    supabase
      .from("whatsapp_conversation_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(18),
  ]);

  return {
    conversation: asRecord(conversationResult.data) as ConversationRow,
    messages: Array.isArray(messagesResult.data)
      ? messagesResult.data.map((row) => asRecord(row) as MessageRow).reverse()
      : [],
  };
}

function valueFromMetadata(metadata: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function buildQualificationSnapshot(lead: LeadRow, profile: ProfileRow) {
  const leadMetadata = asRecord(lead.metadata);
  const profileMetadata = asRecord(profile.metadata);
  const mergedMetadata = { ...leadMetadata, ...profileMetadata };

  const budgetMin = asNumber(profile.budget_min, 0);
  const budgetMax = asNumber(profile.budget_max, 0);

  return {
    score: asNumber(profile.lead_score, asNumber(lead.qualification_score, 0)),
    stage: asString(profile.crm_stage) || asString(lead.status),
    classification: asString(profile.classification) || asString(lead.classification),
    capital: budgetMax || budgetMin || valueFromMetadata(mergedMetadata, ["capital", "budget", "investment", "valor"]),
    regiao: asString(profile.location) || valueFromMetadata(mergedMetadata, ["region", "cidade", "city", "location"]),
    objetivo: asString(profile.investment_goal) || valueFromMetadata(mergedMetadata, ["objective", "objetivo", "goal"]),
    experiencia: asString(profile.experience_level) || valueFromMetadata(mergedMetadata, ["experience", "experiencia"]),
    urgencia: asString(profile.urgency) || valueFromMetadata(mergedMetadata, ["urgency", "prazo"]),
    email: asString(lead.email) || valueFromMetadata(mergedMetadata, ["email"]),
  };
}

function lastMessagesSummary(messages: MessageRow[]) {
  const relevant = messages
    .map((message) => {
      const direction = asString(message.direction);
      const author = asString(message.author_label) || asString(message.author_name) || asString(message.author_type) || direction;
      const text = asString(message.text) || asString(message.content);
      if (!text.trim()) return "";
      return `${author}: ${clampText(text, 180)}`;
    })
    .filter(Boolean)
    .slice(-8);

  return relevant.join(" | ");
}

function buildConversationSummary(input: {
  leadName: string;
  leadPhone: string;
  leadEmail: string | null;
  appointmentLabel: string;
  messages: MessageRow[];
  qualificationSnapshot: Record<string, unknown>;
}) {
  const capital = asString(input.qualificationSnapshot.capital) || "nao informado";
  const objetivo = asString(input.qualificationSnapshot.objetivo) || "nao informado";
  const regiao = asString(input.qualificationSnapshot.regiao) || "nao informada";
  const ultimas = lastMessagesSummary(input.messages) || "Sem historico suficiente.";

  return clampText(
    `Ligacao marcada para ${input.appointmentLabel}. Lead ${input.leadName} (${input.leadPhone}). Email: ${
      input.leadEmail ?? "nao informado"
    }. Capital: ${capital}. Objetivo: ${objetivo}. Regiao: ${regiao}. Ultimas mensagens: ${ultimas}`,
    MAX_SUMMARY_LENGTH,
  );
}

function buildSdrBriefing(input: {
  leadName: string;
  leadPhone: string;
  leadEmail: string | null;
  appointmentLabel: string;
  qualificationSnapshot: Record<string, unknown>;
  messages: MessageRow[];
}) {
  const snapshot = input.qualificationSnapshot;
  const lines = [
    `Nova ligacao agendada pela Evelyn para ${input.appointmentLabel}.`,
    `Lead: ${input.leadName} | ${input.leadPhone}${input.leadEmail ? ` | ${input.leadEmail}` : ""}.`,
    `Score/etapa: ${asString(snapshot.score) || String(snapshot.score ?? "nao informado")} / ${
      asString(snapshot.classification) || asString(snapshot.stage) || "nao informado"
    }.`,
    `Capital: ${asString(snapshot.capital) || "nao informado"}.`,
    `Objetivo: ${asString(snapshot.objetivo) || "nao informado"}.`,
    `Regiao: ${asString(snapshot.regiao) || "nao informada"}.`,
    `Experiencia: ${asString(snapshot.experiencia) || "nao informada"}.`,
    `Ultimo contexto: ${lastMessagesSummary(input.messages) || "sem mensagens recentes."}`,
  ];

  return clampText(lines.join("\n"), MAX_BRIEFING_LENGTH);
}

function appointmentEventSnapshot(input: {
  appointment: WhatsAppSdrAppointmentSummary;
  eventType: string;
  note?: string;
}) {
  return {
    id: input.appointment.id,
    status: input.appointment.status,
    scheduledFor: input.appointment.scheduledFor,
    scheduleLabel: input.appointment.scheduleLabel,
    assignedAdminUserId: input.appointment.assignedAdminUserId,
    assignedAdminName: input.appointment.assignedAdminName,
    leadConfirmationStatus: input.appointment.leadConfirmationStatus,
    confirmationSentAt: input.appointment.confirmationSentAt,
    leadConfirmedAt: input.appointment.leadConfirmedAt,
    leadReminderSentAt: input.appointment.leadReminderSentAt,
    adminReminderSentAt: input.appointment.adminReminderSentAt,
    eventType: input.eventType,
    note: input.note ?? null,
    updatedAt: new Date().toISOString(),
  };
}

async function updateMetadataWithAppointment(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
  eventType: string,
  note?: string,
) {
  const snapshot = appointmentEventSnapshot({ appointment, eventType, note });
  const event = {
    type: eventType,
    at: new Date().toISOString(),
    appointmentId: appointment.id,
    status: appointment.status,
    scheduledFor: appointment.scheduledFor,
    note: note ?? null,
  };

  const [leadResult, conversationResult, profileResult] = await Promise.all([
    supabase.from("whatsapp_leads").select("metadata").eq("id", appointment.leadId).maybeSingle(),
    appointment.conversationId
      ? supabase.from("whatsapp_conversations").select("metadata").eq("id", appointment.conversationId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("whatsapp_lead_profiles").select("metadata").eq("lead_id", appointment.leadId).maybeSingle(),
  ]);

  const merge = (metadata: unknown) => {
    const current = asRecord(metadata);
    const previousEvents = Array.isArray(current.sdr_appointment_events)
      ? (current.sdr_appointment_events as unknown[])
      : Array.isArray(current.sdrAppointmentEvents)
        ? (current.sdrAppointmentEvents as unknown[])
        : [];
    const events = [...previousEvents, event].slice(-20);
    return {
      ...current,
      sdr_appointment: snapshot,
      sdrAppointment: snapshot,
      sdr_appointment_events: events,
      sdrAppointmentEvents: events,
    };
  };

  await Promise.all([
    supabase
      .from("whatsapp_leads")
      .update({ metadata: merge(asRecord(leadResult.data).metadata) })
      .eq("id", appointment.leadId),
    appointment.conversationId
      ? supabase
          .from("whatsapp_conversations")
          .update({ metadata: merge(asRecord(conversationResult.data).metadata) })
          .eq("id", appointment.conversationId)
      : Promise.resolve(),
    supabase
      .from("whatsapp_lead_profiles")
      .update({
        next_action: `Ligacao SDR agendada para ${appointment.scheduleLabel}`,
        next_action_due_at: appointment.scheduledFor,
        metadata: merge(asRecord(profileResult.data).metadata),
      })
      .eq("lead_id", appointment.leadId),
  ]);
}

async function insertAppointmentTimelineNote(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
  eventType: string,
  note?: string,
) {
  if (!appointment.conversationId) return;

  const eventLabel: Record<string, string> = {
    scheduled: "ligacao marcada",
    notified: "administrador avisado",
    lead_confirmation_sent: "confirmacao enviada ao lead",
    lead_confirmed: "lead confirmou a ligacao",
    lead_reschedule_requested: "lead pediu para remarcar",
    rescheduled: "ligacao remarcada",
    lead_reminder_sent: "lembrete enviado ao lead",
    admin_reminder_sent: "lembrete enviado ao administrador",
    completed: "ligacao concluida",
    cancelled: "ligacao cancelada",
    missed: "ligacao perdida",
  };
  const text =
    eventType === "scheduled"
      ? `Agenda SDR: ligacao marcada para ${appointment.scheduleLabel}. Responsavel: ${
          appointment.assignedAdminName ?? "equipe Betel"
        }.`
      : `Agenda SDR: ${eventLabel[eventType] ?? eventType} para ${appointment.scheduleLabel}.${note ? ` ${note}` : ""}`;

  await supabase.from("whatsapp_conversation_messages").insert({
    conversation_id: appointment.conversationId,
    lead_id: appointment.leadId,
    instance_id: appointment.instanceId,
    direction: "system",
    author_type: "system",
    author_label: "Agenda SDR",
    message_type: "text",
    text,
    payload: {
      kind: "sdr_appointment_event",
      eventType,
      appointmentId: appointment.id,
      scheduledFor: appointment.scheduledFor,
    },
  });
}

function scheduledNotificationText(appointment: WhatsAppSdrAppointmentSummary) {
  return [
    "Nova ligacao agendada BTL",
    `Lead: ${appointment.leadName}`,
    `Telefone: ${appointment.leadPhone || "nao informado"}`,
    appointment.leadEmail ? `Email: ${appointment.leadEmail}` : null,
    `Horario: ${appointment.scheduleLabel}`,
    "",
    "Resumo para abordagem:",
    appointment.sdrBriefing,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function adminLeadConfirmedText(appointment: WhatsAppSdrAppointmentSummary) {
  return [
    "Confirmacao de ligacao BTL",
    `Lead: ${appointment.leadName}`,
    `Telefone: ${appointment.leadPhone || "nao informado"}`,
    `Horario confirmado: ${appointment.scheduleLabel}`,
    "",
    "Resumo para abordagem:",
    appointment.sdrBriefing || appointment.conversationSummary,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function adminRescheduleRequestedText(appointment: WhatsAppSdrAppointmentSummary) {
  return [
    "Lead pediu para remarcar a ligacao BTL",
    `Lead: ${appointment.leadName}`,
    `Telefone: ${appointment.leadPhone || "nao informado"}`,
    `Horario atual: ${appointment.scheduleLabel}`,
    "A Evelyn vai coletar o novo dia e horario e atualizar a agenda.",
  ].join("\n");
}

function adminRescheduledText(appointment: WhatsAppSdrAppointmentSummary) {
  return [
    "Ligacao BTL reagendada",
    `Lead: ${appointment.leadName}`,
    `Telefone: ${appointment.leadPhone || "nao informado"}`,
    `Novo horario: ${appointment.scheduleLabel}`,
    "",
    "Resumo para abordagem:",
    appointment.sdrBriefing || appointment.conversationSummary,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function adminReminderText(appointment: WhatsAppSdrAppointmentSummary) {
  return [
    "Lembrete BTL: ligacao em 5 minutos",
    `Lead: ${appointment.leadName}`,
    `Telefone: ${appointment.leadPhone || "nao informado"}`,
    `Horario: ${appointment.scheduleLabel}`,
    `Confirmacao do lead: ${leadConfirmationStatusLabel(appointment.leadConfirmationStatus)}`,
    "",
    "Resumo:",
    appointment.sdrBriefing || appointment.conversationSummary,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function leadConfirmationStatusLabel(status: SdrLeadConfirmationStatus) {
  if (status === "confirmed") return "confirmada";
  if (status === "reschedule_requested") return "remarcacao solicitada";
  return "pendente";
}

function leadConfirmationText(appointment: WhatsAppSdrAppointmentSummary) {
  return `Oi, ${leadFirstName(appointment.leadName)}. Sua ligacao com a Betel esta marcada para ${appointment.scheduleLabel}. Confirma esse horario?`;
}

function leadReminderText(appointment: WhatsAppSdrAppointmentSummary) {
  return `Oi, ${leadFirstName(appointment.leadName)}. Sua ligacao com a Betel e daqui 5 minutos. Confirmado?`;
}

function leadReschedulePromptText(appointment: WhatsAppSdrAppointmentSummary) {
  return `Claro, ${leadFirstName(appointment.leadName)}. Me fala o novo dia e horario que fica melhor entre 08h e 19h, que eu confiro a agenda por aqui.`;
}

function leadConfirmedReplyText(appointment: WhatsAppSdrAppointmentSummary) {
  return `Perfeito, ${leadFirstName(appointment.leadName)}. Horario confirmado para ${appointment.scheduleLabel}. A equipe da Betel ja foi avisada.`;
}

function appointmentActionButton(appointment: WhatsAppSdrAppointmentSummary) {
  const confirmUrl = sdrAppointmentActionUrl(appointment.id, "confirm");
  const rescheduleUrl = sdrAppointmentActionUrl(appointment.id, "reschedule");
  if (!confirmUrl || !rescheduleUrl) return undefined;

  return {
    footerText: "Agenda Betel",
    choices: [
      { label: "Confirmar", url: confirmUrl },
      { label: "Marcar por outro dia", url: rescheduleUrl },
    ],
  };
}

async function notifyAppointmentRecipient(input: {
  appointment: WhatsAppSdrAppointmentSummary;
  agentKey: string;
  providerInstanceId: string | null;
  recipient: WhatsAppSdrAppointmentRecipient;
  text: string;
  trackIdSuffix: string;
}) {
  if (!input.providerInstanceId || !input.recipient.phone) {
    return { ok: false, error: "Instancia ou telefone do usuario notificador ausente." };
  }

  return sendWhatsAppAgentReply({
    agentKey: input.agentKey,
    instanceId: input.providerInstanceId || undefined,
    number: input.recipient.phone,
    text: input.text,
    trackId: `sdr-appointment-${input.appointment.id}-${input.trackIdSuffix}`,
  });
}

async function sendAppointmentLeadMessage(input: {
  appointment: WhatsAppSdrAppointmentSummary;
  agentKey: string;
  providerInstanceId: string | null;
  text: string;
  trackIdSuffix: string;
  actionButton?: ReturnType<typeof appointmentActionButton>;
}) {
  if (!input.providerInstanceId || !input.appointment.leadPhone) {
    return { ok: false, error: "Instancia ou telefone do lead ausente." };
  }

  return sendWhatsAppAgentReply({
    agentKey: input.agentKey,
    instanceId: input.providerInstanceId || undefined,
    number: input.appointment.leadPhone,
    text: input.text,
    trackId: `sdr-appointment-${input.appointment.id}-${input.trackIdSuffix}`,
    actionButton: input.actionButton,
  });
}

async function summarizeAppointmentData(supabase: SupabaseAdminClient, row: unknown) {
  const record = asRecord(row);
  const assignedId = asNullableString(record.assigned_admin_user_id);
  const recipients = await mapRecipientsById(assignedId ? [assignedId] : []);
  return summarizeSdrAppointmentRow(record, recipients);
}

async function readAppointmentById(supabase: SupabaseAdminClient, appointmentId: string) {
  const { data, error } = await supabase.from("whatsapp_sdr_appointments").select("*").eq("id", appointmentId).maybeSingle();
  if (error || !data) return null;
  return summarizeAppointmentData(supabase, data);
}

async function latestNotificationPayload(
  supabase: SupabaseAdminClient,
  appointmentId: string,
  fallback: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("whatsapp_sdr_appointments")
    .select("notification_payload")
    .eq("id", appointmentId)
    .maybeSingle();

  if (error || !data) return fallback;
  return asRecord(asRecord(data).notification_payload);
}

async function providerInstanceIdForAppointment(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
  fallback: string | null = null,
) {
  const fromPayload = asString(appointment.notificationPayload.providerInstanceId);
  if (fromPayload) return fromPayload;
  if (fallback) return fallback;
  if (!appointment.instanceId) return null;

  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("provider_instance_id")
    .eq("id", appointment.instanceId)
    .maybeSingle();

  if (error || !data) return null;
  return asNullableString(asRecord(data).provider_instance_id);
}

async function recipientForAppointment(supabase: SupabaseAdminClient, appointment: WhatsAppSdrAppointmentSummary) {
  const assignedRecipient = await getRecipientById(supabase, appointment.assignedAdminUserId);
  if (assignedRecipient) return assignedRecipient;

  const settingsRow = await maybeReadSettingsRow(supabase);
  return resolveNotificationRecipient(supabase, settingsRow);
}

async function findExistingActiveAppointment(
  supabase: SupabaseAdminClient,
  leadId: string,
  conversationId: string | null,
) {
  let query = supabase
    .from("whatsapp_sdr_appointments")
    .select("*")
    .eq("lead_id", leadId)
    .in("status", ACTIVE_STATUSES)
    .gte("scheduled_for", new Date(Date.now() - 15 * 60_000).toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(1);

  if (conversationId) query = query.eq("conversation_id", conversationId);

  const { data, error } = await query;
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const assignedId = asNullableString(asRecord(data[0]).assigned_admin_user_id);
  const recipients = await mapRecipientsById(assignedId ? [assignedId] : []);
  return summarizeSdrAppointmentRow(asRecord(data[0]), recipients);
}

function buildPromptResult(
  status: SdrRuntimeAppointmentResult["status"],
  appointment: WhatsAppSdrAppointmentSummary | null,
  suggestions: string[] = [],
  error?: string,
): SdrRuntimeAppointmentResult {
  if (status === "scheduled" && appointment) {
    return {
      ok: true,
      status,
      appointment,
      suggestions,
      promptContext: `AGENDA SDR: horario reservado com sucesso para ${appointment.scheduleLabel}. Confirme ao lead com naturalidade, mantenha a conversa ativa e diga que um consultor especialista vai ligar nesse horario.`,
    };
  }

  if (status === "rescheduled" && appointment) {
    return {
      ok: true,
      status,
      appointment,
      suggestions,
      promptContext: `AGENDA SDR: horario remarcado com sucesso para ${appointment.scheduleLabel}. Confirme ao lead com naturalidade, diga que a equipe recebeu a nova agenda e continue tirando duvidas.`,
    };
  }

  if (status === "already_scheduled" && appointment) {
    return {
      ok: true,
      status,
      appointment,
      suggestions,
      promptContext: `AGENDA SDR: ja existe ligacao ativa para ${appointment.scheduleLabel}. Nao crie promessa nova; confirme o horario existente e continue tirando duvidas.`,
    };
  }

  if (status === "slot_full") {
    return {
      ok: false,
      status,
      appointment,
      suggestions,
      error,
      promptContext: `AGENDA SDR: o horario solicitado ja atingiu o limite de 2 leads por hora. Peca outro horario entre 08h e 19h. Sugestoes disponiveis: ${suggestions.join(", ") || "proximo horario comercial disponivel"}.`,
    };
  }

  if (status === "outside_business_hours") {
    return {
      ok: false,
      status,
      appointment,
      suggestions,
      error,
      promptContext: `AGENDA SDR: o horario informado esta fora da janela de ligacoes, que e das 08h as 19h. Peca um horario dentro dessa janela. Sugestoes: ${suggestions.join(", ") || "amanha em horario comercial"}.`,
    };
  }

  if (status === "missing_notification_user") {
    return {
      ok: false,
      status,
      appointment,
      suggestions,
      error,
      promptContext:
        "AGENDA SDR: ainda nao existe usuario cadastrado com telefone para receber o aviso da agenda. Nao diga que o horario foi confirmado como definitivo; colete o melhor horario e continue tirando duvidas.",
    };
  }

  if (status === "needs_time") {
    return {
      ok: false,
      status,
      appointment,
      suggestions,
      error,
      promptContext:
        "AGENDA SDR: o lead demonstrou aceitar ligacao, mas ainda nao deu um horario objetivo. Pergunte de forma simples qual horario entre 08h e 19h funciona melhor.",
    };
  }

  return {
    ok: false,
    status: "error",
    appointment,
    suggestions,
    error,
    promptContext:
      "AGENDA SDR: houve falha tecnica ao tentar criar a agenda. Continue a conversa normalmente, colete o horario e nao prometa confirmacao definitiva.",
  };
}

async function rescheduleExistingAppointment(input: {
  supabase: SupabaseAdminClient;
  existingAppointment: WhatsAppSdrAppointmentSummary;
  scheduledFor: string;
  settings: WhatsAppSdrAppointmentSettings;
  recipient: WhatsAppSdrAppointmentRecipient;
  agentKey: string;
  providerInstanceId: string | null;
  decisionMeetingSchedule: WhatsAppMeetingScheduleCandidate | null | undefined;
}) {
  const { supabase, existingAppointment, scheduledFor, settings, recipient } = input;

  if (!isInsideBusinessHours(scheduledFor, settings)) {
    const suggestions = await suggestAvailableAppointments(supabase, scheduledFor, settings);
    return buildPromptResult("outside_business_hours", existingAppointment, suggestions);
  }

  const bucket = hourBucketIso(scheduledFor);
  const slot = await chooseSlotPosition(supabase, bucket, settings.maxBookingsPerHour, existingAppointment.id);
  if (!slot.available) {
    const suggestions = await suggestAvailableAppointments(supabase, scheduledFor, settings);
    return buildPromptResult("slot_full", existingAppointment, suggestions, slot.error);
  }

  const [{ lead, profile }, { messages }] = await Promise.all([
    readLeadData(supabase, existingAppointment.leadId),
    readConversationData(supabase, existingAppointment.conversationId),
  ]);
  const leadName =
    asString(lead.name) ||
    asString(profile.full_name) ||
    asString(profile.name) ||
    asString(lead.profile_name) ||
    existingAppointment.leadName ||
    "Lead";
  const leadPhone = normalizePhone(lead.phone) || existingAppointment.leadPhone;
  const leadEmail = asNullableString(lead.email) ?? asNullableString(profile.email) ?? existingAppointment.leadEmail;
  const scheduleLabel = formatAppointmentDateTime(scheduledFor);
  const qualificationSnapshot = buildQualificationSnapshot(lead, profile);
  const conversationSummary = buildConversationSummary({
    leadName,
    leadPhone,
    leadEmail,
    appointmentLabel: scheduleLabel,
    messages,
    qualificationSnapshot,
  });
  const sdrBriefing = buildSdrBriefing({
    leadName,
    leadPhone,
    leadEmail,
    appointmentLabel: scheduleLabel,
    qualificationSnapshot,
    messages,
  });

  const now = new Date().toISOString();
  const providerInstanceId = input.providerInstanceId || (await providerInstanceIdForAppointment(supabase, existingAppointment));
  const notificationPayload = await latestNotificationPayload(supabase, existingAppointment.id, existingAppointment.notificationPayload);
  const { data, error } = await supabase
    .from("whatsapp_sdr_appointments")
    .update({
      assigned_admin_user_id: recipient.id,
      status: "scheduled" satisfies SdrAppointmentStatus,
      scheduled_for: scheduledFor,
      hour_bucket: bucket,
      slot_position: slot.slotPosition,
      lead_name: leadName,
      lead_phone: leadPhone,
      lead_email: leadEmail,
      schedule_label: scheduleLabel,
      conversation_summary: conversationSummary,
      sdr_briefing: sdrBriefing,
      qualification_snapshot: qualificationSnapshot,
      lead_confirmation_status: "pending" satisfies SdrLeadConfirmationStatus,
      lead_confirmation_requested_at: null,
      lead_confirmed_at: null,
      lead_reschedule_requested_at: null,
      confirmation_due_at: confirmationDueAtIso(scheduledFor),
      confirmation_sent_at: null,
      admin_confirmation_notified_at: null,
      lead_reminder_sent_at: null,
      admin_reminder_sent_at: null,
      reminder_due_at: reminderDueAtIso(scheduledFor),
      reschedule_note: `Remarcado em ${now}`,
      notification_payload: {
        ...notificationPayload,
        recipientAdminUserId: recipient.id,
        recipientName: recipient.displayName,
        recipientPhone: recipient.phone,
        providerInstanceId,
        rescheduledAt: now,
        decisionMeetingSchedule: input.decisionMeetingSchedule ?? null,
      },
    })
    .eq("id", existingAppointment.id)
    .select("*")
    .single();

  if (error || !data) return buildPromptResult("error", existingAppointment, [], error?.message ?? "Falha ao remarcar.");

  let appointment = await summarizeAppointmentData(supabase, data);
  const delivery = await notifyAppointmentRecipient({
    appointment,
    agentKey: input.agentKey,
    providerInstanceId,
    recipient,
    text: adminRescheduledText(appointment),
    trackIdSuffix: `rescheduled-${Date.parse(scheduledFor)}`,
  });

  if (delivery.ok) {
    const payload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
    const { data: updated } = await supabase
      .from("whatsapp_sdr_appointments")
      .update({
        status: "notified" satisfies SdrAppointmentStatus,
        notified_at: new Date().toISOString(),
        notification_payload: {
          ...payload,
          rescheduleDelivery: delivery,
        },
      })
      .eq("id", appointment.id)
      .select("*")
      .single();
    if (updated) appointment = await summarizeAppointmentData(supabase, updated);
  }

  await updateMetadataWithAppointment(supabase, appointment, "rescheduled");
  await insertAppointmentTimelineNote(supabase, appointment, "rescheduled", "O lead pediu outro dia e a agenda foi atualizada.");

  return buildPromptResult("rescheduled", appointment);
}

export async function createSdrAppointmentFromRuntimeDecision(
  input: CreateSdrAppointmentFromRuntimeInput,
): Promise<SdrRuntimeAppointmentResult> {
  if (!input.leadId) return buildPromptResult("error", null, [], "Lead nao identificado.");

  const scheduledFor = parsePortugueseScheduleDateTime(input.inboundText, input.decisionMeetingSchedule);
  const supabase = getSupabaseAdminClient();
  if (!supabase) return buildPromptResult("error", null, [], "Supabase admin nao configurado.");

  const settingsRow = await maybeReadSettingsRow(supabase);
  const recipient = await resolveNotificationRecipient(supabase, settingsRow);
  const settings = normalizeSettings(settingsRow, recipient);

  if (!scheduledFor) return buildPromptResult("needs_time", null);

  if (!recipient) return buildPromptResult("missing_notification_user", null);

  const existingAppointment = await findExistingActiveAppointment(supabase, input.leadId, input.conversationId);
  if (existingAppointment) {
    if (existingAppointment.leadConfirmationStatus === RESCHEDULE_REQUESTED_STATUS) {
      return rescheduleExistingAppointment({
        supabase,
        existingAppointment,
        scheduledFor,
        settings,
        recipient,
        agentKey: input.agentKey,
        providerInstanceId: input.providerInstanceId,
        decisionMeetingSchedule: input.decisionMeetingSchedule,
      });
    }

    return buildPromptResult("already_scheduled", existingAppointment);
  }

  if (!isInsideBusinessHours(scheduledFor, settings)) {
    const suggestions = await suggestAvailableAppointments(supabase, scheduledFor, settings);
    return buildPromptResult("outside_business_hours", null, suggestions);
  }

  const bucket = hourBucketIso(scheduledFor);
  const slot = await chooseSlotPosition(supabase, bucket, settings.maxBookingsPerHour);
  if (!slot.available) {
    const suggestions = await suggestAvailableAppointments(supabase, scheduledFor, settings);
    return buildPromptResult("slot_full", null, suggestions, slot.error);
  }

  const [{ lead, profile }, { messages }] = await Promise.all([
    readLeadData(supabase, input.leadId),
    readConversationData(supabase, input.conversationId),
  ]);

  const leadName =
    asString(lead.name) ||
    asString(profile.full_name) ||
    asString(profile.name) ||
    asString(lead.profile_name) ||
    "Lead";
  const leadPhone = normalizePhone(lead.phone) || normalizePhone(input.leadPhone);
  const leadEmail = asNullableString(lead.email) ?? asNullableString(profile.email);
  const scheduleLabel = formatAppointmentDateTime(scheduledFor);
  const qualificationSnapshot = buildQualificationSnapshot(lead, profile);
  const conversationSummary = buildConversationSummary({
    leadName,
    leadPhone,
    leadEmail,
    appointmentLabel: scheduleLabel,
    messages,
    qualificationSnapshot,
  });
  const sdrBriefing = buildSdrBriefing({
    leadName,
    leadPhone,
    leadEmail,
    appointmentLabel: scheduleLabel,
    qualificationSnapshot,
    messages,
  });

  const insertPayload = {
    lead_id: input.leadId,
    conversation_id: input.conversationId,
    instance_id: input.instanceId,
    agent_key: input.agentKey,
    assigned_admin_user_id: recipient.id,
    status: "scheduled" satisfies SdrAppointmentStatus,
    scheduled_for: scheduledFor,
    timezone: settings.timezone,
    hour_bucket: bucket,
    slot_position: slot.slotPosition,
    lead_name: leadName,
    lead_phone: leadPhone,
    lead_email: leadEmail,
    schedule_label: scheduleLabel,
    conversation_summary: conversationSummary,
    sdr_briefing: sdrBriefing,
    qualification_snapshot: qualificationSnapshot,
    lead_confirmation_status: "pending" satisfies SdrLeadConfirmationStatus,
    confirmation_due_at: confirmationDueAtIso(scheduledFor),
    reminder_due_at: reminderDueAtIso(scheduledFor),
    notification_payload: {
      recipientAdminUserId: recipient.id,
      recipientName: recipient.displayName,
      recipientPhone: recipient.phone,
      providerInstanceId: input.providerInstanceId,
    },
    metadata: {
      source: "evelyn_runtime",
      createdByAgent: true,
      decisionMeetingSchedule: input.decisionMeetingSchedule ?? null,
    },
  };

  const { data, error } = await supabase.from("whatsapp_sdr_appointments").insert(insertPayload).select("*").single();
  if (error || !data) {
    if (error?.code === "23505") {
      const suggestions = await suggestAvailableAppointments(supabase, scheduledFor, settings);
      return buildPromptResult("slot_full", null, suggestions, error.message);
    }
    return buildPromptResult("error", null, [], error?.message ?? "Falha ao criar agenda.");
  }

  let appointment = summarizeSdrAppointmentRow(asRecord(data), new Map([[recipient.id, recipient]]));
  await updateMetadataWithAppointment(supabase, appointment, "scheduled");
  await insertAppointmentTimelineNote(supabase, appointment, "scheduled");

  const notification = await notifyAppointmentRecipient({
    appointment,
    agentKey: input.agentKey,
    providerInstanceId: input.providerInstanceId,
    recipient,
    text: scheduledNotificationText(appointment),
    trackIdSuffix: "scheduled",
  });

  if (notification.ok) {
    const payload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
    const { data: updated } = await supabase
      .from("whatsapp_sdr_appointments")
      .update({
        status: "notified" satisfies SdrAppointmentStatus,
        notified_at: new Date().toISOString(),
        notification_payload: {
          ...payload,
          delivery: notification,
        },
      })
      .eq("id", appointment.id)
      .select("*")
      .single();

    if (updated) {
      appointment = summarizeSdrAppointmentRow(asRecord(updated), new Map([[recipient.id, recipient]]));
      await updateMetadataWithAppointment(supabase, appointment, "notified");
    }
  } else {
    const notificationError =
      "errorMessage" in notification ? notification.errorMessage : "error" in notification ? notification.error : undefined;
    await updateMetadataWithAppointment(
      supabase,
      appointment,
      "notification_failed",
      notificationError ?? "Falha ao enviar WhatsApp para usuario responsavel.",
    );
  }

  return buildPromptResult("scheduled", appointment);
}

export type SdrAppointmentLeadAction = "confirm" | "reschedule";

export type SdrAppointmentLeadActionResult = {
  ok: boolean;
  status:
    | "confirmed"
    | "reschedule_requested"
    | "already_confirmed"
    | "missing_appointment"
    | "inactive_appointment"
    | "missing_delivery_context"
    | "error";
  appointment: WhatsAppSdrAppointmentSummary | null;
  message: string;
  adminNotified?: boolean;
  leadReplySent?: boolean;
  error?: string;
};

function isAppointmentActive(appointment: WhatsAppSdrAppointmentSummary) {
  return ACTIVE_STATUSES.includes(appointment.status);
}

async function markAppointmentLeadAction(input: {
  appointment: WhatsAppSdrAppointmentSummary;
  action: SdrAppointmentLeadAction;
  source: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      status: "error",
      appointment: input.appointment,
      message: "Supabase admin nao configurado.",
    } satisfies SdrAppointmentLeadActionResult;
  }

  const { appointment, action, source } = input;
  if (!isAppointmentActive(appointment)) {
    return {
      ok: false,
      status: "inactive_appointment",
      appointment,
      message: "Esse agendamento nao esta mais ativo.",
    } satisfies SdrAppointmentLeadActionResult;
  }

  const now = new Date().toISOString();
  const providerInstanceId = await providerInstanceIdForAppointment(supabase, appointment);
  const recipient = await recipientForAppointment(supabase, appointment);
  const agentKey = appointment.agentKey || "";

  if (!providerInstanceId || !agentKey) {
    return {
      ok: false,
      status: "missing_delivery_context",
      appointment,
      message: "Nao foi possivel localizar a instancia do WhatsApp para esse agendamento.",
    } satisfies SdrAppointmentLeadActionResult;
  }

  if (action === "confirm") {
    const alreadyConfirmed = appointment.leadConfirmationStatus === "confirmed";
    const notificationPayload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
    const { data, error } = await supabase
      .from("whatsapp_sdr_appointments")
      .update({
        lead_confirmation_status: "confirmed" satisfies SdrLeadConfirmationStatus,
        lead_confirmed_at: appointment.leadConfirmedAt ?? now,
        lead_confirmation_requested_at: appointment.leadConfirmationRequestedAt ?? now,
        notification_payload: {
          ...notificationPayload,
          leadConfirmationSource: source,
          leadConfirmedAt: appointment.leadConfirmedAt ?? now,
        },
      })
      .eq("id", appointment.id)
      .select("*")
      .single();

    if (error || !data) {
      return {
        ok: false,
        status: "error",
        appointment,
        message: "Nao foi possivel confirmar esse horario agora.",
        error: error?.message,
      } satisfies SdrAppointmentLeadActionResult;
    }

    let updated = await summarizeAppointmentData(supabase, data);
    let leadReplySent = false;
    const leadReply = await sendAppointmentLeadMessage({
      appointment: updated,
      agentKey,
      providerInstanceId,
      text: leadConfirmedReplyText(updated),
      trackIdSuffix: "lead-confirmed-reply",
    });
    leadReplySent = Boolean(leadReply.ok);

    let adminNotified = Boolean(updated.adminConfirmationNotifiedAt);
    if (!adminNotified && recipient) {
      const adminDelivery = await notifyAppointmentRecipient({
        appointment: updated,
        agentKey,
        providerInstanceId,
        recipient,
        text: adminLeadConfirmedText(updated),
        trackIdSuffix: "lead-confirmed",
      });
      adminNotified = Boolean(adminDelivery.ok);

      if (adminDelivery.ok) {
        const payload = await latestNotificationPayload(supabase, updated.id, updated.notificationPayload);
        const { data: notified } = await supabase
          .from("whatsapp_sdr_appointments")
          .update({
            admin_confirmation_notified_at: new Date().toISOString(),
            notification_payload: {
              ...payload,
              leadConfirmationAdminDelivery: adminDelivery,
            },
          })
          .eq("id", updated.id)
          .select("*")
          .single();
        if (notified) updated = await summarizeAppointmentData(supabase, notified);
      }
    }

    await updateMetadataWithAppointment(supabase, updated, "lead_confirmed");
    await insertAppointmentTimelineNote(supabase, updated, "lead_confirmed", `Origem: ${source}.`);

    return {
      ok: true,
      status: alreadyConfirmed ? "already_confirmed" : "confirmed",
      appointment: updated,
      message: "Horario confirmado.",
      adminNotified,
      leadReplySent,
    } satisfies SdrAppointmentLeadActionResult;
  }

  const firstRescheduleRequest = appointment.leadConfirmationStatus !== RESCHEDULE_REQUESTED_STATUS;
  const notificationPayload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
  const { data, error } = await supabase
    .from("whatsapp_sdr_appointments")
    .update({
      lead_confirmation_status: RESCHEDULE_REQUESTED_STATUS,
      lead_reschedule_requested_at: now,
      lead_confirmation_requested_at: appointment.leadConfirmationRequestedAt ?? now,
      reschedule_note: `Lead pediu remarcacao em ${now}. Origem: ${source}.`,
      notification_payload: {
        ...notificationPayload,
        leadRescheduleSource: source,
        leadRescheduleRequestedAt: now,
      },
    })
    .eq("id", appointment.id)
    .select("*")
    .single();

  if (error || !data) {
    return {
      ok: false,
      status: "error",
      appointment,
      message: "Nao foi possivel iniciar a remarcacao agora.",
      error: error?.message,
    } satisfies SdrAppointmentLeadActionResult;
  }

  const updated = await summarizeAppointmentData(supabase, data);
  const leadReply = await sendAppointmentLeadMessage({
    appointment: updated,
    agentKey,
    providerInstanceId,
    text: leadReschedulePromptText(updated),
    trackIdSuffix: "lead-reschedule-prompt",
  });

  let adminNotified = false;
  if (firstRescheduleRequest && recipient) {
    const adminDelivery = await notifyAppointmentRecipient({
      appointment: updated,
      agentKey,
      providerInstanceId,
      recipient,
      text: adminRescheduleRequestedText(updated),
      trackIdSuffix: "lead-reschedule-requested",
    });
    adminNotified = Boolean(adminDelivery.ok);
  }

  await updateMetadataWithAppointment(supabase, updated, "lead_reschedule_requested");
  await insertAppointmentTimelineNote(supabase, updated, "lead_reschedule_requested", "A Evelyn vai coletar novo horario.");

  return {
    ok: true,
    status: "reschedule_requested",
    appointment: updated,
    message: "Remarcacao solicitada.",
    adminNotified,
    leadReplySent: Boolean(leadReply.ok),
  } satisfies SdrAppointmentLeadActionResult;
}

export async function respondToSdrAppointmentLeadAction(input: {
  appointmentId: string;
  action: SdrAppointmentLeadAction;
  source?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      status: "error",
      appointment: null,
      message: "Supabase admin nao configurado.",
    } satisfies SdrAppointmentLeadActionResult;
  }

  const appointment = await readAppointmentById(supabase, input.appointmentId);
  if (!appointment) {
    return {
      ok: false,
      status: "missing_appointment",
      appointment: null,
      message: "Agendamento nao encontrado.",
    } satisfies SdrAppointmentLeadActionResult;
  }

  return markAppointmentLeadAction({
    appointment,
    action: input.action,
    source: input.source || "lead_action",
  });
}

function detectLeadAppointmentAction(text: string): SdrAppointmentLeadAction | null {
  const normalized = normalizeText(text);
  if (/\b(remarcar|reagendar|marcar\s+(?:para\s+)?outro|outro\s+(?:dia|horario)|mudar\s+horario)\b/.test(normalized)) {
    return "reschedule";
  }
  if (/\b(confirmo|confirmado|confirmada|pode\s+confirmar|ta\s+confirmado|esta\s+confirmado|confirmar)\b/.test(normalized)) {
    return "confirm";
  }
  return null;
}

export async function handleSdrAppointmentInboundControl(input: {
  leadId: string;
  conversationId: string | null;
  text: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.leadId || !input.text) {
    return { handled: false as const, reason: "missing_context" };
  }

  const action = detectLeadAppointmentAction(input.text);
  if (!action) return { handled: false as const, reason: "no_action" };

  const appointment = await findExistingActiveAppointment(supabase, input.leadId, input.conversationId);
  if (!appointment) return { handled: false as const, reason: "missing_appointment" };

  if (!appointment.confirmationSentAt && appointment.leadConfirmationStatus === "pending") {
    return { handled: false as const, reason: "confirmation_not_requested" };
  }

  const result = await markAppointmentLeadAction({
    appointment,
    action,
    source: "whatsapp_text",
  });

  return {
    handled: result.ok,
    action,
    result,
  } as const;
}

async function processLeadConfirmationDue(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
) {
  if (!isAppointmentActive(appointment)) return { ok: true, skipped: true, reason: "inactive" };
  if (appointment.leadConfirmationStatus !== "pending") return { ok: true, skipped: true, reason: "already_answered" };
  if (Date.parse(appointment.scheduledFor) <= Date.now()) return { ok: true, skipped: true, reason: "past_appointment" };

  const providerInstanceId = await providerInstanceIdForAppointment(supabase, appointment);
  const agentKey = appointment.agentKey || "";
  const delivery = await sendAppointmentLeadMessage({
    appointment,
    agentKey,
    providerInstanceId,
    text: leadConfirmationText(appointment),
    trackIdSuffix: "lead-confirmation",
    actionButton: appointmentActionButton(appointment),
  });

  if (!delivery.ok) return { ok: false, error: "errorMessage" in delivery ? delivery.errorMessage : "lead_confirmation_failed" };

  const notificationPayload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
  const { data } = await supabase
    .from("whatsapp_sdr_appointments")
    .update({
      lead_confirmation_requested_at: appointment.leadConfirmationRequestedAt ?? new Date().toISOString(),
      confirmation_sent_at: new Date().toISOString(),
      notification_payload: {
        ...notificationPayload,
        leadConfirmationDelivery: delivery,
      },
    })
    .eq("id", appointment.id)
    .select("*")
    .single();

  const updated = data ? await summarizeAppointmentData(supabase, data) : appointment;
  await updateMetadataWithAppointment(supabase, updated, "lead_confirmation_sent");
  await insertAppointmentTimelineNote(supabase, updated, "lead_confirmation_sent", "Mensagem enviada com botoes Confirmar e Marcar por outro dia.");
  return { ok: true, appointmentId: appointment.id };
}

async function processLeadReminderDue(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
) {
  if (!isAppointmentActive(appointment)) return { ok: true, skipped: true, reason: "inactive" };
  if (appointment.leadConfirmationStatus === RESCHEDULE_REQUESTED_STATUS) {
    return { ok: true, skipped: true, reason: "reschedule_requested" };
  }
  if (Date.parse(appointment.scheduledFor) <= Date.now() - 2 * 60_000) {
    return { ok: true, skipped: true, reason: "past_appointment" };
  }

  const providerInstanceId = await providerInstanceIdForAppointment(supabase, appointment);
  const agentKey = appointment.agentKey || "";
  const delivery = await sendAppointmentLeadMessage({
    appointment,
    agentKey,
    providerInstanceId,
    text: leadReminderText(appointment),
    trackIdSuffix: "lead-reminder",
    actionButton: appointment.leadConfirmationStatus === "pending" ? appointmentActionButton(appointment) : undefined,
  });

  if (!delivery.ok) return { ok: false, error: "errorMessage" in delivery ? delivery.errorMessage : "lead_reminder_failed" };

  const notificationPayload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
  const { data } = await supabase
    .from("whatsapp_sdr_appointments")
    .update({
      lead_reminder_sent_at: new Date().toISOString(),
      notification_payload: {
        ...notificationPayload,
        leadReminderDelivery: delivery,
      },
    })
    .eq("id", appointment.id)
    .select("*")
    .single();

  const updated = data ? await summarizeAppointmentData(supabase, data) : appointment;
  await updateMetadataWithAppointment(supabase, updated, "lead_reminder_sent");
  await insertAppointmentTimelineNote(supabase, updated, "lead_reminder_sent");
  return { ok: true, appointmentId: appointment.id };
}

async function processAdminReminderDue(
  supabase: SupabaseAdminClient,
  appointment: WhatsAppSdrAppointmentSummary,
) {
  if (!isAppointmentActive(appointment)) return { ok: true, skipped: true, reason: "inactive" };
  if (appointment.leadConfirmationStatus === RESCHEDULE_REQUESTED_STATUS) {
    return { ok: true, skipped: true, reason: "reschedule_requested" };
  }
  if (Date.parse(appointment.scheduledFor) <= Date.now() - 2 * 60_000) {
    return { ok: true, skipped: true, reason: "past_appointment" };
  }

  const providerInstanceId = await providerInstanceIdForAppointment(supabase, appointment);
  const recipient = await recipientForAppointment(supabase, appointment);
  const agentKey = appointment.agentKey || "";
  if (!recipient) return { ok: false, error: "missing_recipient" };

  const delivery = await notifyAppointmentRecipient({
    appointment,
    agentKey,
    providerInstanceId,
    recipient,
    text: adminReminderText(appointment),
    trackIdSuffix: "admin-reminder",
  });

  if (!delivery.ok) return { ok: false, error: "errorMessage" in delivery ? delivery.errorMessage : "admin_reminder_failed" };

  const notificationPayload = await latestNotificationPayload(supabase, appointment.id, appointment.notificationPayload);
  const { data } = await supabase
    .from("whatsapp_sdr_appointments")
    .update({
      admin_reminder_sent_at: new Date().toISOString(),
      notification_payload: {
        ...notificationPayload,
        adminReminderDelivery: delivery,
      },
    })
    .eq("id", appointment.id)
    .select("*")
    .single();

  const updated = data ? await summarizeAppointmentData(supabase, data) : appointment;
  await updateMetadataWithAppointment(supabase, updated, "admin_reminder_sent");
  await insertAppointmentTimelineNote(supabase, updated, "admin_reminder_sent");
  return { ok: true, appointmentId: appointment.id };
}

export async function runWhatsAppSdrAppointmentAutomation(input: { now?: string; limit?: number } = {}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const nowIso = input.now || new Date().toISOString();
  const nowMs = Date.parse(nowIso) || Date.now();
  const limit = input.limit ?? 25;
  const activeStatuses = ACTIVE_STATUSES;

  const [confirmationsResult, leadRemindersResult, adminRemindersResult] = await Promise.all([
    supabase
      .from("whatsapp_sdr_appointments")
      .select("*")
      .in("status", activeStatuses)
      .eq("lead_confirmation_status", "pending")
      .is("confirmation_sent_at", null)
      .not("confirmation_due_at", "is", null)
      .lte("confirmation_due_at", nowIso)
      .gt("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(limit),
    supabase
      .from("whatsapp_sdr_appointments")
      .select("*")
      .in("status", activeStatuses)
      .neq("lead_confirmation_status", RESCHEDULE_REQUESTED_STATUS)
      .is("lead_reminder_sent_at", null)
      .not("reminder_due_at", "is", null)
      .lte("reminder_due_at", nowIso)
      .gt("scheduled_for", new Date(nowMs - 2 * 60_000).toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(limit),
    supabase
      .from("whatsapp_sdr_appointments")
      .select("*")
      .in("status", activeStatuses)
      .neq("lead_confirmation_status", RESCHEDULE_REQUESTED_STATUS)
      .is("admin_reminder_sent_at", null)
      .not("reminder_due_at", "is", null)
      .lte("reminder_due_at", nowIso)
      .gt("scheduled_for", new Date(nowMs - 2 * 60_000).toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(limit),
  ]);

  const errors: string[] = [];
  const result = {
    confirmationsSent: 0,
    leadRemindersSent: 0,
    adminRemindersSent: 0,
    skipped: 0,
  };

  const processRows = async (
    rows: unknown[] | null | undefined,
    handler: (appointment: WhatsAppSdrAppointmentSummary) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>,
    counter: keyof Pick<typeof result, "confirmationsSent" | "leadRemindersSent" | "adminRemindersSent">,
  ) => {
    for (const row of rows || []) {
      const appointment = await summarizeAppointmentData(supabase, row);
      const processed = await handler(appointment).catch((error: unknown) => ({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }));
      const skipped = "skipped" in processed && Boolean(processed.skipped);
      if (processed.ok && !skipped) result[counter] += 1;
      else if (skipped) result.skipped += 1;
      else errors.push(`${appointment.id}: ${processed.error || "erro desconhecido"}`);
    }
  };

  if (confirmationsResult.error) errors.push(`confirmations: ${confirmationsResult.error.message}`);
  if (leadRemindersResult.error) errors.push(`lead_reminders: ${leadRemindersResult.error.message}`);
  if (adminRemindersResult.error) errors.push(`admin_reminders: ${adminRemindersResult.error.message}`);

  await processRows(confirmationsResult.data as unknown[], (appointment) => processLeadConfirmationDue(supabase, appointment), "confirmationsSent");
  await processRows(leadRemindersResult.data as unknown[], (appointment) => processLeadReminderDue(supabase, appointment), "leadRemindersSent");
  await processRows(adminRemindersResult.data as unknown[], (appointment) => processAdminReminderDue(supabase, appointment), "adminRemindersSent");

  return {
    ok: errors.length === 0,
    ...result,
    errors,
    timestamp: new Date().toISOString(),
  };
}

export async function updateWhatsAppSdrAppointmentStatus(input: {
  appointmentId: string;
  status: SdrAppointmentStatus;
  cancellationReason?: string;
}): Promise<WhatsAppSdrAppointmentSummary | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const patch: Record<string, unknown> = {
    status: input.status,
  };

  if (input.status === "completed") patch.completed_at = new Date().toISOString();
  if (input.status === "cancelled") {
    patch.cancelled_at = new Date().toISOString();
    patch.cancellation_reason = input.cancellationReason ?? null;
  }

  const { data, error } = await supabase
    .from("whatsapp_sdr_appointments")
    .update(patch)
    .eq("id", input.appointmentId)
    .select("*")
    .single();

  if (error || !data) return null;

  const assignedId = asNullableString(asRecord(data).assigned_admin_user_id);
  const recipients = await mapRecipientsById(assignedId ? [assignedId] : []);
  const appointment = summarizeSdrAppointmentRow(asRecord(data), recipients);
  await updateMetadataWithAppointment(supabase, appointment, input.status, input.cancellationReason);
  await insertAppointmentTimelineNote(supabase, appointment, input.status);
  return appointment;
}

export function formatSdrAppointmentDate(iso: string) {
  return `${shortDateFormatter.format(new Date(iso))} ${shortTimeFormatter.format(new Date(iso))}`;
}
