"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Database,
  FileText,
  Gavel,
  Search,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from "lucide-react";
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
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
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

type WorkspaceFilter = "todos" | "entrada" | "revisao" | "risco" | "pronto";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const longDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
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
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatShortDate(value: string) {
  if (!value) return "sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return shortDateFormatter.format(date);
}

function formatLongDate(value: string) {
  if (!value) return "sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return longDateFormatter.format(date);
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

function daysUntil(value: string) {
  if (!value) return null;
  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return Math.round((date.getTime() - base) / 86_400_000);
}

function runTone(status = ""): ResourceTone {
  const text = normalizeText(status);
  if (!text || text.includes("sem run") || text.includes("pendente")) return "muted";
  if (text.includes("completed") || text.includes("concluido") || text.includes("approved")) return "green";
  if (text.includes("failed") || text.includes("erro") || text.includes("bloq")) return "red";
  if (text.includes("running") || text.includes("anal")) return "purple";
  if (text.includes("queued") || text.includes("fila") || text.includes("aguard")) return "yellow";
  return "cyan";
}

function processStatus(status?: string, fallback = "pendente") {
  const text = String(status || "").trim();
  return text || fallback;
}

function buildProcessSteps(opportunity: WorkspaceOpportunity, snapshot?: WorkspaceSnapshot) {
  return [
    {
      label: "Captura",
      owner: "Renata",
      status: "concluido",
      detail: snapshot?.snapshotCode || opportunity.sourceName,
      tone: "green" as ResourceTone,
    },
    {
      label: "Curadoria",
      owner: "Helena",
      status: processStatus(snapshot?.curatorRunStatus || snapshot?.curationStatus || opportunity.aiStatus, "fila ia"),
      detail: snapshot?.curatorRunCode || opportunity.stage,
      tone: runTone(snapshot?.curatorRunStatus || opportunity.aiStatus),
    },
    {
      label: "Risco oculto",
      owner: "Igor",
      status: processStatus(snapshot?.hiddenRiskStatus),
      detail: snapshot?.hiddenRiskRunCode || `${opportunity.riskFlags.length} sinais`,
      tone: runTone(snapshot?.hiddenRiskStatus || (opportunity.riskScore >= 70 ? "risco" : "")),
    },
    {
      label: "Revisao humana",
      owner: "Patricia",
      status: processStatus(snapshot?.humanHandoffStatus || opportunity.legalStatus),
      detail: snapshot?.humanHandoffRunCode || opportunity.nextAction,
      tone: runTone(snapshot?.humanHandoffStatus || opportunity.legalStatus),
    },
    {
      label: "Compliance",
      owner: "Dr. Otavio",
      status: processStatus(snapshot?.complianceRunStatus || snapshot?.complianceReviewStatus),
      detail: snapshot?.complianceRunCode || `score ${opportunity.complianceScore}`,
      tone: runTone(snapshot?.complianceRunStatus || snapshot?.complianceReviewStatus),
    },
    {
      label: "Comercial",
      owner: "Matching",
      status: processStatus(snapshot?.communicationStatus),
      detail: snapshot?.communicationOutboxCount ? `${snapshot.communicationOutboxCount} envios` : "aguarda aprovacao",
      tone: snapshot?.communicationOutboxCount ? "green" as ResourceTone : "muted" as ResourceTone,
    },
  ];
}

function filterLabel(filter: WorkspaceFilter) {
  const labels: Record<WorkspaceFilter, string> = {
    todos: "Todos",
    entrada: "Entrada",
    revisao: "Revisao",
    risco: "Risco",
    pronto: "Pronto",
  };
  return labels[filter];
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
    <div className="grid min-h-80 place-items-center px-4 py-10 text-center">
      <div>
        <Database className="mx-auto mb-3 text-[var(--admin-muted)]" size={28} />
        <h2 className="text-lg font-semibold text-white">Nenhuma oportunidade cadastrada</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-[var(--admin-muted)]">
          A mesa fica pronta assim que a Renata ou a entrada manual criar o primeiro registro.
        </p>
      </div>
    </div>
  );
}

