"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  CircleDashed,
  Database,
  FileText,
  Gavel,
  Home,
  ListChecks,
  MapPin,
  Search,
  ShieldCheck,
  TimerReset,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { backfillOpportunityImagesAction, refreshOpportunityValidationPipelineAction } from "@/app/admin/oportunidades/actions";
import { cn } from "@/lib/utils";

type ResourceTone = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

type WorkspaceModule = {
  title: string;
  eyebrow: string;
  description: string;
  statusLabel: string;
};

type WorkspaceOpportunity = {
  id: string;
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  sourceName: string;
  sourceType: string;
  initialBid: number;
  appraisalValue: number;
  discountPct: number;
  opportunityScore: number;
  riskScore: number;
  complianceScore: number;
  aiStatus: string;
  legalStatus: string;
  stage: string;
  nextAction: string;
  owner: string;
  auctionDate: string;
  occupancy: string;
  summary: string;
  riskFlags: Array<{ label: string; severity: ResourceTone; detail: string }>;
  checklist: Array<{ label: string; status: string; owner: string }>;
  documents: Array<{ label: string; status: string; source: string }>;
  timeline: Array<{ time: string; actor: string; action: string; tone: ResourceTone }>;
  images?: Array<{ url: string; sourceUrl?: string; status?: string; alt?: string }>;
};

type WorkspaceSnapshot = {
  snapshotCode: string;
  sourceUrl: string;
  title: string;
  status: string;
  collectedBy: string;
  collectedAt: string;
  sourceName: string;
  opportunityCode: string;
  runCode: string;
  runStatus: string;
  curationStatus: string;
  curatorRunCode: string;
  curatorRunStatus: string;
  hiddenRiskRunCode: string;
  hiddenRiskStatus: string;
  humanHandoffRunCode: string;
  humanHandoffStatus: string;
  legalReviewCode: string;
  legalReviewStatus: string;
  legalReviewDecision: string;
  complianceRunCode: string;
  complianceRunStatus: string;
  complianceReviewStatus: string;
  communicationStatus: string;
  communicationOutboxCount: number;
  payloadPreview: string;
};

type ValidationStepStatus = "passed" | "warning" | "pending" | "blocked" | "skipped";
type ValidationOverallStatus = "completed" | "in_review" | "blocked" | "discarded";

type WorkspaceValidationStep = {
  stepKey: string;
  stepLabel: string;
  stepOrder: number;
  status: ValidationStepStatus;
  score: number;
  summary: string;
  provider: string;
  errorMessage: string;
  finishedAt: string;
};

type WorkspaceValidationRun = {
  opportunityCode: string;
  opportunityTitle: string;
  overallStatus: ValidationOverallStatus;
  currentStepKey: string;
  currentStepLabel: string;
  progressPct: number;
  finalScore: number;
  blockedReason: string;
  persisted: boolean;
  steps: WorkspaceValidationStep[];
};

type WorkspaceFilter = "todos" | "entrada" | "revisao" | "risco" | "pronto" | "com_foto";
type CategoryFilter =
  | "todos"
  | "imoveis"
  | "terrenos"
  | "lotes"
  | "casas"
  | "apartamentos"
  | "predios"
  | "comerciais"
  | "rurais";

