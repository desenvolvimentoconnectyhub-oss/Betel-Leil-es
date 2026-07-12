import "server-only";

import { createHash } from "node:crypto";
import {
  listMessageRoutes,
  listMessageSegments,
  listMessageTemplates,
  manualRecipientsToJson,
  messageVariablesForRecipient,
  parseManualRecipientsText,
  parseTemplateVariablesJson,
  renderMessageTemplate,
  resolveMessageRecipients,
  type ManualMessageRecipient,
  type MessageRecipient,
  type MessageRoute,
  type MessageTemplate,
} from "@/lib/communication/message-templates";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { CommunicationOutboxItem } from "../agent-workforce";
import type { MutationResult } from "./shared";
import { normalizeCommunicationOutbox } from "./shared";

type DbRow = Record<string, unknown>;

export type MessagingRecipientOption = MessageRecipient & {
  channelReady: string[];
};

export type MessagingAdminData = {
  templates: MessageTemplate[];
  routes: MessageRoute[];
  segments: Awaited<ReturnType<typeof listMessageSegments>>;
  recipients: MessagingRecipientOption[];
  recentOutbox: CommunicationOutboxItem[];
};

export type SaveMessageTemplateInput = {
  id?: string;
  templateKey: string;
  channel: string;
  audienceKey: string;
  name: string;
  description: string;
  subjectTemplate: string;
  bodyTemplate: string;
  guardrailTemplate: string;
  buttonLabelTemplate: string;
  buttonUrlTemplate: string;
  variables: string[];
  status: "draft" | "active" | "archived";
  version?: number;
  operatorLabel: string;
};

export type SaveMessageRouteInput = {
  routeKey: string;
  name: string;
  description: string;
  templateKey: string;
  channel: string;
  recipientSegmentKeys: string[];
  recipientKeys: string[];
  manualRecipients: ManualMessageRecipient[];
  enabled: boolean;
  operatorLabel: string;
};

export type QueueDirectMessageInput = {
  templateKey: string;
  channel: string;
  audienceKey: string;
  recipientSegmentKeys: string[];
  recipientKeys: string[];
  manualRecipients: ManualMessageRecipient[];
  variables: Record<string, unknown>;
  operatorLabel: string;
};

export type QueueDirectMessageOutput = {
  outboxCount: number;
  messageCodes: string[];
  skippedReason?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function makeMessageCode(seed: string) {
  const hash = createHash("sha256").update(seed).digest("hex").slice(0, 10).toUpperCase();
  return `MSG-${Date.now().toString(36).toUpperCase()}-${hash}`;
}

function recipientChannelReady(recipient: MessageRecipient) {
  const channels: string[] = [];
  if (recipient.phone) channels.push("whatsapp");
  if (recipient.email) channels.push("email");
  channels.push("push", "community");
  return [...new Set(channels)];
}

async function listRecentMessageOutbox(): Promise<CommunicationOutboxItem[]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("communication_outbox")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) return [];
  return ((data || []) as DbRow[]).map(normalizeCommunicationOutbox);
}

export async function getMessagingAdminData(): Promise<MessagingAdminData> {
  const [templates, routes, segments, adminRecipients, investorRecipients, leadRecipients, recentOutbox] =
    await Promise.all([
      listMessageTemplates(),
      listMessageRoutes(),
      listMessageSegments(),
      resolveMessageRecipients({ channel: "whatsapp", segmentKeys: ["admin.all"], limit: 150 }),
      resolveMessageRecipients({ channel: "whatsapp", segmentKeys: ["investors.all"], limit: 150 }),
      resolveMessageRecipients({ channel: "whatsapp", segmentKeys: ["leads.whatsapp"], limit: 150 }),
      listRecentMessageOutbox(),
    ]);

  const recipientsByKey = new Map<string, MessagingRecipientOption>();
  for (const recipient of [...adminRecipients, ...investorRecipients, ...leadRecipients]) {
    recipientsByKey.set(recipient.key, {
      ...recipient,
      channelReady: recipientChannelReady(recipient),
    });
  }

  return {
    templates,
    routes,
    segments,
    recipients: [...recipientsByKey.values()],
    recentOutbox,
  };
}

export async function saveMessageTemplateRecord(
  input: SaveMessageTemplateInput
): Promise<MutationResult<{ templateKey: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { ok: false, error: "Supabase admin nao configurado. Templates exigem service role." };
  }

  const templateKey = cleanString(input.templateKey);
  const channel = normalizeChannel(input.channel);
  const audienceKey = cleanString(input.audienceKey, "general");
  if (!templateKey || !input.name.trim()) {
    return { ok: false, error: "Informe chave e nome do template." };
  }

  if (input.status === "active") {
    let update = supabase
      .from("message_templates")
      .update({ status: "archived", updated_by_label: input.operatorLabel })
      .eq("template_key", templateKey)
      .eq("channel", channel)
      .eq("audience_key", audienceKey)
      .eq("status", "active");

    if (input.id) update = update.neq("id", input.id);
    const { error: archiveError } = await update;
    if (archiveError) return { ok: false, error: archiveError.message };
  }

  const payload = {
    template_key: templateKey,
    channel,
    audience_key: audienceKey,
    name: input.name.trim(),
    description: input.description.trim(),
    subject_template: input.subjectTemplate,
    body_template: input.bodyTemplate,
    guardrail_template: input.guardrailTemplate,
    button_label_template: input.buttonLabelTemplate || null,
    button_url_template: input.buttonUrlTemplate || null,
    variables: input.variables,
    status: input.status,
    version: Math.max(1, Math.trunc(input.version || 1)),
    updated_by_label: input.operatorLabel,
  };

  const result = input.id
    ? await supabase.from("message_templates").update(payload).eq("id", input.id)
    : await supabase.from("message_templates").insert({
        ...payload,
        created_by_label: input.operatorLabel,
      });

  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, data: { templateKey } };
}

