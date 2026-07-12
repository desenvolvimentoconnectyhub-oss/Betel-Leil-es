import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WhatsAppActionButtonInput } from "./connectyhub-client";
import { normalizeWhatsAppNumber } from "./connectyhub-client";

type DbRow = Record<string, unknown>;

export type MessageChannel = "whatsapp" | "email" | "push" | "community" | string;
export type MessageTemplateStatus = "draft" | "active" | "archived";
export type MessageRecipientType = "admin" | "investor" | "lead" | "manual";

export type MessageTemplate = {
  id?: string;
  templateKey: string;
  channel: MessageChannel;
  audienceKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
  guardrailTemplate: string;
  buttonLabelTemplate: string;
  buttonUrlTemplate: string;
  variables: string[];
  status: MessageTemplateStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MessageRoute = {
  routeKey: string;
  name: string;
  description: string;
  templateKey: string;
  channel: MessageChannel;
  recipientSegmentKeys: string[];
  recipientKeys: string[];
  manualRecipients: ManualMessageRecipient[];
  enabled: boolean;
  updatedAt?: string;
};

export type MessageRecipientSegment = {
  segmentKey: string;
  label: string;
  recipientType: string;
  description: string;
  filters: Record<string, unknown>;
  channelPreferences: string[];
  status: string;
};

export type ManualMessageRecipient = {
  label?: string;
  name?: string;
  email?: string;
  phone?: string;
  channel?: string;
};

export type MessageRecipient = {
  key: string;
  type: MessageRecipientType;
  label: string;
  name: string;
  email: string;
  phone: string;
  role?: string;
  status?: string;
  planKey?: string;
  lifecycleStage?: string;
  source: string;
  variables: Record<string, unknown>;
};

export type RenderedMessageTemplate = {
  template: MessageTemplate;
  subject: string;
  body: string;
  guardrailSummary: string;
  actionButton?: WhatsAppActionButtonInput;
  missingVariables: string[];
};

export type ResolveMessageRecipientsInput = {
  channel?: MessageChannel;
  recipientKeys?: string[];
  segmentKeys?: string[];
  manualRecipients?: ManualMessageRecipient[];
  fallbackRecipients?: ManualMessageRecipient[];
  limit?: number;
};

const defaultTemplates: MessageTemplate[] = [
  {
    templateKey: "scraper.report.admin",
    channel: "whatsapp",
    audienceKey: "admin",
    name: "Relatorio do scraper para admins",
    description: "Resumo operacional enviado aos administradores apos uma rodada do scraper.",
    subjectTemplate: "Betel AI - relatorio do scraper",
    bodyTemplate: [
      "Betel AI - coleta do scraper concluida",
      "",
      "Periodo: {{period_label}}",
      "Fontes: {{sources_summary}}",
      "Rodada: {{run_summary}}",
      "",
      "Base atual:",
      "{{base_summary}}",
      "",
      "Situacao dos imoveis:",
      "{{validation_summary}}",
      "{{stage_line}}",
      "{{ai_line}}",
      "{{legal_line}}",
      "{{discard_reasons}}",
      "{{base_observation}}",
      "{{validation_observation}}",
      "",
      "Painel: {{panel_url}}",
    ].join("\n"),
    guardrailTemplate: "Aviso interno automatico da coleta. Nao e campanha comercial.",
    buttonLabelTemplate: "Abrir painel",
    buttonUrlTemplate: "{{panel_url}}",
    variables: [
      "period_label",
      "sources_summary",
      "run_summary",
      "base_summary",
      "validation_summary",
      "stage_line",
      "ai_line",
      "legal_line",
      "discard_reasons",
      "base_observation",
      "validation_observation",
      "panel_url",
    ],
    status: "active",
    version: 1,
  },
  {
    templateKey: "admin.invite",
    channel: "whatsapp",
    audienceKey: "admin",
    name: "Convite de acesso admin",
    description: "Mensagem enviada quando um usuario administrativo recebe acesso.",
    subjectTemplate: "Oi, {{recipient_first_name}}. Seu acesso ao painel da Betel foi liberado.",
    bodyTemplate: [
      "Toque no botao abaixo para cadastrar sua senha e acessar o painel admin.",
      "",
      "Esse link e pessoal. Se expirar, peca para o admin reenviar outro convite.",
    ].join("\n"),
    guardrailTemplate: "",
    buttonLabelTemplate: "Cadastrar senha",
    buttonUrlTemplate: "{{action_link}}",
    variables: ["recipient_first_name", "recipient_name", "recipient_email", "action_link"],
    status: "active",
    version: 1,
  },
  {
    templateKey: "admin.recovery",
    channel: "whatsapp",
    audienceKey: "admin",
    name: "Redefinicao de senha admin",
    description: "Mensagem enviada quando um admin precisa redefinir a senha.",
    subjectTemplate: "Oi, {{recipient_first_name}}. Seu link de acesso da Betel esta pronto.",
    bodyTemplate: [
      "Toque no botao abaixo para redefinir sua senha e acessar o painel admin.",
      "",
      "Esse link e pessoal. Se expirar, peca para o admin reenviar outro acesso.",
    ].join("\n"),
    guardrailTemplate: "",
    buttonLabelTemplate: "Redefinir senha",
    buttonUrlTemplate: "{{action_link}}",
    variables: ["recipient_first_name", "recipient_name", "recipient_email", "action_link"],
    status: "active",
    version: 1,
  },
  {
    templateKey: "opportunity.paid",
    channel: "whatsapp",
    audienceKey: "paid_clients",
    name: "Oportunidade completa para cliente",
    description: "Mensagem completa para destinatarios com acesso ativo.",
    subjectTemplate: "Oportunidade {{opportunity_code}} - {{recipient_name}}",
    bodyTemplate:
      "Oportunidade aprovada com dossie, score, riscos e proximos passos supervisionados para cliente com acesso ativo.",
    guardrailTemplate: "{{target_rule}} {{recipient_guardrail}}",
    buttonLabelTemplate: "Ver oportunidade",
    buttonUrlTemplate: "{{opportunity_url}}",
    variables: ["opportunity_code", "recipient_name", "target_rule", "recipient_guardrail", "opportunity_url"],
    status: "active",
    version: 1,
  },
  {
    templateKey: "opportunity.cold",
    channel: "whatsapp",
    audienceKey: "cold_leads",
    name: "Teaser seguro para lead",
    description: "Chamada parcial sem dados sensiveis para lead sem acesso completo.",
    subjectTemplate: "Nova oportunidade Betel",
    bodyTemplate:
      "Teaser seguro sem endereco completo, tese sensivel ou orientacao de lance. CTA para contratar plano.",
    guardrailTemplate: "{{target_rule}} {{recipient_guardrail}}",
    buttonLabelTemplate: "Falar com a Betel",
    buttonUrlTemplate: "{{opportunity_url}}",
    variables: ["target_rule", "recipient_guardrail", "opportunity_url"],
    status: "active",
    version: 1,
  },
  {
    templateKey: "opportunity.community",
    channel: "community",
    audienceKey: "community",
    name: "Resumo educativo para comunidade",
    description: "Publicacao coletiva e educacional, sem orientacao individual.",
    subjectTemplate: "Resumo educativo Betel",
    bodyTemplate:
      "Resumo educativo para comunidade, sem recomendacao individual ou dados sensiveis da oportunidade.",
    guardrailTemplate: "{{target_rule}} {{recipient_guardrail}}",
    buttonLabelTemplate: "",
    buttonUrlTemplate: "",
    variables: ["target_rule", "recipient_guardrail"],
    status: "active",
    version: 1,
  },
  {
    templateKey: "message.direct",
    channel: "whatsapp",
    audienceKey: "general",
    name: "Mensagem direta",
    description: "Template generico para envio manual supervisionado pelo admin.",
    subjectTemplate: "{{subject}}",
    bodyTemplate: "{{body}}",
    guardrailTemplate: "{{guardrail}}",
    buttonLabelTemplate: "{{button_label}}",
    buttonUrlTemplate: "{{button_url}}",
    variables: ["subject", "body", "guardrail", "button_label", "button_url", "recipient_name"],
    status: "active",
    version: 1,
  },
];

const defaultSegments: MessageRecipientSegment[] = [
  {
    segmentKey: "admin.operations",
    label: "Administradores da operacao",
    recipientType: "admin",
    description: "Owners, admins e managers ativos.",
    filters: { roles: ["owner", "admin", "manager"], statuses: ["active", "invited"] },
    channelPreferences: ["whatsapp", "email"],
    status: "active",
  },
  {
    segmentKey: "admin.all",
    label: "Todos os administradores ativos",
    recipientType: "admin",
    description: "Usuarios administrativos ativos ou convidados.",
    filters: { statuses: ["active", "invited"] },
    channelPreferences: ["whatsapp", "email"],
    status: "active",
  },
  {
    segmentKey: "investors.premium",
    label: "Clientes premium/pagantes",
    recipientType: "investor",
    description: "Investidores com acesso completo.",
    filters: { access: "full" },
    channelPreferences: ["whatsapp", "email", "push"],
    status: "active",
  },
  {
    segmentKey: "investors.all",
    label: "Investidores com opt-in",
    recipientType: "investor",
    description: "Investidores habilitados no canal selecionado.",
    filters: { opt_in: true },
    channelPreferences: ["whatsapp", "email", "push"],
    status: "active",
  },
  {
    segmentKey: "leads.whatsapp",
    label: "Leads do WhatsApp",
    recipientType: "lead",
    description: "Leads captados no WhatsApp.",
    filters: { channel: "whatsapp" },
    channelPreferences: ["whatsapp"],
    status: "active",
  },
];

const defaultRoutes: MessageRoute[] = [
  {
    routeKey: "scraper.report.admin",
    name: "Relatorio do scraper para administradores",
    description: "Destinatarios do resumo operacional do scraper.",
    templateKey: "scraper.report.admin",
    channel: "whatsapp",
    recipientSegmentKeys: ["admin.operations"],
    recipientKeys: [],
    manualRecipients: [],
    enabled: true,
  },
];

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = cleanString(value).toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "off"].includes(normalized)) return false;
  return fallback;
}