export function OpportunityWorkspacePage({
  module,
  opportunities,
  snapshots,
  source,
  reason,
}: {
  module: WorkspaceModule;
  opportunities: WorkspaceOpportunity[];
  snapshots: WorkspaceSnapshot[];
  source: string;
  reason?: string;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkspaceFilter>("todos");
  const [selectedId, setSelectedId] = useState(opportunities[0]?.id || "");

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

  const filteredOpportunities = useMemo(() => {
    const text = normalizeText(query);

    return opportunities.filter((item) => {
      const bucket = classifyOpportunity(item);
      if (filter !== "todos" && bucket !== filter) return false;
      if (!text) return true;

      const haystack = normalizeText(
        [
          item.title,
          item.propertyType,
          item.city,
          item.state,
          item.sourceName,
          item.stage,
          item.aiStatus,
          item.legalStatus,
          item.nextAction,
        ].join(" ")
      );

      return haystack.includes(text);
    });
  }, [filter, opportunities, query]);

  const selected =
    opportunities.find((item) => item.id === selectedId) ||
    filteredOpportunities[0] ||
    opportunities[0];
  const selectedSnapshots = selected ? snapshotsByOpportunity.get(selected.id) || [] : [];
  const selectedSnapshot = selectedSnapshots[0];
  const processSteps = selected ? buildProcessSteps(selected, selectedSnapshot) : [];
  const urgentCount = opportunities.filter((item) => {
    const days = daysUntil(item.auctionDate);
    return days !== null && days >= 0 && days <= 3;
  }).length;
  const entradaCount = opportunities.filter((item) => classifyOpportunity(item) === "entrada").length;
  const revisaoCount = opportunities.filter((item) => classifyOpportunity(item) === "revisao").length;
  const riscoCount = opportunities.filter((item) => classifyOpportunity(item) === "risco").length;

  return (
    <div className="mx-auto max-w-[1800px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)]">
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
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href="/admin/oportunidades/nova">
                <FileText size={15} />
                Novo
              </Link>
            </Button>
          </div>
        </div>
        {reason ? <p className="mt-3 text-xs text-[var(--admin-muted)]">{reason}</p> : null}
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Arquivo" value={String(opportunities.length)} detail="imoveis no pipeline" tone="cyan" />
        <MetricTile label="Entrada" value={String(entradaCount)} detail="captados ou em fila IA" tone="purple" />
        <MetricTile label="Revisao" value={String(revisaoCount)} detail="juridico ou humano" tone="yellow" />
        <MetricTile label="Urgentes" value={String(urgentCount + riscoCount)} detail="ate 3 dias ou com risco" tone="red" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(420px,0.75fr)]">
        <DashboardCard
          title="Arquivo operacional"
          eyebrow="planilha / captacao / fila"
          action={
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative w-48 sm:w-64">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
                />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar imovel"
                  className="h-8 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] pl-8 text-sm text-white"
                />
              </div>
            </div>
          }
          contentClassName="p-0"
        >
          <div className="flex flex-wrap gap-2 border-b border-[var(--admin-border)] px-3 py-3">
            {(["todos", "entrada", "revisao", "risco", "pronto"] as WorkspaceFilter[]).map((item) => (
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
                    ? "bg-[var(--admin-cyan)] text-black hover:bg-white"
                    : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                )}
              >
                {filterLabel(item)}
              </Button>
            ))}
          </div>

          {opportunities.length ? (
            <Table className="min-w-[1280px]">
              <TableHeader className="bg-[rgba(255,255,255,0.02)]">
                <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
                  {[
                    "Imovel",
                    "Tipo",
                    "Cidade/UF",
                    "Fonte",
                    "Leilao",
                    "Lance",
                    "Avaliacao",
                    "Desc.",
                    "Score",
                    "Risco",
                    "IA",
                    "Juridico",
                    "Etapa",
                  ].map((head) => (
                    <TableHead
                      key={head}
                      className="h-10 px-3 font-mono text-[10px] uppercase text-[var(--admin-muted)]"
                    >
                      {head}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOpportunities.map((item) => {
                  const isSelected = selected?.id === item.id;
                  const due = daysUntil(item.auctionDate);

                  return (
                    <TableRow
                      key={item.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedId(item.id);
                      }}
                      className={cn(
                        "cursor-pointer border-[var(--admin-border)] bg-[var(--admin-card)] outline-none hover:bg-[rgba(255,255,255,0.04)] focus-visible:bg-[rgba(0,243,255,0.08)]",
                        isSelected && "bg-[rgba(0,243,255,0.08)]"
                      )}
                    >
                      <TableCell className="max-w-[280px] px-3 py-3">
                        <div className="truncate font-semibold text-white">{item.title}</div>
                        <div className="mt-1 truncate font-mono text-[10px] text-[var(--admin-muted)]">{item.id}</div>
                      </TableCell>
                      <TableCell className="px-3 text-[var(--admin-soft)]">{item.propertyType}</TableCell>
                      <TableCell className="px-3 text-[var(--admin-soft)]">
                        {item.city}/{item.state || "--"}
                      </TableCell>
                      <TableCell className="max-w-[170px] px-3">
                        <div className="truncate text-[var(--admin-soft)]">{item.sourceName}</div>
                      </TableCell>
                      <TableCell className="px-3">
                        <div className="font-mono text-white">{formatShortDate(item.auctionDate)}</div>
                        <div className="mt-1 text-[10px] text-[var(--admin-muted)]">
                          {due === null ? "sem prazo" : due < 0 ? "passou" : `${due}d`}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 font-mono font-semibold text-white">
                        {formatCurrency(item.initialBid)}
                      </TableCell>
                      <TableCell className="px-3 font-mono text-[var(--admin-soft)]">
                        {formatCurrency(item.appraisalValue)}
                      </TableCell>
                      <TableCell className="px-3 font-mono text-[var(--admin-green)]">{item.discountPct}%</TableCell>
                      <TableCell className="px-3">
                        <ScoreBadge score={item.opportunityScore} />
                      </TableCell>
                      <TableCell className="px-3">
                        <RiskBadge score={item.riskScore} />
                      </TableCell>
                      <TableCell className="px-3">
                        <StatusBadge tone={getStatusTone(item.aiStatus)}>{item.aiStatus}</StatusBadge>
                      </TableCell>
                      <TableCell className="px-3">
                        <StatusBadge tone={getStatusTone(item.legalStatus)}>{item.legalStatus}</StatusBadge>
                      </TableCell>
                      <TableCell className="max-w-[220px] px-3">
                        <div className="truncate text-[var(--admin-soft)]">{item.stage}</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <EmptyState />
          )}
        </DashboardCard>

        <div className="grid content-start gap-4">
          <DashboardCard
            title="Arquivo do imovel"
            eyebrow="status / agentes / evidencias"
            action={
              selected ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                >
                  <Link href={`/admin/oportunidades/${selected.id}`}>
                    Abrir
                    <ArrowUpRight size={14} />
                  </Link>
                </Button>
              ) : null
            }
          >
            {selected ? (
              <div className="grid gap-4">
                <div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <StatusBadge tone={getStatusTone(selected.stage)}>{selected.stage}</StatusBadge>
                    <StatusBadge tone={getStatusTone(selected.aiStatus)}>{selected.aiStatus}</StatusBadge>
                    <StatusBadge tone={getStatusTone(selected.legalStatus)}>{selected.legalStatus}</StatusBadge>
                  </div>
                  <h2 className="text-lg font-semibold leading-6 text-white">{selected.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--admin-muted)]">
                    {selected.address} - {selected.city}/{selected.state || "--"}
                  </p>
                  <p className="mt-3 text-sm leading-6 text-[var(--admin-soft)]">{selected.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-[var(--admin-border)] px-3 py-3">
                    <p className="text-xs text-[var(--admin-muted)]">Leilao</p>
                    <p className="mt-2 font-mono text-sm font-semibold text-white">
                      {formatLongDate(selected.auctionDate)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--admin-border)] px-3 py-3">
                    <p className="text-xs text-[var(--admin-muted)]">Fonte</p>
                    <p className="mt-2 truncate text-sm font-semibold text-white">{selected.sourceName}</p>
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <Sparkles size={15} className="text-[var(--admin-cyan)]" />
                    Processo dos agentes
                  </div>
                  <div className="grid gap-2">
                    {processSteps.map((step, index) => (
                      <div
                        key={step.label}
                        className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3"
                      >
                        <div className={cn("grid size-7 place-items-center rounded-md border font-mono text-xs", toneBorder[step.tone])}>
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">{step.label}</p>
                            <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
                          </div>
                          <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">
                            {step.owner} - {step.detail}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                    <ShieldCheck size={15} className="text-[var(--admin-green)]" />
                    Checklist e documentos
                  </div>
                  <div className="grid gap-2">
                    {[...selected.checklist.slice(0, 3), ...selected.documents.slice(0, 2)].map((item) => {
                      const label = "label" in item ? item.label : "Documento";
                      const status = "status" in item ? item.status : "";
                      const owner = "owner" in item ? item.owner : "source" in item ? item.source : "";

                      return (
                        <div
                          key={`${label}-${owner}`}
                          className="flex items-center justify-between gap-3 rounded-md border border-[var(--admin-border)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-white">{label}</p>
                            <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">{owner}</p>
                          </div>
                          <StatusBadge tone={getStatusTone(status)}>{status}</StatusBadge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState />
            )}
          </DashboardCard>

          <DashboardCard title="Evidencias coletadas" eyebrow="fonte / snapshot / payload">
            {selectedSnapshots.length ? (
              <div className="grid gap-2">
                {selectedSnapshots.slice(0, 4).map((snapshot) => (
                  <div key={snapshot.snapshotCode} className="rounded-lg border border-[var(--admin-border)] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-white">{snapshot.snapshotCode}</p>
                        <p className="mt-1 text-xs text-[var(--admin-muted)]">
                          {snapshot.collectedBy} - {formatLongDate(snapshot.collectedAt)}
                        </p>
                      </div>
                      <StatusBadge tone={getStatusTone(snapshot.status)}>{snapshot.status}</StatusBadge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">
                      {snapshot.payloadPreview || snapshot.title}
                    </p>
                    {snapshot.sourceUrl ? (
                      <Link
                        href={snapshot.sourceUrl}
                        target="_blank"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] hover:text-white"
                      >
                        Fonte original
                        <ArrowUpRight size={12} />
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--admin-border)] px-3 py-4 text-sm text-[var(--admin-muted)]">
                Sem snapshot vinculado a este imovel.
              </div>
            )}
          </DashboardCard>

          {selected?.timeline.length ? (
            <DashboardCard title="Linha do tempo" eyebrow="auditoria">
              <div className="grid gap-3">
                {selected.timeline.slice(0, 4).map((item) => (
                  <div key={`${item.time}-${item.actor}-${item.action}`} className="flex gap-3">
                    <div className={cn("mt-1 size-2 shrink-0 rounded-full bg-current", toneBorder[item.tone])} />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white">
                        {item.actor} <span className="font-mono text-[var(--admin-muted)]">{item.time}</span>
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{item.action}</p>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          ) : null}
        </div>
      </section>
    </div>
  );
}
