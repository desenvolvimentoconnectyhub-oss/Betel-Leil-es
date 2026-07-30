import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  FileText,
  Lock,
  Megaphone,
  ShieldCheck,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type { TrafficAiDashboardData, TrafficConnectionStatus, TrafficTone } from "@/lib/traffic-ai/dashboard";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { AdminIcon } from "@/components/admin/AdminIcons";
import { cn } from "@/lib/utils";

const toneText: Record<TrafficTone, string> = {
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  cyan: "text-[var(--admin-cyan)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBg: Record<TrafficTone, string> = {
  green: "border-[rgba(19,122,69,0.24)] bg-[rgba(19,122,69,0.08)]",
  yellow: "border-[rgba(183,121,17,0.26)] bg-[rgba(183,121,17,0.08)]",
  red: "border-[rgba(196,61,45,0.26)] bg-[rgba(196,61,45,0.08)]",
  purple: "border-[rgba(138,90,45,0.24)] bg-[rgba(138,90,45,0.08)]",
  cyan: "border-[rgba(200,90,31,0.24)] bg-[rgba(200,90,31,0.08)]",
  muted: "border-[var(--admin-border)] bg-white",
};

const moduleConnectionMap: Record<string, string[]> = {
  "meta-ads": ["meta_ads", "traffic_ai_governance"],
  "google-ads": ["google_ads", "traffic_ai_governance"],
  "google-analytics": ["google_analytics", "google_search_console", "google_business_profile", "traffic_ai_governance"],
  "trafego-organico": ["meta_social", "google_search_console", "google_business_profile", "traffic_ai_governance"],
  "caixa-meta": ["meta_social", "traffic_ai_governance"],
  criativos: ["meta_ads", "google_ads", "meta_social", "traffic_ai_governance"],
  "meta-whatsapp-chat": ["meta_social", "traffic_ai_governance"],
};

const modulePlan: Record<string, Array<{ title: string; detail: string; status: "feito" | "proximo" | "futuro" }>> = {
  "meta-ads": [
    { title: "Conectar BM e conta de anuncios", detail: "Salvar Business ID, Ad Account ID e System User Token na manutencao.", status: "proximo" },
    { title: "Sincronizar campanhas", detail: "Trazer campanhas, conjuntos, anuncios, custos, leads e criativos via Inngest.", status: "futuro" },
    { title: "Otimizar com aprovacao", detail: "IA sugere mudancas de budget, criativo e publico; humano aprova antes de aplicar.", status: "futuro" },
  ],
  "google-ads": [
    { title: "Conectar OAuth e Customer ID", detail: "Salvar Developer Token, OAuth e Customer ID.", status: "proximo" },
    { title: "Sincronizar campanhas e termos", detail: "Coletar keywords, search terms, custo, conversoes e landing pages.", status: "futuro" },
    { title: "Rotina de recomendacoes", detail: "IA recomenda negativas, ajustes de lances e campanhas com aprovacao.", status: "futuro" },
  ],
  "google-analytics": [
    { title: "Conectar GA4", detail: "Salvar Property ID e OAuth para leitura dos funis.", status: "proximo" },
    { title: "Cruzar origem com CRM", detail: "Relacionar UTM, evento, lead e conversa WhatsApp.", status: "futuro" },
    { title: "Relatorio executivo IA", detail: "Gerar resumo semanal com gargalos e recomendacoes.", status: "futuro" },
  ],
  "trafego-organico": [
    { title: "Conectar perfis sociais e Search Console", detail: "Ler Instagram, Facebook, GBP e consultas organicas.", status: "proximo" },
    { title: "Analisar posts e comentarios", detail: "Classificar tema, engajamento, intencao e oportunidades de resposta.", status: "futuro" },
    { title: "Planejar conteudo com IA", detail: "Sugerir pauta, formato, horario e chamada para WhatsApp.", status: "futuro" },
  ],
  "caixa-meta": [
    { title: "Conectar Page e Instagram Business", detail: "Preparar Messenger, Instagram DM e eventos da Meta.", status: "proximo" },
    { title: "Unificar inbox", detail: "Centralizar comentarios, DMs, Messenger e WhatsApp oficial.", status: "futuro" },
    { title: "Atendimento multicanal", detail: "Roteamento para agente, humano ou campanha de follow-up.", status: "futuro" },
  ],
  criativos: [
    { title: "Biblioteca de assets", detail: "Registrar criativos, copies, links, formatos e origem.", status: "proximo" },
    { title: "Score de performance", detail: "Cruzar criativo com gasto, leads, CPL, taxa de resposta e canal.", status: "futuro" },
    { title: "Geracao controlada", detail: "IA cria variacoes, mas publicacao exige revisao.", status: "futuro" },
  ],
};