export async function saveMessageRouteRecord(input: SaveMessageRouteInput): Promise<MutationResult<{ routeKey: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { ok: false, error: "Supabase admin nao configurado. Rotas de mensagem exigem service role." };
  }

  const routeKey = cleanString(input.routeKey);
  if (!routeKey || !input.templateKey.trim()) {
    return { ok: false, error: "Informe rota e template." };
  }

  const { error } = await supabase.from("message_routes").upsert(
    {
      route_key: routeKey,
      name: input.name.trim() || routeKey,
      description: input.description.trim(),
      template_key: input.templateKey.trim(),
      channel: normalizeChannel(input.channel),
      recipient_segment_keys: input.recipientSegmentKeys,
      recipient_keys: input.recipientKeys,
      manual_recipients: JSON.parse(manualRecipientsToJson(input.manualRecipients)),
      enabled: input.enabled,
      updated_by_label: input.operatorLabel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "route_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { routeKey } };
}

export async function queueDirectMessageRecord(
  input: QueueDirectMessageInput
): Promise<MutationResult<QueueDirectMessageOutput>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { ok: false, error: "Supabase admin nao configurado. Outbox exige service role." };
  }

  const channel = normalizeChannel(input.channel);
  const recipients = await resolveMessageRecipients({
    channel,
    segmentKeys: input.recipientSegmentKeys,
    recipientKeys: input.recipientKeys,
    manualRecipients: input.manualRecipients,
    limit: 300,
  });

  if (!recipients.length) {
    return {
      ok: true,
      data: {
        outboxCount: 0,
        messageCodes: [],
        skippedReason: "Nenhum destinatario elegivel para o canal selecionado.",
      },
    };
  }

  const now = new Date().toISOString();
  const rows = await Promise.all(
    recipients.map(async (recipient, index) => {
      const variables = {
        ...input.variables,
        ...messageVariablesForRecipient(recipient),
      };
      const rendered = await renderMessageTemplate({
        templateKey: input.templateKey,
        channel,
        audienceKey: input.audienceKey,
        variables,
      });
      const messageCode = makeMessageCode(`${input.templateKey}:${recipient.key}:${now}:${index}`);

      return {
        message_code: messageCode,
        run_code: `RUN-DIRECT-${now.slice(0, 10)}-${index + 1}`,
        agent_key: "multichannel-dispatch",
        audience_key: "direct_message",
        audience_label: "Mensagem direta",
        channel,
        detail_level: "admin_template",
        status: "draft",
        recipient_label: recipient.label,
        subject: rendered.subject,
        message_preview: rendered.body,
        guardrail_summary: rendered.guardrailSummary,
        payload: {
          templateKey: rendered.template.templateKey,
          templateVersion: rendered.template.version,
          templateAudienceKey: rendered.template.audienceKey,
          missingVariables: rendered.missingVariables,
          operatorLabel: input.operatorLabel,
          recipient: {
            key: recipient.key,
            type: recipient.type,
            label: recipient.label,
            name: recipient.name,
            email: recipient.email,
            phone: recipient.phone,
            source: recipient.source,
          },
          actionButton: rendered.actionButton,
          variables,
        },
      };
    })
  );

  const { error } = await supabase.from("communication_outbox").insert(rows);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    data: {
      outboxCount: rows.length,
      messageCodes: rows.map((row) => cleanString(row.message_code)),
    },
  };
}

export function parseRouteFormRecipients(input: {
  segmentKeys: string;
  recipientKeys: string;
  manualRecipients: string;
}) {
  return {
    recipientSegmentKeys: input.segmentKeys
      .split(/[\s,;|]+/g)
      .map((item) => item.trim())
      .filter(Boolean),
    recipientKeys: input.recipientKeys
      .split(/[\s,;|]+/g)
      .map((item) => item.trim())
      .filter(Boolean),
    manualRecipients: parseManualRecipientsText(input.manualRecipients),
  };
}

export function parseMessageVariablesForm(value: string) {
  return parseTemplateVariablesJson(value);
}

export function normalizeTemplateVariables(value: string) {
  return value
    .split(/[\s,;|]+/g)
    .map((item) => item.trim().replace(/^\{\{\s*|\s*\}\}$/g, ""))
    .filter(Boolean);
}