const categoryTabs: Array<{ key: CategoryFilter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "imoveis", label: "Imóveis" },
  { key: "terrenos", label: "Terrenos" },
  { key: "lotes", label: "Lotes" },
  { key: "casas", label: "Casas" },
  { key: "apartamentos", label: "Apartamentos" },
  { key: "predios", label: "Prédios" },
  { key: "comerciais", label: "Comerciais" },
  { key: "rurais", label: "Rurais" },
];

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] text-[var(--admin-cyan)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]",
  yellow: "border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)] text-[var(--admin-yellow)]",
  red: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]",
  purple: "border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.09)] text-[var(--admin-purple)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-muted)]",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatCurrency(value: number) {
  if (!value) return "Valor não informado";
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatShortDate(value: string) {
  if (!value) return "sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return shortDateFormatter.format(date);
}

function classifyOpportunity(item: WorkspaceOpportunity): WorkspaceFilter {
  const text = normalizeText(`${item.stage} ${item.aiStatus} ${item.legalStatus} ${item.nextAction}`);

  if (item.riskScore >= 70 || text.includes("bloq") || text.includes("critico") || text.includes("risco alto")) {
    return "risco";
  }

  if (text.includes("humano") || text.includes("jurid") || text.includes("pendente") || text.includes("aguard")) {
    return "revisao";
  }

  if (text.includes("entrada") || text.includes("fila ia") || text.includes("curadoria")) {
    return "entrada";
  }

  return "pronto";
}

function classifyPropertyCategory(item: WorkspaceOpportunity): CategoryFilter {
  const text = normalizeText(`${item.propertyType} ${item.title} ${item.summary}`);

  if (text.includes("lote")) return "lotes";
  if (text.includes("terreno")) return "terrenos";
  if (text.includes("apartamento") || text.includes("apto")) return "apartamentos";
  if (text.includes("casa") || text.includes("sobrado") || text.includes("condominio")) return "casas";
  if (text.includes("predio") || text.includes("edificio")) return "predios";
  if (text.includes("comercial") || text.includes("sala") || text.includes("loja") || text.includes("galpao")) {
    return "comerciais";
  }
  if (text.includes("rural") || text.includes("fazenda") || text.includes("sitio") || text.includes("chacara")) {
    return "rurais";
  }

  return "imoveis";
}

function daysUntil(value: string) {
  if (!value) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((date.getTime() - base) / 86_400_000);
}

function filterLabel(filter: WorkspaceFilter) {
  const labels: Record<WorkspaceFilter, string> = {
    todos: "Todos",
    entrada: "Entrada",
    revisao: "Revisão",
    risco: "Risco",
    pronto: "Prontos",
    com_foto: "Com foto",
  };
  return labels[filter];
}

function getPrimaryImage(item: WorkspaceOpportunity) {
  const images = item.images || [];
  return images.find((image) => image.status === "mirrored")?.url || images[0]?.url || "";
}

function metricTone(value: number, fallback: ResourceTone) {
  return value > 0 ? fallback : "muted";
}

function validationTone(status?: ValidationOverallStatus): ResourceTone {
  if (status === "completed") return "green";
  if (status === "blocked" || status === "discarded") return "red";
  if (status === "in_review") return "yellow";
  return "muted";
}

function validationLabel(status?: ValidationOverallStatus) {
  const labels: Record<ValidationOverallStatus, string> = {
    completed: "Concluido",
    in_review: "Em validacao",
    blocked: "Bloqueado",
    discarded: "Descartado",
  };
  return status ? labels[status] : "Nao calculado";
}

function stepTone(status: ValidationStepStatus): ResourceTone {
  if (status === "passed") return "green";
  if (status === "blocked") return "red";
  if (status === "warning") return "yellow";
  if (status === "pending") return "purple";
  return "muted";
}

function stepIcon(status: ValidationStepStatus) {
  if (status === "passed") return CheckCircle2;
  if (status === "blocked") return XCircle;
  if (status === "warning") return AlertTriangle;
  return CircleDashed;
}

function validationStopCounts(validations: WorkspaceValidationRun[]) {
  const counts = new Map<string, number>();
  for (const validation of validations) {
    if (validation.overallStatus === "completed") continue;
    const label = validation.currentStepLabel || "Sem etapa";
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function statusSuggestsStop(value: string) {
  const text = normalizeText(value);
  return (
    text.includes("erro") ||
    text.includes("falha") ||
    text.includes("bloq") ||
    text.includes("descart") ||
    text.includes("reject") ||
    text.includes("failed")
  );
}

function snapshotStopLabel(snapshot: WorkspaceSnapshot, qualifiedCodes: Set<string>) {
  if (!snapshot.opportunityCode) return "Nao virou oportunidade";
  if (!qualifiedCodes.has(snapshot.opportunityCode)) return "Fora da vitrine";
  if (statusSuggestsStop(`${snapshot.status} ${snapshot.runStatus} ${snapshot.curationStatus}`)) return "Coleta ou curadoria";
  if (statusSuggestsStop(snapshot.hiddenRiskStatus)) return "Risco oculto";
  if (snapshot.humanHandoffStatus && !normalizeText(snapshot.humanHandoffStatus).includes("completed")) return "Revisao humana";
  if (snapshot.legalReviewStatus && !normalizeText(snapshot.legalReviewStatus).includes("approved")) return "Juridico";
  if (snapshot.complianceReviewStatus && !normalizeText(snapshot.complianceReviewStatus).includes("approved")) return "Compliance";
  if (snapshot.communicationStatus && statusSuggestsStop(snapshot.communicationStatus)) return "Comunicacao";
  return "Chegou ao fim";
}

function snapshotStopCounts(snapshots: WorkspaceSnapshot[], qualifiedCodes: Set<string>) {
  const counts = new Map<string, number>();
  for (const snapshot of snapshots) {
    const label = snapshotStopLabel(snapshot, qualifiedCodes);
    if (label === "Chegou ao fim") continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function ValidationProgress({
  validation,
  compact = false,
}: {
  validation?: WorkspaceValidationRun;
  compact?: boolean;
}) {
  const tone = validationTone(validation?.overallStatus);
  const progress = validation?.progressPct || 0;

  return (
    <div className={cn("rounded-lg border px-3 py-2", toneBorder[tone])}>
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold">
          <ShieldCheck size={14} className="shrink-0" />
          <span className="truncate">{validationLabel(validation?.overallStatus)}</span>
        </span>
        <span className="font-mono text-xs font-bold">{progress}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progress}%` }} />
      </div>
      {!compact && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">
          {validation?.blockedReason || validation?.currentStepLabel || "Aguardando calculo da validacao."}
        </p>
      )}
    </div>
  );
}

function ValidationStepChips({ validation }: { validation?: WorkspaceValidationRun }) {
  if (!validation?.steps.length) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={cn("inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[10px] font-semibold", toneBorder.muted)}>
          <CircleDashed size={11} />
          Sem etapas
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {validation.steps.slice(0, 5).map((step) => {
        const Icon = stepIcon(step.status);
        return (
          <span
            key={step.stepKey}
            title={step.summary || step.errorMessage || step.stepLabel}
            className={cn(
              "inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-2 text-[10px] font-semibold",
              toneBorder[stepTone(step.status)]
            )}
          >
            <Icon size={11} className="shrink-0" />
            <span className="truncate">{step.stepLabel}</span>
          </span>
        );
      })}
    </div>
  );
}

function ValidationPipelinePanel({
  validations,
  snapshots,
  qualifiedCodes,
}: {
  validations: WorkspaceValidationRun[];
  snapshots: WorkspaceSnapshot[];
  qualifiedCodes: Set<string>;
}) {
  const completed = validations.filter((item) => item.overallStatus === "completed").length;
  const blocked = validations.filter((item) => item.overallStatus === "blocked" || item.overallStatus === "discarded").length;
  const inReview = validations.filter((item) => item.overallStatus === "in_review").length;
  const linkedCodes = new Set(snapshots.map((item) => item.opportunityCode).filter(Boolean));
  const unlinkedSnapshots = snapshots.filter((item) => !item.opportunityCode).length;
  const outsideOrDuplicate = Math.max(snapshots.length - qualifiedCodes.size, 0);
  const outsidePortfolio = Math.max(linkedCodes.size - qualifiedCodes.size, 0);
  const avgProgress = validations.length
    ? Math.round(validations.reduce((total, item) => total + item.progressPct, 0) / validations.length)
    : 0;
  const stopCounts = validationStopCounts(validations);
  const captureStopCounts = snapshotStopCounts(snapshots, qualifiedCodes);
  const activeValidations = validations
    .filter((item) => item.overallStatus !== "completed")
    .slice(0, 6);

  return (
    <DashboardCard
      title="Validação dos imóveis"
      eyebrow="captura / provas / decisão"
      action={
        <form action={refreshOpportunityValidationPipelineAction}>
          <Button
            type="submit"
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <ListChecks size={15} />
            Atualizar validação
          </Button>
        </form>
      }
    >
      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <MetricTile label="Candidatos brutos" value={String(snapshots.length)} detail="snapshots capturados" tone={metricTone(snapshots.length, "cyan")} />
        <MetricTile label="Viraram oportunidade" value={String(linkedCodes.size)} detail="gravados no banco" tone={metricTone(linkedCodes.size, "purple")} />
        <MetricTile label="Entraram na vitrine" value={String(qualifiedCodes.size)} detail="passaram filtros finais" tone={metricTone(qualifiedCodes.size, "green")} />
        <MetricTile label="Fora/duplicados" value={String(outsideOrDuplicate)} detail={`${unlinkedSnapshots} sem oportunidade; ${outsidePortfolio} fora vitrine`} tone={metricTone(outsideOrDuplicate, "yellow")} />
      </div>

      <div className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Paradas da captacao</p>
          <StatusBadge tone={captureStopCounts.length ? "yellow" : "green"}>
            {captureStopCounts.length ? `${captureStopCounts.length} filtros` : "sem parada"}
          </StatusBadge>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {captureStopCounts.length ? (
            captureStopCounts.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-black/15 px-3 py-2 text-xs">
                <span className="truncate text-[var(--admin-soft)]">{item.label}</span>
                <span className="font-mono font-bold text-white">{item.count}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-[var(--admin-muted)]">Todas as capturas desta lista chegaram ate a vitrine.</p>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MetricTile label="No pipeline" value={String(validations.length)} detail={`${avgProgress}% medio validado`} tone={metricTone(validations.length, "cyan")} />
        <MetricTile label="Chegaram ao fim" value={String(completed)} detail="prontos para avancar" tone={metricTone(completed, "green")} />
        <MetricTile label="Em validação" value={String(inReview)} detail="com etapa pendente" tone={metricTone(inReview, "yellow")} />
        <MetricTile label="Bloqueados" value={String(blocked)} detail="risco, descarte ou falta critica" tone={metricTone(blocked, "red")} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Paradas por etapa</p>
            <StatusBadge tone={stopCounts.length ? "yellow" : "green"}>
              {stopCounts.length ? `${stopCounts.length} etapas` : "sem parada"}
            </StatusBadge>
          </div>
          <div className="mt-4 grid gap-2">
            {stopCounts.length ? (
              stopCounts.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-black/15 px-3 py-2 text-xs">
                  <span className="truncate text-[var(--admin-soft)]">{item.label}</span>
                  <span className="font-mono font-bold text-white">{item.count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--admin-muted)]">Todos os imóveis validados chegaram ao fim.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-sm font-semibold text-white">Fila atual</p>
          <div className="mt-4 grid gap-2">
            {activeValidations.length ? (
              activeValidations.map((validation) => (
                <div key={validation.opportunityCode} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-black/15 px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{validation.opportunityTitle}</p>
                    <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">
                      Parou em: {validation.currentStepLabel || "sem etapa"}{validation.blockedReason ? ` / ${validation.blockedReason}` : ""}
                    </p>
                  </div>
                  <ValidationProgress validation={validation} compact />
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--admin-muted)]">Sem imóveis pendentes nesta lista.</p>
            )}
          </div>
        </div>
      </div>
    </DashboardCard>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
}) {
  return (
    <article className={cn("min-h-24 rounded-lg border px-4 py-3", toneBorder[tone])}>
      <p className="text-xs text-[var(--admin-muted)]">{label}</p>
      <div className="mt-3 font-mono text-2xl font-bold">{value}</div>
      <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">{detail}</p>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="grid min-h-80 place-items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-10 text-center">
      <div>
        <Database className="mx-auto mb-3 text-[var(--admin-muted)]" size={28} />
        <h2 className="text-lg font-semibold text-white">Nenhum imóvel captado</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--admin-muted)]">
          A vitrine aparece assim que a Renata ou a entrada manual criar o primeiro imóvel.
        </p>
      </div>
    </div>
  );
}

function PropertyCard({
  opportunity,
  snapshot,
  validation,
}: {
  opportunity: WorkspaceOpportunity;
  snapshot?: WorkspaceSnapshot;
  validation?: WorkspaceValidationRun;
}) {
  const imageUrl = getPrimaryImage(opportunity);
  const imagesCount = opportunity.images?.length || 0;
  const location = [opportunity.city, opportunity.state].filter(Boolean).join("/");
  const due = daysUntil(opportunity.auctionDate);
  const detailHref = `/admin/oportunidades/${opportunity.id}`;
  const sourceUrl = snapshot?.sourceUrl;

  return (
    <article className="group flex min-h-[520px] flex-col overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] transition hover:border-[rgba(255,122,24,0.42)] hover:bg-[rgba(255,255,255,0.035)]">
      <Link href={detailHref} className="block">
        <div className="relative aspect-[16/10] border-b border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={opportunity.title}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
            />
          ) : (
            <div className="grid h-full place-items-center text-[var(--admin-muted)]">
              <Home size={36} className="opacity-30" />
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            <span className="rounded-md border border-black/35 bg-black/72 px-2 py-1 text-[10px] font-bold uppercase text-white">
              {opportunity.propertyType || "Imóvel"}
            </span>
            {imagesCount ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-black/35 bg-black/72 px-2 py-1 font-mono text-[10px] font-bold text-white">
                <Camera size={11} />
                {imagesCount}
              </span>
            ) : null}
          </div>

          <StatusBadge
            tone={getStatusTone(opportunity.stage)}
            className="absolute bottom-3 left-3 border-black/35 bg-black/72"
          >
            {opportunity.stage}
          </StatusBadge>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <Link href={detailHref} className="min-w-0">
            <h2 className="line-clamp-2 text-base font-semibold leading-6 text-white transition group-hover:text-[var(--admin-orange)]">
              {opportunity.title}
            </h2>
          </Link>
          <ScoreBadge score={opportunity.opportunityScore} className="h-9 min-w-12" />
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--admin-muted)]">
          <MapPin size={14} className="shrink-0" />
          <span className="truncate">{location || "Localização não informada"}</span>
        </div>

        <p className="mt-3 line-clamp-3 min-h-16 text-sm leading-6 text-[var(--admin-soft)]">
          {opportunity.summary || opportunity.address || "Descrição em validação pela curadoria."}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Lance</p>
            <p className="mt-2 truncate font-mono text-base font-bold text-white">
              {formatCurrency(opportunity.initialBid)}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
              Avaliação
            </p>
            <p className="mt-2 truncate font-mono text-base font-bold text-[var(--admin-green)]">
              {formatCurrency(opportunity.appraisalValue)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone="green">{opportunity.discountPct}% desconto</StatusBadge>
          <RiskBadge score={opportunity.riskScore} className="h-7 min-w-10" />
          <span className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--admin-border)] px-2 font-mono text-[10px] text-[var(--admin-muted)]">
            <CalendarDays size={12} />
            {formatShortDate(opportunity.auctionDate)}
            {due !== null && due >= 0 ? ` / ${due}d` : ""}
          </span>
        </div>

        <div className="mt-4">
          <ValidationProgress validation={validation} />
          <ValidationStepChips validation={validation} />
        </div>

        <div className="mt-4 border-t border-[var(--admin-border)] pt-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{opportunity.sourceName || "Fonte"}</p>
              <p className="mt-1 truncate text-[var(--admin-muted)]">{opportunity.address || opportunity.nextAction}</p>
            </div>
            <StatusBadge tone={getStatusTone(opportunity.legalStatus)}>{opportunity.legalStatus}</StatusBadge>
          </div>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
          <Link
            href={detailHref}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(255,122,24,0.36)] bg-[rgba(255,122,24,0.12)] px-3 text-xs font-semibold text-[var(--admin-orange)] transition hover:bg-[rgba(255,122,24,0.2)] hover:text-white"
          >
            <FileText size={14} />
            Ver descrição completa
          </Link>
          {sourceUrl ? (
            <Link
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-3 text-xs font-semibold text-[var(--admin-muted)] transition hover:text-white"
            >
              Fonte
              <ArrowUpRight size={13} />
            </Link>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function OpportunityWorkspacePage({
  module,
  opportunities,
  snapshots,
  validations,
  source,
  reason,
}: {
  module: WorkspaceModule;
  opportunities: WorkspaceOpportunity[];
  snapshots: WorkspaceSnapshot[];
  validations: WorkspaceValidationRun[];
  source: string;
  reason?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("todos");
  const [category, setCategory] = useState<CategoryFilter>("todos");

  const snapshotsByOpportunity = useMemo(() => {
    const map = new Map<string, WorkspaceSnapshot[]>();
    for (const snapshot of snapshots) {
      if (!snapshot.opportunityCode) continue;
      const current = map.get(snapshot.opportunityCode) || [];
      current.push(snapshot);
      map.set(snapshot.opportunityCode, current);
    }
    return map;
  }, [snapshots]);

  const validationsByOpportunity = useMemo(() => {
    const map = new Map<string, WorkspaceValidationRun>();
    for (const validation of validations) {
      if (!validation.opportunityCode) continue;
      map.set(validation.opportunityCode, validation);
    }
    return map;
  }, [validations]);

  const qualifiedOpportunityCodes = useMemo(() => new Set(opportunities.map((item) => item.id)), [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const text = normalizeText(query);

    return opportunities.filter((item) => {
      if (category !== "todos" && classifyPropertyCategory(item) !== category) return false;
      const bucket = classifyOpportunity(item);
      if (filter !== "todos" && filter !== "com_foto" && bucket !== filter) return false;
      if (filter === "com_foto" && !getPrimaryImage(item)) return false;
      if (!text) return true;

      const haystack = normalizeText(
        [
          item.title,
          item.propertyType,
          item.address,
          item.city,
          item.state,
          item.sourceName,
          item.stage,
          item.aiStatus,
          item.legalStatus,
          item.nextAction,
          item.summary,
        ].join(" ")
      );

      return haystack.includes(text);
    });
  }, [category, filter, opportunities, query]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilter, number>();
    counts.set("todos", opportunities.length);

    for (const opportunity of opportunities) {
      const key = classifyPropertyCategory(opportunity);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return counts;
  }, [opportunities]);

  const urgentCount = opportunities.filter((item) => {
    const days = daysUntil(item.auctionDate);
    return days !== null && days >= 0 && days <= 3;
  }).length;
  const rawCaptureCount = snapshots.length;
  const notVisibleCount = Math.max(rawCaptureCount - opportunities.length, 0);
  const revisaoCount = opportunities.filter((item) => classifyOpportunity(item) === "revisao").length;
  const readyCount = opportunities.filter((item) => classifyOpportunity(item) === "pronto").length;
  const withPhotoCount = opportunities.filter((item) => Boolean(getPrimaryImage(item))).length;

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(255,122,24,0.32)] bg-[rgba(255,122,24,0.1)] px-3 text-xs font-semibold text-[var(--admin-orange)]">
              <Gavel size={15} />
              {module.eyebrow}
            </div>
            <h1 className="text-2xl font-semibold text-white">{module.title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">{module.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={source === "supabase" ? "green" : "purple"}>{source}</StatusBadge>
            <StatusBadge tone={getStatusTone(module.statusLabel)}>{module.statusLabel}</StatusBadge>
            <Button
              asChild
              variant="outline"
              className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href="/admin/scraper">
                <TimerReset size={15} />
                Scraper
              </Link>
            </Button>
            <form action={backfillOpportunityImagesAction}>
              <Button
                type="submit"
                variant="outline"
                className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
              >
                <Camera size={15} />
                Atualizar fotos
              </Button>
            </form>
            <Button asChild className="h-9 bg-[var(--admin-orange)] text-black hover:bg-white">
              <Link href="/admin/oportunidades/nova">
                <FileText size={15} />
                Novo imóvel
              </Link>
            </Button>
          </div>
        </div>
        {reason ? <p className="mt-3 text-xs text-[var(--admin-muted)]">{reason}</p> : null}
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Qualificados" value={String(opportunities.length)} detail={`${rawCaptureCount} snapshots; ${notVisibleCount} fora/duplicados`} tone="cyan" />
        <MetricTile label="Com foto" value={String(withPhotoCount)} detail="prontos para vitrine" tone={metricTone(withPhotoCount, "green")} />
        <MetricTile label="Em revisão" value={String(revisaoCount)} detail="jurídico ou humano" tone={metricTone(revisaoCount, "yellow")} />
        <MetricTile label="Urgentes" value={String(urgentCount)} detail="leilão em até 3 dias" tone={metricTone(urgentCount, "red")} />
      </section>

      <section className="mb-4">
        <ValidationPipelinePanel
          validations={validations}
          snapshots={snapshots}
          qualifiedCodes={qualifiedOpportunityCodes}
        />
      </section>

      <DashboardCard
        title="Vitrine de imóveis captados"
        eyebrow="foto / descrição / valor"
        action={
          <div className="relative w-56 sm:w-80">
            <Search
              size={15}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por título, cidade ou fonte"
              className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] pl-8 text-sm text-white"
            />
          </div>
        }
      >
        <div className="-mx-1 mb-4 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2 border-b border-[var(--admin-border)] pb-3">
            {categoryTabs.map((tab) => {
              const isActive = category === tab.key;
              const count = categoryCounts.get(tab.key) || 0;

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setCategory(tab.key)}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
                    isActive
                      ? "border-[rgba(255,122,24,0.62)] bg-[var(--admin-orange)] text-black"
                      : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] text-[var(--admin-soft)] hover:border-[rgba(255,122,24,0.36)] hover:text-white"
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                      isActive ? "bg-black/15 text-black" : "bg-[rgba(255,255,255,0.08)] text-[var(--admin-muted)]"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["todos", "com_foto", "entrada", "revisao", "risco", "pronto"] as WorkspaceFilter[]).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={filter === item ? "default" : "outline"}
              aria-pressed={filter === item}
              onClick={() => setFilter(item)}
              className={cn(
                "h-8",
                filter === item
                  ? "bg-[var(--admin-orange)] text-black hover:bg-white"
                  : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
              )}
            >
              {filterLabel(item)}
            </Button>
          ))}
        </div>

        {filteredOpportunities.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredOpportunities.map((opportunity) => (
              <PropertyCard
                key={opportunity.id}
                opportunity={opportunity}
                snapshot={snapshotsByOpportunity.get(opportunity.id)?.[0]}
                validation={validationsByOpportunity.get(opportunity.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}

        {readyCount > 0 ? (
          <p className="mt-4 text-xs text-[var(--admin-muted)]">
            {readyCount === 1
              ? "1 imóvel está classificado como pronto para avançar depois da revisão operacional."
              : `${readyCount} imóveis estão classificados como prontos para avançar depois da revisão operacional.`}
          </p>
        ) : null}
      </DashboardCard>
    </div>
  );
}
