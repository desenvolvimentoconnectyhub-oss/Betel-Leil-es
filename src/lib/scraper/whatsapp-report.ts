import "server-only";

import { createHash } from "node:crypto";
import { shouldShowInPortfolio } from "@/lib/admin/repository/data";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getWillianAgentConfig } from "@/lib/communication/willian-agent-config";
import {
  normalizeWhatsAppNumber,
  sendGlobalWhatsAppText,
} from "@/lib/communication/connectyhub-client";
import type { ScraperRunStatus } from "./types";

type DbRow = Record<string, unknown>;

export type ScraperTargetRunReport = {
  targetCode: string;
  targetName?: string;
  runCode?: string;
  status: ScraperRunStatus | "skipped";
  skipReason?: string;
  rateLimited?: boolean;
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsFailed: number;
  pagesScraped: number;
  durationMs: number;
  errorMessage?: string;
  skippedDetails?: Array<{ title: string; reason: string }>;
  failedDetails?: Array<{ title: string; error: string }>;
};

export type ScraperCronRunSummary = {
  processed: string[];
  failed: string[];
  skipped: string[];
  targets: ScraperTargetRunReport[];
  startedAt: string;
  finishedAt: string;
  quotaBlocked?: boolean;
  notification?: ScraperWhatsAppReportResult;
};

export type ScraperWhatsAppReportResult = {
  enabled: boolean;
  skipped: boolean;
  reason?: string;
  messageCode: string;
  recipients: string[];
  attempted: number;
  sent: number;
  failed: number;
  messagePreview: string;
  providerStatuses: Array<{
    messageCode: string;
    recipient: string;
    status: "sent" | "failed" | "prepared" | "skipped";
    providerStatus?: string;
    errorMessage?: string;
    externalDeliveryId?: string;
  }>;
};

type ReportConfig = {
  enabled: boolean;
  recipients: string[];
  appUrl: string;
  source: string;
};

type OpportunityBaseStats = {
  totalOpportunities: number;
  visibleOpportunities: number;
  visibleSampled: boolean;
  totalSnapshots: number;
  stageCounts: Record<string, number>;
  aiStatusCounts: Record<string, number>;
  legalStatusCounts: Record<string, number>;
  validation: {
    completed: number;
    inReview: number;
    blocked: number;
    discarded: number;
    reason?: string;
  };
  reason?: string;
};

const REPORT_CONFIG_KEYS = [
  "BETEL_SCRAPER_REPORT_WHATSAPP_ENABLED",
  "BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBER",
  "BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBERS",
  "BETEL_SCRAPER_REPORT_WHATSAPP_NUMBER",
  "BETEL_SCRAPER_REPORT_WHATSAPP_NUMBERS",
  "BETEL_SCRAPER_REPORT_ADMIN_URL",
  "BETEL_PUBLIC_APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
];

const MAX_OPPORTUNITY_ROWS_FOR_STATS = 5000;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const clean = cleanString(value).toLowerCase();
  if (!clean) return fallback;
  if (["1", "true", "yes", "sim", "on", "enabled"].includes(clean)) return true;
  if (["0", "false", "no", "nao", "off", "disabled"].includes(clean)) return false;
  return fallback;
}

function configAliases(keys: string[]) {
  return [...new Set(keys.flatMap((key) => [key, key.toLowerCase()]))];
}

async function readAppConfig(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  const values = new Map<string, string>();

  if (!supabase) return values;

  const { data } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", configAliases(keys));

  for (const row of data || []) {
    const key = cleanString((row as DbRow).key);
    const value = cleanString((row as DbRow).value);
    if (key && value) values.set(key, value);
  }

  return values;
}

function configValue(keys: string[], appConfig: Map<string, string>, fallback = "") {
  for (const key of configAliases(keys)) {
    const value = cleanString(appConfig.get(key));
    if (value) return value;
  }

  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) return value;
  }

  return fallback;
}

