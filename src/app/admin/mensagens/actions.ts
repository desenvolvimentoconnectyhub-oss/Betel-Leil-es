"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import {
  normalizeTemplateVariables,
  parseMessageVariablesForm,
  parseRouteFormRecipients,
  queueDirectMessageRecord,
  saveMessageRouteRecord,
  saveMessageTemplateRecord,
} from "@/lib/admin/repository";
import {
  DEFAULT_SDR_APPOINTMENT_MESSAGE_TEMPLATES,
  DEFAULT_SDR_GROUP_INVITE_SETTINGS,
  saveWhatsAppSdrAppointmentSettings,
} from "@/lib/whatsapp/sdr-appointments";
import type {
  WhatsAppSdrAppointmentMessageTemplates,
  WhatsAppSdrGroupInviteSettings,
} from "@/lib/whatsapp/sdr-appointment-types";

const managerRoles = new Set(["owner", "admin", "manager"]);
const statusValues = new Set(["draft", "active", "archived"]);

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listField(formData: FormData, name: string) {
  return formData
    .getAll(name)
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean)
    .join(",");
}

function booleanField(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" && ["1", "true", "on", "yes", "sim"].includes(value.toLowerCase());
}

function numberField(formData: FormData, name: string): number | undefined {
  const value = field(formData, name);
  if (!value) return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function safeQueryValue(value: string) {
  return value.replace(/[^\w.:-]/g, "").slice(0, 120);
}

function redirectWith(
  status: "success" | "error",
  message: string,
  context?: { tab?: string; template?: string; route?: string }
): never {
  const params = new URLSearchParams({ status, message });
  if (context?.tab) params.set("tab", safeQueryValue(context.tab));
  if (context?.template) params.set("template", safeQueryValue(context.template));
  if (context?.route) params.set("route", safeQueryValue(context.route));
  redirect(`/admin/mensagens?${params.toString()}`);
}

function redirectContext(formData: FormData) {
  return {
    tab: field(formData, "returnTab"),
    template: field(formData, "returnTemplate"),
    route: field(formData, "returnRoute"),
  };
}

async function requireMessageManager() {
  const admin = await requireCurrentAdmin();
  if (!managerRoles.has(admin.role)) {
    redirectWith("error", "Seu perfil nao pode gerenciar mensagens.");
  }
  return admin;
}

function revalidateMessages() {
  revalidatePath("/admin");
  revalidatePath("/admin/mensagens");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
}

function revalidateSdrAppointmentFlow() {
  revalidateMessages();
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/agenda");
  revalidatePath("/api/admin/whatsapp/appointments");
  revalidatePath("/api/admin/whatsapp/crm");
}

export async function saveMessageTemplateAction(formData: FormData) {
  const admin = await requireMessageManager();
  const context = redirectContext(formData);
  const statusValue = field(formData, "status", "active");
  const status = statusValues.has(statusValue) ? (statusValue as "draft" | "active" | "archived") : "draft";
  const result = await saveMessageTemplateRecord({
    id: field(formData, "id"),
    templateKey: field(formData, "templateKey"),
    channel: field(formData, "channel", "whatsapp"),
    audienceKey: field(formData, "audienceKey", "general"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    subjectTemplate: field(formData, "subjectTemplate"),
    bodyTemplate: field(formData, "bodyTemplate"),
    guardrailTemplate: field(formData, "guardrailTemplate"),
    buttonLabelTemplate: field(formData, "buttonLabelTemplate"),
    buttonUrlTemplate: field(formData, "buttonUrlTemplate"),
    variables: normalizeTemplateVariables(field(formData, "variables")),
    version: Number(field(formData, "version", "1")),
    status,
    operatorLabel: admin.name || admin.email || "Admin Betel",
  });

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel salvar o template.", context);
  revalidateMessages();
  redirectWith("success", "Template de mensagem salvo.", context);
}

export async function saveMessageRouteAction(formData: FormData) {
  const admin = await requireMessageManager();
  const context = redirectContext(formData);
  const parsed = parseRouteFormRecipients({
    segmentKeys: listField(formData, "recipientSegmentKeys"),
    recipientKeys: listField(formData, "recipientKeys"),
    manualRecipients: field(formData, "manualRecipients"),
  });
  const result = await saveMessageRouteRecord({
    routeKey: field(formData, "routeKey"),
    name: field(formData, "name"),
    description: field(formData, "description"),
    templateKey: field(formData, "templateKey"),
    channel: field(formData, "channel", "whatsapp"),
    recipientSegmentKeys: parsed.recipientSegmentKeys,
    recipientKeys: parsed.recipientKeys,
    manualRecipients: parsed.manualRecipients,
    enabled: booleanField(formData, "enabled"),
    operatorLabel: admin.name || admin.email || "Admin Betel",
  });

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel salvar a rota.", context);
  revalidateMessages();
  redirectWith("success", "Rota de destinatarios salva.", context);
}

export async function queueDirectMessageAction(formData: FormData) {
  const admin = await requireMessageManager();
  const context = redirectContext(formData);
  const parsed = parseRouteFormRecipients({
    segmentKeys: listField(formData, "recipientSegmentKeys"),
    recipientKeys: listField(formData, "recipientKeys"),
    manualRecipients: field(formData, "manualRecipients"),
  });
  const variables = {
    subject: field(formData, "subject"),
    body: field(formData, "body"),
    guardrail: field(formData, "guardrail"),
    button_label: field(formData, "buttonLabel"),
    button_url: field(formData, "buttonUrl"),
    ...parseMessageVariablesForm(field(formData, "variablesJson")),
  };
  const result = await queueDirectMessageRecord({
    templateKey: field(formData, "templateKey", "message.direct"),
    channel: field(formData, "channel", "whatsapp"),
    audienceKey: field(formData, "audienceKey", "general"),
    recipientSegmentKeys: parsed.recipientSegmentKeys,
    recipientKeys: parsed.recipientKeys,
    manualRecipients: parsed.manualRecipients,
    variables,
    operatorLabel: admin.name || admin.email || "Admin Betel",
  });

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel criar a mensagem.", context);
  revalidateMessages();

  if (!result.data?.outboxCount) {
    redirectWith("error", result.data?.skippedReason || "Nenhum destinatario elegivel.", context);
  }

  redirectWith("success", `${result.data.outboxCount} mensagem(ns) criada(s) no outbox.`, context);
}

export async function saveSdrAppointmentFlowAction(formData: FormData) {
  await requireMessageManager();
  const context = { tab: "remetente" };
  const businessStartHour = numberField(formData, "businessStartHour");
  const businessEndHour = numberField(formData, "businessEndHour");
  const maxBookingsPerHour = numberField(formData, "maxBookingsPerHour");
  const leadConfirmationMinutesBefore = numberField(formData, "leadConfirmationMinutesBefore");
  const adminUnconfirmedNoticeMinutesBefore = numberField(formData, "adminUnconfirmedNoticeMinutesBefore");

  if (
    businessStartHour === undefined ||
    businessEndHour === undefined ||
    businessStartHour < 0 ||
    businessStartHour > 23 ||
    businessEndHour < 1 ||
    businessEndHour > 24 ||
    businessStartHour >= businessEndHour
  ) {
    redirectWith("error", "Informe uma janela de atendimento valida para a Agenda SDR.", context);
  }

  if (maxBookingsPerHour === undefined || maxBookingsPerHour < 1 || maxBookingsPerHour > 10) {
    redirectWith("error", "O limite da Agenda SDR deve ficar entre 1 e 10 leads por hora.", context);
  }

  if (
    leadConfirmationMinutesBefore === undefined ||
    leadConfirmationMinutesBefore < 1 ||
    leadConfirmationMinutesBefore > 1440
  ) {
    redirectWith("error", "Informe quantos minutos antes a Evelyn deve confirmar com o lead.", context);
  }

  if (
    adminUnconfirmedNoticeMinutesBefore === undefined ||
    adminUnconfirmedNoticeMinutesBefore < 0 ||
    adminUnconfirmedNoticeMinutesBefore >= leadConfirmationMinutesBefore
  ) {
    redirectWith("error", "O aviso ao admin sem confirmacao precisa acontecer depois da pergunta ao lead.", context);
  }

  const messageTemplates = Object.fromEntries(
    Object.keys(DEFAULT_SDR_APPOINTMENT_MESSAGE_TEMPLATES).map((key) => [
      key,
      field(formData, `sdrTemplate_${key}`, DEFAULT_SDR_APPOINTMENT_MESSAGE_TEMPLATES[key as keyof WhatsAppSdrAppointmentMessageTemplates]),
    ]),
  ) as Partial<WhatsAppSdrAppointmentMessageTemplates>;
  const groupInviteUrl = field(formData, "groupInviteGroupUrl", DEFAULT_SDR_GROUP_INVITE_SETTINGS.groupUrl);

  try {
    const parsedGroupUrl = new URL(groupInviteUrl);
    const host = parsedGroupUrl.hostname.toLowerCase();
    const isWhatsAppGroup =
      parsedGroupUrl.protocol === "https:" &&
      (host === "chat.whatsapp.com" || host === "whatsapp.com" || host === "www.whatsapp.com");
    if (!isWhatsAppGroup) {
      redirectWith("error", "Informe um link valido de grupo do WhatsApp para o convite da Betel.", context);
    }
  } catch {
    redirectWith("error", "Informe um link valido de grupo do WhatsApp para o convite da Betel.", context);
  }

  const groupInvite: Partial<WhatsAppSdrGroupInviteSettings> = {
    enabled: booleanField(formData, "groupInviteEnabled"),
    groupUrl: groupInviteUrl,
    buttonLabel: field(formData, "groupInviteButtonLabel", DEFAULT_SDR_GROUP_INVITE_SETTINGS.buttonLabel),
    footerText: field(formData, "groupInviteFooterText", DEFAULT_SDR_GROUP_INVITE_SETTINGS.footerText),
    trackingEnabled: booleanField(formData, "groupInviteTrackingEnabled"),
    sendAfterScheduled: booleanField(formData, "groupInviteAfterScheduled"),
    sendAfterDisqualified: booleanField(formData, "groupInviteAfterDisqualified"),
  };

  await saveWhatsAppSdrAppointmentSettings({
    notificationAdminUserId: field(formData, "notificationAdminUserId") || null,
    handoffAlertAdminUserId: field(formData, "handoffAlertAdminUserId") || null,
    businessStartHour,
    businessEndHour,
    maxBookingsPerHour,
    leadConfirmationMinutesBefore,
    adminUnconfirmedNoticeMinutesBefore,
    messageTemplates,
    groupInvite,
  });

  revalidateSdrAppointmentFlow();
  redirectWith("success", "Fluxo automatico da Agenda SDR salvo.", context);
}
