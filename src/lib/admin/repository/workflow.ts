import "server-only";

import type { AdminSessionUser } from "@/lib/auth/types";
import { sendGlobalWhatsAppText } from "@/lib/communication/connectyhub-client";
import { renderMessageTemplate } from "@/lib/communication/message-templates";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DataResult, MutationResult } from "./shared";

type DbRow = Record<string, unknown>;

export type AdminSectorKey =
  | "operations"
  | "market_analysis"
  | "legal"
  | "validation"
  | "creative"
  | "communication";

export type AdminSector = {
  id: string;
  key: string;
  name: string;
  description: string;
  defaultRoute: string;
  sortOrder: number;
  isActive: boolean;
};

export type AdminSectorMembership = {
  id: string;
  adminUserId: string;
  sectorId: string;
  sectorKey: string;
  sectorName: string;
  defaultRoute: string;
  roleInSector: string;
  canReview: boolean;
  canApprove: boolean;
  canReceiveNotifications: boolean;
  isPrimary: boolean;
  isActive: boolean;
};

export type PipelineStageDefinition = {
  id: string;
  stageKey: string;
  name: string;
  description: string;
  sectorId: string;
  sectorKey: string;
  sectorName: string;
  nextStageKey: string;
  requiredPermission: string;
  slaHours: number;
  sortOrder: number;
  isActive: boolean;
};

export type WorkflowTaskStatus =
  | "pending"
  | "in_progress"
  | "approved"
  | "approved_with_notes"
  | "rejected"
  | "blocked"
  | "cancelled";

export type OpportunityWorkflowTask = {
  id: string;
  opportunityId: string;
  batchId: string;
  importRowId: string;
  stageKey: string;
  sectorId: string;
  assignedAdminUserId: string;
  status: WorkflowTaskStatus;
  title: string;
  description: string;
  actionUrl: string;
  priority: string;
  dueAt: string;
  createdByAdminUserId: string;
  resolvedByAdminUserId: string;
  resolvedAt: string;
  decision: string;
  decisionNotes: string;
  sourceType: string;
  createdAt: string;
  updatedAt: string;
};

type SectorRecipient = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
};

export const openWorkflowTaskStatuses: WorkflowTaskStatus[] = ["pending", "in_progress", "blocked"];

const sectorStageKeys: Record<AdminSectorKey, string[]> = {
  operations: [],
  market_analysis: ["market_review"],
  legal: ["legal_review"],
  validation: ["validation"],
  creative: ["creative"],
  communication: ["communication"],
};

const defaultSectors: AdminSector[] = [
  {
    id: "",
    key: "operations",
    name: "Operacao / Admin",
    description: "Usuarios que administram a operacao e acompanham todas as filas.",
    defaultRoute: "/admin",
    sortOrder: 10,
    isActive: true,
  },
  {
    id: "",
    key: "market_analysis",
    name: "Analise de mercado",
    description: "Setor que revisa a analise automatica dos imoveis.",
    defaultRoute: "/admin/oportunidades",
    sortOrder: 20,
    isActive: true,
  },
  {
    id: "",
    key: "legal",
    name: "Juridico",
    description: "Setor que valida risco juridico, edital, ocupacao e impedimentos.",
    defaultRoute: "/admin/fontes/capturas",
    sortOrder: 30,
    isActive: true,
  },
  {
    id: "",
    key: "validation",
    name: "Validacao",
    description: "Setor que faz a validacao final antes da publicacao ou comunicacao.",
    defaultRoute: "/admin/oportunidades",
    sortOrder: 40,
    isActive: true,
  },
  {
    id: "",
    key: "creative",
    name: "Criativos",
    description: "Setor que prepara pecas e materiais de comunicacao.",
    defaultRoute: "/admin/meta-whatsapp",
    sortOrder: 50,
    isActive: true,
  },
  {
    id: "",
    key: "communication",
    name: "Comunicacao",
    description: "Setor que envia oportunidades aprovadas para usuarios e canais.",
    defaultRoute: "/admin/whatsapp",
    sortOrder: 60,
    isActive: true,
  },
];

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = cleanString(value).toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "off"].includes(normalized)) return false;
  return fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asStatus(value: unknown): WorkflowTaskStatus {
  const status = cleanString(value, "pending");
  return ["pending", "in_progress", "approved", "approved_with_notes", "rejected", "blocked", "cancelled"].includes(status)
    ? (status as WorkflowTaskStatus)
    : "pending";
}

function appUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "http://localhost:3000"
  ).replace(/\/+$/g, "");
}

