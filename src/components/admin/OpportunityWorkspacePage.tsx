"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Columns3,
  Database,
  Download,
  FileText,
  Gavel,
  ImageOff,
  LayoutGrid,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  TimerReset,
  UploadCloud,
  X,
} from "lucide-react";
import { backfillOpportunityImagesAction, refreshOpportunityValidationPipelineAction } from "@/app/admin/oportunidades/actions";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

type WorkspaceFilter = "todos" | "entrada" | "revisao" | "risco" | "pronto" | "com_foto" | "sem_foto" | "sem_valor";
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
type ViewMode = "table" | "cards";
type SortKey = "priority" | "score" | "risk" | "discount" | "bid" | "auctionDate" | "title";
type Density = "comfortable" | "compact";

const categoryTabs: Array<{ key: CategoryFilter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "imoveis", label: "Imoveis" },
  { key: "terrenos", label: "Terrenos" },
  { key: "lotes", label: "Lotes" },
  { key: "casas", label: "Casas" },
  { key: "apartamentos", label: "Apartamentos" },
  { key: "predios", label: "Predios" },
  { key: "comerciais", label: "Comerciais" },
  { key: "rurais", label: "Rurais" },
];

const quickFilters: Array<{ key: WorkspaceFilter; label: string }> = [
  { key: "todos", label: "Todos" },
  { key: "pronto", label: "Prontos" },
  { key: "revisao", label: "Revisao" },
  { key: "risco", label: "Bloqueados" },
  { key: "entrada", label: "Entrada" },
  { key: "com_foto", label: "Com foto" },
  { key: "sem_foto", label: "Sem foto" },
  { key: "sem_valor", label: "Sem valor" },
];

const savedViews: Array<{
  key: string;
  label: string;
  filter: WorkspaceFilter;
  category?: CategoryFilter;
  sort?: SortKey;
}> = [
  { key: "prontos", label: "Prontos para decisao", filter: "pronto", sort: "score" },
  { key: "bloqueados", label: "Bloqueados", filter: "risco", sort: "risk" },
  { key: "alto-potencial", label: "Alto potencial", filter: "todos", sort: "score" },
  { key: "sem-foto", label: "Sem foto", filter: "sem_foto", sort: "priority" },
  { key: "sem-avaliacao", label: "Sem avaliacao", filter: "sem_valor", sort: "priority" },
  { key: "revisao-pendente", label: "Revisao pendente", filter: "revisao", sort: "auctionDate" },
];

const pipelineStages = [
  { key: "capturado", label: "Capturado" },
  { key: "catalogado", label: "Catalogado" },
  { key: "enriquecido", label: "Enriquecido" },
  { key: "revisao", label: "Revisao humana" },
  { key: "juridico", label: "Juridico" },
  { key: "decisao", label: "Decisao" },
] as const;

const workflowPipelineParamMap: Record<string, string> = {
  market_review: "revisao",
  legal_review: "juridico",
  validation: "decisao",
  creative: "decisao",
  communication: "decisao",
};

const columnLabels = {
  photo: "Foto",
  property: "Imovel",
  location: "Localizacao",
  type: "Tipo",
  source: "Origem",
  bid: "Lance",
  appraisal: "Avaliacao",
  discount: "Desconto",
  score: "Score",
  risk: "Risco",
  stage: "Etapa",
  status: "Status",
  owner: "Responsavel",
  updated: "Atualizacao",
  actions: "Acoes",
};

type ColumnKey = keyof typeof columnLabels;

