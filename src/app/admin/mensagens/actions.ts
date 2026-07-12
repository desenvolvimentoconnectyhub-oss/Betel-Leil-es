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

function redirectWith(status: "success" | "error", message: string): never {
  redirect(`/admin/mensagens?status=${status}&message=${encodeURIComponent(message)}`);
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

export async function saveMessageTemplateAction(formData: FormData) {
  const admin = await requireMessageManager();
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

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel salvar o template.");
  revalidateMessages();
  redirectWith("success", "Template de mensagem salvo.");
}

export async function saveMessageRouteAction(formData: FormData) {
  const admin = await requireMessageManager();
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

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel salvar a rota.");
  revalidateMessages();
  redirectWith("success", "Rota de destinatarios salva.");
}

export async function queueDirectMessageAction(formData: FormData) {
  const admin = await requireMessageManager();
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

  if (!result.ok) redirectWith("error", result.error || "Nao foi possivel criar a mensagem.");
  revalidateMessages();

  if (!result.data?.outboxCount) {
    redirectWith("error", result.data?.skippedReason || "Nenhum destinatario elegivel.");
  }

  redirectWith("success", `${result.data.outboxCount} mensagem(ns) criada(s) no outbox.`);
}