function absoluteActionUrl(path: string) {
  const value = cleanString(path, "/admin");
  if (/^https?:\/\//i.test(value)) return value;
  return `${appUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function notificationCode(prefix: string, id: string) {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${suffix}`;
}

function normalizeSector(row: DbRow): AdminSector {
  return {
    id: cleanString(row.id),
    key: cleanString(row.sector_key),
    name: cleanString(row.name),
    description: cleanString(row.description),
    defaultRoute: cleanString(row.default_route, "/admin"),
    sortOrder: asNumber(row.sort_order),
    isActive: asBoolean(row.is_active, true),
  };
}

function normalizeMembership(row: DbRow): AdminSectorMembership {
  const sector = asRecord(row.admin_sectors);
  return {
    id: cleanString(row.id),
    adminUserId: cleanString(row.admin_user_id),
    sectorId: cleanString(row.sector_id),
    sectorKey: cleanString(sector.sector_key),
    sectorName: cleanString(sector.name),
    defaultRoute: cleanString(sector.default_route, "/admin"),
    roleInSector: cleanString(row.role_in_sector, "member"),
    canReview: asBoolean(row.can_review, true),
    canApprove: asBoolean(row.can_approve),
    canReceiveNotifications: asBoolean(row.can_receive_notifications, true),
    isPrimary: asBoolean(row.is_primary),
    isActive: asBoolean(row.is_active, true),
  };
}

function normalizeStage(row: DbRow): PipelineStageDefinition {
  const sector = asRecord(row.admin_sectors);
  return {
    id: cleanString(row.id),
    stageKey: cleanString(row.stage_key),
    name: cleanString(row.name),
    description: cleanString(row.description),
    sectorId: cleanString(row.sector_id),
    sectorKey: cleanString(sector.sector_key),
    sectorName: cleanString(sector.name),
    nextStageKey: cleanString(row.next_stage_key),
    requiredPermission: cleanString(row.required_permission, "review"),
    slaHours: asNumber(row.sla_hours, 24),
    sortOrder: asNumber(row.sort_order),
    isActive: asBoolean(row.is_active, true),
  };
}

function normalizeTask(row: DbRow): OpportunityWorkflowTask {
  return {
    id: cleanString(row.id),
    opportunityId: cleanString(row.opportunity_id),
    batchId: cleanString(row.batch_id),
    importRowId: cleanString(row.import_row_id),
    stageKey: cleanString(row.stage_key),
    sectorId: cleanString(row.sector_id),
    assignedAdminUserId: cleanString(row.assigned_admin_user_id),
    status: asStatus(row.status),
    title: cleanString(row.title),
    description: cleanString(row.description),
    actionUrl: cleanString(row.action_url),
    priority: cleanString(row.priority, "normal"),
    dueAt: cleanString(row.due_at),
    createdByAdminUserId: cleanString(row.created_by_admin_user_id),
    resolvedByAdminUserId: cleanString(row.resolved_by_admin_user_id),
    resolvedAt: cleanString(row.resolved_at),
    decision: cleanString(row.decision),
    decisionNotes: cleanString(row.decision_notes),
    sourceType: cleanString(row.source_type, "manual"),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
  };
}

export function defaultSectorKeysForRole(role: string) {
  if (role === "owner" || role === "admin") return ["operations"];
  if (role === "manager") return ["operations", "market_analysis"];
  if (role === "analyst") return ["market_analysis"];
  return [];
}

export function adminHasFullOpportunityVisibility(admin: AdminSessionUser) {
  return admin.role === "owner" || admin.role === "admin";
}

export function workflowStageKeysForAdmin(admin: AdminSessionUser) {
  if (adminHasFullOpportunityVisibility(admin)) return [];

  const memberships = admin.sectors || [];
  const scopedMemberships = memberships.some((membership) => membership.isPrimary)
    ? memberships.filter((membership) => membership.isPrimary)
    : memberships;
  const stageKeys = new Set<string>();

  for (const membership of scopedMemberships) {
    const key = cleanString(membership.key) as AdminSectorKey;
    for (const stageKey of sectorStageKeys[key] || []) {
      stageKeys.add(stageKey);
    }
  }

  if (!stageKeys.size && ["manager", "analyst"].includes(admin.role)) {
    stageKeys.add("market_review");
  }

  return [...stageKeys];
}

export async function getOpenOpportunityWorkflowTaskForAdminRecord(input: {
  opportunityCode: string;
  admin: AdminSessionUser;
}): Promise<DataResult<OpportunityWorkflowTask | null>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      data: null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const opportunityCode = cleanString(input.opportunityCode);
  if (!opportunityCode) {
    return {
      data: null,
      source: "supabase",
      reason: "Oportunidade nao informada.",
    };
  }

  const { data: opportunity, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id")
    .eq("code", opportunityCode)
    .maybeSingle();

  if (opportunityError) {
    return {
      data: null,
      source: "supabase",
      reason: opportunityError.message,
    };
  }

  const opportunityId = cleanString((opportunity as DbRow | null)?.id);
  if (!opportunityId) {
    return {
      data: null,
      source: "supabase",
      reason: "Oportunidade nao encontrada para workflow.",
    };
  }

  const stageKeys = workflowStageKeysForAdmin(input.admin);
  if (!adminHasFullOpportunityVisibility(input.admin) && !stageKeys.length) {
    return {
      data: null,
      source: "supabase",
      reason: "Usuario sem etapa aberta neste workflow.",
    };
  }

  let query = supabase
    .from("opportunity_workflow_tasks")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .in("status", openWorkflowTaskStatuses)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (stageKeys.length) {
    query = query.in("stage_key", stageKeys);
  }

  const { data, error } = await query;
  if (error) {
    return {
      data: null,
      source: "supabase",
      reason: error.message,
    };
  }

  const task = ((data || []) as DbRow[]).map(normalizeTask).find((item) => item.id) || null;
  return {
    data: task,
    source: "supabase",
    reason: task ? undefined : "Nenhuma tarefa aberta para este usuario nesta oportunidade.",
  };
}

export async function listAdminSectors(): Promise<DataResult<AdminSector[]>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { data: defaultSectors, source: "mock", reason: "Supabase admin nao configurado." };

  const { data, error } = await supabase
    .from("admin_sectors")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return { data: defaultSectors, source: "mock", reason: error.message };

  return {
    data: ((data || []) as DbRow[]).map(normalizeSector).filter((sector) => sector.key),
    source: "supabase",
  };
}