function statusTone(status: string): TrafficTone {
  if (["ok", "active", "approved", "applied"].includes(status)) return "green";
  if (["warning", "pending", "open", "draft"].includes(status)) return "yellow";
  if (["error", "failed", "rejected"].includes(status)) return "red";
  return "muted";
}

function visibleConnections(data: TrafficAiDashboardData) {
  const ids = moduleConnectionMap[data.moduleSlug] || [];
  const connections = data.connections.filter((connection) => ids.includes(connection.id));
  return connections.length ? connections : data.connections;
}

function ConnectionCard({ connection }: { connection: TrafficConnectionStatus }) {
  return (
    <article className={cn("rounded-lg border p-3", toneBg[statusTone(connection.status)])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">{connection.title}</h3>
            <StatusBadge tone={statusTone(connection.status)}>
              {connection.status === "ok" ? "configurado" : connection.status}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{connection.description}</p>
        </div>
        <Database size={17} className={cn("shrink-0", toneText[statusTone(connection.status)])} />
      </div>
      <div className="mt-3 grid gap-2 text-xs text-[var(--admin-soft)] sm:grid-cols-2">
        <span>{connection.configuredRequired}/{connection.requiredTotal} obrigatorias</span>
        <span>{connection.usedBy}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {connection.credentials.slice(0, 6).map((credential) => (
          <span
            key={`${connection.id}-${credential.configKey}`}
            className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--admin-muted)]"
          >
            {credential.label}
          </span>
        ))}
      </div>
    </article>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--admin-border)] bg-white px-4 py-8 text-center">
      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{title}</p>
      <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>
    </div>
  );
}

function PlanBadge({ status }: { status: "feito" | "proximo" | "futuro" }) {
  const tone = status === "feito" ? "green" : status === "proximo" ? "yellow" : "muted";
  const label = status === "feito" ? "feito" : status === "proximo" ? "proximo" : "futuro";
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}

