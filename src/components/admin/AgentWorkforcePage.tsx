import Link from "next/link";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BellRing,
  Bot,
  Braces,
  Building2,
  CheckCircle2,
  Clock3,
  ClipboardList,
  Cpu,
  FileSearch,
  GitBranch,
  LockKeyhole,
  MessageSquareText,
  Network,
  PlayCircle,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  ShieldAlert,
  UserCog,
  Wrench,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type { AgentStatus, AgentWorkflowStage } from "@/lib/admin/agent-workforce";
import { agentWorkflowStages } from "@/lib/admin/agent-workforce";
import type { AgentOfficeData, DataResult } from "@/lib/admin/repository";
import type { ResourceTone } from "@/lib/admin/resources";
import {
  createAgentAction,
  createAgentPromptAction,
  createAgentRunAction,
  createMaintenanceTaskAction,
  dispatchCommunicationAction,
  enqueueAgentHandoffAction,
  processAgentRunAction,
  processCommunicationOutboxBatchAction,
  processCommunicationOutboxAction,
  resolveHumanGateAction,
  runAgentPipelineAction,
  syncAgentWorkflowAction,
  updateAgentRunStatusAction,
  updateAgentStatusAction,
} from "@/app/admin/agentes-ia/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PipelineVisualization } from "./PipelineVisualization";
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

const statusTone: Record<AgentStatus, ResourceTone> = {
  active: "green",
  supervised: "cyan",
  paused: "yellow",
  planned: "purple",
};

const statusLabel: Record<AgentStatus, string> = {
  active: "Ativo",
  supervised: "Supervisionado",
  paused: "Pausado",
  planned: "Planejado",
};

const groupIcons = [RadioTower, Bot, FileSearch, MessageSquareText, LockKeyhole];
const officeIcons = [Building2, RadioTower, Bot, ShieldCheck, MessageSquareText, LockKeyhole, Wrench];
const officeNav = [
  { href: "#formularios", label: "Operar" },
  { href: "#runs", label: "Runs" },
  { href: "#runtime", label: "Runtime" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#orquestracao", label: "Orquestracao" },
  { href: "#escritorio", label: "Escritorio" },
  { href: "#setores", label: "Setores" },
  { href: "#agentes", label: "Agentes" },
  { href: "#prompts", label: "Prompts" },
  { href: "#manutencao", label: "Manutencao" },
];

const inputClass =
  "h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-sm text-white outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(0,243,255,0.18)]";

const textAreaClass =
  "min-h-24 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] py-3 text-white placeholder:text-[var(--admin-muted)]";

const labelClass = "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

const runStatusOptions = [
  { value: "queued", label: "Na fila" },
  { value: "running", label: "Executando" },
  { value: "waiting_human", label: "Aguardando humano" },
  { value: "completed", label: "Concluido" },
  { value: "failed", label: "Falhou" },
  { value: "blocked", label: "Bloqueado" },
];

const runtimeModeOptions = [
  { value: "mock", label: "Mock auditavel" },
  { value: "manual", label: "Manual" },
  { value: "provider", label: "Provider configurado" },
  { value: "gemini", label: "Gemini" },
];

const humanGateDecisionOptions = [
  { value: "approved", label: "Aprovar e enfileirar" },
  { value: "approved_with_notes", label: "Aprovar com ressalva" },
  { value: "blocked", label: "Bloquear" },
];

const communicationAudienceOptions = [
  { value: "all", label: "Todos os publicos" },
  { value: "paid_clients", label: "Clientes pagantes" },
  { value: "cold_leads", label: "Leads frios" },
  { value: "community", label: "Comunidade" },
  { value: "multichannel", label: "Push e email" },
];

const deliveryAdapterOptions = [
  { value: "mock", label: "Mock auditavel" },
  { value: "manual", label: "Manual confirmado" },
  { value: "sandbox", label: "Sandbox" },
  { value: "provider", label: "Provider real" },
];

const outboxStatusFilters = [
  { value: "all", label: "Todos", tone: "muted" as ResourceTone },
  { value: "pending", label: "Pendentes", tone: "cyan" as ResourceTone },
  { value: "retry", label: "Retry", tone: "yellow" as ResourceTone },
  { value: "failed", label: "Falhas", tone: "red" as ResourceTone },
  { value: "sent", label: "Enviadas", tone: "green" as ResourceTone },
];

const communicationChannelFilters = [
  { value: "all", label: "Todos", tone: "muted" as ResourceTone },
  { value: "whatsapp", label: "WhatsApp", tone: "green" as ResourceTone },
  { value: "email", label: "Email", tone: "cyan" as ResourceTone },
  { value: "push", label: "Push", tone: "purple" as ResourceTone },
  { value: "community", label: "Comunidade", tone: "yellow" as ResourceTone },
  { value: "worker", label: "Worker", tone: "purple" as ResourceTone },
];

const auditStatusFilters = [
  { value: "all", label: "Todos", tone: "muted" as ResourceTone },
  { value: "cycle", label: "Ciclos", tone: "purple" as ResourceTone },
  { value: "sent", label: "Enviadas", tone: "green" as ResourceTone },
  { value: "retry", label: "Retry", tone: "yellow" as ResourceTone },
  { value: "failed", label: "Falhas", tone: "red" as ResourceTone },
];

const auditTypeFilters = [
  { value: "all", label: "Tudo", tone: "muted" as ResourceTone },
  { value: "worker", label: "Worker", tone: "purple" as ResourceTone },
  { value: "delivery", label: "Entrega", tone: "green" as ResourceTone },
  { value: "dispatch", label: "Despacho", tone: "cyan" as ResourceTone },
];

type SearchParamValue = string | string[] | undefined;
type AgentRunView = AgentOfficeData["recentRuns"][number];
type WorkflowEdgeView = AgentOfficeData["workflowEdges"][number];
type RuntimeEventView = AgentOfficeData["runtimeEvents"][number];
type ProviderHealthView = AgentOfficeData["providerHealth"][number];

function paramValue(params: Record<string, SearchParamValue>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function filterValue(value: string | undefined, allowed: string[], fallback = "all") {
  const normalized = (value || fallback).toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function queryHref(
  params: Record<string, SearchParamValue>,
  updates: Record<string, string>,
  hash = "setores"
) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (key === "status" || key === "message") return;
    const current = Array.isArray(value) ? value[0] : value;
    if (current && current !== "all") query.set(key, current);
  });

  Object.entries(updates).forEach(([key, value]) => {
    if (!value || value === "all") query.delete(key);
    else query.set(key, value);
  });

  const queryString = query.toString();
  return `/admin/agentes-ia${queryString ? `?${queryString}` : ""}#${hash}`;
}

function communicationChannelKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized.includes("whatsapp") || normalized.includes("wpp")) return "whatsapp";
  if (normalized.includes("email") || normalized.includes("mail")) return "email";
  if (normalized.includes("push")) return "push";
  if (normalized.includes("comunidade") || normalized.includes("community") || normalized.includes("grupo")) {
    return "community";
  }
  if (normalized.includes("worker")) return "worker";
  return normalized || "generic";
}

function providerHealthTone(provider: ProviderHealthView): ResourceTone {
  if (provider.readyForProvider) return "green";
  if (provider.endpointConfigured) return "yellow";
  return "red";
}

function providerHealthLabel(provider: ProviderHealthView) {
  if (provider.readyForProvider) return "Pronto";
  if (provider.endpointConfigured) return "Homologar";
  return "Configurar";
}

function getHandoffOptions(workflowEdges: WorkflowEdgeView[], run: AgentRunView) {
  const nextEdges = workflowEdges.filter((edge) => edge.fromAgentKey === run.agentKey);
  return nextEdges.length ? nextEdges : workflowEdges.filter((edge) => edge.toAgentKey !== run.agentKey).slice(0, 4);
}

function isHumanGateRun(run: AgentRunView) {
  const text = `${run.status} ${run.humanReviewStatus || ""} ${run.nextAction} ${run.agentKey || ""}`.toLowerCase();
  return (
    text.includes("waiting_human") ||
    text.includes("aguardando humano") ||
    text.includes("pendente_aprovacao") ||
    text.includes("aprovacao humana") ||
    run.agentKey === "human-handoff"
  );
}

function isCommunicationReadyRun(run: AgentRunView) {
  const statusText = run.status.toLowerCase();
  const reviewText = (run.humanReviewStatus || "").toLowerCase();
  const blockedText = `${run.status} ${run.humanReviewStatus || ""} ${run.errorMessage || ""}`.toLowerCase();
  const completed =
    statusText.includes("completed") ||
    statusText.includes("concluido") ||
    statusText.includes("done");
  const approved =
    reviewText.includes("aprov") ||
    reviewText.includes("approved") ||
    reviewText.includes("liber") ||
    reviewText.includes("ok");
  const blocked =
    blockedText.includes("blocked") ||
    blockedText.includes("bloque") ||
    blockedText.includes("failed") ||
    blockedText.includes("erro");

  return run.agentKey === "compliance-guard" && completed && approved && !blocked;
}

function isCommunicationAuditEvent(event: RuntimeEventView) {
  return event.eventType.startsWith("communication_");
}