function asNumber(value: unknown, fallback = 1) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function parseJsonRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

function parseJsonArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function normalizeChannel(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.includes("whatsapp") || normalized.includes("wpp")) return "whatsapp";
  if (normalized.includes("email") || normalized.includes("mail")) return "email";
  if (normalized.includes("push")) return "push";
  if (normalized.includes("comunidade") || normalized.includes("community") || normalized.includes("grupo")) return "community";
  return normalized || "whatsapp";
}

function normalizeTemplate(row: DbRow): MessageTemplate {
  return {
    id: cleanString(row.id),
    templateKey: cleanString(row.template_key),
    channel: normalizeChannel(cleanString(row.channel, "whatsapp")),
    audienceKey: cleanString(row.audience_key, "general"),
    name: cleanString(row.name),
    description: cleanString(row.description),
    subjectTemplate: cleanString(row.subject_template),
    bodyTemplate: cleanString(row.body_template),
    guardrailTemplate: cleanString(row.guardrail_template),
    buttonLabelTemplate: cleanString(row.button_label_template),
    buttonUrlTemplate: cleanString(row.button_url_template),
    variables: asStringArray(row.variables),
    status: ["draft", "active", "archived"].includes(cleanString(row.status))
      ? (cleanString(row.status) as MessageTemplateStatus)
      : "draft",
    version: asNumber(row.version, 1),
    createdAt: cleanString(row.created_at),
    updatedAt: cleanString(row.updated_at),
  };
}

