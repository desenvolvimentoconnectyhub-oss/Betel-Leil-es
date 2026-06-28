"use client";

import {
  FileText,
  Newspaper,
  Globe2,
  Bell,
  PenTool,
  Eye,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type { IntelligenceCenterData, ContentPost } from "@/lib/admin/repository/intelligence";
import type { DataResult } from "@/lib/admin/repository";
import type { ResourceTone } from "@/lib/admin/resources";
import { DashboardCard } from "./DashboardCard";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

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

const contentAgents = [
  {
    key: "blog-writer",
    name: "Agente Blog",
    description: "Cria artigos de blog a partir de relatorios da Central de Inteligencia.",
    icon: FileText,
    tone: "purple" as ResourceTone,
    status: "Planejado",
  },
  {
    key: "news-writer",
    name: "Agente Noticias",
    description: "Gera noticias e atualizacoes do feed a partir de relatorios.",
    icon: Newspaper,
    tone: "cyan" as ResourceTone,
    status: "Planejado",
  },
  {
    key: "site-publisher",
    name: "Agente Cadastro no Site",
    description: "Registra oportunidades aprovadas no portal publico para assinantes.",
    icon: Globe2,
    tone: "green" as ResourceTone,
    status: "Planejado",
  },
  {
    key: "admin-alert",
    name: "Agente Alerta Admin",
    description: "Notifica admins sobre eventos importantes do sistema.",
    icon: Bell,
    tone: "red" as ResourceTone,
    status: "Planejado",
  },
];

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

export function ContentManagementPage({
  module,
  data,
}: {
  module: AdminModule;
  data: DataResult<IntelligenceCenterData>;
}) {
  const { metrics, posts } = data.data;
  const published = posts.filter((p) => p.status === "published").length;
  const drafts = posts.filter((p) => p.status === "draft" || p.status === "rascunho").length;

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 md:p-6">
      <header>
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)]">
            <PenTool size={24} className="text-[var(--admin-purple)]" />
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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Relatorios" value={metrics.totalReports} tone="cyan" />
        <MetricCard label="Posts" value={metrics.totalPosts} tone="purple" />
        <MetricCard label="Publicados" value={published} tone="green" />
        <MetricCard label="Rascunhos" value={drafts} tone="yellow" />
      </div>

      <DashboardCard
        title="Agentes de Conteudo"
        eyebrow="grupo conteudo e publicacao"
        action={<StatusBadge tone="yellow">Fase 7</StatusBadge>}
      >
        <div className="grid gap-3 md:grid-cols-2">
          {contentAgents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div key={agent.key} className={cn("rounded-lg border p-4", toneBg[agent.tone])}>
                <div className="flex items-start gap-3">
                  <div className={cn("mt-0.5 shrink-0", toneText[agent.tone])}>
                    <Icon size={20} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{agent.name}</span>
                      <StatusBadge tone="yellow">{agent.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">{agent.description}</p>
                    <p className="mt-2 font-mono text-[10px] text-[var(--admin-muted)]">{agent.key}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Conteudo gerado"
        eyebrow="content_posts"
        action={
          <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
            {posts.length} post(s)
          </span>
        }
      >
        {posts.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <PenTool size={40} className="text-[var(--admin-muted)] opacity-30" />
            <p className="text-sm text-[var(--admin-muted)]">Nenhum conteudo gerado ainda.</p>
            <p className="max-w-md text-xs text-[var(--admin-muted)]">
              Os agentes de conteudo transformam relatorios da Central de Inteligencia em artigos, noticias e
              publicacoes. Ative os agentes para comecar.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post: ContentPost) => (
              <div
                key={post.id}
                className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{post.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-[var(--admin-muted)]">{post.excerpt}</p>
                  </div>
                  <StatusBadge tone={post.tone}>{post.status}</StatusBadge>
                </div>
                <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--admin-muted)]">
                  <span>{post.contentType}</span>
                  <span>{formatDate(post.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardCard>

      <DashboardCard title="Fluxo de conteudo" eyebrow="pipeline → central → conteudo">
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded border border-[var(--admin-border)] bg-[rgba(0,0,0,0.3)] px-4 py-3">
            <Eye size={16} className="shrink-0 text-[var(--admin-cyan)]" />
            <div>
              <p className="text-xs font-medium text-white">1. Pipeline processa oportunidade</p>
              <p className="text-[10px] text-[var(--admin-muted)]">
                Agentes de captacao, curadoria e revisao geram relatorios na Central de Inteligencia.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded border border-[var(--admin-border)] bg-[rgba(0,0,0,0.3)] px-4 py-3">
            <FileText size={16} className="shrink-0 text-[var(--admin-purple)]" />
            <div>
              <p className="text-xs font-medium text-white">2. Agentes de conteudo consomem relatorios</p>
              <p className="text-[10px] text-[var(--admin-muted)]">
                Blog Writer e News Writer transformam relatorios em artigos e noticias.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded border border-[var(--admin-border)] bg-[rgba(0,0,0,0.3)] px-4 py-3">
            <Globe2 size={16} className="shrink-0 text-[var(--admin-green)]" />
            <div>
              <p className="text-xs font-medium text-white">3. Site Publisher cadastra no portal</p>
              <p className="text-[10px] text-[var(--admin-muted)]">
                Oportunidades aprovadas sao publicadas com niveis de acesso por plano.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded border border-[var(--admin-border)] bg-[rgba(0,0,0,0.3)] px-4 py-3">
            <Bell size={16} className="shrink-0 text-[var(--admin-red)]" />
            <div>
              <p className="text-xs font-medium text-white">4. Admin Alert monitora o sistema</p>
              <p className="text-[10px] text-[var(--admin-muted)]">
                Erros criticos, alertas e pipeline travado geram notificacoes para admins.
              </p>
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}