export async function getAdminUserSectorMemberships(adminUserId: string): Promise<AdminSectorMembership[]> {
  const memberships = await listAdminUserSectorMemberships([adminUserId]);
  return memberships.get(adminUserId) || [];
}

export async function listAdminUserSectorMemberships(adminUserIds: string[]): Promise<Map<string, AdminSectorMembership[]>> {
  const result = new Map<string, AdminSectorMembership[]>();
  const ids = [...new Set(adminUserIds.map((id) => cleanString(id)).filter(Boolean))];
  if (!ids.length) return result;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return result;

  const { data, error } = await supabase
    .from("admin_user_sector_memberships")
    .select("*, admin_sectors(sector_key,name,default_route)")
    .in("admin_user_id", ids)
    .eq("is_active", true)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) return result;

  for (const item of ((data || []) as DbRow[]).map(normalizeMembership).filter((membership) => membership.sectorKey)) {
    const current = result.get(item.adminUserId) || [];
    current.push(item);
    result.set(item.adminUserId, current);
  }

  return result;
}

export async function setAdminUserSectorMemberships(
  adminUserId: string,
  sectorKeys: string[]
): Promise<MutationResult<{ count: number }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const cleanAdminUserId = cleanString(adminUserId);
  const keys = [...new Set(sectorKeys.map((key) => cleanString(key)).filter(Boolean))];
  if (!cleanAdminUserId) return { ok: false, error: "Usuario nao informado para setores." };

  const { error: deactivateError } = await supabase
    .from("admin_user_sector_memberships")
    .update({ is_active: false, is_primary: false })
    .eq("admin_user_id", cleanAdminUserId);

  if (deactivateError) return { ok: false, error: deactivateError.message };
  if (!keys.length) return { ok: true, data: { count: 0 } };

  const { data: sectors, error: sectorsError } = await supabase
    .from("admin_sectors")
    .select("id, sector_key")
    .in("sector_key", keys)
    .eq("is_active", true);

  if (sectorsError) return { ok: false, error: sectorsError.message };

  const sectorRows = (sectors || []) as DbRow[];
  const payload = sectorRows.map((sector, index) => ({
    admin_user_id: cleanAdminUserId,
    sector_id: cleanString(sector.id),
    role_in_sector: index === 0 ? "coordinator" : "reviewer",
    can_review: true,
    can_approve: true,
    can_receive_notifications: true,
    is_primary: index === 0,
    is_active: true,
  }));

  if (!payload.length) return { ok: false, error: "Setores selecionados nao foram encontrados." };

  const { error: upsertError } = await supabase
    .from("admin_user_sector_memberships")
    .upsert(payload, { onConflict: "admin_user_id,sector_id" });

  if (upsertError) return { ok: false, error: upsertError.message };
  return { ok: true, data: { count: payload.length } };
}

async function getStageDefinition(stageKey: string): Promise<PipelineStageDefinition | null> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("pipeline_stage_definitions")
    .select("*, admin_sectors(sector_key,name)")
    .eq("stage_key", stageKey)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeStage(data as DbRow);
}

export async function adminCanApproveWorkflowStage(
  admin: AdminSessionUser,
  stageKey: string
): Promise<boolean> {
  if (admin.role === "owner" || admin.role === "admin") return true;

  const stage = await getStageDefinition(stageKey);
  if (!stage) return false;

  const memberships = admin.sectors?.length ? admin.sectors : await getAdminUserSectorMemberships(admin.id);
  if (!memberships.length && stageKey === "market_review" && ["manager", "analyst"].includes(admin.role)) {
    return true;
  }

  return memberships.some((membership) => {
    const sectorKey = "sectorKey" in membership ? membership.sectorKey : membership.key;
    const isActive = "isActive" in membership ? membership.isActive : true;
    return (
      isActive &&
      sectorKey === stage.sectorKey &&
      (stage.requiredPermission === "approve" ? membership.canApprove : membership.canReview)
    );
  });
}