function normalizeRoute(row: DbRow): MessageRoute {
  return {
    routeKey: cleanString(row.route_key),
    name: cleanString(row.name),
    description: cleanString(row.description),
    templateKey: cleanString(row.template_key),
    channel: normalizeChannel(cleanString(row.channel, "whatsapp")),
    recipientSegmentKeys: asStringArray(row.recipient_segment_keys),
    recipientKeys: asStringArray(row.recipient_keys),
    manualRecipients: parseJsonArray<ManualMessageRecipient>(row.manual_recipients),
    enabled: asBoolean(row.enabled, true),
    updatedAt: cleanString(row.updated_at),
  };
}

function normalizeSegment(row: DbRow): MessageRecipientSegment {
  return {
    segmentKey: cleanString(row.segment_key),
    label: cleanString(row.label),
    recipientType: cleanString(row.recipient_type, "mixed"),
    description: cleanString(row.description),
    filters: parseJsonRecord(row.filters),
    channelPreferences: asStringArray(row.channel_preferences),
    status: cleanString(row.status, "active"),
  };
}

function defaultTemplateFor(templateKey: string, channel?: string, audienceKey?: string) {
  const channelKey = channel ? normalizeChannel(channel) : "";
  return (
    defaultTemplates.find(
      (template) =>
        template.templateKey === templateKey &&
        (!channelKey || normalizeChannel(template.channel) === channelKey) &&
        (!audienceKey || template.audienceKey === audienceKey)
    ) ||
    defaultTemplates.find(
      (template) => template.templateKey === templateKey && (!channelKey || normalizeChannel(template.channel) === channelKey)
    ) ||
    defaultTemplates.find((template) => template.templateKey === templateKey) ||
    defaultTemplates.find((template) => template.templateKey === "message.direct")!
  );
}

