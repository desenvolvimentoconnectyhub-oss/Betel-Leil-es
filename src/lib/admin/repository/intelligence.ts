import "server-only";

import {
  type DataResult, type MutationResult,
  asString, asNumber, asArray, asStringList,
  mockReason,
  getSupabaseAdminClient,
  normalizeTone, toneForRunStatus,
  shortCode, formatAdminDateTime,
} from "./shared";

import type { ResourceTone } from "../resources";

export type IntelligenceReport = {
  id: string;
  reportCode: string;
  agentKey: string;
  agentRunId: string;
  opportunityId: string;
  opportunityTitle: string;
  reportType: string;
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
  tags: string[];
  visibility: string;
  status: string;
  consumedByContent: boolean;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  tone: ResourceTone;
};

export type ContentPost = {
  id: string;
  postCode: string;
  contentType: string;
  agentKey: string;
  title: string;
  slug: string;
  excerpt: string;
  status: string;
  visibility: string;
  tags: string[];
  sourceReportIds: string[];
  publishedAt: string;
  createdAt: string;
  tone: ResourceTone;
};

export type IntelligenceCenterData = {
  reports: IntelligenceReport[];
  posts: ContentPost[];
  metrics: {
    totalReports: number;
    byAgent: Record<string, number>;
    byType: Record<string, number>;
    pendingReview: number;
    consumedByContent: number;
    totalPosts: number;
  };
};

export type IntelligenceCenterFilters = {
  agentKey?: string;
  reportType?: string;
  status?: string;
  tag?: string;
};

type IntelligenceReportDbRow = Record<string, unknown>;
type ContentPostDbRow = Record<string, unknown>;

function toneForReportStatus(status: string): ResourceTone {
  if (status === "published") return "green";
  if (status === "draft") return "yellow";
  if (status === "archived") return "muted";
  return "cyan";
}

function toneForPostStatus(status: string): ResourceTone {
  if (status === "published") return "green";
  if (status === "review") return "yellow";
  if (status === "draft") return "purple";
  if (status === "archived") return "muted";
  return "cyan";
}

function normalizeReport(row: IntelligenceReportDbRow): IntelligenceReport {
  const oppRow = (row.auction_opportunities || null) as Record<string, unknown> | null;
  const status = asString(row.status, "draft");
  return {
    id: asString(row.id),
    reportCode: asString(row.report_code),
    agentKey: asString(row.agent_key),
    agentRunId: asString(row.agent_run_id),
    opportunityId: asString(row.opportunity_id),
    opportunityTitle: asString(oppRow?.title, ""),
    reportType: asString(row.report_type, "analysis"),
    title: asString(row.title, "Relatorio"),
    summary: asString(row.summary),
    structuredData: (row.structured_data as Record<string, unknown>) || {},
    tags: asStringList(row.tags),
    visibility: asString(row.visibility, "internal"),
    status,
    consumedByContent: row.consumed_by_content === true,
    publishedAt: asString(row.published_at),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    tone: toneForReportStatus(status),
  };
}

function normalizePost(row: ContentPostDbRow): ContentPost {
  const status = asString(row.status, "draft");
  return {
    id: asString(row.id),
    postCode: asString(row.post_code),
    contentType: asString(row.content_type, "blog"),
    agentKey: asString(row.agent_key),
    title: asString(row.title, "Post"),
    slug: asString(row.slug),
    excerpt: asString(row.excerpt),
    status,
    visibility: asString(row.visibility, "public"),
    tags: asStringList(row.tags),
    sourceReportIds: asStringList(row.source_report_ids),
    publishedAt: asString(row.published_at),
    createdAt: asString(row.created_at),
    tone: toneForPostStatus(status),
  };
}

function emptyMetrics(): IntelligenceCenterData["metrics"] {
  return {
    totalReports: 0,
    byAgent: {},
    byType: {},
    pendingReview: 0,
    consumedByContent: 0,
    totalPosts: 0,
  };
}

function buildMetrics(reports: IntelligenceReport[], posts: ContentPost[]): IntelligenceCenterData["metrics"] {
  const byAgent: Record<string, number> = {};
  const byType: Record<string, number> = {};
  let pendingReview = 0;
  let consumedByContent = 0;

  for (const r of reports) {
    byAgent[r.agentKey] = (byAgent[r.agentKey] || 0) + 1;
    byType[r.reportType] = (byType[r.reportType] || 0) + 1;
    if (r.status === "draft") pendingReview++;
    if (r.consumedByContent) consumedByContent++;
  }

  return {
    totalReports: reports.length,
    byAgent,
    byType,
    pendingReview,
    consumedByContent,
    totalPosts: posts.length,
  };
}

export async function getIntelligenceCenterData(
  filters?: IntelligenceCenterFilters
): Promise<DataResult<IntelligenceCenterData>> {
  const supabase = getSupabaseAdminClient();

  const empty: IntelligenceCenterData = { reports: [], posts: [], metrics: emptyMetrics() };

  if (!supabase) {
    return { data: empty, source: "mock", reason: mockReason };
  }

  let reportsQuery = supabase
    .from("intelligence_reports")
    .select("*, auction_opportunities(title)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filters?.agentKey) reportsQuery = reportsQuery.eq("agent_key", filters.agentKey);
  if (filters?.reportType) reportsQuery = reportsQuery.eq("report_type", filters.reportType);
  if (filters?.status) reportsQuery = reportsQuery.eq("status", filters.status);
  if (filters?.tag) reportsQuery = reportsQuery.contains("tags", [filters.tag]);

  const [reportsResult, postsResult] = await Promise.all([
    reportsQuery,
    supabase
      .from("content_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const reports = reportsResult.error
    ? []
    : ((reportsResult.data || []) as IntelligenceReportDbRow[]).map(normalizeReport);

  const posts = postsResult.error
    ? []
    : ((postsResult.data || []) as ContentPostDbRow[]).map(normalizePost);

  const hasData = reports.length > 0 || posts.length > 0;

  return {
    data: { reports, posts, metrics: buildMetrics(reports, posts) },
    source: hasData ? "supabase" : "mock",
    reason: hasData ? undefined : "Tabelas sem registros. Pipeline ainda nao publicou relatorios.",
  };
}

export type CreateIntelligenceReportInput = {
  agentKey: string;
  agentRunId?: string;
  opportunityId?: string;
  reportType: string;
  title: string;
  summary: string;
  structuredData: Record<string, unknown>;
  tags: string[];
  visibility?: string;
  status?: string;
};

export async function createIntelligenceReportRecord(
  input: CreateIntelligenceReportInput
): Promise<MutationResult<{ reportCode: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { ok: false, error: "Supabase admin nao configurado." };
  }

  const reportCode = `RPT-${Date.now().toString(36).slice(-6)}`.toUpperCase();

  const { error } = await supabase.from("intelligence_reports").insert({
    report_code: reportCode,
    agent_key: input.agentKey,
    agent_run_id: input.agentRunId || null,
    opportunity_id: input.opportunityId || null,
    report_type: input.reportType,
    title: input.title,
    summary: input.summary,
    structured_data: input.structuredData,
    tags: input.tags,
    visibility: input.visibility || "internal",
    status: input.status || "draft",
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { reportCode } };
}
