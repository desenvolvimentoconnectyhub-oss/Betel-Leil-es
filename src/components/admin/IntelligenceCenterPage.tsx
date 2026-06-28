"use client";

import Link from "next/link";
import {
  BrainCircuit,
  FileText,
  BarChart3,
  Clock3,
  Eye,
  Filter,
  Tag,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type {
  IntelligenceCenterData,
  IntelligenceReport,
  ContentPost,
  DataResult,
} from "@/lib/admin/repository";
import type { ResourceTone } from "@/lib/admin/resources";
import { DashboardCard } from "./DashboardCard";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

type SearchParamValue = string | string[] | undefined;

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBg: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)]",
  yellow: "border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)]",
  red: "border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.08)]",
  purple: "border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]",
};

const reportTypeLabels: Record<string, { label: string; tone: ResourceTone }> = {
  analysis: { label: "Analise", tone: "cyan" },
  curation: { label: "Curadoria", tone: "purple" },
  risk: { label: "Risco", tone: "red" },
  compliance: { label: "Compliance", tone: "yellow" },
  market: { label: "Mercado", tone: "green" },
  content: { label: "Conteudo", tone: "purple" },
  alert: { label: "Alerta", tone: "red" },
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  published: "Publicado",
  archived: "Arquivado",
  review: "Em revisao",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function filterHref(
  params: Record<string, SearchParamValue>,
  updates: Record<string, string>
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "status" && updates.status !== undefined) continue;
    if (key === "message") continue;
    const v = Array.isArray(value) ? value[0] : value;
    if (v && v !== "all") query.set(key, v);
  }
  for (const [key, value] of Object.entries(updates)) {
    if (!value || value === "all") query.delete(key);
    else query.set(key, value);
  }
  const qs = query.toString();
  return `/admin/central-inteligencia${qs ? `?${qs}` : ""}`;
}