export function getDefaultMessageTemplates() {
  return defaultTemplates;
}

export function getDefaultMessageSegments() {
  return defaultSegments;
}

export function getDefaultMessageRoutes() {
  return defaultRoutes;
}

export async function listMessageTemplates(): Promise<MessageTemplate[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return defaultTemplates;

  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .order("template_key", { ascending: true })
    .order("version", { ascending: false });

  if (error) return defaultTemplates;

  const persisted = ((data || []) as DbRow[]).map(normalizeTemplate).filter((template) => template.templateKey);
  const persistedKeys = new Set(
    persisted.map((template) => `${template.templateKey}:${normalizeChannel(template.channel)}:${template.audienceKey}`)
  );
  const fallbacks = defaultTemplates.filter(
    (template) => !persistedKeys.has(`${template.templateKey}:${normalizeChannel(template.channel)}:${template.audienceKey}`)
  );

  return [...persisted, ...fallbacks];
}

export async function listMessageSegments(): Promise<MessageRecipientSegment[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return defaultSegments;

  const { data, error } = await supabase
    .from("message_recipient_segments")
    .select("*")
    .order("segment_key", { ascending: true });

  if (error) return defaultSegments;

  const persisted = ((data || []) as DbRow[]).map(normalizeSegment).filter((segment) => segment.segmentKey);
  const persistedKeys = new Set(persisted.map((segment) => segment.segmentKey));
  return [...persisted, ...defaultSegments.filter((segment) => !persistedKeys.has(segment.segmentKey))];
}

export async function listMessageRoutes(): Promise<MessageRoute[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return defaultRoutes;

  const { data, error } = await supabase
    .from("message_routes")
    .select("*")
    .order("route_key", { ascending: true });

  if (error) return defaultRoutes;

  const persisted = ((data || []) as DbRow[]).map(normalizeRoute).filter((route) => route.routeKey);
  const persistedKeys = new Set(persisted.map((route) => route.routeKey));
  return [...persisted, ...defaultRoutes.filter((route) => !persistedKeys.has(route.routeKey))];
}

export async function getMessageRoute(routeKey: string): Promise<MessageRoute> {
  const routes = await listMessageRoutes();
  return routes.find((route) => route.routeKey === routeKey) || defaultRoutes[0];
}

export async function getMessageTemplate(templateKey: string, channel = "whatsapp", audienceKey = "") {
  const channelKey = normalizeChannel(channel);
  const templates = await listMessageTemplates();
  return (
    templates.find(
      (template) =>
        template.templateKey === templateKey &&
        normalizeChannel(template.channel) === channelKey &&
        template.status === "active" &&
        (!audienceKey || template.audienceKey === audienceKey)
    ) ||
    templates.find(
      (template) =>
        template.templateKey === templateKey && normalizeChannel(template.channel) === channelKey && template.status === "active"
    ) ||
    defaultTemplateFor(templateKey, channel, audienceKey)
  );
}

function valueAtPath(values: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, values);
}

function stringifyTemplateValue(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function renderText(template: string, variables: Record<string, unknown>, missing: Set<string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => {
    const value = valueAtPath(variables, key);
    if (value === undefined || value === null || value === "") {
      missing.add(key);
      return "";
    }
    return stringifyTemplateValue(value);
  });
}

function cleanRenderedText(value: string) {
  return value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line, index, lines) => {
      if (line.trim()) return true;
      return lines[index - 1]?.trim() || lines[index + 1]?.trim();
    })
    .join("\n")
    .trim();
}