function auditEventChannel(event: RuntimeEventView) {
  const payload = event.payload || {};
  const channel = payloadString(payload, "channel", payloadString(payload, "channelKey"));

  if (channel) return communicationChannelKey(channel);
  if (event.eventType.toLowerCase().includes("worker")) return "worker";
  if (event.eventType.toLowerCase().includes("dispatch")) return "dispatch";
  return "generic";
}

function auditEventStatus(event: RuntimeEventView) {
  const text = `${event.eventType} ${event.status}`.toLowerCase();
  if (text.includes("worker_cycle")) return "cycle";
  if (text.includes("delivery_sent") || text.includes("sent")) return "sent";
  if (text.includes("retry")) return "retry";
  if (text.includes("failed") || text.includes("error")) return "failed";
  if (text.includes("dispatch")) return "dispatch";
  return "other";
}

function auditEventType(event: RuntimeEventView) {
  const text = event.eventType.toLowerCase();
  if (text.includes("worker")) return "worker";
  if (text.includes("delivery")) return "delivery";
  if (text.includes("dispatch")) return "dispatch";
  return "other";
}

function payloadString(payload: Record<string, unknown> | undefined, key: string, fallback = "") {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function payloadNumber(payload: Record<string, unknown> | undefined, key: string, fallback = 0) {
  const value = payload?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function HumanGateForm({
  run,
  handoffOptions,
  compact = false,
}: {
  run: AgentRunView;
  handoffOptions: WorkflowEdgeView[];
  compact?: boolean;
}) {
  return (
    <form
      action={resolveHumanGateAction}
      className={cn(
        "grid gap-2 rounded-md border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] p-2",
        compact && "p-3"
      )}
    >
      <input name="runCode" type="hidden" value={run.id} />
      <div className="grid gap-2 md:grid-cols-2">
        <select
          className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 text-xs text-white outline-none"
          defaultValue="approved"
          name="decision"
        >
          {humanGateDecisionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 text-xs text-white outline-none"
          name="handoffTarget"
        >
          {!handoffOptions.length && <option value="">Sem proximo agente</option>}
          {handoffOptions.map((edge) => (
            <option key={`${run.id}-${edge.key}-gate`} value={`${edge.key}|${edge.toAgentKey}`}>
              {edge.toAgent}
            </option>
          ))}
        </select>
      </div>
      <Input
        className="h-9 border-[var(--admin-border)] bg-[#050505] text-xs text-white placeholder:text-[var(--admin-muted)]"
        defaultValue="Operador Betel"
        name="reviewerLabel"
        placeholder="responsavel"
      />
      <Textarea
        className="min-h-16 border-[var(--admin-border)] bg-[#050505] py-2 text-xs text-white placeholder:text-[var(--admin-muted)]"
        defaultValue={`Revisao humana de ${run.id}: ${run.outputSummary || run.nextAction}`}
        name="notes"
        placeholder="parecer, ressalva ou motivo de bloqueio"
      />
      <Button className="h-9 justify-center bg-[var(--admin-yellow)] text-xs font-bold text-black hover:bg-white" type="submit">
        <ShieldCheck size={14} />
        Resolver gate humano
      </Button>
    </form>
  );
}

export function AgentWorkforcePage({
  module,
  officeData,
  searchParams = {},
}: {
  module: AdminModule;
  officeData: DataResult<AgentOfficeData>;
  searchParams?: Record<string, SearchParamValue>;
}) {
  const {
    metrics,
    officeRooms,
    directory,
    promptRegistry,
    maintenanceQueue,
    stages,
    workflowEdges,
    groups,
    communicationSegments: segments,
    communicationOutbox,
    providerHealth,
    recentRuns,
    runtimeEvents,
  } = officeData.data;
  const status = paramValue(searchParams, "status");
  const message = paramValue(searchParams, "message");
  const outboxStatusFilter = filterValue(
    paramValue(searchParams, "outboxStatus"),
    outboxStatusFilters.map((item) => item.value)
  );
  const outboxChannelFilter = filterValue(
    paramValue(searchParams, "outboxChannel"),
    communicationChannelFilters.map((item) => item.value)
  );
  const auditStatusFilter = filterValue(
    paramValue(searchParams, "auditStatus"),
    auditStatusFilters.map((item) => item.value)
  );
  const auditChannelFilter = filterValue(
    paramValue(searchParams, "auditChannel"),
    communicationChannelFilters.map((item) => item.value)
  );
  const auditTypeFilter = filterValue(
    paramValue(searchParams, "auditType"),
    auditTypeFilters.map((item) => item.value)
  );
  const noticeTone: ResourceTone = status === "success" ? "green" : "red";
  const runtimeStats = recentRuns.reduce(
    (stats, run) => {
      const currentStatus = run.status.toLowerCase();
      if (currentStatus.includes("queued") || currentStatus.includes("planejado")) stats.queued += 1;
      if (currentStatus.includes("running") || currentStatus.includes("execut")) stats.running += 1;
      if (currentStatus.includes("human") || currentStatus.includes("juridico") || currentStatus.includes("aguard")) {
        stats.review += 1;
      }
      if (currentStatus.includes("failed") || currentStatus.includes("erro") || currentStatus.includes("bloque")) {
        stats.failed += 1;
      }
      stats.cost += run.costEstimate || 0;
      return stats;
    },
    { queued: 0, running: 0, review: 0, failed: 0, cost: 0 }
  );
  const humanGateRuns = recentRuns.filter(isHumanGateRun).slice(0, 4);
  const communicationReadyRuns = recentRuns.filter(isCommunicationReadyRun);
  const deliverableMessages = communicationOutbox.filter((message) => {
    const text = message.status.toLowerCase();
    return message.isDue !== false && !text.includes("sent") && !text.includes("enviado");
  });
  const outboxHealth = communicationOutbox.reduce(
    (stats, message) => {
      const statusText = message.status.toLowerCase();

      if (statusText.includes("sent") || statusText.includes("enviado")) stats.sent += 1;
      else if (statusText.includes("retry")) stats.retry += 1;
      else if (statusText.includes("failed") || statusText.includes("falh")) stats.failed += 1;
      else stats.pending += 1;

      if (message.scheduledFor) stats.scheduled += 1;
      stats.attempts += message.deliveryAttempt || 0;
      return stats;
    },
    { pending: 0, retry: 0, failed: 0, sent: 0, scheduled: 0, attempts: 0 }
  );
  const filteredCommunicationOutbox = communicationOutbox.filter((message) => {
    const statusText = message.status.toLowerCase();
    const statusBucket = statusText.includes("sent") || statusText.includes("enviado")
      ? "sent"
      : statusText.includes("retry")
        ? "retry"
        : statusText.includes("failed") || statusText.includes("falh")
          ? "failed"
          : "pending";
    const channelBucket = communicationChannelKey(message.channel);

    return (
      (outboxStatusFilter === "all" || outboxStatusFilter === statusBucket) &&
      (outboxChannelFilter === "all" || outboxChannelFilter === channelBucket)
    );
  });
  const communicationAuditEvents = runtimeEvents.filter(isCommunicationAuditEvent);
  const communicationAuditStats = communicationAuditEvents.reduce(
    (stats, event) => {
      const type = event.eventType.toLowerCase();
      const statusText = event.status.toLowerCase();

      if (type.includes("worker_cycle")) stats.cycles += 1;
      if (type.includes("delivery_sent")) stats.sent += 1;
      if (type.includes("retry") || statusText.includes("retry")) stats.retry += 1;
      if (type.includes("failed") || statusText.includes("failed")) stats.failed += 1;
      stats.latency += event.durationMs || payloadNumber(event.payload, "latencyMs");
      return stats;
    },
    { cycles: 0, sent: 0, retry: 0, failed: 0, latency: 0 }
  );
  const communicationAuditList = communicationAuditEvents
    .filter((event) => auditStatusFilter === "all" || auditEventStatus(event) === auditStatusFilter)
    .filter((event) => auditChannelFilter === "all" || auditEventChannel(event) === auditChannelFilter)
    .filter((event) => auditTypeFilter === "all" || auditEventType(event) === auditTypeFilter)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)] px-3 text-xs font-semibold text-[var(--admin-purple)]">
              <GitBranch size={15} />
              {module.eyebrow}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{module.title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">{module.description}</p>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">
              Aqui os agentes deixam de ser apenas automacoes isoladas e passam a operar como uma empresa virtual:
              cada sala tem setor, lider, agentes cadastrados, prompts versionados, funcoes, bloqueios e rituais de
              manutencao.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="purple">Escritorio de Agentes IA</StatusBadge>
            <StatusBadge tone="yellow">Humano aprova</StatusBadge>
            <StatusBadge tone={officeData.source === "supabase" ? "green" : "yellow"}>{officeData.source}</StatusBadge>
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href="/admin/ia">
                Ver curadoria
                <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {message && status && (
        <div className={cn("mb-4 flex gap-3 rounded-lg border px-4 py-3 text-sm", toneBg[noticeTone])}>
          <ShieldAlert className={cn("mt-0.5 shrink-0", toneText[noticeTone])} size={17} />
          <div>
            <div className="font-semibold text-white">
              {status === "success" ? "Operacao concluida" : "Operacao nao concluida"}
            </div>
            <div className="mt-1 text-[var(--admin-muted)]">{message}</div>
          </div>
        </div>
      )}

      {officeData.reason && (
        <div className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[#070707] px-4 py-3 text-xs leading-5 text-[var(--admin-muted)]">
          Fonte atual: {officeData.reason}
        </div>
      )}

      <nav className="mb-4 flex gap-2 overflow-x-auto rounded-lg border border-[var(--admin-border)] bg-[#070707] p-2">
        {officeNav.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="inline-flex h-9 shrink-0 items-center rounded-md border border-transparent px-3 text-xs font-semibold text-[var(--admin-muted)] transition hover:border-[var(--admin-border)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
          >
            {item.label}
          </a>
        ))}
      </nav>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className={cn("min-h-[122px] rounded-lg border px-4 py-4", toneBg[metric.tone])}>
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className={cn("mt-5 font-mono text-3xl font-bold tracking-tight", toneText[metric.tone])}>
              {metric.value}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section id="formularios" className="mb-4 grid scroll-mt-24 gap-4 xl:grid-cols-3">
        <DashboardCard
          title="Cadastrar agente"
          eyebrow="nome / funcao / prompt"
          action={<Plus size={17} className="text-[var(--admin-cyan)]" />}
        >
          <form action={createAgentAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <TextField label="Nome" name="name" placeholder="Agente Auditor de Custos" required />
              <TextField label="Chave" name="agentKey" placeholder="api-cost-auditor" />
              <SelectField
                label="Setor"
                name="groupKey"
                defaultValue="curadoria"
                options={groups.map((group) => ({ value: group.key, label: group.name }))}
              />
              <SelectField
                label="Status"
                name="status"
                defaultValue="planned"
                options={[
                  { value: "planned", label: "Planejado" },
                  { value: "supervised", label: "Supervisionado" },
                  { value: "active", label: "Ativo" },
                  { value: "paused", label: "Pausado" },
                ]}
              />
              <TextField label="Prompt" name="promptName" placeholder="api_cost_auditor" />
              <TextField label="Versao" name="promptVersion" placeholder="v0.1" defaultValue="v0.1" />
            </div>
            <TextAreaField
              label="Funcao"
              name="role"
              placeholder="Descreva o cargo do agente dentro da empresa virtual."
              required
            />
            <TextField label="Trigger" name="triggerType" placeholder="Run finalizado, custo alto, erro de API" />
            <TextField label="Entradas" name="inputs" placeholder="agent_runs, api_usage_logs, plans" />
            <TextField label="Saidas" name="outputs" placeholder="agent_maintenance_tasks, audit_logs" />
            <TextField label="Guardrails" name="guardrails" placeholder="Nao alterar custo sem log, Escalar anomalia" />
            <TextAreaField label="System prompt" name="systemPrompt" placeholder="Prompt completo do agente." />
            <SubmitButton label="Salvar agente" />
          </form>
        </DashboardCard>

        <DashboardCard
          title="Versionar prompt"
          eyebrow="registry / qualidade"
          action={<Cpu size={17} className="text-[var(--admin-purple)]" />}
        >
          <form action={createAgentPromptAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <SelectField
                label="Agente"
                name="agentKey"
                defaultValue={directory[0]?.key || ""}
                options={directory.map((agent) => ({ value: agent.key, label: agent.name }))}
              />
              <SelectField
                label="Setor"
                name="departmentKey"
                defaultValue={groups[0]?.key || "curadoria"}
                options={groups.map((group) => ({ value: group.key, label: group.name }))}
              />
              <TextField label="Prompt" name="promptName" placeholder="auction_notice_curator" required />
              <TextField label="Versao" name="promptVersion" placeholder="v0.3" defaultValue="v0.1" />
              <TextField label="Chave" name="promptKey" placeholder="auction_notice_curator-v0.3" />
              <SelectField
                label="Status"
                name="status"
                defaultValue="supervised"
                options={[
                  { value: "planned", label: "Planejado" },
                  { value: "supervised", label: "Supervisionado" },
                  { value: "active", label: "Ativo" },
                  { value: "paused", label: "Pausado" },
                ]}
              />
            </div>
            <TextField label="Dono" name="ownerLabel" placeholder="Produto IA" defaultValue="Produto IA" />
            <TextAreaField label="Objetivo" name="purpose" placeholder="O que este prompt deve fazer." />
            <TextField label="Entradas" name="inputContract" placeholder="edital_pdf, endereco, matricula" />
            <TextField label="Saidas" name="outputContract" placeholder="risks, checklist, confidence" />
            <TextField label="Guardrails" name="guardrails" placeholder="Separar fato de hipotese, Exigir evidencia" />
            <TextAreaField label="System prompt" name="systemPrompt" placeholder="Prompt completo versionado." />
            <TextAreaField label="Notas da versao" name="changeNotes" placeholder="O que mudou nesta versao." />
            <SubmitButton label="Salvar prompt" />
          </form>
        </DashboardCard>

        <DashboardCard
          title="Abrir manutencao"
          eyebrow="qa / falha / ajuste"
          action={<Wrench size={17} className="text-[var(--admin-yellow)]" />}
        >
          <form action={createMaintenanceTaskAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <TextField label="Codigo" name="taskCode" placeholder="PROMPT-006" />
              <SelectField
                label="Sala"
                name="roomKey"
                defaultValue={officeRooms[0]?.key || ""}
                options={officeRooms.map((room) => ({ value: room.key, label: room.name }))}
              />
              <SelectField
                label="Agente"
                name="agentKey"
                defaultValue=""
                options={[
                  { value: "", label: "Sem agente especifico" },
                  ...directory.map((agent) => ({ value: agent.key, label: agent.name })),
                ]}
              />
              <SelectField
                label="Severidade"
                name="severity"
                defaultValue="Media"
                options={[
                  { value: "Baixa", label: "Baixa" },
                  { value: "Media", label: "Media" },
                  { value: "Alta", label: "Alta" },
                  { value: "Critica", label: "Critica" },
                ]}
              />
              <TextField label="Status" name="status" placeholder="Aberto" defaultValue="Aberto" />
              <TextField label="Dono" name="ownerLabel" placeholder="Produto IA" defaultValue="Produto IA" />
            </div>
            <TextField label="Area" name="area" placeholder="Prompt, API, custo, log, compliance" required />
            <TextField label="Prazo" name="dueAt" type="datetime-local" />
            <TextAreaField label="Check" name="checkDescription" placeholder="O que precisa ser verificado." />
            <TextAreaField label="Proxima acao" name="nextAction" placeholder="Qual decisao ou correcao precisa acontecer." />
            <SubmitButton label="Abrir manutencao" />
          </form>
        </DashboardCard>
      </section>

      <section id="runs" className="mb-4 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(360px,0.75fr)_minmax(0,1.25fr)]">
        <DashboardCard
          title="Abrir run de agente"
          eyebrow="fila / gatilho / entrada"
          action={<PlayCircle size={17} className="text-[var(--admin-cyan)]" />}
        >
          <form action={createAgentRunAction} className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <SelectField
                label="Agente"
                name="agentKey"
                defaultValue={directory[0]?.key || ""}
                options={directory.map((agent) => ({ value: agent.key, label: agent.name }))}
              />
              <TextField label="Run" name="runCode" placeholder="RUN-1050" />
              <TextField label="Oportunidade" name="opportunityCode" placeholder="BC-204 ou UUID" />
              <TextField label="Investidor" name="investorId" placeholder="UUID do lead, quando existir" />
              <SelectField label="Status" name="status" defaultValue="queued" options={runStatusOptions} />
              <TextField label="Gatilho" name="triggerSource" placeholder="manual, cron, api, webhook" defaultValue="manual" />
            </div>
            <TextAreaField
              label="Entrada"
              name="inputSummary"
              placeholder="Descreva o trabalho que este agente deve executar e os dados que recebeu."
              required
            />
            <TextAreaField label="Saida inicial" name="outputSummary" placeholder="Opcional: use quando registrar um run ja processado." />
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Revisao humana" name="humanReviewStatus" placeholder="pendente" defaultValue="pendente" />
              <TextField label="Handoff" name="handoffTo" placeholder="Curadoria, Compliance, Dra. Helena" />
              <TextField label="Custo estimado" name="costEstimate" placeholder="0.03" />
              <TextField label="Inicio" name="startedAt" type="datetime-local" />
            </div>
            <TextAreaField label="Erro" name="errorMessage" placeholder="Preencha apenas se a execucao falhou." />
            <SubmitButton label="Abrir run" />
          </form>
        </DashboardCard>

        <DashboardCard
          title="Fila de execucao"
          eyebrow="status / saida / handoff"
          action={<Activity size={17} className="text-[var(--admin-purple)]" />}
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-[var(--admin-border)] bg-[#070707] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Run</th>
                  <th className="px-4 py-3 font-semibold">Agente</th>
                  <th className="px-4 py-3 font-semibold">Entrada</th>
                  <th className="px-4 py-3 font-semibold">Handoff</th>
                  <th className="px-4 py-3 font-semibold">Atualizar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {recentRuns.map((run) => {
                  const handoffOptions = getHandoffOptions(workflowEdges, run);
                  const gateReady = isHumanGateRun(run);

                  return (
                  <tr key={run.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs font-bold text-white">{run.id}</p>
                      <div className="mt-2">
                        <StatusBadge tone={run.tone}>{run.status}</StatusBadge>
                      </div>
                      <p className="mt-2 text-[11px] text-[var(--admin-muted)]">{run.triggerSource || "manual"}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-white">{run.agent}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                        {run.agentKey || "agent"}
                      </p>
                      <p className="mt-2 text-xs text-[var(--admin-soft)]">{run.opportunity}</p>
                    </td>
                    <td className="max-w-[300px] px-4 py-4 text-xs leading-5 text-[var(--admin-muted)]">
                      <p>{run.inputSummary || run.nextAction}</p>
                      {run.outputSummary && <p className="mt-2 text-[var(--admin-soft)]">Saida: {run.outputSummary}</p>}
                      {run.errorMessage && <p className="mt-2 text-[var(--admin-red)]">Erro: {run.errorMessage}</p>}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-xs font-semibold text-white">{run.handoff}</p>
                      <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{run.nextAction}</p>
                      {typeof run.costEstimate === "number" && (
                        <p className="mt-2 font-mono text-[10px] text-[var(--admin-cyan)]">
                          custo ${run.costEstimate.toFixed(4)}
                        </p>
                      )}
                      <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                        tentativa {run.attemptCount || 0}/{run.maxAttempts || 3}
                      </p>
                      {(run.provider || run.model) && (
                        <p className="mt-1 font-mono text-[10px] text-[var(--admin-soft)]">
                          {run.provider || "mock"} / {run.model || "betel-deterministic-v0"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <form action={processAgentRunAction} className="mb-3 grid min-w-[310px] gap-2 rounded-md border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] p-2">
                        <input name="runCode" type="hidden" value={run.id} />
                        <input name="runtimeMode" type="hidden" value="mock" />
                        <input name="operatorLabel" type="hidden" value="Runtime Betel" />
                        <input name="provider" type="hidden" value="mock" />
                        <input name="model" type="hidden" value="betel-deterministic-v0" />
                        <Button
                          className="h-9 justify-center bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white"
                          type="submit"
                        >
                          <PlayCircle size={14} />
                          Executar agente
                        </Button>
                      </form>
                      <form action={updateAgentRunStatusAction} className="grid min-w-[310px] gap-2">
                        <input name="runCode" type="hidden" value={run.id} />
                        <div className="grid gap-2 md:grid-cols-2">
                          <select
                            className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 text-xs text-white outline-none"
                            defaultValue={run.status}
                            name="status"
                          >
                            {!runStatusOptions.some((option) => option.value === run.status) && (
                              <option value={run.status}>{run.status}</option>
                            )}
                            {runStatusOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <Input
                            className="h-9 border-[var(--admin-border)] bg-[#050505] text-xs text-white placeholder:text-[var(--admin-muted)]"
                            defaultValue={typeof run.costEstimate === "number" ? String(run.costEstimate) : ""}
                            name="costEstimate"
                            placeholder="custo"
                            step="any"
                            type="number"
                          />
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          <Input
                            className="h-9 border-[var(--admin-border)] bg-[#050505] text-xs text-white placeholder:text-[var(--admin-muted)]"
                            defaultValue={run.humanReviewStatus || "pendente"}
                            name="humanReviewStatus"
                            placeholder="revisao humana"
                          />
                          <Input
                            className="h-9 border-[var(--admin-border)] bg-[#050505] text-xs text-white placeholder:text-[var(--admin-muted)]"
                            defaultValue={run.handoff === "Sem handoff" ? "" : run.handoff}
                            name="handoffTo"
                            placeholder="handoff"
                          />
                        </div>
                        <Textarea
                          className="min-h-16 border-[var(--admin-border)] bg-[#050505] py-2 text-xs text-white placeholder:text-[var(--admin-muted)]"
                          defaultValue={run.outputSummary || ""}
                          name="outputSummary"
                          placeholder="saida do agente"
                        />
                        <Input
                          className="h-9 border-[var(--admin-border)] bg-[#050505] text-xs text-white placeholder:text-[var(--admin-muted)]"
                          defaultValue={run.errorMessage || ""}
                          name="errorMessage"
                          placeholder="erro, se houver"
                        />
                        <Button
                          className="h-9 justify-center border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] text-xs font-bold text-white hover:bg-[rgba(0,243,255,0.12)] hover:text-[var(--admin-cyan)]"
                          type="submit"
                        >
                          <RefreshCw size={14} />
                          Atualizar run
                        </Button>
                      </form>
                      {gateReady && (
                        <div className="mt-3">
                          <HumanGateForm handoffOptions={handoffOptions} run={run} />
                        </div>
                      )}
                      <form action={enqueueAgentHandoffAction} className="mt-3 grid min-w-[310px] gap-2 rounded-md border border-[var(--admin-border)] bg-[#050505] p-2">
                        <input name="currentRunCode" type="hidden" value={run.id} />
                        <select
                          className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 text-xs text-white outline-none"
                          name="handoffTarget"
                        >
                          {!handoffOptions.length && <option value="">Sem proximo agente</option>}
                          {handoffOptions.map((edge) => (
                            <option key={`${run.id}-${edge.key}`} value={`${edge.key}|${edge.toAgentKey}`}>
                              {edge.toAgent}
                            </option>
                          ))}
                        </select>
                        <Textarea
                          className="min-h-16 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] py-2 text-xs text-white placeholder:text-[var(--admin-muted)]"
                          defaultValue={`Handoff de ${run.id}: ${run.outputSummary || run.nextAction}`}
                          name="inputSummary"
                          placeholder="contexto para o proximo agente"
                        />
                        <Button
                          className="h-9 justify-center bg-[var(--admin-cyan)] text-xs font-bold text-black hover:bg-white"
                          disabled={!handoffOptions.length}
                          type="submit"
                        >
                          <ArrowRight size={14} />
                          Enfileirar proximo
                        </Button>
                      </form>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DashboardCard>
      </section>

      <section id="runtime" className="mb-4 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.65fr)]">
        <DashboardCard
          title="Runtime dos agentes"
          eyebrow="executor / worker / mock"
          action={<PlayCircle size={17} className="text-[var(--admin-green)]" />}
        >
          <div className="grid gap-3 md:grid-cols-5">
            {[
              { label: "Fila", value: runtimeStats.queued, tone: "purple" as ResourceTone },
              { label: "Executando", value: runtimeStats.running, tone: "cyan" as ResourceTone },
              { label: "Humano", value: runtimeStats.review, tone: "yellow" as ResourceTone },
              { label: "Falhas", value: runtimeStats.failed, tone: "red" as ResourceTone },
              { label: "Custo", value: `$${runtimeStats.cost.toFixed(4)}`, tone: "green" as ResourceTone },
            ].map((item) => (
              <div key={item.label} className={cn("rounded-lg border px-3 py-3", toneBg[item.tone])}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                  {item.label}
                </p>
                <p className={cn("mt-3 font-mono text-xl font-bold", toneText[item.tone])}>{item.value}</p>
              </div>
            ))}
          </div>

          <form
            action={runAgentPipelineAction}
            className="mt-4 grid gap-3 rounded-lg border border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.08)] p-3"
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-purple)]">
                  esteira piloto
                </p>
                <h3 className="mt-1 text-base font-semibold text-white">
                  {"Captacao -> curadoria -> risco -> humano"}
                </h3>
                <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--admin-soft)]">
                  Processa runs em sequencia, cria handoffs automaticos e para quando encontra aprovacao humana.
                </p>
              </div>
              <Button className="h-10 shrink-0 bg-[var(--admin-purple)] font-bold text-white hover:bg-white hover:text-black" type="submit">
                <GitBranch size={15} />
                Rodar esteira
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <TextField label="Run inicial" name="startRunCode" placeholder="opcional" />
              <TextField label="Oportunidade" name="opportunityCode" placeholder="BC-204" defaultValue="BC-204" />
              <TextField label="Operador" name="operatorLabel" placeholder="Pipeline Betel" defaultValue="Pipeline Betel" />
              <TextField label="Etapas" name="maxSteps" placeholder="4" defaultValue="4" type="number" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField label="Modo" name="runtimeMode" defaultValue="mock" options={runtimeModeOptions} />
              <TextField label="Provider" name="provider" placeholder="mock" defaultValue="mock" />
              <TextField label="Modelo" name="model" placeholder="betel-deterministic-v0" defaultValue="betel-deterministic-v0" />
            </div>
            <div className="grid gap-2">
              <Label className={labelClass} htmlFor="pipeline-input-summary">
                Entrada
              </Label>
              <Textarea
                className="min-h-20 border-[var(--admin-border)] bg-[#050505] py-2 text-xs text-white placeholder:text-[var(--admin-muted)]"
                defaultValue="Fonte homologada encontrou imovel candidato para captura, curadoria de edital, risco oculto e handoff humano antes de qualquer comunicacao externa."
                id="pipeline-input-summary"
                name="inputSummary"
              />
            </div>
          </form>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <form action={processAgentRunAction} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <SelectField label="Modo" name="runtimeMode" defaultValue="mock" options={runtimeModeOptions} />
                <TextField label="Provider" name="provider" placeholder="mock" defaultValue="mock" />
                <TextField label="Modelo" name="model" placeholder="betel-deterministic-v0" defaultValue="betel-deterministic-v0" />
              </div>
              <TextField label="Operador" name="operatorLabel" placeholder="Runtime Betel" defaultValue="Runtime Betel" />
              <Button className="h-10 bg-[var(--admin-green)] font-bold text-black hover:bg-white" type="submit">
                <PlayCircle size={15} />
                Processar proximo
              </Button>
            </form>

            <form action={processAgentRunAction} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
              <SelectField
                label="Run"
                name="runCode"
                defaultValue={recentRuns[0]?.id || ""}
                options={recentRuns.map((run) => ({ value: run.id, label: `${run.id} / ${run.agent}` }))}
              />
              <div className="grid gap-3 md:grid-cols-3">
                <SelectField label="Modo" name="runtimeMode" defaultValue="mock" options={runtimeModeOptions} />
                <TextField label="Provider" name="provider" placeholder="mock" defaultValue="mock" />
                <TextField label="Modelo" name="model" placeholder="betel-deterministic-v0" defaultValue="betel-deterministic-v0" />
              </div>
              <TextField label="Operador" name="operatorLabel" placeholder="Runtime Betel" defaultValue="Runtime Betel" />
              <Button className="h-10 border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] font-bold text-white hover:bg-[rgba(34,197,94,0.12)] hover:text-[var(--admin-green)]" type="submit">
                <Cpu size={15} />
                Processar selecionado
              </Button>
            </form>
          </div>
        </DashboardCard>

        <div className="grid gap-4">
          <DashboardCard
            title="Gate humano"
            eyebrow="aprovar / bloquear / handoff"
            action={<ShieldCheck size={17} className="text-[var(--admin-yellow)]" />}
          >
            <div className="grid gap-3">
              {humanGateRuns.length ? (
                humanGateRuns.map((run) => (
                  <div key={`${run.id}-human-gate`} className="rounded-md border border-[var(--admin-border)] bg-[#050505] p-3">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-yellow)]">
                          {run.id}
                        </p>
                        <p className="mt-1 font-semibold text-white">{run.agent}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{run.nextAction}</p>
                      </div>
                      <StatusBadge tone={run.tone}>{run.status}</StatusBadge>
                    </div>
                    <HumanGateForm compact handoffOptions={getHandoffOptions(workflowEdges, run)} run={run} />
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-3 text-xs leading-5 text-[var(--admin-muted)]">
                  Nenhum run aguardando decisao humana no momento.
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Contrato de worker"
            eyebrow="endpoint / payload"
            action={<StatusBadge tone="cyan">POST</StatusBadge>}
          >
            <div className="grid gap-2">
              <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                <p className="font-mono text-[11px] text-[var(--admin-cyan)]">/api/admin/agentes-ia/runtime</p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                  runCode, runtimeMode, provider, model e operatorLabel.
                </p>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                <p className="font-mono text-[11px] text-[var(--admin-purple)]">/api/admin/agentes-ia/pipeline</p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                  cria ou continua a esteira ate o primeiro gate humano.
                </p>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                <p className="font-mono text-[11px] text-[var(--admin-yellow)]">/api/admin/agentes-ia/human-gate</p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                  registra decisao humana e cria handoff aprovado.
                </p>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                <p className="font-mono text-[11px] text-[var(--admin-green)]">/api/admin/agentes-ia/communication</p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                  enfileira agentes de cliente, lead frio, comunidade e multicanal.
                </p>
              </div>
              {[
                "queued -> running -> completed",
                "waiting_human preserva gate juridico/compliance",
                "agent_runtime_events registra tentativa, custo e provider",
              ].map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs leading-5 text-[var(--admin-soft)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Eventos do worker"
            eyebrow="logs / tentativas / custo"
            action={<Activity size={17} className="text-[var(--admin-purple)]" />}
          >
            <div className="grid gap-2">
              {runtimeEvents.slice(0, 6).map((event) => (
                <div key={event.id} className={cn("rounded-md border px-3 py-2", toneBg[event.tone])}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[event.tone])}>
                        {event.eventType} / {event.status}
                      </p>
                      <p className="mt-1 font-semibold text-white">{event.runCode}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[var(--admin-muted)]">
                      t{event.attempt}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{event.message}</p>
                  <div className="mt-2 flex flex-wrap gap-2 font-mono text-[10px] text-[var(--admin-muted)]">
                    <span>{event.provider || "mock"}</span>
                    <span>{event.model || "betel-deterministic-v0"}</span>
                    {typeof event.durationMs === "number" && <span>{event.durationMs}ms</span>}
                    {typeof event.costEstimate === "number" && <span>${event.costEstimate.toFixed(4)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>

      <DashboardCard
        title="Escritorio virtual dos agentes"
        eyebrow="setores / salas / rituais operacionais"
        action={<StatusBadge tone="purple">empresa virtual</StatusBadge>}
        className="mb-4 scroll-mt-24"
      >
        <div id="escritorio" className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {officeRooms.map((room, index) => {
            const Icon = officeIcons[index] || Building2;

            return (
              <article key={room.key} className={cn("rounded-lg border p-4", toneBg[room.tone])}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={cn("mb-3 inline-flex h-9 w-9 items-center justify-center rounded-md border", toneBg[room.tone])}>
                      <Icon size={17} className={toneText[room.tone]} />
                    </div>
                    <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[room.tone])}>
                      {room.sector}
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-white">{room.name}</h2>
                  </div>
                  <StatusBadge tone={room.tone}>{room.status}</StatusBadge>
                </div>

                <p className="mt-3 min-h-16 text-sm leading-6 text-[var(--admin-soft)]">{room.purpose}</p>

                <div className="mt-4 grid gap-2 text-xs leading-5">
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    <span className="font-semibold text-white">Lider: </span>
                    <span className="text-[var(--admin-muted)]">{room.lead}</span>
                  </div>
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    <span className="font-semibold text-white">Modo: </span>
                    <span className="text-[var(--admin-muted)]">{room.operatingMode}</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  <SignalList label="Agentes" items={room.agents} tone={room.tone} />
                  <SignalList label="Sistemas" items={room.systems} tone="cyan" />
                </div>

                <div className="mt-3 rounded-md border border-[var(--admin-border)] bg-[#050505] p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase text-[var(--admin-muted)]">
                    Manutencao
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{room.maintenanceFocus}</p>
                </div>
              </article>
            );
          })}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Esteira de agentes"
        eyebrow="busca / curadoria / humano / comunicacao / execucao"
        action={<StatusBadge tone="cyan">fluxo principal</StatusBadge>}
        className="mb-4"
      >
        <div className="grid gap-3 xl:grid-cols-5">
          {stages.map((stage, index) => (
            <div key={stage.label} className={cn("rounded-lg border p-3", toneBg[stage.tone])}>
              <div className="flex items-start justify-between gap-3">
                <div className={cn("font-mono text-[10px] font-semibold uppercase", toneText[stage.tone])}>
                  {String(index + 1).padStart(2, "0")}
                </div>
                {index < stages.length - 1 ? (
                  <ArrowRight size={15} className="text-[var(--admin-muted)]" />
                ) : (
                  <CheckCircle2 size={15} className="text-[var(--admin-green)]" />
                )}
              </div>
              <h2 className="mt-3 text-sm font-semibold text-white">{stage.label}</h2>
              <p className="mt-2 min-h-20 text-xs leading-5 text-[var(--admin-soft)]">{stage.description}</p>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                {stage.owner}
              </p>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Pipeline visual"
        eyebrow="fluxo de trabalho / stages / agentes"
        className="mb-4 scroll-mt-24"
      >
        <div id="pipeline">
          <PipelineVisualization
            stages={agentWorkflowStages}
            edges={workflowEdges}
            groups={groups}
            directory={directory}
          />
        </div>
      </DashboardCard>

      <DashboardCard
        title="Mapa de orquestracao"
        eyebrow="handoffs / gates / proximo agente"
        action={
          <form action={syncAgentWorkflowAction}>
            <Button className="h-8 border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] text-xs text-white hover:bg-[rgba(0,243,255,0.12)] hover:text-[var(--admin-cyan)]">
              <RefreshCw size={14} />
              Sincronizar mapa
            </Button>
          </form>
        }
        className="mb-4 scroll-mt-24"
      >
        <div id="orquestracao" className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {workflowEdges.map((edge) => (
            <article key={edge.key} className={cn("rounded-lg border p-3", toneBg[edge.tone])}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[edge.tone])}>
                    {edge.key}
                  </p>
                  <h2 className="mt-2 text-sm font-semibold text-white">
                    {edge.fromAgent} {"->"} {edge.toAgent}
                  </h2>
                </div>
                <StatusBadge tone={edge.requiresHumanApproval ? "yellow" : "cyan"}>
                  {edge.requiresHumanApproval ? "Gate humano" : "Automatico"}
                </StatusBadge>
              </div>
              <p className="mt-3 text-xs leading-5 text-[var(--admin-soft)]">{edge.condition}</p>
              <div className="mt-3 grid gap-2 text-xs leading-5">
                <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                  <span className="font-semibold text-white">Trigger: </span>
                  <span className="text-[var(--admin-muted)]">{edge.trigger}</span>
                </div>
                <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                  <span className="font-semibold text-white">Saida: </span>
                  <span className="text-[var(--admin-muted)]">{edge.output}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard
        title="Diretorio de agentes"
        eyebrow="nomes / cargos / prompts / supervisao"
        action={<UserCog size={17} className="text-[var(--admin-cyan)]" />}
        className="mb-4 scroll-mt-24"
        contentClassName="p-0"
      >
        <div id="agentes" className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-[var(--admin-border)] bg-[#070707] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
              <tr>
                <th className="px-4 py-3 font-semibold">Agente</th>
                <th className="px-4 py-3 font-semibold">Setor</th>
                <th className="px-4 py-3 font-semibold">Funcao</th>
                <th className="px-4 py-3 font-semibold">Prompt</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Reporta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              {directory.map((agent) => (
                <tr key={agent.key} className="align-top">
                  <td className="px-4 py-4">
                    <Link href={`/admin/agentes-ia/${agent.key}`} className="font-semibold text-white hover:text-[var(--admin-cyan)] transition">
                      {agent.name}
                    </Link>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                      {agent.currentShift}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-medium text-[var(--admin-soft)]">{agent.department}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">{agent.currentDesk}</p>
                  </td>
                  <td className="max-w-[280px] px-4 py-4 text-xs leading-5 text-[var(--admin-muted)]">
                    {agent.functionSummary}
                  </td>
                  <td className="px-4 py-4">
                    <p className={cn("font-mono text-xs font-semibold", toneText[agent.tone])}>{agent.promptName}</p>
                    <p className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">{agent.promptVersion}</p>
                  </td>
                  <td className="px-4 py-4">
                    <form action={updateAgentStatusAction} className="grid min-w-40 gap-2">
                      <input name="agentKey" type="hidden" value={agent.key} />
                      <StatusBadge tone={statusTone[agent.status]}>{statusLabel[agent.status]}</StatusBadge>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-8 w-full rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 text-xs text-white outline-none"
                          defaultValue={agent.status}
                          name="status"
                        >
                          <option value="planned">Planejado</option>
                          <option value="supervised">Supervisionado</option>
                          <option value="active">Ativo</option>
                          <option value="paused">Pausado</option>
                        </select>
                        <button
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-cyan)] transition hover:bg-[rgba(0,243,255,0.12)]"
                          type="submit"
                          title="Salvar status"
                        >
                          <Save size={14} />
                        </button>
                      </div>
                    </form>
                  </td>
                  <td className="px-4 py-4 text-xs text-[var(--admin-muted)]">{agent.reportsTo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardCard>

      <section id="setores" className="mb-4 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.75fr)]">
        <div className="grid gap-4">
          {groups.map((group, index) => {
            const Icon = groupIcons[index] || Bot;

            return (
              <DashboardCard
                key={group.key}
                title={group.name}
                eyebrow={group.eyebrow}
                action={<StatusBadge tone={group.tone}>{group.status}</StatusBadge>}
              >
                <div className="grid gap-4 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <div className="grid content-start gap-3">
                    <div className={cn("rounded-lg border p-3", toneBg[group.tone])}>
                      <Icon size={18} className={toneText[group.tone]} />
                      <p className="mt-3 text-sm leading-6 text-[var(--admin-soft)]">{group.purpose}</p>
                    </div>

                    <div className="grid gap-2 text-xs leading-5">
                      <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                        <span className="font-semibold text-white">Trigger: </span>
                        <span className="text-[var(--admin-muted)]">{group.trigger}</span>
                      </div>
                      <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                        <span className="font-semibold text-white">Gate humano: </span>
                        <span className="text-[var(--admin-muted)]">{group.humanGate}</span>
                      </div>
                      <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                        <span className="font-semibold text-white">SLA: </span>
                        <span className="text-[var(--admin-muted)]">{group.sla}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {group.apiDependencies.map((dependency) => (
                        <span
                          key={dependency}
                          className="rounded-md border border-[var(--admin-border)] bg-[#070707] px-2 py-1 font-mono text-[10px] text-[var(--admin-muted)]"
                        >
                          {dependency}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {group.agents.map((agent) => (
                      <div key={agent.key} className="rounded-lg border border-[var(--admin-border)] bg-[#070707] p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-white">{agent.name}</h3>
                            <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{agent.role}</p>
                          </div>
                          <StatusBadge tone={statusTone[agent.status]}>{statusLabel[agent.status]}</StatusBadge>
                        </div>

                        <div className="mt-3 grid gap-2 md:grid-cols-3">
                          <MiniSpec icon={<Braces size={14} />} label="Prompt" value={`${agent.promptName} ${agent.promptVersion}`} tone={agent.tone} />
                          <MiniSpec icon={<BellRing size={14} />} label="Trigger" value={agent.trigger} tone="yellow" />
                          <MiniSpec icon={<ShieldCheck size={14} />} label="Guardrail" value={agent.guardrails[0]} tone="red" />
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <SignalList label="Entradas" items={agent.inputs} tone="cyan" />
                          <SignalList label="Saidas" items={agent.outputs} tone="green" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </DashboardCard>
            );
          })}
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard
            title="Segmentos de comunicacao"
            eyebrow="clientes / leads / canais"
            action={<MessageSquareText size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="grid gap-3">
              <form
                action={dispatchCommunicationAction}
                className="grid gap-3 rounded-lg border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-green)]">
                      despacho pos-aprovacao
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">
                      Cria runs de comunicacao somente a partir de compliance concluido e liberado.
                    </p>
                  </div>
                  <Button
                    className="h-9 shrink-0 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white"
                    disabled={!communicationReadyRuns.length}
                    type="submit"
                  >
                    <Send size={14} />
                    Despachar
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Run de compliance liberado"
                    name="sourceRunCode"
                    defaultValue={communicationReadyRuns[0]?.id || ""}
                    options={
                      communicationReadyRuns.length
                        ? communicationReadyRuns.map((run) => ({
                            value: run.id,
                            label: `${run.id} / ${run.agent}`,
                          }))
                        : [{ value: "", label: "Nenhum compliance liberado" }]
                    }
                  />
                  <SelectField
                    label="Publico"
                    name="audienceScope"
                    defaultValue="all"
                    options={communicationAudienceOptions}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <TextField
                    label="Oportunidade"
                    name="opportunityCode"
                    placeholder="BC-204"
                    defaultValue={communicationReadyRuns[0]?.opportunity || "BC-204"}
                  />
                  <TextField label="Canais" name="channels" placeholder="WhatsApp, Email, Push" defaultValue="WhatsApp, Email, Push" />
                  <TextField label="Operador" name="operatorLabel" placeholder="Growth Betel" defaultValue="Growth Betel" />
                </div>

                <div className="grid gap-2">
                  <Label className={labelClass} htmlFor="communication-message-intent">
                    Intencao
                  </Label>
                  <Textarea
                    className="min-h-16 border-[var(--admin-border)] bg-[#050505] py-2 text-xs text-white placeholder:text-[var(--admin-muted)]"
                    defaultValue="Preparar comunicacao supervisionada da oportunidade aprovada, separando mensagem completa para cliente pagante e teaser seguro para lead frio."
                    id="communication-message-intent"
                    name="messageIntent"
                  />
                </div>
              </form>

              {segments.map((segment) => (
                <div key={segment.label} className={cn("rounded-lg border p-3", toneBg[segment.tone])}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-white">{segment.label}</h3>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">{segment.agent}</p>
                    </div>
                    <StatusBadge tone={segment.tone}>{segment.status}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--admin-soft)]">{segment.audience}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{segment.rule}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Outbox de comunicacao"
            eyebrow="rascunhos / canais / guardrails"
            contentClassName="p-0"
            action={<Send size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="border-b border-[var(--admin-border)] p-4">
                <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
                  {[
                    { label: "Pendentes", value: outboxHealth.pending, tone: "cyan" as ResourceTone },
                    { label: "Agendadas", value: outboxHealth.scheduled, tone: "purple" as ResourceTone },
                    { label: "Retry", value: outboxHealth.retry, tone: "yellow" as ResourceTone },
                    { label: "Falhas", value: outboxHealth.failed, tone: "red" as ResourceTone },
                    { label: "Enviadas", value: outboxHealth.sent, tone: "green" as ResourceTone },
                ].map((item) => (
                  <div key={item.label} className={cn("rounded-md border px-3 py-2", toneBg[item.tone])}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                      {item.label}
                    </p>
                    <p className={cn("mt-1 text-lg font-semibold", toneText[item.tone])}>{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="mb-3 grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
                <div className="flex flex-wrap gap-2">
                  {outboxStatusFilters.map((filter) => (
                    <Link
                      key={`outbox-status-${filter.value}`}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold transition",
                        outboxStatusFilter === filter.value ? toneBg[filter.tone] : "border-[var(--admin-border)] text-[var(--admin-muted)]"
                      )}
                      href={queryHref(searchParams, { outboxStatus: filter.value }, "setores")}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {communicationChannelFilters
                    .filter((filter) => filter.value !== "worker")
                    .map((filter) => (
                      <Link
                        key={`outbox-channel-${filter.value}`}
                        className={cn(
                          "inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold transition",
                          outboxChannelFilter === filter.value
                            ? toneBg[filter.tone]
                            : "border-[var(--admin-border)] text-[var(--admin-muted)]"
                        )}
                        href={queryHref(searchParams, { outboxChannel: filter.value }, "setores")}
                      >
                        {filter.label}
                      </Link>
                    ))}
                </div>
              </div>

              <div className="mb-3 grid gap-3 rounded-lg border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.07)] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-green)]">
                      scheduler / cron
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">
                      Execucao automatizada usa token dedicado, mock/sandbox por padrao e dry-run em GET sem run=true.
                    </p>
                  </div>
                  <Clock3 size={17} className="shrink-0 text-[var(--admin-green)]" />
                </div>
                <div className="grid gap-2 font-mono text-[10px] text-[var(--admin-muted)] md:grid-cols-2">
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    GET /api/admin/agentes-ia/communication/scheduler?dryRun=true
                  </div>
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    CRON /api/admin/agentes-ia/communication/scheduler/cron
                  </div>
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    TOKEN CRON_SECRET ou BETEL_COMMUNICATION_SCHEDULER_TOKEN
                  </div>
                  <div className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2">
                    0 11 * * * UTC / mock / sandbox / allowExternal=false
                  </div>
                </div>
              </div>

              <div className="mb-3 grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                      homologacao de providers
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">
                      Provider real exige liberacao externa, confirmacao de homologacao e endpoint configurado.
                    </p>
                  </div>
                  <ShieldAlert size={17} className="shrink-0 text-[var(--admin-yellow)]" />
                </div>
                <div className="grid gap-2">
                  {providerHealth.map((provider) => {
                    const tone = providerHealthTone(provider);

                    return (
                      <div key={provider.channelKey} className={cn("rounded-md border px-3 py-2", toneBg[tone])}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{provider.channel}</p>
                            <p className="mt-1 truncate font-mono text-[10px] text-[var(--admin-muted)]">
                              {provider.provider}
                            </p>
                          </div>
                          <StatusBadge tone={tone}>{providerHealthLabel(provider)}</StatusBadge>
                        </div>
                        <div className="mt-3 grid gap-1 break-words font-mono text-[10px] text-[var(--admin-muted)]">
                          <span>{provider.endpointConfigured ? "endpoint ok" : "endpoint pendente"}</span>
                          <span>{provider.tokenConfigured ? "token ok" : "token pendente"}</span>
                          <span className="break-all">
                            {provider.providerReleased ? "flag liberada" : provider.releaseEnvKeys[0]}
                          </span>
                        </div>
                        {!!provider.missing.length && (
                          <p className="mt-2 break-words text-xs leading-5 text-[var(--admin-soft)]">
                            Falta: {provider.missing.join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <form
                action={processCommunicationOutboxBatchAction}
                className="mb-3 grid gap-3 rounded-lg border border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)] p-3"
              >
                <input name="processBatch" type="hidden" value="true" />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-purple)]">
                      ciclo da fila
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">
                      Processa mensagens elegiveis, agenda retry com backoff e registra o ciclo no runtime.
                    </p>
                  </div>
                  <Button
                    className="h-9 shrink-0 bg-[var(--admin-purple)] text-xs font-bold text-white hover:bg-white hover:text-black"
                    disabled={!deliverableMessages.length}
                    type="submit"
                  >
                    <RefreshCw size={14} />
                    Rodar worker
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Adaptador"
                    name="adapterMode"
                    defaultValue="mock"
                    options={deliveryAdapterOptions}
                  />
                  <TextField label="Lote" name="batchSize" placeholder="5" defaultValue="5" type="number" />
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <TextField label="Provider" name="provider" placeholder="sandbox" defaultValue="sandbox" />
                  <TextField label="Operador" name="operatorLabel" placeholder="Delivery Worker Betel" defaultValue="Delivery Worker Betel" />
                  <TextField label="Tentativas" name="maxAttempts" placeholder="3" defaultValue="3" type="number" />
                </div>

                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="allowExternal"
                      type="checkbox"
                      value="true"
                    />
                    Liberar provider externo
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="providerReleaseConfirmed"
                      type="checkbox"
                      value="true"
                    />
                    Provider homologado
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="forceFail"
                      type="checkbox"
                      value="true"
                    />
                    Simular falhas no lote
                  </label>
                </div>
              </form>

              <form
                action={processCommunicationOutboxAction}
                className="grid gap-3 rounded-lg border border-[rgba(0,243,255,0.22)] bg-[rgba(0,243,255,0.06)] p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">
                      entrega individual
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">
                      Processa uma mensagem especifica sem avançar o restante da fila.
                    </p>
                  </div>
                  <Button
                    className="h-9 shrink-0 bg-[var(--admin-cyan)] text-xs font-bold text-black hover:bg-white"
                    disabled={!deliverableMessages.length}
                    type="submit"
                  >
                    <PlayCircle size={14} />
                    Processar entrega
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <SelectField
                    label="Mensagem"
                    name="messageCode"
                    defaultValue={deliverableMessages[0]?.messageCode || ""}
                    options={
                      deliverableMessages.length
                        ? deliverableMessages.map((message) => ({
                            value: message.messageCode,
                            label: `${message.messageCode} / ${message.channel}`,
                          }))
                        : [{ value: "", label: "Nenhuma mensagem pendente" }]
                    }
                  />
                  <SelectField
                    label="Adaptador"
                    name="adapterMode"
                    defaultValue="mock"
                    options={deliveryAdapterOptions}
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <TextField label="Provider" name="provider" placeholder="sandbox" defaultValue="sandbox" />
                  <TextField label="Operador" name="operatorLabel" placeholder="Delivery Betel" defaultValue="Delivery Betel" />
                </div>

                <TextField label="Tentativas" name="maxAttempts" placeholder="3" defaultValue="3" type="number" />

                <div className="flex flex-wrap gap-3">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="allowExternal"
                      type="checkbox"
                      value="true"
                    />
                    Liberar provider externo
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="providerReleaseConfirmed"
                      type="checkbox"
                      value="true"
                    />
                    Provider homologado
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                    <input
                      className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                      name="forceFail"
                      type="checkbox"
                      value="true"
                    />
                    Forcar falha controlada
                  </label>
                </div>
              </form>
            </div>

            <div className="divide-y divide-[var(--admin-border)]">
              {filteredCommunicationOutbox.length ? (
                filteredCommunicationOutbox.slice(0, 6).map((message) => (
                  <div key={message.id} className="grid gap-3 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                          {message.messageCode}
                        </p>
                        <p className="mt-1 font-semibold text-white">{message.audience}</p>
                        <p className="mt-1 text-xs text-[var(--admin-muted)]">
                          {message.channel} / {message.detailLevel} / {message.opportunity}
                        </p>
                      </div>
                      <StatusBadge tone={message.tone}>{message.status}</StatusBadge>
                    </div>
                    <p className="text-xs leading-5 text-[var(--admin-soft)]">{message.preview}</p>
                    <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
                      <span className="font-semibold text-white">Guardrail: </span>
                      {message.guardrail}
                    </div>
                    <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[var(--admin-muted)]">
                      <span>{message.agent}</span>
                      <span>{message.runCode || "sem run"}</span>
                      <span>{message.recipientLabel}</span>
                      {message.recipientPlan && <span>plano {message.recipientPlan}</span>}
                      {!!message.recipientMatchScore && <span>match {message.recipientMatchScore}</span>}
                      {message.cadenceLabel && <span>{message.cadenceLabel}</span>}
                      {!!message.deliveryAttempt && <span>tentativa {message.deliveryAttempt}</span>}
                      {message.adapterLabel && <span>{message.adapterLabel}</span>}
                      {message.nextRetryAt && <span>retry {message.nextRetryAt}</span>}
                    </div>
                    {message.errorMessage && (
                      <div className="rounded-md border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs leading-5 text-[var(--admin-red)]">
                        {message.errorMessage}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-4 py-5 text-sm leading-6 text-[var(--admin-muted)]">
                  Nenhuma mensagem encontrada para os filtros atuais.
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Auditoria de entregas"
            eyebrow="worker / provider / retry"
            contentClassName="p-0"
            action={<Activity size={17} className="text-[var(--admin-purple)]" />}
          >
            <div className="border-b border-[var(--admin-border)] p-4">
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {[
                  { label: "Ciclos", value: communicationAuditStats.cycles, tone: "purple" as ResourceTone },
                  { label: "Enviadas", value: communicationAuditStats.sent, tone: "green" as ResourceTone },
                  { label: "Retry", value: communicationAuditStats.retry, tone: "yellow" as ResourceTone },
                  { label: "Falhas", value: communicationAuditStats.failed, tone: "red" as ResourceTone },
                ].map((item) => (
                  <div key={item.label} className={cn("rounded-md border px-3 py-2", toneBg[item.tone])}>
                    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                      {item.label}
                    </p>
                    <p className={cn("mt-1 text-lg font-semibold", toneText[item.tone])}>{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
                <div className="flex flex-wrap gap-2">
                  {auditStatusFilters.map((filter) => (
                    <Link
                      key={`audit-status-${filter.value}`}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold transition",
                        auditStatusFilter === filter.value
                          ? toneBg[filter.tone]
                          : "border-[var(--admin-border)] text-[var(--admin-muted)]"
                      )}
                      href={queryHref(searchParams, { auditStatus: filter.value }, "setores")}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {communicationChannelFilters.map((filter) => (
                    <Link
                      key={`audit-channel-${filter.value}`}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold transition",
                        auditChannelFilter === filter.value
                          ? toneBg[filter.tone]
                          : "border-[var(--admin-border)] text-[var(--admin-muted)]"
                      )}
                      href={queryHref(searchParams, { auditChannel: filter.value }, "setores")}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {auditTypeFilters.map((filter) => (
                    <Link
                      key={`audit-type-${filter.value}`}
                      className={cn(
                        "inline-flex h-8 items-center rounded-md border px-2 text-xs font-semibold transition",
                        auditTypeFilter === filter.value
                          ? toneBg[filter.tone]
                          : "border-[var(--admin-border)] text-[var(--admin-muted)]"
                      )}
                      href={queryHref(searchParams, { auditType: filter.value }, "setores")}
                    >
                      {filter.label}
                    </Link>
                  ))}
                </div>
                <p className="font-mono text-[10px] text-[var(--admin-muted)]">
                  API: /api/admin/agentes-ia/communication/audit?channel={auditChannelFilter}&status=
                  {auditStatusFilter}&eventType={auditTypeFilter}
                </p>
              </div>
            </div>

            <div className="divide-y divide-[var(--admin-border)]">
              {communicationAuditList.length ? (
                communicationAuditList.map((event) => {
                  const payload = event.payload || {};
                  const messageCode = payloadString(payload, "messageCode", event.runCode);
                  const channel = payloadString(payload, "channel", payloadString(payload, "channelKey", "canal"));
                  const providerStatus = payloadString(payload, "providerStatus", event.status);
                  const adapterLabel = payloadString(payload, "adapterLabel", event.provider || "adapter");
                  const audience = payloadString(payload, "audience", "");
                  const nextRetryAt = payloadString(payload, "nextRetryAt", "");
                  const processedCount = payloadNumber(payload, "processed");
                  const failedCount = payloadNumber(payload, "failed");
                  const pendingAfter = payloadNumber(payload, "pendingAfter");

                  return (
                    <div key={event.id} className="grid gap-3 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[event.tone])}>
                            {event.eventType}
                          </p>
                          <p className="mt-1 font-semibold text-white">{messageCode}</p>
                          <p className="mt-1 text-xs text-[var(--admin-muted)]">
                            {adapterLabel} / {channel} {audience ? `/ ${audience}` : ""}
                          </p>
                        </div>
                        <StatusBadge tone={event.tone}>{providerStatus}</StatusBadge>
                      </div>
                      <p className="text-xs leading-5 text-[var(--admin-soft)]">{event.message}</p>
                      <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[var(--admin-muted)]">
                        <span>{event.runCode}</span>
                        <span>t{event.attempt}</span>
                        {typeof event.durationMs === "number" && <span>{event.durationMs}ms</span>}
                        {!!processedCount && <span>{processedCount} processadas</span>}
                        {!!failedCount && <span>{failedCount} falhas</span>}
                        {!!pendingAfter && <span>{pendingAfter} pendentes</span>}
                        {nextRetryAt && <span>retry {nextRetryAt}</span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="px-4 py-5 text-sm leading-6 text-[var(--admin-muted)]">
                  Nenhum evento de comunicacao registrado ainda. Quando o worker rodar, os ciclos e entregas aparecem aqui.
                </div>
              )}
            </div>
          </DashboardCard>

          <DashboardCard title="Runs recentes" eyebrow="handoff / auditoria" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {recentRuns.map((run) => (
                <div key={run.id} className="grid gap-3 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-mono text-[11px] font-bold text-white">{run.id}</div>
                    <StatusBadge tone={run.tone}>{run.status}</StatusBadge>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{run.agent}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {run.opportunity} {"->"} {run.handoff}
                    </p>
                  </div>
                  <p className="text-xs leading-5 text-[var(--admin-soft)]">{run.nextAction}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Regra central"
            eyebrow="compliance"
            action={<LockKeyhole size={17} className="text-[var(--admin-red)]" />}
          >
            <div className="grid gap-2">
              {[
                "Agente nao publica oportunidade sem aprovacao humana.",
                "Lead frio nunca recebe oportunidade completa.",
                "Orientacao de lance exige contrato/autorizacao assinada.",
                "Toda API, prompt, saida e mensagem deve gerar log.",
              ].map((rule) => (
                <div
                  key={rule}
                  className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm leading-5 text-[var(--admin-soft)]"
                >
                  {rule}
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>

      <section className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
        <DashboardCard
          title="Prompts cadastrados"
          eyebrow="prompt registry / versoes / donos"
          action={<Cpu size={17} className="text-[var(--admin-purple)]" />}
          className="scroll-mt-24"
          contentClassName="p-0"
        >
          <div id="prompts" className="divide-y divide-[var(--admin-border)]">
            {promptRegistry.map((prompt) => (
              <div key={prompt.key} className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_160px]">
                <div className="min-w-0">
                  <p className={cn("truncate font-mono text-xs font-semibold", toneText[prompt.tone])}>
                    {prompt.promptName}
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">{prompt.promptVersion}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{prompt.agent}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{prompt.objective}</p>
                  <p className="mt-2 text-[11px] leading-5 text-[var(--admin-soft)]">
                    Dono: {prompt.owner} | Politica: {prompt.updatePolicy}
                  </p>
                </div>
                <div className="flex items-start justify-start lg:justify-end">
                  <StatusBadge tone={statusTone[prompt.status]}>{statusLabel[prompt.status]}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>

        <div className="grid content-start gap-4">
          <DashboardCard
            title="Sala de manutencao"
            eyebrow="qa / api / custo / logs"
            action={<Wrench size={17} className="text-[var(--admin-yellow)]" />}
            className="scroll-mt-24"
          >
            <div id="manutencao" className="grid gap-3">
              {maintenanceQueue.map((item) => (
                <div key={item.code} className={cn("rounded-lg border p-3", toneBg[item.tone])}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[item.tone])}>
                        {item.code} / {item.severity}
                      </p>
                      <h3 className="mt-1 font-semibold text-white">{item.area}</h3>
                    </div>
                    <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[var(--admin-soft)]">{item.check}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                    {item.owner}: {item.nextAction}
                  </p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Contrato operacional"
            eyebrow="como cada setor trabalha"
            action={<ClipboardList size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="grid gap-2">
              <div className="rounded-md border border-[var(--admin-border)] bg-[#070707] px-3 py-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Network size={14} className="text-[var(--admin-cyan)]" />
                  Setores conectados por handoff, nao por decisao solta.
                </div>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                  Cada sala recebe entradas claras, gera saidas auditaveis e passa o trabalho para o proximo setor com
                  log.
                </p>
              </div>
              {[
                "Agente tem nome, funcao, prompt, versao, dono e status.",
                "Sala de manutencao pode pausar agente, ajustar prompt ou pedir revisao.",
                "Setor juridico e compliance continuam acima da automacao.",
              ].map((rule) => (
                <div
                  key={rule}
                  className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm leading-5 text-[var(--admin-soft)]"
                >
                  {rule}
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}

function TextField({
  label,
  name,
  placeholder,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Input
        className={inputClass}
        defaultValue={defaultValue}
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <select className={selectClass} defaultValue={defaultValue} id={name} name={name}>
        {options.map((option) => (
          <option key={option.value || option.label} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextAreaField({
  label,
  name,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Textarea className={textAreaClass} id={name} name={name} placeholder={placeholder} required={required} />
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  return (
    <Button className="h-10 bg-[var(--admin-cyan)] font-bold text-black hover:bg-white" type="submit">
      <Save size={15} />
      {label}
    </Button>
  );
}

function MiniSpec({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: ResourceTone;
}) {
  return (
    <div className={cn("min-h-24 rounded-md border px-3 py-2", toneBg[tone])}>
      <div className={cn("flex items-center gap-2 font-mono text-[10px] uppercase", toneText[tone])}>
        {icon}
        {label}
      </div>
      <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{value}</p>
    </div>
  );
}

function SignalList({ label, items, tone }: { label: string; items: string[]; tone: ResourceTone }) {
  return (
    <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
      <p className={cn("font-mono text-[10px] font-semibold uppercase", toneText[tone])}>{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-2 py-1 text-[11px] text-[var(--admin-muted)]">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