export function IntelligenceCenterPage({
  module,
  data,
  searchParams,
}: {
  module: AdminModule;
  data: DataResult<IntelligenceCenterData>;
  searchParams: Record<string, SearchParamValue>;
}) {
  const { reports, posts, metrics } = data.data;

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]">
            <BrainCircuit size={24} className="text-[var(--admin-cyan)]" />
          </div>
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              {module.eyebrow}
            </p>
            <h1 className="text-xl font-bold text-white">{module.title}</h1>
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-[var(--admin-muted)]">{module.description}</p>
      </header>

      {data.source === "mock" && data.reason && (
        <div className="rounded-lg border border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.06)] px-4 py-3 text-xs text-[var(--admin-yellow)]">
          {data.reason}
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <MetricCard label="Relatorios" value={metrics.totalReports} tone="cyan" />
        <MetricCard label="Rascunhos" value={metrics.pendingReview} tone="yellow" />
        <MetricCard label="Consumidos" value={metrics.consumedByContent} tone="green" />
        <MetricCard label="Posts" value={metrics.totalPosts} tone="purple" />
        <MetricCard label="Tipos" value={Object.keys(metrics.byType).length} tone="muted" />
        <MetricCard label="Agentes" value={Object.keys(metrics.byAgent).length} tone="cyan" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(reportTypeLabels).map(([key, { label, tone }]) => {
          const active = searchParams.reportType === key;
          return (
            <Link
              key={key}
              href={filterHref(searchParams, { reportType: active ? "" : key })}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition",
                active ? cn(toneBg[tone], toneText[tone]) : "border-[var(--admin-border)] text-[var(--admin-muted)] hover:text-white"
              )}
            >
              {label}
            </Link>
          );
        })}
        {["draft", "published", "archived"].map((s) => {
          const active = searchParams.status === s;
          return (
            <Link
              key={s}
              href={filterHref(searchParams, { status: active ? "" : s })}
              className={cn(
                "rounded border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] transition",
                active ? "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] text-[var(--admin-cyan)]" : "border-[var(--admin-border)] text-[var(--admin-muted)] hover:text-white"
              )}
            >
              {statusLabels[s] || s}
            </Link>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Reports timeline */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardCard
            title="Relatorios"
            eyebrow="intelligence_reports"
            action={
              <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
                {reports.length} registro(s)
              </span>
            }
          >
            {reports.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <BrainCircuit size={40} className="text-[var(--admin-muted)] opacity-30" />
                <p className="text-sm text-[var(--admin-muted)]">
                  Nenhum relatorio publicado ainda.
                </p>
                <p className="max-w-sm text-xs text-[var(--admin-muted)]">
                  Os relatorios aparecem aqui conforme os agentes processam oportunidades pelo pipeline.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {reports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        {/* Right column: breakdown + posts */}
        <div className="flex flex-col gap-6">
          {/* By agent */}
          {Object.keys(metrics.byAgent).length > 0 && (
            <DashboardCard title="Por agente" eyebrow="distribuicao">
              <div className="space-y-2">
                {Object.entries(metrics.byAgent)
                  .sort(([, a], [, b]) => b - a)
                  .map(([agentKey, count]) => (
                    <Link
                      key={agentKey}
                      href={filterHref(searchParams, { agentKey })}
                      className="flex items-center justify-between rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2 transition hover:bg-[rgba(255,255,255,0.05)]"
                    >
                      <span className="font-mono text-xs text-white">{agentKey}</span>
                      <span className="font-mono text-xs text-[var(--admin-cyan)]">{count}</span>
                    </Link>
                  ))}
              </div>
            </DashboardCard>
          )}

          {/* By type */}
          {Object.keys(metrics.byType).length > 0 && (
            <DashboardCard title="Por tipo" eyebrow="categorias">
              <div className="space-y-2">
                {Object.entries(metrics.byType)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => {
                    const meta = reportTypeLabels[type] || { label: type, tone: "muted" as ResourceTone };
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                      >
                        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                        <span className="font-mono text-xs text-white">{count}</span>
                      </div>
                    );
                  })}
              </div>
            </DashboardCard>
          )}

          {/* Content posts */}
          <DashboardCard
            title="Conteudo"
            eyebrow="content_posts"
            action={
              <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
                {posts.length} post(s)
              </span>
            }
          >
            {posts.length === 0 ? (
              <p className="text-xs italic text-[var(--admin-muted)]">
                Nenhum conteudo gerado. Aguardando agentes de conteudo (Fase 7).
              </p>
            ) : (
              <div className="space-y-2">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-white">{post.title}</span>
                      <StatusBadge tone={post.tone}>{statusLabels[post.status] || post.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-[10px] text-[var(--admin-muted)]">
                      {post.contentType} · {post.slug} · {formatDate(post.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: ResourceTone }) {
  return (
    <div className={cn("rounded-lg border p-3", toneBg[tone])}>
      <p className={cn("text-2xl font-bold", toneText[tone])}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
        {label}
      </p>
    </div>
  );
}

function ReportRow({ report }: { report: IntelligenceReport }) {
  const typeMeta = reportTypeLabels[report.reportType] || { label: report.reportType, tone: "muted" as ResourceTone };

  return (
    <div className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge tone={typeMeta.tone}>{typeMeta.label}</StatusBadge>
            <span className="truncate text-sm font-medium text-white">{report.title}</span>
          </div>
          {report.summary && (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--admin-muted)]">{report.summary}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--admin-muted)]">
            {report.agentKey && (
              <Link
                href={`/admin/agentes-ia/${report.agentKey}`}
                className="font-mono hover:text-[var(--admin-cyan)] transition"
              >
                {report.agentKey}
              </Link>
            )}
            {report.opportunityTitle && (
              <span>· {report.opportunityTitle}</span>
            )}
            <span>· {formatDate(report.createdAt)}</span>
            {report.tags.length > 0 && (
              <div className="flex gap-1">
                {report.tags.map((t) => (
                  <span key={t} className="rounded border border-[var(--admin-border)] px-1 py-0.5">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge tone={report.tone}>{statusLabels[report.status] || report.status}</StatusBadge>
          {report.consumedByContent && (
            <span className="text-[10px] text-[var(--admin-green)]">Consumido</span>
          )}
        </div>
      </div>
    </div>
  );
}