export async function renderMessageTemplate(input: {
  templateKey: string;
  channel?: MessageChannel;
  audienceKey?: string;
  variables?: Record<string, unknown>;
}): Promise<RenderedMessageTemplate> {
  const template = await getMessageTemplate(input.templateKey, input.channel || "whatsapp", input.audienceKey);
  const missing = new Set<string>();
  const variables = input.variables || {};
  const subject = cleanRenderedText(renderText(template.subjectTemplate, variables, missing));
  const body = cleanRenderedText(renderText(template.bodyTemplate, variables, missing));
  const guardrailSummary = cleanRenderedText(renderText(template.guardrailTemplate, variables, missing));
  const label = cleanRenderedText(renderText(template.buttonLabelTemplate, variables, missing));
  const url = cleanRenderedText(renderText(template.buttonUrlTemplate, variables, missing));

  return {
    template,
    subject,
    body,
    guardrailSummary,
    actionButton: label && url ? { label, url, footerText: "Betel Leiloes" } : undefined,
    missingVariables: [...missing],
  };
}

function recipientKey(type: MessageRecipientType, id: string) {
  return `${type}:${id}`;
}

function normalizeManualRecipient(input: ManualMessageRecipient, index: number): MessageRecipient | null {
  const phone = normalizeWhatsAppNumber(cleanString(input.phone || ""));
  const email = cleanString(input.email).toLowerCase();
  const name = cleanString(input.name || input.label, phone || email || `Manual ${index + 1}`);
  if (!phone && !email) return null;

  return {
    key: recipientKey("manual", cleanString(phone || email || String(index))),
    type: "manual",
    label: name,
    name,
    email,
    phone,
    source: "manual",
    variables: {
      recipient_name: name,
      recipient_first_name: firstName(name),
      recipient_email: email,
      recipient_phone: phone,
    },
  };
}

function firstName(name: string) {
  return cleanString(name).split(/\s+/)[0] || "tudo bem";
}

function channelAllowsRecipient(channel: string, recipient: MessageRecipient) {
  const channelKey = normalizeChannel(channel);
  if (channelKey === "whatsapp") return Boolean(recipient.phone);
  if (channelKey === "email") return Boolean(recipient.email);
  return true;
}

function segmentWants(segmentKeys: Set<string>, key: string) {
  return segmentKeys.has(key);
}

function recipientExplicitlySelected(recipientKeys: Set<string>, recipient: MessageRecipient) {
  return recipientKeys.has(recipient.key) || recipientKeys.has(`${recipient.type}:${recipient.email}`) || recipientKeys.has(`${recipient.type}:${recipient.phone}`);
}

function roleIn(value: string, allowed: string[]) {
  return !allowed.length || allowed.includes(value);
}

function statusIn(value: string, allowed: string[]) {
  return !allowed.length || allowed.includes(value);
}

async function loadAdminRecipients(channel: string, segmentKeys: Set<string>, recipientKeys: Set<string>, limit: number) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const wantsAdmins =
    segmentWants(segmentKeys, "admin.all") ||
    segmentWants(segmentKeys, "admin.operations") ||
    [...recipientKeys].some((key) => key.startsWith("admin:"));

  if (!wantsAdmins) return [];

  const { data, error } = await supabase
    .from("admin_users")
    .select("id, display_name, email, phone, role, status")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const rows = (data || []) as DbRow[];
  const recipients = rows.map((row) => {
    const id = cleanString(row.id);
    const name = cleanString(row.display_name, cleanString(row.email, "Admin Betel"));
    const email = cleanString(row.email).toLowerCase();
    const phone = normalizeWhatsAppNumber(cleanString(row.phone));
    const role = cleanString(row.role, "admin");
    const status = cleanString(row.status, "active");
    return {
      key: recipientKey("admin", id),
      type: "admin" as const,
      label: name,
      name,
      email,
      phone,
      role,
      status,
      source: "admin_users",
      variables: {
        recipient_name: name,
        recipient_first_name: firstName(name),
        recipient_email: email,
        recipient_phone: phone,
        recipient_role: role,
      },
    };
  });

  return recipients.filter((recipient) => {
    const selected = recipientExplicitlySelected(recipientKeys, recipient);
    const allAdmins = segmentWants(segmentKeys, "admin.all") && statusIn(recipient.status || "", ["active", "invited"]);
    const operations =
      segmentWants(segmentKeys, "admin.operations") &&
      roleIn(recipient.role || "", ["owner", "admin", "manager"]) &&
      statusIn(recipient.status || "", ["active", "invited"]);
    return channelAllowsRecipient(channel, recipient) && (selected || allAdmins || operations);
  });
}