function splitWhatsappNumbers(value: string) {
  return value
    .split(/[\s,;|]+/g)
    .map((number) => normalizeWhatsAppNumber(number))
    .filter((number) => number.length >= 10);
}

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

async function resolveReportConfig(): Promise<ReportConfig> {
  const appConfig = await readAppConfig(REPORT_CONFIG_KEYS);
  const enabledRaw = configValue(["BETEL_SCRAPER_REPORT_WHATSAPP_ENABLED"], appConfig, "true");
  const configuredNumbers = [
    configValue(["BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBER"], appConfig),
    configValue(["BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBERS"], appConfig),
    configValue(["BETEL_SCRAPER_REPORT_WHATSAPP_NUMBER"], appConfig),
    configValue(["BETEL_SCRAPER_REPORT_WHATSAPP_NUMBERS"], appConfig),
  ]
    .filter(Boolean)
    .join(",");
  const globalAgentConfig = await getWillianAgentConfig().catch(() => null);
  const fallbackNumbers = globalAgentConfig?.behavior.responsibleNumbers || "";
  const recipients = unique(splitWhatsappNumbers(configuredNumbers || fallbackNumbers));
  const appUrl = configValue(
    ["BETEL_SCRAPER_REPORT_ADMIN_URL"],
    appConfig,
    configValue(["BETEL_PUBLIC_APP_URL", "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL"], appConfig)
  ).replace(/\/+$/, "");

  return {
    enabled: readBoolean(enabledRaw, true),
    recipients,
    appUrl,
    source: configuredNumbers ? "global_whatsapp_notification_config" : fallbackNumbers ? "global_responsible_numbers" : "missing",
  };
}

function makeReportCode(summary: ScraperCronRunSummary) {
  const seed = [
    summary.startedAt,
    summary.finishedAt,
    ...summary.targets.map((target) => target.runCode || `${target.targetCode}:${target.status}:${target.skipReason || ""}`),
  ].join("|");
  const digest = createHash("sha256").update(seed).digest("hex").slice(0, 18).toUpperCase();
  return `SCR-RPT-${digest}`;
}

function formatBetelDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function plural(count: number, singular: string, pluralLabel: string) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function addCount(counts: Record<string, number>, key: string, amount = 1) {
  const label = cleanString(key, "Sem status");
  counts[label] = (counts[label] || 0) + amount;
}