async function loadSectorRecipients(sectorId: string): Promise<SectorRecipient[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !sectorId) return [];

  const { data, error } = await supabase
    .from("admin_user_sector_memberships")
    .select("admin_users(id,display_name,email,phone,role,status)")
    .eq("sector_id", sectorId)
    .eq("is_active", true)
    .eq("can_receive_notifications", true);

  if (error) return [];

  return ((data || []) as DbRow[])
    .map((row) => {
      const admin = asRecord(row.admin_users);
      return {
        id: cleanString(admin.id),
        name: cleanString(admin.display_name, cleanString(admin.email, "Admin Betel")),
        email: cleanString(admin.email).toLowerCase(),
        phone: cleanString(admin.phone),
        role: cleanString(admin.role),
        status: cleanString(admin.status),
      };
    })
    .filter((recipient) => recipient.id && recipient.phone && ["active", "invited"].includes(recipient.status));
}

async function insertNotification(input: {
  taskId?: string;
  opportunityId?: string;
  batchId?: string;
  sectorId?: string;
  recipientAdminUserId?: string;
  title: string;
  messageText: string;
  actionUrl: string;
  status?: "queued" | "sent" | "failed" | "skipped";
  provider?: string;
  providerMessageId?: string;
  providerResponse?: Record<string, unknown>;
  errorMessage?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("internal_notifications").insert({
    task_id: input.taskId || null,
    opportunity_id: input.opportunityId || null,
    batch_id: input.batchId || null,
    sector_id: input.sectorId || null,
    recipient_admin_user_id: input.recipientAdminUserId || null,
    notification_type: input.taskId ? "workflow_task" : "workflow_batch",
    channel: "whatsapp",
    title: input.title,
    message_text: input.messageText,
    action_url: input.actionUrl,
    status: input.status || "queued",
    provider: input.provider || null,
    provider_message_id: input.providerMessageId || null,
    provider_response: input.providerResponse || {},
    error_message: input.errorMessage || null,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
  });
}

async function notifySector(input: {
  templateKey: string;
  sectorId: string;
  taskId?: string;
  opportunityId?: string;
  batchId?: string;
  title: string;
  messageText: string;
  actionUrl: string;
  variables: Record<string, unknown>;
}) {
  const recipients = await loadSectorRecipients(input.sectorId);

  if (!recipients.length) {
    await insertNotification({
      taskId: input.taskId,
      opportunityId: input.opportunityId,
      batchId: input.batchId,
      sectorId: input.sectorId,
      title: input.title,
      messageText: input.messageText,
      actionUrl: input.actionUrl,
      status: "skipped",
      errorMessage: "Nenhum usuario ativo com WhatsApp no setor.",
    });
    return { sent: 0, failed: 0, skipped: 1 };
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    const rendered = await renderMessageTemplate({
      templateKey: input.templateKey,
      channel: "whatsapp",
      audienceKey: "admin",
      variables: {
        ...input.variables,
        recipient_name: recipient.name,
        recipient_first_name: recipient.name.split(/\s+/)[0] || "tudo bem",
        recipient_email: recipient.email,
        recipient_phone: recipient.phone,
      },
    });
    const messageCode = notificationCode("WF", input.taskId || input.batchId || recipient.id);
    const delivery = await sendGlobalWhatsAppText({
      messageCode,
      runCode: `WORKFLOW-${messageCode}`,
      subject: rendered.subject || input.title,
      messagePreview: rendered.body || input.messageText,
      guardrailSummary: rendered.guardrailSummary,
      actionButton: rendered.actionButton || { label: "Abrir painel", url: input.actionUrl, footerText: "Betel Leiloes" },
      payload: {
        eventType: input.taskId ? "workflow_task_assigned" : "workflow_batch_ready",
        template: {
          key: rendered.template.templateKey,
          version: rendered.template.version,
          missingVariables: rendered.missingVariables,
        },
        recipient: {
          name: recipient.name,
          email: recipient.email,
          phone: recipient.phone,
        },
      },
    });

    if (delivery.ok) sent += 1;
    else failed += 1;

    await insertNotification({
      taskId: input.taskId,
      opportunityId: input.opportunityId,
      batchId: input.batchId,
      sectorId: input.sectorId,
      recipientAdminUserId: recipient.id,
      title: input.title,
      messageText: rendered.body || input.messageText,
      actionUrl: input.actionUrl,
      status: delivery.ok ? "sent" : "failed",
      provider: "connectyhub",
      providerMessageId: delivery.externalDeliveryId,
      providerResponse: delivery as unknown as Record<string, unknown>,
      errorMessage: delivery.errorMessage,
    });
  }

  return { sent, failed, skipped: 0 };
}

export async function ensureOpportunityWorkflowTaskRecord(input: {
  opportunityId: string;
  stageKey: string;
  batchId?: string;
  importRowId?: string;
  title: string;
  description?: string;
  actionUrl?: string;
  priority?: "low" | "normal" | "high" | "critical";
  createdByAdminUserId?: string;
  sourceType?: string;
  sourcePayload?: Record<string, unknown>;
  sendNotification?: boolean;
}): Promise<MutationResult<{ task: OpportunityWorkflowTask; notification?: { sent: number; failed: number; skipped: number } }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const stage = await getStageDefinition(input.stageKey);
  if (!stage?.id) return { ok: false, error: `Etapa de workflow nao encontrada: ${input.stageKey}.` };

  const actionUrl = input.actionUrl || `/admin/oportunidades`;
  const dueAt = new Date(Date.now() + stage.slaHours * 60 * 60 * 1000).toISOString();
  const { data: existing, error: existingError } = await supabase
    .from("opportunity_workflow_tasks")
    .select("*")
    .eq("opportunity_id", input.opportunityId)
    .eq("stage_key", input.stageKey)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  const payload = {
    opportunity_id: input.opportunityId,
    batch_id: input.batchId || null,
    import_row_id: input.importRowId || null,
    stage_key: input.stageKey,
    sector_id: stage.sectorId || null,
    status: "pending",
    title: input.title,
    description: input.description || stage.description,
    action_url: actionUrl,
    priority: input.priority || "normal",
    due_at: dueAt,
    created_by_admin_user_id: input.createdByAdminUserId || null,
    source_type: input.sourceType || "workflow",
    source_payload: input.sourcePayload || {},
  };

  let task: OpportunityWorkflowTask;
  if (existing?.id) {
    const { data, error } = await supabase
      .from("opportunity_workflow_tasks")
      .update({
        title: payload.title,
        description: payload.description,
        action_url: payload.action_url,
        priority: payload.priority,
        due_at: payload.due_at,
        source_payload: payload.source_payload,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error || !data) return { ok: false, error: error?.message || "Nao foi possivel atualizar tarefa." };
    task = normalizeTask(data as DbRow);
  } else {
    const { data, error } = await supabase
      .from("opportunity_workflow_tasks")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) return { ok: false, error: error?.message || "Nao foi possivel criar tarefa." };
    task = normalizeTask(data as DbRow);
  }

  const notification = input.sendNotification === false || !stage.sectorId
    ? undefined
    : await notifySector({
        templateKey: "internal.workflow.task_assigned",
        sectorId: stage.sectorId,
        taskId: task.id,
        opportunityId: input.opportunityId,
        title: input.title,
        messageText: input.description || stage.description,
        actionUrl: absoluteActionUrl(actionUrl),
        variables: {
          stage_name: stage.name,
          sector_name: stage.sectorName,
          task_title: input.title,
          task_description: input.description || stage.description,
          action_url: absoluteActionUrl(actionUrl),
        },
      });

  return { ok: true, data: { task, notification } };
}