function investorHasFullAccess(row: DbRow) {
  const plan = cleanString(row.plan_key).toLowerCase();
  const status = cleanString(row.status).toLowerCase();
  const lifecycle = cleanString(row.lifecycle_stage).toLowerCase();
  const fullAccessUntil = cleanString(row.full_access_until);
  const fullAccessMs = fullAccessUntil ? Date.parse(fullAccessUntil) : NaN;
  return (
    ["premium", "pro", "paid", "enterprise", "pilot"].includes(plan) ||
    status.includes("ativo") ||
    status.includes("active") ||
    status.includes("piloto") ||
    lifecycle.includes("cliente") ||
    lifecycle.includes("client") ||
    (Number.isFinite(fullAccessMs) && fullAccessMs > Date.now())
  );
}

async function loadInvestorRecipients(channel: string, segmentKeys: Set<string>, recipientKeys: Set<string>, limit: number) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const wantsInvestors =
    segmentWants(segmentKeys, "investors.all") ||
    segmentWants(segmentKeys, "investors.premium") ||
    [...recipientKeys].some((key) => key.startsWith("investor:"));

  if (!wantsInvestors) return [];

  const { data, error } = await supabase
    .from("investor_profiles")
    .select("id, name, email, phone, status, plan_key, lifecycle_stage, whatsapp_opt_in, email_opt_in, push_opt_in, full_access_until")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  const rows = (data || []) as DbRow[];
  const channelKey = normalizeChannel(channel);
  const recipients = rows.map((row) => {
    const id = cleanString(row.id);
    const name = cleanString(row.name, cleanString(row.email, "Investidor Betel"));
    const email = cleanString(row.email).toLowerCase();
    const phone = normalizeWhatsAppNumber(cleanString(row.phone));
    const planKey = cleanString(row.plan_key);
    const lifecycleStage = cleanString(row.lifecycle_stage);
    return {
      key: recipientKey("investor", id),
      type: "investor" as const,
      label: name,
      name,
      email,
      phone,
      status: cleanString(row.status),
      planKey,
      lifecycleStage,
      source: "investor_profiles",
      variables: {
        recipient_name: name,
        recipient_first_name: firstName(name),
        recipient_email: email,
        recipient_phone: phone,
        recipient_plan: planKey,
        recipient_lifecycle: lifecycleStage,
      },
      optIn:
        channelKey === "whatsapp"
          ? asBoolean(row.whatsapp_opt_in)
          : channelKey === "email"
            ? asBoolean(row.email_opt_in)
            : channelKey === "push"
              ? asBoolean(row.push_opt_in)
              : true,
      fullAccess: investorHasFullAccess(row),
    };
  });

  return recipients.filter((recipient) => {
    const selected = recipientExplicitlySelected(recipientKeys, recipient);
    const all = segmentWants(segmentKeys, "investors.all") && recipient.optIn;
    const premium = segmentWants(segmentKeys, "investors.premium") && recipient.optIn && recipient.fullAccess;
    return channelAllowsRecipient(channel, recipient) && (selected || all || premium);
  });
}

async function loadLeadRecipients(channel: string, segmentKeys: Set<string>, recipientKeys: Set<string>, limit: number) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || normalizeChannel(channel) !== "whatsapp") return [];

  const wantsLeads =
    segmentWants(segmentKeys, "leads.whatsapp") || [...recipientKeys].some((key) => key.startsWith("lead:"));

  if (!wantsLeads) return [];

  const { data, error } = await supabase
    .from("whatsapp_leads")
    .select("id, name, phone, status, source")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return [];

  return ((data || []) as DbRow[])
    .map((row) => {
      const id = cleanString(row.id);
      const phone = normalizeWhatsAppNumber(cleanString(row.phone));
      const name = cleanString(row.name, phone || "Lead WhatsApp");
      return {
        key: recipientKey("lead", id),
        type: "lead" as const,
        label: name,
        name,
        email: "",
        phone,
        status: cleanString(row.status),
        source: "whatsapp_leads",
        variables: {
          recipient_name: name,
          recipient_first_name: firstName(name),
          recipient_phone: phone,
          lead_source: cleanString(row.source),
        },
      };
    })
    .filter((recipient) => {
      const selected = recipientExplicitlySelected(recipientKeys, recipient);
      return channelAllowsRecipient(channel, recipient) && (selected || segmentWants(segmentKeys, "leads.whatsapp"));
    });
}