function topCounts(counts: Record<string, number>, limit = 4) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label}: ${count}`)
    .join(" | ");
}

function classifyDiscardReason(reason: string) {
  const text = reason
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (text.includes("sem foto") || text.includes("foto util")) return "Sem foto util";
  if (text.includes("sem valor") || text.includes("valor informado")) return "Sem valor informado";
  if (text.includes("link exato")) return "Sem link exato da fonte";
  if (text.includes("fora da janela")) return "Fora da janela de leilao";
  if (text.includes("leilao ja passou") || text.includes("past_auction_date")) return "Leilao vencido";
  if (text.includes("data do leilao") || text.includes("auction_date")) return "Data de leilao incompleta";
  if (text.includes("nao e imovel") || text.includes("veiculo") || text.includes("maquina")) return "Nao parece imovel";
  if (text.includes("gravado") || text.includes("gravar")) return "Falha ao gravar";
  return cleanString(reason, "Outro filtro");
}

function summarizeRun(summary: ScraperCronRunSummary) {
  const totals = summary.targets.reduce(
    (acc, target) => {
      acc.itemsFound += target.itemsFound;
      acc.itemsIngested += target.itemsIngested;
      acc.itemsSkipped += target.itemsSkipped;
      acc.itemsFailed += target.itemsFailed;
      acc.pagesScraped += target.pagesScraped;
      acc.durationMs += target.durationMs;

      for (const item of target.skippedDetails || []) {
        addCount(acc.discardReasons, classifyDiscardReason(item.reason));
      }

      for (const item of target.failedDetails || []) {
        addCount(acc.discardReasons, classifyDiscardReason(item.error));
      }

      if (target.errorMessage) addCount(acc.errorMessages, target.errorMessage);
      return acc;
    },
    {
      itemsFound: 0,
      itemsIngested: 0,
      itemsSkipped: 0,
      itemsFailed: 0,
      pagesScraped: 0,
      durationMs: 0,
      discardReasons: {} as Record<string, number>,
      errorMessages: {} as Record<string, number>,
    }
  );

  return totals;
}

async function fetchOpportunityRowsForStats() {
  const supabase = getSupabaseAdminClient();
  const rows: DbRow[] = [];
  if (!supabase) return { rows, total: 0, error: "Supabase admin nao configurado." };

  const pageSize = 1000;
  let total = 0;

  for (let from = 0; from < MAX_OPPORTUNITY_ROWS_FOR_STATS; from += pageSize) {
    const to = Math.min(from + pageSize - 1, MAX_OPPORTUNITY_ROWS_FOR_STATS - 1);
    const { data, error, count } = await supabase
      .from("auction_opportunities")
      .select(
        "id,code,title,property_type,address,city,state,source_name,source_type,initial_bid,appraisal_value,stage,ai_status,legal_status,summary,raw_payload,updated_at",
        { count: from === 0 ? "exact" : undefined }
      )
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) return { rows, total: rows.length, error: error.message };
    if (from === 0) total = count || 0;

    rows.push(...((data || []) as DbRow[]));
    if (!data?.length || data.length < pageSize) break;
  }

  return { rows, total: total || rows.length };
}

async function getSnapshotCount() {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return 0;

  const { count } = await supabase
    .from("source_snapshots")
    .select("id", { count: "exact", head: true });

  return count || 0;
}

async function getValidationStats(): Promise<OpportunityBaseStats["validation"]> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return { completed: 0, inReview: 0, blocked: 0, discarded: 0, reason: "Supabase admin nao configurado." };
  }

  const { data, error } = await supabase
    .from("opportunity_validation_runs")
    .select("overall_status")
    .limit(MAX_OPPORTUNITY_ROWS_FOR_STATS);

  if (error) {
    return { completed: 0, inReview: 0, blocked: 0, discarded: 0, reason: error.message };
  }

  const counts = { completed: 0, inReview: 0, blocked: 0, discarded: 0 };
  for (const row of (data || []) as DbRow[]) {
    const status = cleanString(row.overall_status, "in_review");
    if (status === "completed") counts.completed += 1;
    else if (status === "blocked") counts.blocked += 1;
    else if (status === "discarded") counts.discarded += 1;
    else counts.inReview += 1;
  }

  return counts;
}

async function getOpportunityBaseStats(): Promise<OpportunityBaseStats> {
  const [opportunityResult, totalSnapshots, validation] = await Promise.all([
    fetchOpportunityRowsForStats(),
    getSnapshotCount(),
    getValidationStats(),
  ]);

  const stageCounts: Record<string, number> = {};
  const aiStatusCounts: Record<string, number> = {};
  const legalStatusCounts: Record<string, number> = {};

  for (const row of opportunityResult.rows) {
    addCount(stageCounts, cleanString(row.stage, "Entrada"));
    addCount(aiStatusCounts, cleanString(row.ai_status, "Fila IA"));
    addCount(legalStatusCounts, cleanString(row.legal_status, "Pendente"));
  }

  return {
    totalOpportunities: opportunityResult.total,
    visibleOpportunities: opportunityResult.rows.filter((row) => shouldShowInPortfolio(row)).length,
    visibleSampled: opportunityResult.rows.length < opportunityResult.total,
    totalSnapshots,
    stageCounts,
    aiStatusCounts,
    legalStatusCounts,
    validation,
    reason: opportunityResult.error,
  };
}

function formatReportMessage(summary: ScraperCronRunSummary, baseStats: OpportunityBaseStats, appUrl: string) {
  const run = summarizeRun(summary);
  const discardReasons = topCounts(run.discardReasons, 4);
  const stageLine = topCounts(baseStats.stageCounts, 4);
  const aiLine = topCounts(baseStats.aiStatusCounts, 4);
  const legalLine = topCounts(baseStats.legalStatusCounts, 4);
  const visibleLabel = baseStats.visibleSampled
    ? `${baseStats.visibleOpportunities}+ visiveis na vitrine`
    : plural(baseStats.visibleOpportunities, "visivel na vitrine", "visiveis na vitrine");
  const panelUrl = appUrl ? `${appUrl}/admin/fontes/capturas` : "/admin/fontes/capturas";

  return [
    "Betel AI - coleta do scraper concluida",
    "",
    `Periodo: ${formatBetelDate(summary.startedAt)} ate ${formatBetelDate(summary.finishedAt)}`,
    `Fontes: ${summary.processed.length} processadas, ${summary.failed.length} com falha, ${summary.skipped.length} ignoradas.`,
    `Rodada: ${plural(run.itemsFound, "imovel encontrado", "imoveis encontrados")}; ${plural(run.itemsIngested, "gravado", "gravados")}; ${plural(run.itemsSkipped + run.itemsFailed, "descartado/falhou", "descartados/falharam")}.`,
    "",
    "Base atual:",
    `${plural(baseStats.totalOpportunities, "imovel no banco", "imoveis no banco")}; ${visibleLabel}; ${plural(baseStats.totalSnapshots, "captura registrada", "capturas registradas")}.`,
    "",
    "Situacao dos imoveis:",
    `Validacao: ${baseStats.validation.completed} validados, ${baseStats.validation.inReview} em analise, ${baseStats.validation.blocked} bloqueados, ${baseStats.validation.discarded} descartados.`,
    stageLine ? `Etapas: ${stageLine}.` : null,
    aiLine ? `IA: ${aiLine}.` : null,
    legalLine ? `Juridico: ${legalLine}.` : null,
    discardReasons ? `Principais filtros da rodada: ${discardReasons}.` : null,
    baseStats.reason ? `Observacao: base parcial (${baseStats.reason}).` : null,
    baseStats.validation.reason ? `Validacao: ${baseStats.validation.reason}.` : null,
    "",
    `Painel: ${panelUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

async function recordScraperReportNotification(input: {
  messageCode: string;
  recipientPhone: string;
  status: "prepared" | "sent" | "failed" | "skipped";
  summary: ScraperCronRunSummary;
  messageText: string;
  providerStatus?: string;
  externalDeliveryId?: string;
  errorMessage?: string;
  payload?: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  await supabase.from("scraper_report_notifications").upsert(
    {
      message_code: input.messageCode,
      recipient_phone: input.recipientPhone || null,
      channel: "whatsapp",
      status: input.status,
      run_started_at: input.summary.startedAt,
      run_finished_at: input.summary.finishedAt,
      targets_processed: input.summary.processed.length,
      targets_failed: input.summary.failed.length,
      targets_skipped: input.summary.skipped.length,
      items_found: summarizeRun(input.summary).itemsFound,
      items_ingested: summarizeRun(input.summary).itemsIngested,
      items_skipped: summarizeRun(input.summary).itemsSkipped,
      message_text: input.messageText,
      provider_status: input.providerStatus || null,
      external_delivery_id: input.externalDeliveryId || null,
      error_message: input.errorMessage || null,
      payload: input.payload || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "message_code" }
  );
}

function hasExecutedTarget(summary: ScraperCronRunSummary) {
  return summary.targets.some((target) => target.status !== "skipped") || summary.processed.length > 0 || summary.failed.length > 0;
}

export async function sendScraperWhatsAppReport(
  summary: ScraperCronRunSummary,
  options: { dryRun?: boolean; force?: boolean } = {}
): Promise<ScraperWhatsAppReportResult> {
  const baseStats = await getOpportunityBaseStats();
  const config = await resolveReportConfig();
  const messageCode = makeReportCode(summary);
  const messageText = formatReportMessage(summary, baseStats, config.appUrl);
  const skippedBase = {
    enabled: config.enabled,
    skipped: true,
    messageCode,
    recipients: config.recipients,
    attempted: 0,
    sent: 0,
    failed: 0,
    messagePreview: messageText,
    providerStatuses: [],
  };

  if (!options.force && !hasExecutedTarget(summary)) {
    await recordScraperReportNotification({
      messageCode,
      recipientPhone: "",
      status: "skipped",
      summary,
      messageText,
      errorMessage: "Nenhum alvo executado nesta rodada.",
      payload: { reason: "no_target_executed", baseStats },
    }).catch(() => undefined);

    return { ...skippedBase, reason: "no_target_executed" };
  }

  if (!config.enabled) {
    await recordScraperReportNotification({
      messageCode,
      recipientPhone: "",
      status: "skipped",
      summary,
      messageText,
      errorMessage: "Relatorio WhatsApp do scraper desabilitado.",
      payload: { reason: "disabled", baseStats },
    }).catch(() => undefined);

    return { ...skippedBase, reason: "disabled" };
  }

  if (!config.recipients.length) {
    await recordScraperReportNotification({
      messageCode,
      recipientPhone: "",
      status: "skipped",
      summary,
      messageText,
      errorMessage: "Nenhum telefone configurado para o relatorio do scraper.",
      payload: { reason: "missing_recipient", configSource: config.source, baseStats },
    }).catch(() => undefined);

    return { ...skippedBase, reason: "missing_recipient" };
  }

  const providerStatuses: ScraperWhatsAppReportResult["providerStatuses"] = [];

  for (const [index, recipient] of config.recipients.entries()) {
    const targetMessageCode = config.recipients.length === 1 ? messageCode : `${messageCode}-${index + 1}`;

    await recordScraperReportNotification({
      messageCode: targetMessageCode,
      recipientPhone: recipient,
      status: options.dryRun ? "prepared" : "prepared",
      summary,
      messageText,
      payload: { configSource: config.source, baseStats, dryRun: Boolean(options.dryRun) },
    }).catch(() => undefined);

    if (options.dryRun) {
      providerStatuses.push({
        messageCode: targetMessageCode,
        recipient,
        status: "prepared",
        providerStatus: "dry_run",
      });
      continue;
    }

    const delivery = await sendGlobalWhatsAppText({
      messageCode: targetMessageCode,
      runCode: targetMessageCode,
      subject: "Betel AI - relatorio do scraper",
      messagePreview: messageText,
      guardrailSummary: "Aviso interno automatico da coleta. Nao e campanha comercial.",
      payload: {
        recipient: { phone: recipient, label: "Operacao Betel" },
        scraperReport: {
          startedAt: summary.startedAt,
          finishedAt: summary.finishedAt,
          processed: summary.processed.length,
          failed: summary.failed.length,
          skipped: summary.skipped.length,
        },
      },
    });

    const status = delivery.ok ? "sent" : "failed";
    await recordScraperReportNotification({
      messageCode: targetMessageCode,
      recipientPhone: recipient,
      status,
      summary,
      messageText,
      providerStatus: delivery.providerStatus,
      externalDeliveryId: delivery.externalDeliveryId,
      errorMessage: delivery.errorMessage,
      payload: {
        configSource: config.source,
        baseStats,
        responsePreview: delivery.responsePreview,
      },
    }).catch(() => undefined);

    providerStatuses.push({
      messageCode: targetMessageCode,
      recipient,
      status,
      providerStatus: delivery.providerStatus,
      errorMessage: delivery.errorMessage,
      externalDeliveryId: delivery.externalDeliveryId,
    });
  }

  const sent = providerStatuses.filter((item) => item.status === "sent").length;
  const failed = providerStatuses.filter((item) => item.status === "failed").length;

  return {
    enabled: true,
    skipped: false,
    messageCode,
    recipients: config.recipients,
    attempted: providerStatuses.length,
    sent,
    failed,
    messagePreview: messageText,
    providerStatuses,
  };
}