const defaultColumns: Record<ColumnKey, boolean> = {
  photo: true,
  property: true,
  location: true,
  type: true,
  source: true,
  bid: true,
  appraisal: true,
  discount: true,
  score: true,
  risk: true,
  stage: true,
  status: true,
  owner: true,
  updated: true,
  actions: true,
};

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(59,130,246,0.26)] bg-[rgba(59,130,246,0.07)] text-blue-700",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.07)] text-[var(--admin-green)]",
  yellow: "border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] text-[var(--admin-yellow)]",
  red: "border-[rgba(239,68,68,0.26)] bg-[rgba(239,68,68,0.07)] text-[var(--admin-red)]",
  purple: "border-[rgba(139,92,246,0.22)] bg-[rgba(139,92,246,0.07)] text-[var(--admin-purple)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] text-[var(--admin-muted)]",
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatCurrency(value: number) {
  if (!value) return "Valor nao informado";
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatShortDate(value: string) {
  if (!value) return "sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return shortDateFormatter.format(date);
}

function formatDateTime(value: string) {
  if (!value) return "sem data";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return dateTimeFormatter.format(date);
}

function hasMarketValue(item: WorkspaceOpportunity) {
  return item.initialBid > 0 || item.appraisalValue > 0;
}

function getPrimaryImage(item: WorkspaceOpportunity) {
  const images = item.images || [];
  return images.find((image) => image.status === "mirrored")?.url || images.find((image) => image.status !== "failed")?.url || "";
}

function daysUntil(value: string) {
  if (!value) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((date.getTime() - base) / 86_400_000);
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
  if (text.includes("comercial") || text.includes("sala") || text.includes("loja") || text.includes("galpao")) return "comerciais";
  if (text.includes("rural") || text.includes("fazenda") || text.includes("sitio") || text.includes("chacara")) return "rurais";

  return "imoveis";
}

function filterLabel(filter: WorkspaceFilter) {
  return quickFilters.find((item) => item.key === filter)?.label || "Todos";
}

function pipelineStageFromParam(value: string | null) {
  const normalized = value ? normalizeText(value) : "";
  const mapped = workflowPipelineParamMap[normalized] || normalized;
  return pipelineStages.some((stage) => stage.key === mapped) ? mapped : "todos";
}

function riskLevel(score: number) {
  if (!score) return { label: "Nao avaliado", tone: "muted" as ResourceTone };
  if (score >= 80) return { label: "Critico", tone: "red" as ResourceTone };
  if (score >= 65) return { label: "Alto", tone: "red" as ResourceTone };
  if (score >= 45) return { label: "Moderado", tone: "yellow" as ResourceTone };
  return { label: "Baixo", tone: "green" as ResourceTone };
}

function scoreLabel(score: number) {
  if (!score) return "Nao calculado";
  if (score >= 90) return "Excelente";
  if (score >= 75) return "Bom potencial";
  if (score >= 60) return "Exige analise";
  return "Baixa prioridade";
}

function operationalStatus(item: WorkspaceOpportunity, validation?: WorkspaceValidationRun) {
  if (validation?.overallStatus === "completed") return "Pronto para decisao";
  if (validation?.overallStatus === "blocked" || validation?.overallStatus === "discarded") return "Bloqueado";
  if (validation?.overallStatus === "in_review") return "Aguardando revisao";
  const bucket = classifyOpportunity(item);
  if (bucket === "risco") return "Bloqueado";
  if (bucket === "revisao") return "Aguardando revisao";
  if (bucket === "entrada") return "Em analise";
  return "Pronto para decisao";
}

function stageForOpportunity(item: WorkspaceOpportunity, validation?: WorkspaceValidationRun) {
  const text = normalizeText(`${validation?.currentStepLabel || ""} ${validation?.currentStepKey || ""} ${item.stage} ${item.nextAction}`);
  if (text.includes("jurid")) return "juridico";
  if (text.includes("humana") || text.includes("humano") || text.includes("review") || text.includes("revisao")) return "revisao";
  if (text.includes("validacao") || text.includes("criativo") || text.includes("comunicacao")) return "decisao";
  if (text.includes("enriq") || text.includes("mercado") || text.includes("curadoria")) return "enriquecido";
  if (text.includes("catalog") || text.includes("dados") || text.includes("foto")) return "catalogado";
  if (validation?.overallStatus === "completed" || text.includes("decis")) return "decisao";
  return "capturado";
}

function dataQuality(item: WorkspaceOpportunity, validation?: WorkspaceValidationRun) {
  const checks = [
    Boolean(getPrimaryImage(item)),
    hasMarketValue(item),
    Boolean(item.address || item.city),
    Boolean(item.sourceName),
    Boolean(item.summary),
    Boolean(validation?.persisted || validation?.overallStatus),
  ];
  const passed = checks.filter(Boolean).length;
  return { passed, total: checks.length, pct: Math.round((passed / checks.length) * 100) };
}

function latestValidationDate(validation?: WorkspaceValidationRun) {
  const dates = validation?.steps.map((step) => step.finishedAt).filter(Boolean) || [];
  return dates.sort().at(-1) || "";
}

function latestDateForOpportunity(
  item: WorkspaceOpportunity,
  snapshot?: WorkspaceSnapshot,
  validation?: WorkspaceValidationRun
) {
  return latestValidationDate(validation) || snapshot?.collectedAt || item.auctionDate || "";
}

function priorityScore(item: WorkspaceOpportunity, validation?: WorkspaceValidationRun) {
  let score = 0;
  if (validation?.overallStatus === "blocked" || validation?.overallStatus === "discarded") score += 70;
  if (classifyOpportunity(item) === "risco") score += 60;
  if (!hasMarketValue(item)) score += 24;
  if (!getPrimaryImage(item)) score += 16;
  if (item.riskScore >= 70) score += 28;
  const due = daysUntil(item.auctionDate);
  if (due !== null && due >= 0 && due <= 3) score += 12;
  return score;
}

function exportCsv(rows: WorkspaceOpportunity[]) {
  const headers = ["codigo", "titulo", "cidade", "estado", "tipo", "fonte", "lance", "avaliacao", "desconto", "score", "risco", "status"];
  const body = rows.map((item) =>
    [
      item.id,
      item.title,
      item.city,
      item.state,
      item.propertyType,
      item.sourceName,
      item.initialBid,
      item.appraisalValue,
      item.discountPct,
      item.opportunityScore,
      item.riskScore,
      item.aiStatus,
    ]
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[headers.join(","), ...body].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "imoveis-analisados.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function MetricTile({
  label,
  value,
  detail,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className={cn("grid size-8 place-items-center rounded-md border", toneBorder[tone])}>{icon}</span>
        {active ? <span className="rounded-md bg-[rgba(200,90,31,0.1)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-orange)]">Filtro ativo</span> : null}
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="font-mono text-2xl font-bold text-[var(--admin-foreground)]">{value}</span>
      </div>
      <p className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">{label}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>
    </>
  );

  if (!onClick) {
    return <article className="rounded-lg border border-[var(--admin-border)] bg-white p-3 shadow-sm">{content}</article>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-[rgba(200,90,31,0.38)] hover:shadow-md",
        active ? "border-[rgba(200,90,31,0.55)] ring-2 ring-[rgba(200,90,31,0.08)]" : "border-[var(--admin-border)]"
      )}
    >
      {content}
    </button>
  );
}

function OpportunityScore({ score }: { score: number }) {
  return (
    <div className="inline-flex min-w-32 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-2 py-1">
      <ScoreBadge score={score} />
      <span className="min-w-0 text-[11px] font-medium leading-4 text-[var(--admin-muted)]">{scoreLabel(score)}</span>
    </div>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const stageMeta = pipelineStages.find((item) => item.key === stage);
  return <StatusBadge tone="purple">{stageMeta?.label || stage}</StatusBadge>;
}

function RiskLevelBadge({ score, flags = 0 }: { score: number; flags?: number }) {
  const level = riskLevel(score);
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold", toneBorder[level.tone])}>
      {level.tone === "red" ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
      {level.label}
      {flags ? <span className="font-mono text-[10px] opacity-75">{flags}</span> : null}
    </span>
  );
}

function DataQualityIndicator({ passed, total }: { passed: number; total: number }) {
  const tone: ResourceTone = passed === total ? "green" : passed >= total - 1 ? "yellow" : "red";
  return (
    <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-semibold", toneBorder[tone])}>
      <Database size={13} />
      {passed}/{total} dados
    </span>
  );
}

function ProgressBar({ value, tone = "green" }: { value: number; tone?: ResourceTone }) {
  const color =
    tone === "red"
      ? "bg-[var(--admin-red)]"
      : tone === "yellow"
        ? "bg-[var(--admin-yellow)]"
        : tone === "purple"
          ? "bg-[var(--admin-purple)]"
          : "bg-[var(--admin-green)]";

  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(129,117,104,0.16)]">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MoreActionsMenu({
  onExport,
  canManageImports,
}: {
  onExport: () => void;
  canManageImports: boolean;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] shadow-sm transition hover:border-[rgba(200,90,31,0.35)]">
        <MoreHorizontal size={15} />
        Mais acoes
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-[var(--admin-border)] bg-white p-2 shadow-xl shadow-[rgba(81,60,36,0.12)]">
        {canManageImports ? (
          <MenuLink href="/admin/scraper" icon={<TimerReset size={14} />} label="Analise de mercado" />
        ) : null}
        <form action={backfillOpportunityImagesAction}>
          <MenuButton type="submit" icon={<Camera size={14} />} label="Atualizar fotos" />
        </form>
        <form action={refreshOpportunityValidationPipelineAction}>
          <MenuButton type="submit" icon={<ListChecks size={14} />} label="Atualizar validacao" />
        </form>
        {canManageImports ? (
          <MenuLink href="/admin/fontes/capturas" icon={<UploadCloud size={14} />} label="Importar imoveis" />
        ) : null}
        <MenuButton type="button" onClick={onExport} icon={<Download size={14} />} label="Exportar dados" />
        {canManageImports ? (
          <MenuLink href="/admin/fontes" icon={<Settings2 size={14} />} label="Configurar captura" />
        ) : null}
      </div>
    </details>
  );
}

function MenuLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href} className="flex h-9 items-center gap-2 rounded-md px-2 text-sm text-[var(--admin-soft)] hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]">
      {icon}
      {label}
    </Link>
  );
}

function MenuButton({
  type,
  onClick,
  icon,
  label,
}: {
  type: "button" | "submit";
  onClick?: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-[var(--admin-soft)] hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]"
    >
      {icon}
      {label}
    </button>
  );
}

function BulkActionBar({
  count,
  onClear,
  onExport,
  firstSelectedHref,
}: {
  count: number;
  onClear: () => void;
  onExport: () => void;
  firstSelectedHref?: string;
}) {
  if (!count) return null;

  return (
    <div className="sticky top-3 z-20 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[rgba(200,90,31,0.28)] bg-white px-3 py-2 shadow-lg shadow-[rgba(81,60,36,0.12)]">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={16} className="text-[var(--admin-orange)]" />
        <span className="text-sm font-semibold text-[var(--admin-foreground)]">{count} selecionado(s)</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {firstSelectedHref ? (
          <Button asChild size="sm" variant="outline" className="border-[var(--admin-border)] bg-white">
            <Link href={firstSelectedHref}>Abrir primeiro</Link>
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onExport} className="border-[var(--admin-border)] bg-white">
          Exportar
        </Button>
        <Button type="button" size="sm" variant="outline" disabled className="border-[var(--admin-border)] bg-white">
          Atribuir responsavel
        </Button>
        <Button type="button" size="sm" variant="outline" disabled className="border-[var(--admin-border)] bg-white">
          Alterar etapa
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          Limpar
        </Button>
      </div>
    </div>
  );
}

function ValidationPipeline({
  opportunities,
  validationsByOpportunity,
  activeStage,
  onStageChange,
}: {
  opportunities: WorkspaceOpportunity[];
  validationsByOpportunity: Map<string, WorkspaceValidationRun>;
  activeStage: string;
  onStageChange: (stage: string) => void;
}) {
  const total = opportunities.length || 1;
  const stats = pipelineStages.map((stage) => {
    const items = opportunities.filter((item) => stageForOpportunity(item, validationsByOpportunity.get(item.id)) === stage.key);
    const completed = items.filter((item) => validationsByOpportunity.get(item.id)?.overallStatus === "completed").length;
    const blocked = items.filter((item) => {
      const validation = validationsByOpportunity.get(item.id);
      return validation?.overallStatus === "blocked" || validation?.overallStatus === "discarded" || classifyOpportunity(item) === "risco";
    }).length;
    const pending = Math.max(items.length - completed - blocked, 0);
    return { ...stage, count: items.length, completed, blocked, pending, pct: Math.round((items.length / total) * 100) };
  });

  return (
    <DashboardCard
      title="Pipeline operacional"
      eyebrow="captura / catalogo / decisao"
      action={
        <form action={refreshOpportunityValidationPipelineAction}>
          <Button type="submit" variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-xs">
            <RefreshCcw size={14} />
            Atualizar
          </Button>
        </form>
      }
      contentClassName="p-3"
    >
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="grid min-w-[860px] grid-cols-6 gap-2">
          {stats.map((stage) => {
            const active = activeStage === stage.key;
            const tone: ResourceTone = stage.blocked ? "red" : stage.pending ? "yellow" : stage.completed ? "green" : "muted";
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => onStageChange(active ? "todos" : stage.key)}
                className={cn(
                  "rounded-lg border bg-white p-3 text-left transition hover:border-[rgba(200,90,31,0.38)]",
                  active ? "border-[rgba(200,90,31,0.55)] ring-2 ring-[rgba(200,90,31,0.08)]" : "border-[var(--admin-border)]"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--admin-foreground)]">{stage.label}</span>
                  <span className={cn("rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold", toneBorder[tone])}>
                    {stage.pct}%
                  </span>
                </div>
                <div className="mt-3 font-mono text-2xl font-bold text-[var(--admin-foreground)]">{stage.count}</div>
                <ProgressBar value={stage.pct} tone={tone} />
                <div className="mt-2 grid grid-cols-3 gap-1 text-[10px] text-[var(--admin-muted)]">
                  <span>{stage.completed} ok</span>
                  <span>{stage.pending} pend.</span>
                  <span>{stage.blocked} bloq.</span>
                </div>
                <p className="mt-2 text-[10px] text-[var(--admin-muted)]">Tempo medio: sem historico</p>
              </button>
            );
          })}
        </div>
      </div>
    </DashboardCard>
  );
}