function uniqueRecipients(recipients: MessageRecipient[]) {
  const seen = new Set<string>();
  const unique: MessageRecipient[] = [];

  for (const recipient of recipients) {
    const dedupeKey = normalizeChannel(recipient.email ? "email" : "whatsapp") === "email"
      ? `${recipient.type}:${recipient.email}`
      : `${recipient.type}:${recipient.phone || recipient.key}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    unique.push(recipient);
  }

  return unique;
}

export async function resolveMessageRecipients(input: ResolveMessageRecipientsInput = {}) {
  const channel = normalizeChannel(cleanString(input.channel, "whatsapp"));
  const recipientKeys = new Set((input.recipientKeys || []).map((item) => cleanString(item)).filter(Boolean));
  const segmentKeys = new Set((input.segmentKeys || []).map((item) => cleanString(item)).filter(Boolean));
  const limit = Math.max(1, Math.min(input.limit || 200, 500));
  const manual = (input.manualRecipients || [])
    .map((recipient, index) => normalizeManualRecipient(recipient, index))
    .filter((recipient): recipient is MessageRecipient => Boolean(recipient))
    .filter((recipient) => channelAllowsRecipient(channel, recipient));
  const fallback = (input.fallbackRecipients || [])
    .map((recipient, index) => normalizeManualRecipient(recipient, index + manual.length))
    .filter((recipient): recipient is MessageRecipient => Boolean(recipient))
    .filter((recipient) => channelAllowsRecipient(channel, recipient));

  const [admins, investors, leads] = await Promise.all([
    loadAdminRecipients(channel, segmentKeys, recipientKeys, limit),
    loadInvestorRecipients(channel, segmentKeys, recipientKeys, limit),
    loadLeadRecipients(channel, segmentKeys, recipientKeys, limit),
  ]);

  const resolved = uniqueRecipients([...manual, ...admins, ...investors, ...leads]);
  return resolved.length ? resolved : uniqueRecipients(fallback);
}

export async function resolveRouteRecipients(routeKey: string, fallbackRecipients: ManualMessageRecipient[] = []) {
  const route = await getMessageRoute(routeKey);
  if (!route.enabled) return { route, recipients: [] as MessageRecipient[] };

  const recipients = await resolveMessageRecipients({
    channel: route.channel,
    segmentKeys: route.recipientSegmentKeys,
    recipientKeys: route.recipientKeys,
    manualRecipients: route.manualRecipients,
    fallbackRecipients,
  });

  return { route, recipients };
}

export function messageVariablesForRecipient(recipient: MessageRecipient) {
  return recipient.variables;
}

export function parseManualRecipientsText(value: string): ManualMessageRecipient[] {
  return value
    .split(/\r?\n|,/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [labelPart, contactPart] = item.includes("|") ? item.split("|", 2) : ["", item];
      const contact = cleanString(contactPart || labelPart);
      const label = cleanString(labelPart);
      if (contact.includes("@")) return { label, name: label, email: contact };
      return { label, name: label, phone: contact };
    });
}

export function parseTemplateVariablesJson(value: string): Record<string, unknown> {
  if (!value.trim()) return {};
  try {
    return asRecord(JSON.parse(value));
  } catch {
    return {};
  }
}

export function manualRecipientsToJson(recipients: ManualMessageRecipient[]) {
  return JSON.stringify(
    recipients.map((recipient) => ({
      label: cleanString(recipient.label || recipient.name),
      name: cleanString(recipient.name || recipient.label),
      email: cleanString(recipient.email),
      phone: cleanString(recipient.phone),
      channel: cleanString(recipient.channel),
    }))
  );
}

export function variablesToJson(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2);
}