export function TrafficAiModulePage({
  module,
  data,
}: {
  module: AdminModule;
  data: TrafficAiDashboardData;
}) {
  const plan = modulePlan[module.slug] || modulePlan["meta-ads"];
  const selectedConnections = visibleConnections(data);

  return (
    <main className="mx-auto max-w-[1680px] space-y-4 px-4 py-4 lg:px-6">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-[var(--admin-muted)]">Betel AI / Trafego IA</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-lg border border-[rgba(200,90,31,0.24)] bg-[rgba(200,90,31,0.08)] text-[var(--admin-cyan)]">
                <AdminIcon icon={module.icon} size={18} />
              </span>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">{module.title}</h1>
                <p className="mt-1 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">{module.description}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={data.source === "supabase" ? "green" : "yellow"}>
              {data.source === "supabase" ? "base pronta" : "migration pendente"}
            </StatusBadge>
            <StatusBadge tone={data.config.readOnlyMode ? "green" : "red"}>
              {data.config.readOnlyMode ? "modo leitura" : "modo escrita"}
            </StatusBadge>
            <Button
              asChild
              variant="outline"
              className="h-9 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]"
            >
              <Link href="/admin/maintenance">
                Credenciais
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
        </div>

        {data.reason && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-[rgba(183,121,17,0.26)] bg-[rgba(183,121,17,0.08)] px-3 py-2 text-sm text-[var(--admin-yellow)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.reason}</span>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <article key={metric.label} className={cn("rounded-lg border px-4 py-3", toneBg[metric.tone])}>
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className={cn("mt-2 font-mono text-2xl font-bold", toneText[metric.tone])}>{metric.value}</div>
            <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-4">
          <DashboardCard
            title="Conexoes necessarias"
            eyebrow="manutencao / credenciais"
            action={<StatusBadge tone="yellow">preparado</StatusBadge>}
          >
            <div className="grid gap-3">
              {selectedConnections.map((connection) => (
                <ConnectionCard key={connection.id} connection={connection} />
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Campanhas e contas"
            eyebrow="snapshots / leitura"
            action={<BarChart3 size={17} className="text-[var(--admin-cyan)]" />}
            contentClassName="p-0"
          >
            {data.campaigns.length || data.accounts.length ? (
              <div className="divide-y divide-[var(--admin-border)]">
                {data.accounts.slice(0, 4).map((account) => (
                  <div key={account.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{account.name}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">
                        {account.provider} / {account.externalAccountId} / {account.currency || "-"}
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(account.status)}>{account.status}</StatusBadge>
                  </div>
                ))}
                {data.campaigns.slice(0, 8).map((campaign) => (
                  <div key={campaign.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{campaign.name}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">
                        {campaign.provider} / {campaign.snapshotDate || "-"} / leads {campaign.leads}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-[var(--admin-cyan)]">R$ {campaign.spend.toFixed(2)}</p>
                      <p className="text-xs text-[var(--admin-muted)]">CPL R$ {campaign.cpl.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum snapshot sincronizado"
                detail="Depois das credenciais, a proxima fase cria as funcoes Inngest para coletar contas, campanhas, criativos, custos e conversoes."
              />
            )}
          </DashboardCard>
        </div>

        <div className="space-y-4">
          <DashboardCard
            title="Governanca"
            eyebrow="seguranca operacional"
            action={<ShieldCheck size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="grid gap-3">
              <div className="flex items-start gap-3 rounded-lg border border-[rgba(19,122,69,0.24)] bg-[rgba(19,122,69,0.08)] p-3">
                <Lock size={17} className="mt-0.5 shrink-0 text-[var(--admin-green)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--admin-foreground)]">Execucao bloqueada por padrao</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
                    Modo leitura: {data.config.readOnlyMode ? "ativo" : "inativo"}. Aprovacao humana: {data.config.requireHumanApproval ? "obrigatoria" : "desativada"}.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-lg border border-[var(--admin-border)] bg-white p-3">
                <Clock size={17} className="mt-0.5 shrink-0 text-[var(--admin-yellow)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--admin-foreground)]">Sync planejado via Inngest</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
                    Intervalo configurado: {data.config.syncIntervalMinutes} minutos. Nao usar Vercel Cron.
                  </p>
                </div>
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Plano do modulo" eyebrow="fases">
            <div className="grid gap-3">
              {plan.map((item, index) => (
                <div key={item.title} className="flex gap-3">
                  <div className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--admin-border)] bg-white font-mono text-[11px] font-bold text-[var(--admin-cyan)]">
                    {index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{item.title}</p>
                      <PlanBadge status={item.status} />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Recomendacoes IA"
            eyebrow="auditoria / aprovacao"
            action={<Megaphone size={17} className="text-[var(--admin-purple)]" />}
            contentClassName="p-0"
          >
            {data.recommendations.length ? (
              <div className="divide-y divide-[var(--admin-border)]">
                {data.recommendations.slice(0, 6).map((recommendation) => (
                  <div key={recommendation.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{recommendation.title}</p>
                      <StatusBadge tone={statusTone(recommendation.priority)}>{recommendation.priority}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{recommendation.rationale || "Sem justificativa registrada."}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Sem recomendacoes ainda"
                detail="As recomendacoes aparecem depois que os snapshots e relatorios forem gerados."
              />
            )}
          </DashboardCard>

          <DashboardCard title="Perfis e criativos" eyebrow="organico / assets" action={<FileText size={17} className="text-[var(--admin-cyan)]" />} contentClassName="p-0">
            {data.socialProfiles.length ? (
              <div className="divide-y divide-[var(--admin-border)]">
                {data.socialProfiles.slice(0, 6).map((profile) => (
                  <div key={profile.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{profile.displayName}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">
                        {profile.provider} / {profile.username || "-"} / {profile.followerCount} seguidores
                      </p>
                    </div>
                    <StatusBadge tone={statusTone(profile.status)}>{profile.status}</StatusBadge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum perfil social sincronizado"
                detail="Facebook, Instagram, Google Business Profile e canais organicos entram aqui depois das credenciais."
              />
            )}
          </DashboardCard>
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-3 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3 text-sm text-[var(--admin-soft)]">
          <CheckCircle2 size={17} className="text-[var(--admin-green)]" />
          <span>Base preparada para conectar contas quando os acessos da Betel estiverem disponiveis.</span>
        </div>
        <Button asChild className="h-9 bg-[var(--admin-cyan)] text-white hover:bg-[var(--admin-purple)]">
          <Link href="/admin/maintenance">
            Abrir sala de manutencao
            <ArrowUpRight size={15} />
          </Link>
        </Button>
      </section>
    </main>
  );
}