async function resolveOpenWorkflowTask(input: {
  opportunityId: string;
  stageKey: string;
  status: WorkflowTaskStatus;
  resolvedByAdminUserId?: string;
  decision?: string;
  decisionNotes?: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase
    .from("opportunity_workflow_tasks")
    .update({
      status: input.status,
      resolved_by_admin_user_id: input.resolvedByAdminUserId || null,
      resolved_at: new Date().toISOString(),
      decision: input.decision || input.status,
      decision_notes: input.decisionNotes || null,
    })
    .eq("opportunity_id", input.opportunityId)
    .eq("stage_key", input.stageKey)
    .in("status", openWorkflowTaskStatuses);
}

const workflowStageActionCopy: Record<string, { stageLabel: string; nextAction: string; tab: string }> = {
  legal_review: {
    stageLabel: "Revisao juridica",
    nextAction: "Juridico deve validar edital, ocupacao, riscos e permissao de seguir.",
    tab: "juridico",
  },
  validation: {
    stageLabel: "Validacao",
    nextAction: "Validacao deve conferir dados finais antes dos criativos e comunicacao.",
    tab: "visao-geral",
  },
  creative: {
    stageLabel: "Criativos",
    nextAction: "Criativos devem preparar as pecas e materiais da oportunidade aprovada.",
    tab: "documentos",
  },
  communication: {
    stageLabel: "Divulgacao WhatsApp",
    nextAction: "Comunicacao deve escolher agente, destino e acompanhar o envio da oportunidade.",
    tab: "visao-geral",
  },
};

function workflowStageLabel(stage: PipelineStageDefinition) {
  return workflowStageActionCopy[stage.stageKey]?.stageLabel || stage.name;
}

function workflowStageNextAction(stage: PipelineStageDefinition) {
  return workflowStageActionCopy[stage.stageKey]?.nextAction || stage.description;
}

function workflowStageTab(stage: PipelineStageDefinition) {
  return workflowStageActionCopy[stage.stageKey]?.tab || "visao-geral";
}

export async function advanceOpportunityAfterMarketApprovalRecord(input: {
  opportunityCode: string;
  decision: "approved" | "approved_with_notes";
  approvedByAdminUserId: string;
  approvedByName: string;
  notes?: string;
}): Promise<MutationResult<{ taskId: string; notification?: { sent: number; failed: number; skipped: number } }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const opportunityCode = cleanString(input.opportunityCode);
  const { data: opportunity, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id,code,title,timeline")
    .eq("code", opportunityCode)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunity) return { ok: false, error: "Oportunidade nao encontrada para workflow de divulgacao." };

  const opportunityRow = opportunity as DbRow;
  const opportunityId = cleanString(opportunityRow.id);
  const code = cleanString(opportunityRow.code, opportunityCode);
  const title = cleanString(opportunityRow.title, code);
  const timeline = Array.isArray(opportunityRow.timeline) ? opportunityRow.timeline : [];
  const decidedAt = new Date().toISOString();
  const decisionLabel = input.decision === "approved_with_notes" ? "Aprovado com ressalvas" : "Aprovado";

  await resolveOpenWorkflowTask({
    opportunityId,
    stageKey: "market_review",
    status: input.decision,
    resolvedByAdminUserId: input.approvedByAdminUserId,
    decision: input.decision,
    decisionNotes: input.notes,
  });

  await supabase
    .from("auction_opportunities")
    .update({
      stage: "Divulgacao WhatsApp",
      next_action: "Comunicacao deve escolher agente, destino e acompanhar o envio da oportunidade.",
      owner_name: "Comunicacao",
      timeline: [
        ...timeline,
        {
          time: decidedAt,
          actor: input.approvedByName,
          action: `${decisionLabel} na analise de mercado e liberado para divulgacao WhatsApp.`,
          tone: input.decision === "approved_with_notes" ? "yellow" : "green",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: input.approvedByName,
    event_type: "market_review_approved_for_whatsapp_publication",
    status: input.decision,
    payload: {
      opportunityCode: code,
      notes: input.notes || "",
    },
  });

  const taskResult = await ensureOpportunityWorkflowTaskRecord({
    opportunityId,
    stageKey: "communication",
    title: `Divulgacao WhatsApp: ${code}`,
    description: `${title} foi aprovado pela analise de mercado. Escolher agente, grupo, canal ou lista e acompanhar a publicacao.`,
    actionUrl: `/admin/oportunidades/${code}?tab=visao-geral`,
    priority: input.decision === "approved_with_notes" ? "high" : "normal",
    createdByAdminUserId: input.approvedByAdminUserId,
    sourceType: "market_approval",
    sourcePayload: {
      opportunityCode: code,
      decision: input.decision,
      approvedBy: input.approvedByName,
      notes: input.notes || "",
    },
  });

  if (!taskResult.ok || !taskResult.data) {
    return { ok: false, error: taskResult.error || "Analise aprovada, mas a tarefa de comunicacao nao foi criada." };
  }

  return {
    ok: true,
    data: {
      taskId: taskResult.data.task.id,
      notification: taskResult.data.notification,
    },
  };
}

export async function advanceOpportunityAfterLegalApprovalRecord(input: {
  opportunityCode: string;
  decision: "approved" | "approved_with_notes";
  approvedByAdminUserId?: string;
  approvedByName: string;
  notes?: string;
}): Promise<MutationResult<{ taskId: string; notification?: { sent: number; failed: number; skipped: number } }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const opportunityCode = cleanString(input.opportunityCode);
  const { data: opportunity, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id,code,title,timeline")
    .eq("code", opportunityCode)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunity) return { ok: false, error: "Oportunidade nao encontrada para workflow de validacao." };

  const opportunityRow = opportunity as DbRow;
  const opportunityId = cleanString(opportunityRow.id);
  const code = cleanString(opportunityRow.code, opportunityCode);
  const title = cleanString(opportunityRow.title, code);
  const timeline = Array.isArray(opportunityRow.timeline) ? opportunityRow.timeline : [];
  const decidedAt = new Date().toISOString();
  const decisionLabel = input.decision === "approved_with_notes" ? "Aprovado com ressalvas" : "Aprovado";

  await resolveOpenWorkflowTask({
    opportunityId,
    stageKey: "legal_review",
    status: input.decision,
    resolvedByAdminUserId: input.approvedByAdminUserId,
    decision: input.decision,
    decisionNotes: input.notes,
  });

  await supabase
    .from("auction_opportunities")
    .update({
      stage: "Validacao",
      legal_status: decisionLabel,
      next_action: "Validacao deve conferir dados finais antes dos criativos e comunicacao.",
      owner_name: "Validacao",
      timeline: [
        ...timeline,
        {
          time: decidedAt,
          actor: input.approvedByName,
          action: `${decisionLabel} pelo Juridico e enviado para Validacao.`,
          tone: input.decision === "approved_with_notes" ? "yellow" : "green",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: input.approvedByName,
    event_type: "legal_review_approved_for_validation",
    status: input.decision,
    payload: {
      opportunityCode: code,
      notes: input.notes || "",
    },
  });

  const taskResult = await ensureOpportunityWorkflowTaskRecord({
    opportunityId,
    stageKey: "validation",
    title: `Validacao final: ${code}`,
    description: `${title} foi aprovado pelo Juridico. Conferir dados finais antes dos criativos e comunicacao.`,
    actionUrl: `/admin/oportunidades/${code}?tab=visao-geral`,
    priority: input.decision === "approved_with_notes" ? "high" : "normal",
    createdByAdminUserId: input.approvedByAdminUserId,
    sourceType: "legal_approval",
    sourcePayload: {
      opportunityCode: code,
      decision: input.decision,
      approvedBy: input.approvedByName,
      notes: input.notes || "",
    },
  });

  if (!taskResult.ok || !taskResult.data) {
    return { ok: false, error: taskResult.error || "Juridico aprovado, mas a tarefa de validacao nao foi criada." };
  }

  return {
    ok: true,
    data: {
      taskId: taskResult.data.task.id,
      notification: taskResult.data.notification,
    },
  };
}

export async function advanceOpportunityAfterWorkflowStageApprovalRecord(input: {
  opportunityCode: string;
  stageKey: "validation" | "creative" | "communication";
  decision: "approved" | "approved_with_notes";
  approvedByAdminUserId?: string;
  approvedByName: string;
  notes?: string;
}): Promise<MutationResult<{ taskId?: string; notification?: { sent: number; failed: number; skipped: number }; completed: boolean; nextStageKey?: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const currentStage = await getStageDefinition(input.stageKey);
  if (!currentStage) return { ok: false, error: `Etapa atual nao encontrada: ${input.stageKey}.` };

  const nextStage = currentStage.nextStageKey ? await getStageDefinition(currentStage.nextStageKey) : null;
  const opportunityCode = cleanString(input.opportunityCode);
  const { data: opportunity, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id,code,title,timeline")
    .eq("code", opportunityCode)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunity) return { ok: false, error: "Oportunidade nao encontrada para workflow." };

  const opportunityRow = opportunity as DbRow;
  const opportunityId = cleanString(opportunityRow.id);
  const code = cleanString(opportunityRow.code, opportunityCode);
  const title = cleanString(opportunityRow.title, code);
  const timeline = Array.isArray(opportunityRow.timeline) ? opportunityRow.timeline : [];
  const decidedAt = new Date().toISOString();
  const decisionLabel = input.decision === "approved_with_notes" ? "Aprovado com ressalvas" : "Aprovado";
  const nextLabel = nextStage ? workflowStageLabel(nextStage) : "Fluxo concluido";

  await resolveOpenWorkflowTask({
    opportunityId,
    stageKey: input.stageKey,
    status: input.decision,
    resolvedByAdminUserId: input.approvedByAdminUserId,
    decision: input.decision,
    decisionNotes: input.notes,
  });

  const updatePayload: DbRow = nextStage
    ? {
        stage: nextLabel,
        next_action: workflowStageNextAction(nextStage),
        owner_name: nextStage.sectorName || nextLabel,
      }
    : {
        stage: "Fluxo concluido",
        next_action: "Fluxo operacional concluido. Acompanhar respostas, retorno dos usuarios e resultados.",
        owner_name: "Operacao",
      };

  await supabase
    .from("auction_opportunities")
    .update({
      ...updatePayload,
      timeline: [
        ...timeline,
        {
          time: decidedAt,
          actor: input.approvedByName,
          action: nextStage
            ? `${decisionLabel} em ${currentStage.name} e enviado para ${nextLabel}.`
            : `${decisionLabel} em ${currentStage.name} e workflow operacional concluido.`,
          tone: input.decision === "approved_with_notes" ? "yellow" : "green",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: input.approvedByName,
    event_type: `${input.stageKey}_approved_for_${nextStage?.stageKey || "completion"}`,
    status: input.decision,
    payload: {
      opportunityCode: code,
      currentStageKey: input.stageKey,
      nextStageKey: nextStage?.stageKey || "",
      notes: input.notes || "",
    },
  });

  if (!nextStage) {
    return {
      ok: true,
      data: {
        completed: true,
      },
    };
  }

  const taskResult = await ensureOpportunityWorkflowTaskRecord({
    opportunityId,
    stageKey: nextStage.stageKey,
    title: `${nextStage.name}: ${code}`,
    description: `${title} foi aprovado em ${currentStage.name}. ${workflowStageNextAction(nextStage)}`,
    actionUrl: `/admin/oportunidades/${code}?tab=${workflowStageTab(nextStage)}`,
    priority: input.decision === "approved_with_notes" ? "high" : "normal",
    createdByAdminUserId: input.approvedByAdminUserId,
    sourceType: `${input.stageKey}_approval`,
    sourcePayload: {
      opportunityCode: code,
      currentStageKey: input.stageKey,
      nextStageKey: nextStage.stageKey,
      decision: input.decision,
      approvedBy: input.approvedByName,
      notes: input.notes || "",
    },
  });

  if (!taskResult.ok || !taskResult.data) {
    return { ok: false, error: taskResult.error || "Etapa aprovada, mas a proxima tarefa nao foi criada." };
  }

  return {
    ok: true,
    data: {
      taskId: taskResult.data.task.id,
      notification: taskResult.data.notification,
      completed: false,
      nextStageKey: nextStage.stageKey,
    },
  };
}

export async function openMarketReviewTasksForBatchRecord(input: {
  batchId: string;
}): Promise<MutationResult<{ createdOrUpdated: number; notification?: { sent: number; failed: number; skipped: number } }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const batchId = cleanString(input.batchId);
  if (!batchId) return { ok: false, error: "Lote nao informado." };

  const { data: batch, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("id,original_filename,valid_row_count,summary_payload")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError) return { ok: false, error: batchError.message };
  if (!batch) return { ok: false, error: "Lote nao encontrado." };

  const { data: rows, error: rowsError } = await supabase
    .from("market_analysis_import_rows")
    .select("id,row_number,status,opportunity_id")
    .eq("batch_id", batchId)
    .not("opportunity_id", "is", null)
    .in("status", ["pronto_para_revisao", "importado", "extracao_concluida", "analise_mercado_pendente"]);

  if (rowsError) return { ok: false, error: rowsError.message };

  const readyRows = ((rows || []) as DbRow[]).filter((row) => cleanString(row.opportunity_id));
  const opportunityIds = [...new Set(readyRows.map((row) => cleanString(row.opportunity_id)).filter(Boolean))];
  if (!opportunityIds.length) return { ok: true, data: { createdOrUpdated: 0 } };

  const { data: opportunities, error: opportunitiesError } = await supabase
    .from("auction_opportunities")
    .select("id,code,title")
    .in("id", opportunityIds);

  if (opportunitiesError) return { ok: false, error: opportunitiesError.message };

  const opportunitiesById = new Map(((opportunities || []) as DbRow[]).map((item) => [cleanString(item.id), item]));
  let createdOrUpdated = 0;

  for (const row of readyRows) {
    const opportunityId = cleanString(row.opportunity_id);
    const opportunity = opportunitiesById.get(opportunityId);
    if (!opportunity) continue;

    const code = cleanString(opportunity.code);
    await supabase
      .from("auction_opportunities")
      .update({
        stage: "Revisao de mercado",
        next_action: "Analise de mercado deve revisar a IA e aprovar antes da divulgacao WhatsApp.",
        owner_name: "Analise de mercado",
      })
      .eq("id", opportunityId);

    const task = await ensureOpportunityWorkflowTaskRecord({
      opportunityId,
      batchId,
      importRowId: cleanString(row.id),
      stageKey: "market_review",
      title: `Revisao de mercado: ${code}`,
      description: `${cleanString(opportunity.title, code)} esta pronto para conferencia humana da analise de mercado.`,
      actionUrl: `/admin/oportunidades/${code}?tab=visao-geral`,
      priority: "normal",
      sourceType: "batch_completed",
      sourcePayload: {
        batchId,
        rowNumber: asNumber(row.row_number),
        rowStatus: cleanString(row.status),
      },
      sendNotification: false,
    });

    if (task.ok) createdOrUpdated += 1;
  }

  const stage = await getStageDefinition("market_review");
  const notification = stage?.sectorId
    ? await notifySector({
        templateKey: "internal.workflow.batch_ready",
        sectorId: stage.sectorId,
        batchId,
        title: "Lote pronto para revisao de mercado",
        messageText: `${createdOrUpdated} imovel(is) foram analisados e aguardam conferencia da Analise de Mercado.`,
        actionUrl: absoluteActionUrl("/admin/oportunidades?pipeline=market_review"),
        variables: {
          stage_name: stage.name,
          sector_name: stage.sectorName,
          batch_label: cleanString((batch as DbRow).original_filename, batchId.slice(0, 8)),
          ready_count: createdOrUpdated,
          action_url: absoluteActionUrl("/admin/oportunidades?pipeline=market_review"),
        },
      })
    : undefined;

  return { ok: true, data: { createdOrUpdated, notification } };
}