function AttentionQueue({
  items,
  validationsByOpportunity,
}: {
  items: WorkspaceOpportunity[];
  validationsByOpportunity: Map<string, WorkspaceValidationRun>;
}) {
  const priorityItems = items
    .map((item) => ({ item, validation: validationsByOpportunity.get(item.id), priority: priorityScore(item, validationsByOpportunity.get(item.id)) }))
    .filter(({ priority }) => priority > 0)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5);

  const blocked = items.filter((item) => classifyOpportunity(item) === "risco").length;
  const review = items.filter((item) => classifyOpportunity(item) === "revisao").length;
  const insufficient = items.filter((item) => !hasMarketValue(item) || !getPrimaryImage(item)).length;
  const captureErrors = priorityItems.filter(({ validation }) => validation?.overallStatus === "discarded").length;
  const overdue = items.filter((item) => {
    const due = daysUntil(item.auctionDate);
    return due !== null && due >= 0 && due <= 3;
  }).length;

  return (
    <DashboardCard title="Fila de atencao" eyebrow="bloqueios / prioridade" contentClassName="p-3">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Bloqueados" value={blocked} tone="red" />
        <MiniStat label="Aguardando revisao" value={review} tone="yellow" />
        <MiniStat label="Dados insuficientes" value={insufficient} tone="purple" />
        <MiniStat label="Erro de captura" value={captureErrors} tone="red" />
        <MiniStat label="Acima do prazo" value={overdue} tone="yellow" />
      </div>

      <div className="mt-3 grid gap-2">
        {priorityItems.length ? (
          priorityItems.map(({ item, validation, priority }) => {
            const missingValue = !hasMarketValue(item);
            const missingPhoto = !getPrimaryImage(item);
            const reason =
              validation?.blockedReason ||
              validation?.currentStepLabel ||
              (missingValue ? "Valor financeiro pendente" : missingPhoto ? "Foto real pendente" : item.nextAction || "Revisao operacional");
            const stage = stageForOpportunity(item, validation);
            return (
              <div key={item.id} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-white p-3 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/oportunidades/${item.id}`} className="truncate text-sm font-semibold text-[var(--admin-foreground)] hover:text-[var(--admin-orange)]">
                      {item.title}
                    </Link>
                    <StageBadge stage={stage} />
                    <StatusBadge tone={priority >= 70 ? "red" : "yellow"}>{priority >= 70 ? "alta" : "media"}</StatusBadge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-[var(--admin-muted)]">{reason}</p>
                  <p className="mt-1 text-[11px] text-[var(--admin-muted)]">
                    Responsavel: {item.owner || "nao definido"} / Tempo parado: sem historico de SLA
                  </p>
                </div>
                <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
                  <Button asChild size="sm" className="bg-[var(--admin-orange)] text-black hover:bg-white">
                    <Link href={`/admin/oportunidades/${item.id}`}>Abrir</Link>
                  </Button>
                  <form action={refreshOpportunityValidationPipelineAction}>
                    <Button type="submit" size="sm" variant="outline" className="border-[var(--admin-border)] bg-white">
                      Revisar
                    </Button>
                  </form>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-[var(--admin-border)] bg-white p-4 text-sm text-[var(--admin-muted)]">
            Nenhuma pendencia prioritaria com os filtros atuais.
          </div>
        )}
      </div>

      <div className="mt-3">
        <Button type="button" variant="outline" size="sm" className="border-[var(--admin-border)] bg-white">
          Ver todas as pendencias
        </Button>
      </div>
    </DashboardCard>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: ResourceTone }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.72)] px-3 py-2">
      <div className={cn("font-mono text-lg font-bold", tone === "red" ? "text-[var(--admin-red)]" : tone === "yellow" ? "text-[var(--admin-yellow)]" : "text-[var(--admin-foreground)]")}>
        {value}
      </div>
      <p className="text-xs text-[var(--admin-muted)]">{label}</p>
    </div>
  );
}

function OpportunitiesTable({
  items,
  snapshotsByOpportunity,
  validationsByOpportunity,
  selectedIds,
  visibleColumns,
  density,
  sort,
  onSort,
  onToggle,
  onToggleAll,
}: {
  items: WorkspaceOpportunity[];
  snapshotsByOpportunity: Map<string, WorkspaceSnapshot[]>;
  validationsByOpportunity: Map<string, WorkspaceValidationRun>;
  selectedIds: Set<string>;
  visibleColumns: Record<ColumnKey, boolean>;
  density: Density;
  sort: SortKey;
  onSort: (sort: SortKey) => void;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const allSelected = items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const rowPadding = density === "compact" ? "py-2" : "py-3";

  return (
    <div className="hidden overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white lg:block">
      <div className="max-h-[720px] overflow-auto">
        <Table className="min-w-[1420px]">
          <TableHeader className="sticky top-0 z-10 bg-[#f7f2ea] shadow-sm">
            <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 w-11 bg-[#f7f2ea] px-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  aria-label="Selecionar todos os imoveis da pagina"
                  className="size-4 rounded border-[var(--admin-border)]"
                />
              </TableHead>
              {Object.entries(columnLabels).map(([key, label]) => {
                const column = key as ColumnKey;
                if (!visibleColumns[column]) return null;
                const sortable: Partial<Record<ColumnKey, SortKey>> = {
                  property: "title",
                  bid: "bid",
                  discount: "discount",
                  score: "score",
                  risk: "risk",
                  updated: "auctionDate",
                };
                return (
                  <TableHead key={key} className="h-11 whitespace-nowrap px-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                    {sortable[column] ? (
                      <button
                        type="button"
                        onClick={() => onSort(sortable[column]!)}
                        className={cn("inline-flex items-center gap-1", sort === sortable[column] && "text-[var(--admin-orange)]")}
                      >
                        {label}
                        <ArrowUpDown size={12} />
                      </button>
                    ) : (
                      label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const snapshot = snapshotsByOpportunity.get(item.id)?.[0];
              const validation = validationsByOpportunity.get(item.id);
              const imageUrl = getPrimaryImage(item);
              const stage = stageForOpportunity(item, validation);
              const status = operationalStatus(item, validation);
              const quality = dataQuality(item, validation);
              const sourceUrl = snapshot?.sourceUrl;
              const detailHref = `/admin/oportunidades/${item.id}`;

              return (
                <TableRow
                  key={item.id}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("a,button,input,summary")) return;
                    window.location.href = detailHref;
                  }}
                  className="cursor-pointer border-[var(--admin-border)] bg-white hover:bg-[rgba(184,122,22,0.05)]"
                >
                  <TableCell className="sticky left-0 z-10 bg-white px-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => onToggle(item.id)}
                      aria-label={`Selecionar ${item.title}`}
                      className="size-4 rounded border-[var(--admin-border)]"
                    />
                  </TableCell>
                  {visibleColumns.photo ? (
                    <TableCell className={cn("px-3", rowPadding)}>
                      <div className="relative size-14 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[var(--admin-card-2)]">
                        {imageUrl ? (
                          <Image src={imageUrl} alt={item.title} fill sizes="56px" unoptimized className="object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center text-[var(--admin-muted)]">
                            <ImageOff size={18} />
                          </div>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
                  {visibleColumns.property ? (
                    <TableCell className={cn("max-w-[330px] px-3", rowPadding)}>
                      <Link href={detailHref} className="line-clamp-2 font-semibold leading-5 text-[var(--admin-foreground)] hover:text-[var(--admin-orange)]">
                        {item.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="font-mono text-[10px] text-[var(--admin-muted)]">{item.id}</span>
                        <DataQualityIndicator passed={quality.passed} total={quality.total} />
                      </div>
                    </TableCell>
                  ) : null}
                  {visibleColumns.location ? <TableCell className={cn("px-3 text-sm text-[var(--admin-soft)]", rowPadding)}>{[item.city, item.state].filter(Boolean).join("/") || "nao informado"}</TableCell> : null}
                  {visibleColumns.type ? <TableCell className={cn("px-3 text-sm text-[var(--admin-soft)]", rowPadding)}>{item.propertyType || "imovel"}</TableCell> : null}
                  {visibleColumns.source ? <TableCell className={cn("px-3 text-sm text-[var(--admin-soft)]", rowPadding)}>{item.sourceName || "Fonte"}</TableCell> : null}
                  {visibleColumns.bid ? <TableCell className={cn("px-3 font-mono text-sm font-semibold text-[var(--admin-foreground)]", rowPadding)}>{formatCurrency(item.initialBid)}</TableCell> : null}
                  {visibleColumns.appraisal ? <TableCell className={cn("px-3 font-mono text-sm font-semibold text-[var(--admin-green)]", rowPadding)}>{formatCurrency(item.appraisalValue)}</TableCell> : null}
                  {visibleColumns.discount ? <TableCell className={cn("px-3", rowPadding)}><StatusBadge tone={item.discountPct > 0 ? "green" : "muted"}>{item.discountPct || 0}%</StatusBadge></TableCell> : null}
                  {visibleColumns.score ? <TableCell className={cn("px-3", rowPadding)}><OpportunityScore score={item.opportunityScore} /></TableCell> : null}
                  {visibleColumns.risk ? <TableCell className={cn("px-3", rowPadding)}><RiskLevelBadge score={item.riskScore} flags={item.riskFlags?.length || 0} /></TableCell> : null}
                  {visibleColumns.stage ? <TableCell className={cn("px-3", rowPadding)}><StageBadge stage={stage} /></TableCell> : null}
                  {visibleColumns.status ? <TableCell className={cn("px-3", rowPadding)}><StatusBadge tone={getStatusTone(status)}>{status}</StatusBadge></TableCell> : null}
                  {visibleColumns.owner ? <TableCell className={cn("px-3 text-sm text-[var(--admin-soft)]", rowPadding)}>{item.owner || "nao definido"}</TableCell> : null}
                  {visibleColumns.updated ? <TableCell className={cn("px-3 text-xs text-[var(--admin-muted)]", rowPadding)}>{formatDateTime(latestDateForOpportunity(item, snapshot, validation))}</TableCell> : null}
                  {visibleColumns.actions ? (
                    <TableCell className={cn("px-3 text-right", rowPadding)}>
                      <div className="flex justify-end gap-2">
                        {sourceUrl ? (
                          <Link href={sourceUrl} target="_blank" rel="noreferrer" className="grid size-8 place-items-center rounded-md border border-[var(--admin-border)] text-[var(--admin-muted)] hover:text-[var(--admin-foreground)]">
                            <ArrowUpRight size={14} />
                            <span className="sr-only">Abrir anuncio original</span>
                          </Link>
                        ) : null}
                        <Link href={detailHref} className="grid size-8 place-items-center rounded-md border border-[rgba(200,90,31,0.28)] text-[var(--admin-orange)] hover:bg-[rgba(200,90,31,0.08)]">
                          <FileText size={14} />
                          <span className="sr-only">Abrir oportunidade</span>
                        </Link>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function OpportunityCard({
  opportunity,
  snapshot,
  validation,
  selected,
  onToggle,
}: {
  opportunity: WorkspaceOpportunity;
  snapshot?: WorkspaceSnapshot;
  validation?: WorkspaceValidationRun;
  selected: boolean;
  onToggle: () => void;
}) {
  const imageUrl = getPrimaryImage(opportunity);
  const detailHref = `/admin/oportunidades/${opportunity.id}`;
  const sourceUrl = snapshot?.sourceUrl;
  const location = [opportunity.city, opportunity.state].filter(Boolean).join("/");
  const quality = dataQuality(opportunity, validation);
  const stage = stageForOpportunity(opportunity, validation);
  const status = operationalStatus(opportunity, validation);
  const due = daysUntil(opportunity.auctionDate);

  return (
    <article className="group flex min-h-[470px] flex-col overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white shadow-sm transition hover:border-[rgba(200,90,31,0.42)] hover:shadow-md">
      <div className="relative aspect-[16/10] border-b border-[var(--admin-border)] bg-[var(--admin-card-2)]">
        <Link href={detailHref} className="relative block h-full">
          {imageUrl ? (
            <Image src={imageUrl} alt={opportunity.title} fill sizes="(max-width: 768px) 100vw, 420px" unoptimized className="object-cover transition duration-300 group-hover:scale-[1.025]" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-[var(--admin-muted)]">
              <ImageOff size={32} className="opacity-55" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-yellow)]">Sem foto real</span>
              <span className="max-w-48 text-xs leading-5">Banner, logo ou imagem tecnica foi ignorada pela captura.</span>
            </div>
          )}
        </Link>
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <StatusBadge tone="muted" className="border-black/25 bg-black/70 text-white">{opportunity.propertyType || "Imovel"}</StatusBadge>
          <StageBadge stage={stage} />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Selecionar ${opportunity.title}`}
          className={cn(
            "absolute right-3 top-3 grid size-8 place-items-center rounded-md border border-black/20 bg-white/92 text-[var(--admin-muted)] shadow-sm",
            selected && "bg-[var(--admin-orange)] text-black"
          )}
        >
          <CheckCircle2 size={16} />
        </button>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={detailHref} className="line-clamp-2 text-base font-semibold leading-6 text-[var(--admin-foreground)] hover:text-[var(--admin-orange)]">
              {opportunity.title}
            </Link>
            <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--admin-muted)]">
              <MapPin size={14} className="shrink-0" />
              <span className="truncate">{location || "Localizacao nao informada"}</span>
            </div>
          </div>
          <ScoreBadge score={opportunity.opportunityScore} className="h-9 min-w-12" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <ValueBlock label="Lance" value={formatCurrency(opportunity.initialBid)} />
          <ValueBlock label="Avaliacao" value={formatCurrency(opportunity.appraisalValue)} strong />
          <ValueBlock label="Desconto" value={`${opportunity.discountPct || 0}%`} />
          <ValueBlock label="Potencial" value={scoreLabel(opportunity.opportunityScore)} />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge tone={getStatusTone(status)}>{status}</StatusBadge>
          <RiskLevelBadge score={opportunity.riskScore} flags={opportunity.riskFlags?.length || 0} />
          <DataQualityIndicator passed={quality.passed} total={quality.total} />
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--admin-soft)]">
          {validation?.blockedReason || validation?.currentStepLabel || opportunity.nextAction || opportunity.summary || "Sem pendencia critica registrada."}
        </p>

        <div className="mt-auto border-t border-[var(--admin-border)] pt-3">
          <div className="flex items-center justify-between gap-3 text-xs text-[var(--admin-muted)]">
            <span className="truncate">Resp.: {opportunity.owner || "nao definido"}</span>
            <span className="shrink-0">
              {formatShortDate(opportunity.auctionDate)}
              {due !== null && due >= 0 ? ` / ${due}d` : ""}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button asChild size="sm" className="bg-[var(--admin-orange)] text-black hover:bg-white">
              <Link href={detailHref}>Abrir oportunidade</Link>
            </Button>
            {sourceUrl ? (
              <Button asChild size="sm" variant="outline" className="border-[var(--admin-border)] bg-white">
                <Link href={sourceUrl} target="_blank" rel="noreferrer">
                  Abrir anuncio
                  <ArrowUpRight size={13} />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ValueBlock({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-1 truncate font-mono text-sm font-bold", strong ? "text-[var(--admin-green)]" : "text-[var(--admin-foreground)]")}>{value}</p>
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters?: boolean }) {
  return (
    <div className="grid min-h-80 place-items-center rounded-lg border border-[var(--admin-border)] bg-white px-4 py-10 text-center">
      <div>
        <Database className="mx-auto mb-3 text-[var(--admin-muted)]" size={28} />
        <h2 className="text-lg font-semibold text-[var(--admin-foreground)]">
          {hasFilters ? "Nenhum resultado para os filtros" : "Nenhum imovel analisado"}
        </h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--admin-muted)]">
          {hasFilters
            ? "Ajuste a busca, limpe os filtros ou escolha outra visualizacao salva."
            : "A lista aparece assim que a Analise de mercado ou a entrada manual criar o primeiro imovel."}
        </p>
      </div>
    </div>
  );
}

export function OpportunityWorkspacePage({
  module,
  opportunities,
  snapshots,
  validations,
  source,
  reason,
  canManageImports,
}: {
  module: WorkspaceModule;
  opportunities: WorkspaceOpportunity[];
  snapshots: WorkspaceSnapshot[];
  validations: WorkspaceValidationRun[];
  source: string;
  reason?: string;
  canManageImports: boolean;
}) {
  const searchParams = useSearchParams();
  const requestedPipelineStage = pipelineStageFromParam(searchParams.get("pipeline"));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("todos");
  const [category, setCategory] = useState<CategoryFilter>("todos");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "table";
    return (window.localStorage.getItem("betel.opportunities.view") as ViewMode) || "table";
  });
  const [sort, setSort] = useState<SortKey>(() => {
    if (typeof window === "undefined") return "priority";
    return (window.localStorage.getItem("betel.opportunities.sort") as SortKey) || "priority";
  });
  const [density, setDensity] = useState<Density>("comfortable");
  const [savedViewKey, setSavedViewKey] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [pipelineStage, setPipelineStage] = useState(requestedPipelineStage);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(defaultColumns);
  const pageSize = 12;

  useEffect(() => {
    window.localStorage.setItem("betel.opportunities.view", view);
  }, [view]);

  useEffect(() => {
    window.localStorage.setItem("betel.opportunities.sort", sort);
  }, [sort]);

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

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilter, number>();
    counts.set("todos", opportunities.length);

    for (const opportunity of opportunities) {
      const key = classifyPropertyCategory(opportunity);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    return counts;
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    const text = normalizeText(query);

    const filtered = opportunities.filter((item) => {
      const validation = validationsByOpportunity.get(item.id);
      if (category !== "todos" && classifyPropertyCategory(item) !== category) return false;
      if (pipelineStage !== "todos" && stageForOpportunity(item, validation) !== pipelineStage) return false;

      const bucket = classifyOpportunity(item);
      const imageUrl = getPrimaryImage(item);
      if (filter === "com_foto" && !imageUrl) return false;
      if (filter === "sem_foto" && imageUrl) return false;
      if (filter === "sem_valor" && hasMarketValue(item)) return false;
      if (!["todos", "com_foto", "sem_foto", "sem_valor"].includes(filter) && bucket !== filter) return false;
      if (!text) return true;

      const snapshot = snapshotsByOpportunity.get(item.id)?.[0];
      const haystack = normalizeText(
        [
          item.id,
          item.title,
          item.propertyType,
          item.address,
          item.city,
          item.state,
          item.sourceName,
          item.sourceType,
          snapshot?.sourceName,
          item.stage,
          item.aiStatus,
          item.legalStatus,
          item.nextAction,
          item.summary,
        ].join(" ")
      );

      return haystack.includes(text);
    });

    return filtered.sort((a, b) => {
      const validationA = validationsByOpportunity.get(a.id);
      const validationB = validationsByOpportunity.get(b.id);
      if (sort === "score") return b.opportunityScore - a.opportunityScore;
      if (sort === "risk") return b.riskScore - a.riskScore;
      if (sort === "discount") return b.discountPct - a.discountPct;
      if (sort === "bid") return b.initialBid - a.initialBid;
      if (sort === "auctionDate") return (daysUntil(a.auctionDate) ?? 9999) - (daysUntil(b.auctionDate) ?? 9999);
      if (sort === "title") return a.title.localeCompare(b.title, "pt-BR");
      return priorityScore(b, validationB) - priorityScore(a, validationA);
    });
  }, [category, filter, opportunities, pipelineStage, query, snapshotsByOpportunity, sort, validationsByOpportunity]);

  const totalPages = Math.max(1, Math.ceil(filteredOpportunities.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedOpportunities = filteredOpportunities.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRows = filteredOpportunities.filter((item) => selectedIds.has(item.id));
  const selectedFirst = selectedRows[0] ? `/admin/oportunidades/${selectedRows[0].id}` : undefined;

  const rawCaptureCount = snapshots.length;
  const notVisibleCount = Math.max(rawCaptureCount - opportunities.length, 0);
  const revisaoCount = opportunities.filter((item) => classifyOpportunity(item) === "revisao").length;
  const readyCount = opportunities.filter((item) => classifyOpportunity(item) === "pronto").length;
  const blockedCount = opportunities.filter((item) => classifyOpportunity(item) === "risco").length;
  const incompleteCount = opportunities.filter((item) => !hasMarketValue(item) || !getPrimaryImage(item)).length;
  const inReviewValidations = validations.filter((item) => item.overallStatus === "in_review").length;
  const latestUpdate =
    [
      ...snapshots.map((item) => item.collectedAt),
      ...validations.flatMap((item) => item.steps.map((step) => step.finishedAt)),
    ]
      .filter(Boolean)
      .sort()
      .at(-1) || "";

  function resetWorkspacePage() {
    setPage(1);
    setSelectedIds(new Set());
  }

  function updateQuery(value: string) {
    setQuery(value);
    resetWorkspacePage();
  }

  function updateFilter(value: WorkspaceFilter) {
    setFilter(value);
    resetWorkspacePage();
  }

  function updateCategory(value: CategoryFilter) {
    setCategory(value);
    resetWorkspacePage();
  }

  function updateSort(value: SortKey) {
    setSort(value);
    resetWorkspacePage();
  }

  function updatePipelineStage(value: string) {
    setPipelineStage(value);
    resetWorkspacePage();
  }

  const activeFilterChips = [
    query ? { key: "query", label: `Busca: ${query}`, onRemove: () => updateQuery("") } : null,
    filter !== "todos" ? { key: "filter", label: filterLabel(filter), onRemove: () => updateFilter("todos") } : null,
    category !== "todos"
      ? {
          key: "category",
          label: categoryTabs.find((item) => item.key === category)?.label || "Categoria",
          onRemove: () => updateCategory("todos"),
        }
      : null,
    pipelineStage !== "todos"
      ? {
          key: "pipeline",
          label: pipelineStages.find((item) => item.key === pipelineStage)?.label || "Pipeline",
          onRemove: () => updatePipelineStage("todos"),
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; onRemove: () => void }>;

  function clearFilters() {
    setQuery("");
    setFilter("todos");
    setCategory("todos");
    setPipelineStage("todos");
    setSavedViewKey("");
    resetWorkspacePage();
  }

  function applySavedView(key: string) {
    setSavedViewKey(key);
    const saved = savedViews.find((item) => item.key === key);
    if (!saved) return;
    setFilter(saved.filter);
    setCategory(saved.category || "todos");
    if (saved.sort) setSort(saved.sort);
    resetWorkspacePage();
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = paginatedOpportunities.length > 0 && paginatedOpportunities.every((item) => next.has(item.id));
      for (const item of paginatedOpportunities) {
        if (allSelected) next.delete(item.id);
        else next.add(item.id);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto grid max-w-[1800px] gap-4 px-4 py-4 lg:px-5">
      <section className="rounded-lg border border-[var(--admin-border)] bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 inline-flex h-7 items-center gap-2 rounded-md border border-[rgba(200,90,31,0.24)] bg-[rgba(200,90,31,0.08)] px-2.5 text-xs font-semibold text-[var(--admin-orange)]">
              <Gavel size={14} />
              {module.eyebrow}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <h1 className="text-2xl font-semibold text-[var(--admin-foreground)]">{module.title}</h1>
              <span className="pb-0.5 text-sm text-[var(--admin-muted)]">{opportunities.length} registros</span>
            </div>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">{module.description}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">
              <StatusBadge tone={source === "supabase" ? "green" : "purple"}>{source}</StatusBadge>
              <span>Ultima atualizacao: {formatDateTime(latestUpdate)}</span>
              {reason ? <span className="text-[var(--admin-yellow)]">{reason}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild className="h-9 bg-[var(--admin-orange)] text-black hover:bg-white">
              <Link href="/admin/oportunidades/nova">
                <Plus size={15} />
                Novo imovel
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => window.location.reload()}
              className="h-9 border-[var(--admin-border)] bg-white"
            >
              <RefreshCcw size={15} />
              Atualizar dados
            </Button>
            <MoreActionsMenu canManageImports={canManageImports} onExport={() => exportCsv(filteredOpportunities)} />
          </div>
        </div>
      </section>

      <DashboardCard title="Comando operacional" eyebrow="busca / filtros / visualizacao" contentClassName="p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(260px,1fr)_auto] xl:items-center">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" />
              <Input
                value={query}
                onChange={(event) => updateQuery(event.target.value)}
                placeholder="Buscar por titulo, cidade, codigo, fonte ou endereco"
              className="h-10 border-[var(--admin-border)] bg-white pl-9 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={savedViewKey}
              onChange={(event) => applySavedView(event.target.value)}
              className="h-10 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)]"
              aria-label="Minhas visualizacoes"
            >
              <option value="">Minhas visualizacoes</option>
              {savedViews.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(event) => updateSort(event.target.value as SortKey)}
              className="h-10 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)]"
              aria-label="Ordenacao"
            >
              <option value="priority">Prioridade operacional</option>
              <option value="score">Maior score</option>
              <option value="risk">Maior risco</option>
              <option value="discount">Maior desconto</option>
              <option value="bid">Maior lance</option>
              <option value="auctionDate">Leilao mais proximo</option>
              <option value="title">Titulo</option>
            </select>
            <div className="inline-flex rounded-md border border-[var(--admin-border)] bg-white p-1">
              <button
                type="button"
                onClick={() => setView("table")}
                aria-pressed={view === "table"}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold", view === "table" ? "bg-[rgba(200,90,31,0.12)] text-[var(--admin-foreground)]" : "text-[var(--admin-muted)]")}
              >
                <Table2 size={14} />
                Tabela
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-pressed={view === "cards"}
                className={cn("inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs font-semibold", view === "cards" ? "bg-[rgba(200,90,31,0.12)] text-[var(--admin-foreground)]" : "text-[var(--admin-muted)]")}
              >
                <LayoutGrid size={14} />
                Cards
              </button>
            </div>
            <Button type="button" variant="outline" className="h-10 border-[var(--admin-border)] bg-white" onClick={() => setAdvancedOpen(true)}>
              <SlidersHorizontal size={15} />
              Filtros
            </Button>
          </div>
        </div>

        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {quickFilters.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => updateFilter(item.key)}
                className={cn(
                  "inline-flex h-8 items-center rounded-md border px-3 text-xs font-semibold transition",
                  filter === item.key
                    ? "border-[rgba(200,90,31,0.5)] bg-[rgba(200,90,31,0.12)] text-[var(--admin-foreground)]"
                    : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)] hover:border-[rgba(200,90,31,0.32)] hover:text-[var(--admin-foreground)]"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="-mx-1 mt-3 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            {categoryTabs.map((tab) => {
              const isActive = category === tab.key;
              const count = categoryCounts.get(tab.key) || 0;

              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => updateCategory(tab.key)}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
                    isActive
                      ? "border-[rgba(200,90,31,0.5)] bg-[rgba(200,90,31,0.12)] text-[var(--admin-foreground)]"
                      : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)] hover:border-[rgba(200,90,31,0.32)] hover:text-[var(--admin-foreground)]"
                  )}
                >
                  <span>{tab.label}</span>
                  <span className="rounded bg-[rgba(129,117,104,0.12)] px-1.5 py-0.5 font-mono text-[10px]">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {activeFilterChips.length ? (
              activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={chip.onRemove}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-white px-2 text-xs font-semibold text-[var(--admin-soft)] hover:border-[rgba(200,90,31,0.35)]"
                >
                  {chip.label}
                  <X size={12} />
                </button>
              ))
            ) : (
              <span className="text-xs text-[var(--admin-muted)]">Nenhum filtro ativo</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--admin-muted)]">
            <span>{filteredOpportunities.length} resultado(s)</span>
            {activeFilterChips.length ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </DashboardCard>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricTile
          label="Total analisado"
          value={String(opportunities.length)}
          detail={`${rawCaptureCount} capturas; ${notVisibleCount} fora do catalogo`}
          tone="cyan"
          icon={<Database size={15} />}
          active={filter === "todos" && category === "todos"}
          onClick={() => {
            setFilter("todos");
            setCategory("todos");
            resetWorkspacePage();
          }}
        />
        <MetricTile
          label="Prontos para avancar"
          value={String(readyCount)}
          detail="classificados para decisao operacional"
          tone="green"
          icon={<CheckCircle2 size={15} />}
          active={filter === "pronto"}
          onClick={() => updateFilter("pronto")}
        />
        <MetricTile
          label="Em revisao"
          value={String(Math.max(revisaoCount, inReviewValidations))}
          detail="aguardando revisao humana ou juridica"
          tone="yellow"
          icon={<TimerReset size={15} />}
          active={filter === "revisao"}
          onClick={() => updateFilter("revisao")}
        />
        <MetricTile
          label="Bloqueados"
          value={String(blockedCount)}
          detail="risco, descarte ou bloqueio critico"
          tone="red"
          icon={<ShieldAlert size={15} />}
          active={filter === "risco"}
          onClick={() => updateFilter("risco")}
        />
        <MetricTile
          label="Dados incompletos"
          value={String(incompleteCount)}
          detail="sem foto real ou sem valor"
          tone="purple"
          icon={<AlertTriangle size={15} />}
          active={filter === "sem_foto" || filter === "sem_valor"}
          onClick={() => updateFilter("sem_valor")}
        />
      </section>

      <ValidationPipeline
        opportunities={opportunities}
        validationsByOpportunity={validationsByOpportunity}
        activeStage={pipelineStage}
        onStageChange={updatePipelineStage}
      />

      <AttentionQueue items={opportunities} validationsByOpportunity={validationsByOpportunity} />

      <DashboardCard
        title="Oportunidades imobiliarias"
        eyebrow="triagem / decisao"
        action={
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-[var(--admin-muted)] sm:inline">
              Pagina {currentPage} de {totalPages}
            </span>
            <details className="relative hidden lg:block">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-white px-2 text-xs font-semibold text-[var(--admin-soft)]">
                <Columns3 size={14} />
                Colunas
              </summary>
              <div className="absolute right-0 z-20 mt-2 grid w-56 gap-1 rounded-lg border border-[var(--admin-border)] bg-white p-2 shadow-xl">
                {(Object.keys(columnLabels) as ColumnKey[]).map((column) => (
                  <label key={column} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--admin-soft)] hover:bg-[rgba(184,122,22,0.08)]">
                    <input
                      type="checkbox"
                      checked={visibleColumns[column]}
                      onChange={() => setVisibleColumns((current) => ({ ...current, [column]: !current[column] }))}
                    />
                    {columnLabels[column]}
                  </label>
                ))}
              </div>
            </details>
            <select
              value={density}
              onChange={(event) => setDensity(event.target.value as Density)}
              className="hidden h-8 rounded-md border border-[var(--admin-border)] bg-white px-2 text-xs text-[var(--admin-soft)] lg:block"
              aria-label="Densidade da tabela"
            >
              <option value="comfortable">Confortavel</option>
              <option value="compact">Compacta</option>
            </select>
          </div>
        }
        contentClassName="p-3"
      >
        <BulkActionBar
          count={selectedIds.size}
          onClear={() => setSelectedIds(new Set())}
          onExport={() => exportCsv(selectedRows)}
          firstSelectedHref={selectedFirst}
        />

        {paginatedOpportunities.length ? (
          <>
            {view === "table" ? (
              <>
                <OpportunitiesTable
                  items={paginatedOpportunities}
                  snapshotsByOpportunity={snapshotsByOpportunity}
                  validationsByOpportunity={validationsByOpportunity}
                  selectedIds={selectedIds}
                  visibleColumns={visibleColumns}
                  density={density}
                  sort={sort}
                  onSort={updateSort}
                  onToggle={toggleSelection}
                  onToggleAll={toggleAllPage}
                />
                <div className="grid gap-3 lg:hidden">
                  {paginatedOpportunities.map((opportunity) => (
                    <OpportunityCard
                      key={opportunity.id}
                      opportunity={opportunity}
                      snapshot={snapshotsByOpportunity.get(opportunity.id)?.[0]}
                      validation={validationsByOpportunity.get(opportunity.id)}
                      selected={selectedIds.has(opportunity.id)}
                      onToggle={() => toggleSelection(opportunity.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {paginatedOpportunities.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    snapshot={snapshotsByOpportunity.get(opportunity.id)?.[0]}
                    validation={validationsByOpportunity.get(opportunity.id)}
                    selected={selectedIds.has(opportunity.id)}
                    onToggle={() => toggleSelection(opportunity.id)}
                  />
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--admin-border)] pt-3">
              <p className="text-xs text-[var(--admin-muted)]">
                Mostrando {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredOpportunities.length)} de {filteredOpportunities.length}
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="border-[var(--admin-border)] bg-white">
                  Anterior
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="border-[var(--admin-border)] bg-white">
                  Proxima
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState hasFilters={Boolean(activeFilterChips.length)} />
        )}
      </DashboardCard>

      {advancedOpen ? (
        <div className="fixed inset-0 z-50 bg-black/20" role="dialog" aria-modal="true" aria-label="Filtros avancados">
          <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={() => setAdvancedOpen(false)} aria-label="Fechar filtros" />
          <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-[var(--admin-border)] px-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">filtros</p>
                <h2 className="text-sm font-semibold text-[var(--admin-foreground)]">Filtros avancados</h2>
              </div>
              <button type="button" onClick={() => setAdvancedOpen(false)} className="grid size-9 place-items-center rounded-md text-[var(--admin-muted)] hover:bg-[rgba(184,122,22,0.08)]">
                <X size={17} />
              </button>
            </div>
            <div className="grid flex-1 content-start gap-4 overflow-y-auto p-4">
              <FilterSelect label="Etapa" value={pipelineStage} onChange={updatePipelineStage} options={[{ value: "todos", label: "Todas" }, ...pipelineStages.map((item) => ({ value: item.key, label: item.label }))]} />
              <FilterSelect label="Status" value={filter} onChange={(value) => updateFilter(value as WorkspaceFilter)} options={quickFilters.map((item) => ({ value: item.key, label: item.label }))} />
              <FilterSelect label="Tipo de imovel" value={category} onChange={(value) => updateCategory(value as CategoryFilter)} options={categoryTabs.map((item) => ({ value: item.key, label: item.label }))} />
              <FilterSelect label="Ordenacao" value={sort} onChange={(value) => updateSort(value as SortKey)} options={[
                { value: "priority", label: "Prioridade operacional" },
                { value: "score", label: "Maior score" },
                { value: "risk", label: "Maior risco" },
                { value: "discount", label: "Maior desconto" },
                { value: "bid", label: "Maior lance" },
                { value: "auctionDate", label: "Leilao mais proximo" },
                { value: "title", label: "Titulo" },
              ]} />
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.72)] p-3 text-xs leading-5 text-[var(--admin-muted)]">
                Faixas de valor, cidade, estado, fonte, data de captura e responsavel dependem de persistencia dedicada. A busca atual cobre esses campos sem alterar contratos de API.
              </div>
            </div>
            <div className="flex gap-2 border-t border-[var(--admin-border)] p-4">
              <Button type="button" variant="outline" onClick={clearFilters} className="flex-1 border-[var(--admin-border)] bg-white">
                Limpar filtros
              </Button>
              <Button type="button" onClick={() => setAdvancedOpen(false)} className="flex-1 bg-[var(--admin-orange)] text-black hover:bg-white">
                Aplicar
              </Button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-[var(--admin-foreground)]">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm font-normal text-[var(--admin-foreground)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
