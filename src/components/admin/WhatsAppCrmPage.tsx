"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  Flame,
  Gauge,
  Headphones,
  Loader2,
  MessageCircle,
  Paperclip,
  PauseCircle,
  Phone,
  Play,
  Radio,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  StickyNote,
  Tags,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  UserMinus,
  UserRound,
  Users,
  UserX,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import type {
  DataResult,
  WhatsAppCrmData,
  WhatsAppCrmLeadCard,
  WhatsAppCrmStage,
  WhatsAppCrmTimelineItem,
} from "@/lib/admin/repository";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { WillianAgentPanel } from "@/components/admin/WillianAgentPanel";
import type { ResourceTone } from "@/lib/admin/resources";
import type { WillianAgentConfig, WillianInstanceState } from "@/lib/communication/willian-types";
import type { WhatsAppHealthCheckStatus, WhatsAppOperationalHealth } from "@/lib/whatsapp/operational-health-types";
import { cn } from "@/lib/utils";

type PanelTabKey = "inbox" | "agents";
type FilterKey = "todos" | "semresposta" | "handoff" | "quentes" | "sla" | "followup";
type LeadActionKey =
  | "pause_ai"
  | "resume_ai"
  | "opt_out"
  | "clear_opt_out"
  | "cancel_followups"
  | "schedule_followup"
  | "review_good"
  | "review_bad"
  | "update_internal_context";
type FeedbackState = { type: "ok" | "err"; msg: string } | null;
type ActionIcon = ComponentType<{ size?: number; className?: string }>;
type ContextDraft = {
  leadId: string;
  internalNotes: string;
  internalTags: string;
  assignedToLabel: string;
};
type StageDraft = {
  leadId: string;
  crmStage: WhatsAppCrmStage | "";
};

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBg: Record<ResourceTone, string> = {
  cyan: "border-[rgba(200,90,31,0.24)] bg-[rgba(200,90,31,0.08)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)]",
  yellow: "border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)]",
  red: "border-[rgba(239,68,68,0.30)] bg-[rgba(239,68,68,0.08)]",
  purple: "border-[rgba(139,92,246,0.25)] bg-[rgba(139,92,246,0.08)]",
  muted: "border-[var(--admin-border)] bg-white/80",
};

const filterLabels: Record<FilterKey, string> = {
  todos: "Todos",
  semresposta: "Sem resposta",
  handoff: "Handoff",
  quentes: "Quentes",
  sla: "SLA",
  followup: "Follow-up",
};

const panelTabs: Array<{ key: PanelTabKey; label: string; detail: string; icon: ActionIcon }> = [
  { key: "inbox", label: "Inbox", detail: "fila, CRM e conversa", icon: MessageCircle },
  { key: "agents", label: "Agentes", detail: "prompt, voz e conexao", icon: Bot },
];

const crmStages: Array<{ key: WhatsAppCrmStage; label: string; tone: ResourceTone }> = [
  { key: "entrada", label: "Entrada", tone: "muted" },
  { key: "qualificando", label: "Qualificando", tone: "yellow" },
  { key: "quente", label: "Quente", tone: "green" },
  { key: "handoff", label: "Handoff", tone: "purple" },
  { key: "convertido", label: "Convertido", tone: "cyan" },
  { key: "perdido", label: "Perdido", tone: "red" },
];

const crmStageLabels = Object.fromEntries(crmStages.map((stage) => [stage.key, stage.label])) as Record<WhatsAppCrmStage, string>;
const crmStageTone = Object.fromEntries(crmStages.map((stage) => [stage.key, stage.tone])) as Record<WhatsAppCrmStage, ResourceTone>;

const slaTone: Record<WhatsAppCrmLeadCard["slaStatus"], ResourceTone> = {
  ok: "green",
  urgente: "yellow",
  vencido: "red",
  pausado: "muted",
};

const slaLabel: Record<WhatsAppCrmLeadCard["slaStatus"], string> = {
  ok: "No prazo",
  urgente: "Urgente",
  vencido: "SLA vencido",
  pausado: "Pausado",
};

function formatDateTime(value: string) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatRelative(value: string) {
  if (!value) return "sem registro";
  const date = new Date(value);
  const ms = Date.now() - date.getTime();
  if (!Number.isFinite(ms)) return "sem registro";
  if (ms < 60_000) return "agora";
  if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 24 * 60 * 60_000) return `${Math.floor(ms / (60 * 60_000))} h`;
  return `${Math.floor(ms / (24 * 60 * 60_000))} d`;
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 12 && digits.startsWith("55")) {
    return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
  }
  return phone || "Sem telefone";
}

function leadInitials(lead: Pick<WhatsAppCrmLeadCard, "name" | "phone">) {
  const source = lead.name && lead.name !== "Lead WhatsApp" ? lead.name : lead.phone;
  const words = source
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
  return initials || "LW";
}

function LeadAvatar({
  lead,
  size = "md",
}: {
  lead: Pick<WhatsAppCrmLeadCard, "name" | "phone" | "profileImageUrl">;
  size?: "sm" | "md" | "lg";
}) {
  const safeImageUrl = (lead.profileImageUrl || "").replace(/"/g, "%22");
  const sizeClass = size === "lg" ? "h-14 w-14 text-sm" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-11 w-11 text-xs";

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full border border-[rgba(200,90,31,0.24)] bg-[rgba(200,90,31,0.10)] bg-cover bg-center font-bold text-[var(--admin-cyan)] shadow-sm",
        "inline-flex items-center justify-center",
        sizeClass
      )}
      style={safeImageUrl ? { backgroundImage: `url("${safeImageUrl}")` } : undefined}
      title={safeImageUrl ? "Foto sincronizada do WhatsApp" : "Foto do WhatsApp ainda nao sincronizada"}
    >
      {!safeImageUrl && leadInitials(lead)}
    </div>
  );
}

function getMetric(data: WhatsAppCrmData, label: string, fallback: Omit<WhatsAppCrmData["metrics"][number], "label">) {
  const found = data.metrics.find((metric) => metric.label.toLowerCase() === label.toLowerCase());
  return found || { label, ...fallback };
}

function whatsappStatusLooksDisconnected(value: unknown) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return Boolean(
    status.includes("disconnect") ||
      status.includes("not_connected") ||
      status.includes("notconnected") ||
      status.includes("not_logged") ||
      status.includes("notlogged") ||
      status.includes("logout") ||
      status.includes("qr") ||
      status.includes("scan") ||
      status.includes("pair") ||
      ["close", "closed", "offline", "deleted", "archived"].includes(status)
  );
}

function whatsappStatusLooksTerminallyDisconnected(value: unknown) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return Boolean(
    status.includes("disconnect") ||
      status.includes("not_connected") ||
      status.includes("notconnected") ||
      status.includes("not_logged") ||
      status.includes("notlogged") ||
      status.includes("logout") ||
      ["close", "closed", "offline", "deleted", "archived"].includes(status)
  );
}

function whatsappStatusLooksConnected(value: unknown) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!status || whatsappStatusLooksDisconnected(status)) return false;
  return (
    status.includes("connect") ||
    ["open", "online", "ready", "logged", "loggedin", "logged_in", "authenticated"].includes(status)
  );
}

function hasActiveWhatsappAgent(agent: {
  connected?: boolean;
  connectedAt?: string;
  displayName?: string;
  phoneNumber?: string;
  profileImageSyncedAt?: string;
  profileImageUrl?: string;
  runtimeStatus?: string;
  status?: string;
}) {
  const runtimeStatus = String(agent.runtimeStatus || "").toLowerCase();
  if (["paused", "pausado", "inactive", "disabled", "archived", "deleted"].includes(runtimeStatus)) return false;

  const hasSyncedProfile = Boolean(
    agent.phoneNumber &&
      (agent.profileImageSyncedAt ||
        agent.profileImageUrl ||
        agent.displayName)
  );

  return Boolean(
    agent.connected ||
      agent.connectedAt ||
      whatsappStatusLooksConnected(agent.status) ||
      (!whatsappStatusLooksTerminallyDisconnected(agent.status) && hasSyncedProfile)
  );
}

function contextDraftFromLead(lead?: WhatsAppCrmLeadCard): ContextDraft {
  return {
    leadId: lead?.id || "",
    internalNotes: lead?.internalNotes || "",
    internalTags: lead?.internalTags.join(", ") || "",
    assignedToLabel: lead?.assignedToLabel || "",
  };
}

function stageDraftFromLead(lead?: WhatsAppCrmLeadCard): StageDraft {
  return {
    leadId: lead?.id || "",
    crmStage: lead?.crmStage || "",
  };
}

function contextTagsFromText(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function scoreTone(score: number): ResourceTone {
  if (score >= 85) return "cyan";
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "muted";
}

function reviewTone(score: number, verdict: string): ResourceTone {
  const normalized = verdict.toLowerCase();
  if (normalized.includes("bloquear") || score < 55) return "red";
  if (normalized.includes("handoff") || normalized.includes("monitorar") || score < 75) return "yellow";
  return "green";
}

function timelineIcon(item: WhatsAppCrmTimelineItem) {
  const messageType = item.messageType.toLowerCase();
  const mimeType = item.mediaMimeType.toLowerCase();
  if (messageType.includes("audio") || mimeType.includes("audio")) return Headphones;
  if (item.mediaUrl) return Paperclip;
  if (item.authorType === "lead") return UserRound;
  if (item.authorType === "human") return CheckCircle2;
  return Bot;
}

function messageKindLabel(item: WhatsAppCrmTimelineItem) {
  const messageType = item.messageType.toLowerCase();
  const mimeType = item.mediaMimeType.toLowerCase();
  if (messageType.includes("audio") || mimeType.includes("audio")) return "Audio";
  if (messageType.includes("image") || mimeType.includes("image")) return "Imagem";
  if (item.mediaUrl) return "Midia";
  if (item.authorType === "human") return "Humano";
  return "Texto";
}

function directionLabel(value: string) {
  if (value === "inbound") return "Lead";
  if (value === "outbound") return "Atendente";
  return value || "Sem mensagem";
}

function hasQualificationValue(value: string) {
  return value && value !== "Nao informado" && value !== "-";
}

function LeadScore({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <div className="min-w-[92px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={cn("font-mono text-xs font-bold", toneText[tone])}>{score}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">score</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", tone === "cyan" ? "bg-[var(--admin-cyan)]" : tone === "green" ? "bg-[var(--admin-green)]" : tone === "yellow" ? "bg-[var(--admin-yellow)]" : "bg-white/25")} style={{ width: `${Math.max(4, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm text-[var(--admin-foreground)]">{value || "Nao informado"}</p>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  children,
  onClick,
  busy,
  disabled,
  tone = "muted",
  title,
}: {
  icon: ActionIcon;
  children: string;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  tone?: ResourceTone;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      title={title || children}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-xs font-semibold text-[var(--admin-foreground)] transition disabled:cursor-not-allowed disabled:opacity-55",
        toneBg[tone],
        !disabled && !busy ? "hover:border-white/50 hover:bg-white/[0.06]" : ""
      )}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

function formatHealthPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`;
}

function healthCheckIcon(status: WhatsAppHealthCheckStatus) {
  if (status === "ok") return CheckCircle2;
  if (status === "warning") return AlertTriangle;
  return XCircle;
}

function OperationalReadinessPanel({
  health,
  busy,
  onRefresh,
}: {
  health: WhatsAppOperationalHealth;
  busy?: boolean;
  onRefresh: () => void;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const blockers = health.readiness.blockers;
  const warnings = health.readiness.warnings;
  const nextActions = health.readiness.nextActions.slice(0, 5);
  const readinessTone = health.readiness.tone;
  const canServeTone: ResourceTone = health.readiness.canAutoServePrivateChats ? "green" : "red";
  const canConvertTone: ResourceTone = health.readiness.canConvertWithFollowUp ? "green" : "yellow";
  const blockerTone: ResourceTone = blockers.length ? "red" : "green";
  const warningTone: ResourceTone = warnings.length ? "yellow" : "green";
  const firstAction = nextActions[0] || "Manter monitoramento e auditoria recorrente.";

  return (
    <section className="min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-foreground)] shadow-sm shadow-[rgba(81,60,36,0.05)]">
      <div className="grid gap-3 p-3 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-center">
        <div className={cn("rounded-md border px-3 py-2", toneBg[readinessTone])}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                Prontidao
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className={cn("font-mono text-2xl font-bold leading-none", toneText[readinessTone])}>
                  {health.readiness.score}
                </p>
                <span className="truncate text-xs font-semibold text-[var(--admin-foreground)]">
                  {health.readiness.label}
                </span>
              </div>
            </div>
            <Gauge size={18} className={toneText[readinessTone]} />
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/50">
            <div
              className={cn(
                "h-full rounded-full",
                readinessTone === "green"
                  ? "bg-[var(--admin-green)]"
                  : readinessTone === "yellow"
                    ? "bg-[var(--admin-yellow)]"
                    : "bg-[var(--admin-red)]"
              )}
              style={{ width: `${Math.max(4, health.readiness.score)}%` }}
            />
          </div>
        </div>

        <div className="grid min-w-0 gap-2 sm:grid-cols-2 2xl:grid-cols-5">
          <div className="min-h-[58px] rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                Atender
              </p>
              <CheckCircle2 size={14} className={toneText[canServeTone]} />
            </div>
            <p className={cn("mt-1 text-sm font-semibold", toneText[canServeTone])}>
              {health.readiness.canAutoServePrivateChats ? "Liberado" : "Bloqueado"}
            </p>
          </div>

          <div className="min-h-[58px] rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                Converter
              </p>
              <Flame size={14} className={toneText[canConvertTone]} />
            </div>
            <p className={cn("mt-1 text-sm font-semibold", toneText[canConvertTone])}>
              {health.readiness.canConvertWithFollowUp ? "Liberado" : "Pendente"}
            </p>
          </div>

          <div className="min-h-[58px] rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                Bloqueios
              </p>
              <ShieldAlert size={14} className={toneText[blockerTone]} />
            </div>
            <p className={cn("mt-1 text-sm font-semibold", toneText[blockerTone])}>
              {blockers.length ? blockers.length : "0"}
            </p>
          </div>

          <div className="min-h-[58px] rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                Alertas
              </p>
              <AlertTriangle size={14} className={toneText[warningTone]} />
            </div>
            <p className={cn("mt-1 text-sm font-semibold", toneText[warningTone])}>
              {warnings.length ? warnings.length : "0"}
            </p>
          </div>

          <div className="min-h-[58px] rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2 sm:col-span-2 2xl:col-span-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                Proxima acao
              </p>
              <ClipboardCheck size={14} className="text-[var(--admin-muted)]" />
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-medium leading-5 text-[var(--admin-foreground)]">
              {firstAction}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 xl:justify-end">
          <StatusBadge tone={health.source === "supabase" ? "green" : "yellow"}>
            {health.source === "supabase" ? "dados reais" : "fallback"}
          </StatusBadge>
          <ActionButton icon={RefreshCw} tone="muted" busy={busy} onClick={onRefresh}>
            Atualizar
          </ActionButton>
          <button
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((value) => !value)}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] transition hover:border-[rgba(200,90,31,0.32)] hover:bg-[rgba(200,90,31,0.06)]"
          >
            Detalhes
            <ChevronDown
              size={14}
              className={cn("transition-transform", detailsOpen ? "rotate-180" : "")}
            />
          </button>
        </div>
      </div>

      {detailsOpen && (
        <div className="grid gap-3 border-t border-[var(--admin-border)] p-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 overflow-hidden rounded-md border border-[var(--admin-border)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-[var(--admin-border)] bg-[rgba(81,60,36,0.04)]">
                  <tr className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                    <th className="px-3 py-2 font-semibold">Area</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Impacto</th>
                    <th className="px-3 py-2 font-semibold">Acao</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-border)]">
                  {health.checks.map((check) => {
                    const Icon = healthCheckIcon(check.status);
                    const tone: ResourceTone = check.status === "ok" ? "green" : check.status === "warning" ? "yellow" : "red";
                    return (
                      <tr key={check.id} className="align-top">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2 font-semibold text-[var(--admin-foreground)]">
                            <Icon size={14} className={toneText[tone]} />
                            {check.label}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={tone}>
                            {check.status === "ok" ? "ok" : check.status === "warning" ? "atencao" : "critico"}
                          </StatusBadge>
                        </td>
                        <td className="px-3 py-2 leading-5 text-[var(--admin-muted)]">{check.summary}</td>
                        <td className={cn("px-3 py-2 leading-5", toneText[tone])}>{check.action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[var(--admin-foreground)]">Prioridade operacional</p>
                <StatusBadge tone={readinessTone}>{health.readiness.label}</StatusBadge>
              </div>
              <div className="mt-3 grid gap-2">
                {(blockers.length ? blockers : ["Sem bloqueios criticos."]).slice(0, 3).map((item) => (
                  <p
                    key={item}
                    className={cn(
                      "rounded border-l-2 bg-white/[0.02] px-2 py-1.5 text-xs leading-5",
                      blockers.length
                        ? "border-l-[var(--admin-red)] text-[var(--admin-red)]"
                        : "border-l-[var(--admin-green)] text-[var(--admin-green)]"
                    )}
                  >
                    {item}
                  </p>
                ))}
                {warnings.slice(0, 3).map((item) => (
                  <p
                    key={item}
                    className="rounded border-l-2 border-l-[var(--admin-yellow)] bg-white/[0.02] px-2 py-1.5 text-xs leading-5 text-[var(--admin-yellow)]"
                  >
                    {item}
                  </p>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3">
              <p className="text-xs font-semibold text-[var(--admin-foreground)]">Proximos passos</p>
              <ol className="mt-3 grid gap-2">
                {nextActions.length ? (
                  nextActions.map((item, index) => (
                    <li
                      key={item}
                      className="grid grid-cols-[22px_minmax(0,1fr)] gap-2 text-xs leading-5 text-[var(--admin-muted)]"
                    >
                      <span className="grid size-5 place-items-center rounded border border-[var(--admin-border)] font-mono text-[10px] text-[var(--admin-foreground)]">
                        {index + 1}
                      </span>
                      <span>{item}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-[var(--admin-muted)]">Manter monitoramento e auditoria recorrente.</li>
                )}
              </ol>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <InfoCell label="Follow-up falha" value={formatHealthPercent(health.followUps.failureRate)} />
              <InfoCell label="Reviews" value={`${health.quality.averageScore}/100`} />
              <InfoCell label="Grupos ativos" value={`${health.groups.destinationsActive}/${health.groups.destinationsTotal}`} />
              <InfoCell label="Templates Meta" value={`${health.metaOfficial.templatesApproved}/${health.metaOfficial.templatesTotal}`} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LeadQueueItem({
  lead,
  selected,
  onSelect,
}: {
  lead: WhatsAppCrmLeadCard;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full gap-3 border-b border-[var(--admin-border)] px-4 py-4 text-left transition last:border-b-0 lg:grid-cols-[minmax(0,1fr)_120px_112px]",
        selected ? "bg-[rgba(0,243,255,0.06)]" : "hover:bg-[rgba(255,255,255,0.03)]"
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <LeadAvatar lead={lead} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-sm font-semibold text-white">{lead.name}</p>
            <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
            {lead.waitingForReply && <StatusBadge tone="red">sem resposta</StatusBadge>}
            {lead.humanInterventionActive && <StatusBadge tone="yellow">humano</StatusBadge>}
            {lead.optOut && <StatusBadge tone="muted">opt-out</StatusBadge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--admin-muted)]">
            <span className="inline-flex items-center gap-1">
              <Phone size={12} />
              {formatPhone(lead.phone)}
            </span>
            <span>{lead.agentName}</span>
            {lead.assignedToLabel && <span>resp. {lead.assignedToLabel}</span>}
            <span>{lead.messageCount} msgs</span>
          </div>
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">{lead.lastMessagePreview}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {lead.tags.map((tag) => (
              <span key={tag} className="rounded border border-[var(--admin-border)] bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      <LeadScore score={lead.score} />
      <div className="flex flex-col items-start gap-2 lg:items-end">
        <StatusBadge tone={slaTone[lead.slaStatus]}>{slaLabel[lead.slaStatus]}</StatusBadge>
        <span className="inline-flex items-center gap-1 text-xs text-[var(--admin-muted)]">
          <Clock3 size={12} />
          {formatRelative(lead.lastMessageAt)}
        </span>
      </div>
    </button>
  );
}

function LeadDetail({
  lead,
  busyAction,
  onLeadAction,
  manualReply,
  onManualReplyChange,
  onSendManualReply,
  contextDraft,
  onContextDraftChange,
  onSaveContext,
  stageDraft,
  onStageDraftChange,
  onSaveStage,
}: {
  lead?: WhatsAppCrmLeadCard;
  busyAction: string | null;
  onLeadAction: (action: LeadActionKey, lead: WhatsAppCrmLeadCard) => void;
  manualReply: string;
  onManualReplyChange: (value: string) => void;
  onSendManualReply: (lead: WhatsAppCrmLeadCard) => void;
  contextDraft: ContextDraft;
  onContextDraftChange: (patch: Partial<ContextDraft>) => void;
  onSaveContext: (lead: WhatsAppCrmLeadCard) => void;
  stageDraft: StageDraft;
  onStageDraftChange: (patch: Partial<StageDraft>) => void;
  onSaveStage: (lead: WhatsAppCrmLeadCard) => void;
}) {
  if (!lead) {
    return (
      <DashboardCard title="Dossie do lead" eyebrow="whatsapp / crm">
        <div className="py-10 text-center text-sm text-[var(--admin-muted)]">Nenhum lead na fila atual.</div>
      </DashboardCard>
    );
  }

  const qualificationItems = [
    ["Capital", lead.qualification.capital],
    ["Regiao", lead.qualification.region],
    ["Tipo", lead.qualification.propertyType],
    ["Objetivo", lead.qualification.objective],
    ["Experiencia", lead.qualification.experience],
    ["Urgencia", lead.qualification.urgency],
  ] as const;
  const filled = qualificationItems.filter(([, value]) => hasQualificationValue(value)).length;
  const selectedCrmStage = stageDraft.crmStage || lead.crmStage;

  return (
    <DashboardCard
      title="Dossie do lead"
      eyebrow="perfil / historico / proxima acao"
      action={<StatusBadge tone={slaTone[lead.slaStatus]}>{slaLabel[lead.slaStatus]}</StatusBadge>}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <LeadAvatar lead={lead} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-white">{lead.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--admin-muted)]">
              <span>{formatPhone(lead.phone)}</span>
              {lead.whatsappUrl && (
                <a
                  href={lead.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] transition hover:text-white"
                >
                  Abrir WhatsApp
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
          </div>
        </div>
        <LeadScore score={lead.score} />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <InfoCell label="Agente" value={lead.agentName} />
        <InfoCell label="Origem" value={lead.source} />
        <InfoCell label="Etapa CRM" value={crmStageLabels[lead.crmStage]} />
        <InfoCell label="Status" value={lead.status} />
        <InfoCell label="Responsavel" value={lead.assignedToLabel || "Fila IA"} />
        <InfoCell label="Ultima direcao" value={directionLabel(lead.lastMessageDirection)} />
        <InfoCell label="Ultima msg" value={formatDateTime(lead.lastMessageAt)} />
      </div>

      <div className={cn("mt-5 rounded-lg border px-4 py-3", toneBg[lead.humanInterventionActive ? "yellow" : "cyan"])}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Proxima acao</p>
        <p className="mt-2 text-sm leading-6 text-white">{lead.nextAction}</p>
      </div>

      {lead.runtimeDecision.primaryIntent && (
        <div className="mt-3 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-xs font-semibold text-white">
              <Bot size={14} className="text-[var(--admin-cyan)]" />
              Motor de atendimento
            </p>
            <StatusBadge tone={lead.runtimeDecision.riskFlags.length ? "yellow" : "cyan"}>
              {lead.runtimeDecision.stage ? crmStageLabels[lead.runtimeDecision.stage] : lead.runtimeDecision.primaryIntent}
            </StatusBadge>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <InfoCell label="Intencao" value={lead.runtimeDecision.primaryIntent} />
            <InfoCell label="Confianca" value={formatHealthPercent(lead.runtimeDecision.confidence)} />
            <InfoCell label="Atualizado" value={formatRelative(lead.runtimeDecision.updatedAt)} />
          </div>
          <div className="mt-3 grid gap-2">
            {lead.runtimeDecision.qualificationMissing.length > 0 && (
              <p className="rounded border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-2 py-1.5 text-xs leading-5 text-[var(--admin-yellow)]">
                Falta coletar: {lead.runtimeDecision.qualificationMissing.slice(0, 3).join(", ")}
              </p>
            )}
            {lead.runtimeDecision.riskFlags.length > 0 && (
              <p className="rounded border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-2 py-1.5 text-xs leading-5 text-[var(--admin-red)]">
                Risco: {lead.runtimeDecision.riskFlags.slice(0, 3).join(", ")}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-3 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white">Etapa do funil</p>
          <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-muted)]">CRM WhatsApp</span>
            <select
              value={selectedCrmStage}
              onChange={(event) => onStageDraftChange({ crmStage: event.target.value as WhatsAppCrmStage })}
              className="h-9 rounded-md border border-[var(--admin-border)] bg-black/20 px-3 text-sm text-white outline-none focus:border-[var(--admin-cyan)]"
            >
              {crmStages.map((stage) => (
                <option key={stage.key} value={stage.key}>
                  {stage.label}
                </option>
              ))}
            </select>
          </label>
          <ActionButton
            icon={Save}
            tone="green"
            busy={busyAction === `${lead.id}:update_crm_stage`}
            disabled={!selectedCrmStage || selectedCrmStage === lead.crmStage}
            onClick={() => onSaveStage(lead)}
            title="Salvar etapa do funil"
          >
            Salvar etapa
          </ActionButton>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-white">
            <StickyNote size={14} className="text-[var(--admin-cyan)]" />
            Contexto interno
          </p>
          <StatusBadge tone={lead.assignedToLabel ? "purple" : "muted"}>
            {lead.assignedToLabel ? `resp. ${lead.assignedToLabel}` : "fila"}
          </StatusBadge>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-muted)]">Responsavel</span>
            <input
              value={contextDraft.assignedToLabel}
              onChange={(event) => onContextDraftChange({ assignedToLabel: event.target.value })}
              placeholder="Nome do atendente"
              className="h-9 rounded-md border border-[var(--admin-border)] bg-black/20 px-3 text-sm text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-muted)]">
              <Tags size={12} />
              Tags
            </span>
            <input
              value={contextDraft.internalTags}
              onChange={(event) => onContextDraftChange({ internalTags: event.target.value })}
              placeholder="ex: visita, edital, documentacao"
              className="h-9 rounded-md border border-[var(--admin-border)] bg-black/20 px-3 text-sm text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
            />
          </label>
        </div>
        <textarea
          value={contextDraft.internalNotes}
          onChange={(event) => onContextDraftChange({ internalNotes: event.target.value })}
          placeholder="Notas internas do atendimento"
          rows={3}
          className="mt-2 min-h-[84px] w-full resize-none rounded-md border border-[var(--admin-border)] bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[10px] text-[var(--admin-muted)]">{contextDraft.internalNotes.trim().length}/1800</span>
          <ActionButton
            icon={Save}
            tone="cyan"
            busy={busyAction === `${lead.id}:update_internal_context`}
            disabled={!lead.leadId && !lead.conversationId}
            onClick={() => onSaveContext(lead)}
            title="Salvar contexto interno"
          >
            Salvar contexto
          </ActionButton>
        </div>
      </div>

      {lead.latestReviewScore > 0 && (
        <div className={cn("mt-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-3", toneBg[reviewTone(lead.latestReviewScore, lead.latestReviewVerdict)])}>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Auditoria IA</p>
            <p className="mt-1 truncate text-sm text-white">{lead.latestReviewVerdict || "monitorar"}</p>
          </div>
          <div className={cn("font-mono text-2xl font-bold", toneText[reviewTone(lead.latestReviewScore, lead.latestReviewVerdict)])}>
            {lead.latestReviewScore}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="mb-3 text-xs font-semibold text-white">Comandos da conversa</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon={UserCheck}
            tone="yellow"
            busy={busyAction === `${lead.id}:pause_ai`}
            disabled={lead.humanInterventionActive}
            onClick={() => onLeadAction("pause_ai", lead)}
            title="Pausar a IA e assumir atendimento humano"
          >
            Assumir
          </ActionButton>
          <ActionButton
            icon={Bot}
            tone="green"
            busy={busyAction === `${lead.id}:resume_ai`}
            disabled={!lead.humanInterventionActive || lead.optOut}
            onClick={() => onLeadAction("resume_ai", lead)}
            title="Retomar atendimento automatico"
          >
            Retomar IA
          </ActionButton>
          <ActionButton
            icon={UserX}
            tone="red"
            busy={busyAction === `${lead.id}:opt_out`}
            disabled={lead.optOut}
            onClick={() => onLeadAction("opt_out", lead)}
            title="Marcar que o lead nao deseja novas mensagens"
          >
            Opt-out
          </ActionButton>
          <ActionButton
            icon={UserMinus}
            tone="muted"
            busy={busyAction === `${lead.id}:clear_opt_out`}
            disabled={!lead.optOut}
            onClick={() => onLeadAction("clear_opt_out", lead)}
            title="Remover opt-out manualmente"
          >
            Liberar
          </ActionButton>
          <ActionButton
            icon={CalendarClock}
            tone="cyan"
            busy={busyAction === `${lead.id}:schedule_followup`}
            disabled={!lead.conversationId || lead.optOut || lead.humanInterventionActive}
            onClick={() => onLeadAction("schedule_followup", lead)}
            title="Preparar follow-up manual para esta conversa"
          >
            FUP agora
          </ActionButton>
          <ActionButton
            icon={XCircle}
            tone="muted"
            busy={busyAction === `${lead.id}:cancel_followups`}
            disabled={!lead.conversationId}
            onClick={() => onLeadAction("cancel_followups", lead)}
            title="Cancelar follow-ups pendentes desta conversa"
          >
            Cancelar FUP
          </ActionButton>
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <ActionButton
            icon={ThumbsUp}
            tone="green"
            busy={busyAction === `${lead.id}:review_good`}
            disabled={!lead.conversationId}
            onClick={() => onLeadAction("review_good", lead)}
            title="Registrar que a ultima resposta do agente foi boa"
          >
            Resposta boa
          </ActionButton>
          <ActionButton
            icon={ThumbsDown}
            tone="red"
            busy={busyAction === `${lead.id}:review_bad`}
            disabled={!lead.conversationId}
            onClick={() => onLeadAction("review_bad", lead)}
            title="Registrar resposta ruim e enviar conversa para humano"
          >
            Revisar resposta
          </ActionButton>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white">Resposta humana</p>
          <StatusBadge tone={lead.humanInterventionActive ? "yellow" : "muted"}>
            {lead.humanInterventionActive ? "humano ativo" : "opcional"}
          </StatusBadge>
        </div>
        <textarea
          value={manualReply}
          onChange={(event) => onManualReplyChange(event.target.value)}
          placeholder="Escreva a mensagem que sera enviada pelo WhatsApp"
          rows={4}
          className="min-h-[104px] w-full resize-none rounded-md border border-[var(--admin-border)] bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[10px] text-[var(--admin-muted)]">{manualReply.trim().length}/2200</span>
          <ActionButton
            icon={Send}
            tone="green"
            busy={busyAction === `${lead.id}:manual_reply`}
            disabled={!lead.conversationId || !manualReply.trim()}
            onClick={() => onSendManualReply(lead)}
            title="Enviar mensagem humana por WhatsApp"
          >
            Enviar humano
          </ActionButton>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white">Qualificacao</p>
          <span className="font-mono text-[10px] text-[var(--admin-muted)]">{filled}/6 campos</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {qualificationItems.map(([label, value]) => (
            <InfoCell key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-white">Conversa</p>
          <span className="font-mono text-[10px] text-[var(--admin-muted)]">{lead.timeline.length} msgs recentes</span>
        </div>
        <div className="max-h-[520px] overflow-auto rounded-lg border border-[var(--admin-border)] bg-black/20 p-3">
          {lead.timeline.length ? (
            lead.timeline.map((item) => {
              const Icon = timelineIcon(item);
              const isOutbound = item.direction === "outbound";
              const isInbound = item.direction === "inbound";
              const itemTone: ResourceTone = item.authorType === "human" ? "yellow" : item.tone;
              return (
                <div
                  key={item.id}
                  className={cn("mb-2 flex last:mb-0", isOutbound ? "justify-end" : isInbound ? "justify-start" : "justify-center")}
                >
                  <div
                    className={cn(
                      "max-w-[88%] rounded-lg border px-3 py-2",
                      toneBg[itemTone],
                      isOutbound ? "rounded-br-sm" : isInbound ? "rounded-bl-sm" : ""
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold", toneText[itemTone])}>
                        <Icon size={13} />
                        <span className="truncate">{item.authorLabel}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-[var(--admin-muted)]">{formatRelative(item.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-white">{item.text || "Mensagem sem texto."}</p>
                    {item.transcript && item.transcript !== item.text && (
                      <div className="mt-2 rounded-md border border-[var(--admin-border)] bg-black/20 px-2 py-1.5 text-xs leading-5 text-[var(--admin-muted)]">
                        <span className="font-semibold text-white">Transcricao: </span>
                        {item.transcript}
                      </div>
                    )}
                    {item.mediaUrl && (
                      <a
                        href={item.mediaUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-black/20 px-2 py-1 text-xs font-semibold text-[var(--admin-cyan)] transition hover:border-[var(--admin-cyan)] hover:text-white"
                      >
                        <Paperclip size={13} />
                        Abrir midia
                        <ExternalLink size={12} />
                      </a>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="rounded border border-[var(--admin-border)] bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                        {messageKindLabel(item)}
                      </span>
                      {item.deliveryStatus && (
                        <span className="rounded border border-[var(--admin-border)] bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                          {item.deliveryStatus}
                        </span>
                      )}
                      {item.providerMessageId && (
                        <span
                          title={item.providerMessageId}
                          className="rounded border border-[var(--admin-border)] bg-black/20 px-2 py-0.5 font-mono text-[10px] text-[var(--admin-muted)]"
                        >
                          id {item.providerMessageId.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-6 text-center text-sm text-[var(--admin-muted)]">
              Sem mensagens salvas para este lead.
            </div>
          )}
        </div>
      </div>
    </DashboardCard>
  );
}

function CrmFunnel({
  leads,
  onSelect,
}: {
  leads: WhatsAppCrmLeadCard[];
  onSelect: (lead: WhatsAppCrmLeadCard) => void;
}) {
  return (
    <DashboardCard
      title="Funil CRM WhatsApp"
      eyebrow="entrada / qualificacao / fechamento"
      action={<StatusBadge tone="cyan">{leads.length} leads</StatusBadge>}
    >
      <div className="grid gap-3 xl:grid-cols-6">
        {crmStages.map((stage) => {
          const stageLeads = leads.filter((lead) => lead.crmStage === stage.key);
          return (
            <section key={stage.key} className="min-h-[220px] rounded-lg border border-[var(--admin-border)] bg-black/20">
              <div className="flex items-center justify-between gap-2 border-b border-[var(--admin-border)] px-3 py-3">
                <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
                <span className="font-mono text-xs text-[var(--admin-muted)]">{stageLeads.length}</span>
              </div>
              <div className="grid gap-2 p-2">
                {stageLeads.slice(0, 4).map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    onClick={() => onSelect(lead)}
                    className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-2 text-left transition hover:border-[var(--admin-cyan)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-xs font-semibold text-white">{lead.name}</p>
                      <span className={cn("font-mono text-xs font-bold", toneText[scoreTone(lead.score)])}>{lead.score}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--admin-muted)]">{lead.nextAction}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {lead.waitingForReply && <StatusBadge tone="red">sem resposta</StatusBadge>}
                      {lead.humanInterventionActive && <StatusBadge tone="yellow">humano</StatusBadge>}
                    </div>
                  </button>
                ))}
                {!stageLeads.length && (
                  <div className="px-2 py-8 text-center text-xs text-[var(--admin-muted)]">Sem leads nesta etapa.</div>
                )}
                {stageLeads.length > 4 && (
                  <div className="px-2 pb-2 text-center font-mono text-[10px] text-[var(--admin-muted)]">
                    +{stageLeads.length - 4} no filtro
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </DashboardCard>
  );
}

export function WhatsAppCrmPage({
  crmData,
  operationalHealth,
  willianAgentConfig,
  willianInstance,
}: {
  crmData: DataResult<WhatsAppCrmData>;
  operationalHealth?: WhatsAppOperationalHealth | null;
  willianAgentConfig?: WillianAgentConfig;
  willianInstance?: WillianInstanceState;
}) {
  const router = useRouter();
  const data = crmData.data;
  const [panelTab, setPanelTab] = useState<PanelTabKey>("agents");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(data.leads[0]?.id || null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [manualReply, setManualReply] = useState("");
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => contextDraftFromLead(data.leads[0]));
  const [stageDraft, setStageDraft] = useState<StageDraft>(() => stageDraftFromLead(data.leads[0]));

  const counts = useMemo<Record<FilterKey, number>>(
    () => ({
      todos: data.leads.length,
      semresposta: data.leads.filter((lead) => lead.waitingForReply).length,
      handoff: data.leads.filter((lead) => lead.humanInterventionActive).length,
      quentes: data.leads.filter((lead) => lead.score >= 70).length,
      sla: data.leads.filter((lead) => lead.slaStatus === "vencido" || lead.slaStatus === "urgente").length,
      followup: data.leads.filter((lead) => lead.nextFollowUpAt || lead.followUpCount > 0).length,
    }),
    [data.leads]
  );

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.leads.filter((lead) => {
      const matchesFilter =
        filter === "todos" ||
        (filter === "semresposta" && lead.waitingForReply) ||
        (filter === "handoff" && lead.humanInterventionActive) ||
        (filter === "quentes" && lead.score >= 70) ||
        (filter === "sla" && ["vencido", "urgente"].includes(lead.slaStatus)) ||
        (filter === "followup" && (lead.nextFollowUpAt || lead.followUpCount > 0));
      if (!matchesFilter) return false;
      if (!query) return true;
      return [
        lead.name,
        lead.phone,
        lead.agentName,
        lead.assignedToLabel,
        lead.status,
        crmStageLabels[lead.crmStage],
        lead.internalNotes,
        lead.lastMessagePreview,
        ...lead.tags,
        ...lead.internalTags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [data.leads, filter, search]);

  const selectedLead = filteredLeads.find((lead) => lead.id === selectedId) || filteredLeads[0];
  const selectedContextDraft =
    selectedLead && contextDraft.leadId === selectedLead.id ? contextDraft : contextDraftFromLead(selectedLead);
  const selectedStageDraft =
    selectedLead && stageDraft.leadId === selectedLead.id ? stageDraft : stageDraftFromLead(selectedLead);

  async function postJson(path: string, body: Record<string, unknown>) {
    const response = await fetch(path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok || result.success === false || result.ok === false) {
      throw new Error(
        typeof result.error === "string"
          ? result.error
          : typeof result.message === "string"
            ? result.message
            : "Nao foi possivel executar a acao."
      );
    }
    return result;
  }

  function refreshSoon() {
    window.setTimeout(() => router.refresh(), 350);
  }

  function updateLeadContextDraft(lead: WhatsAppCrmLeadCard, patch: Partial<ContextDraft>) {
    const base = contextDraft.leadId === lead.id ? contextDraft : contextDraftFromLead(lead);
    setContextDraft({ ...base, ...patch, leadId: lead.id });
  }

  async function saveLeadContext(lead: WhatsAppCrmLeadCard) {
    const draft = contextDraft.leadId === lead.id ? contextDraft : contextDraftFromLead(lead);
    const internalTags = contextTagsFromText(draft.internalTags).slice(0, 10);
    const internalNote = draft.internalNotes.trim().slice(0, 1800);
    const assignedToLabel = draft.assignedToLabel.trim().slice(0, 80);

    setBusyAction(`${lead.id}:update_internal_context`);
    setFeedback(null);
    try {
      const result = await postJson("/api/admin/whatsapp/leads", {
        action: "update_internal_context",
        leadId: lead.leadId,
        conversationId: lead.conversationId,
        agentKey: lead.agentKey,
        internalNote,
        internalTags,
        assignedToLabel,
      });
      const dataRecord = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
      setContextDraft({
        leadId: lead.id,
        internalNotes: internalNote,
        internalTags: internalTags.join(", "),
        assignedToLabel,
      });
      setFeedback({
        type: "ok",
        msg: typeof dataRecord.message === "string" ? dataRecord.message : "Contexto interno salvo.",
      });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha ao salvar contexto interno.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  function updateLeadStageDraft(lead: WhatsAppCrmLeadCard, patch: Partial<StageDraft>) {
    const base = stageDraft.leadId === lead.id ? stageDraft : stageDraftFromLead(lead);
    setStageDraft({ ...base, ...patch, leadId: lead.id });
  }

  async function saveLeadStage(lead: WhatsAppCrmLeadCard) {
    const draft = stageDraft.leadId === lead.id ? stageDraft : stageDraftFromLead(lead);
    const crmStage = draft.crmStage || lead.crmStage;
    if (!crmStage) return;

    setBusyAction(`${lead.id}:update_crm_stage`);
    setFeedback(null);
    try {
      const result = await postJson("/api/admin/whatsapp/leads", {
        action: "update_crm_stage",
        leadId: lead.leadId,
        conversationId: lead.conversationId,
        agentKey: lead.agentKey,
        crmStage,
      });
      const dataRecord = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
      setStageDraft({ leadId: lead.id, crmStage });
      setFeedback({
        type: "ok",
        msg: typeof dataRecord.message === "string" ? dataRecord.message : "Etapa do CRM salva.",
      });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha ao salvar etapa do CRM.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function runLeadAction(action: LeadActionKey, lead: WhatsAppCrmLeadCard) {
    const key = `${lead.id}:${action}`;
    setBusyAction(key);
    setFeedback(null);
    try {
      const result = await postJson("/api/admin/whatsapp/leads", {
        action,
        leadId: lead.leadId,
        conversationId: lead.conversationId,
        agentKey: lead.agentKey,
      });
      const dataRecord = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
      setFeedback({
        type: "ok",
        msg: typeof dataRecord.message === "string" ? dataRecord.message : "Acao executada.",
      });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha ao executar acao.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function runFollowUpCommand(command: "preview" | "schedule" | "process") {
    const labels = {
      preview: "Simulacao de follow-up concluida.",
      schedule: "Follow-ups elegiveis foram agendados.",
      process: "Worker de follow-up processado.",
    };
    setBusyAction(`followups:${command}`);
    setFeedback(null);
    try {
      if (command === "preview") {
        const response = await fetch("/api/admin/whatsapp/followups?limit=80", { cache: "no-store" });
        const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok || result.ok === false) throw new Error(typeof result.error === "string" ? result.error : "Falha na simulacao.");
        const eligible = typeof result.eligibleCount === "number" ? result.eligibleCount : 0;
        const skipped = typeof result.skippedCount === "number" ? result.skippedCount : 0;
        setFeedback({ type: "ok", msg: `${labels.preview} Elegiveis: ${eligible}. Ignorados: ${skipped}.` });
        return;
      }

      const result =
        command === "schedule"
          ? await postJson("/api/admin/whatsapp/followups", { dryRun: false, limit: 80 })
          : await postJson("/api/admin/whatsapp/followups/worker", { dryRun: false, limit: 10, allowQuietHours: true });
      const dataRecord = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : result;
      const queued = typeof dataRecord.queuedCount === "number" ? ` Agendados: ${dataRecord.queuedCount}.` : "";
      const processed = Array.isArray(dataRecord.processed) ? ` Processados: ${dataRecord.processed.length}.` : "";
      setFeedback({ type: "ok", msg: `${labels[command]}${queued}${processed}` });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha no comando de follow-up.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function runReviewCommand() {
    setBusyAction("reviews:audit");
    setFeedback(null);
    try {
      const result = await postJson("/api/admin/whatsapp/reviews", {
        dryRun: false,
        limit: 12,
        autoHandoff: false,
      });
      const reviewed = typeof result.reviewedCount === "number" ? result.reviewedCount : 0;
      const handoff = typeof result.handoffCount === "number" ? result.handoffCount : 0;
      const learned = typeof result.learnedCount === "number" ? result.learnedCount : 0;
      const skipped = typeof result.skippedCount === "number" ? result.skippedCount : 0;
      setFeedback({
        type: "ok",
        msg: `Auditoria IA concluida. Revisadas: ${reviewed}. Aprendizados: ${learned}. Handoff: ${handoff}. Ignoradas: ${skipped}.`,
      });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha ao auditar conversas.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  async function sendManualReply(lead: WhatsAppCrmLeadCard) {
    const text = manualReply.trim();
    if (!text) return;

    setBusyAction(`${lead.id}:manual_reply`);
    setFeedback(null);
    try {
      const result = await postJson("/api/admin/whatsapp/messages", {
        conversationId: lead.conversationId,
        leadId: lead.leadId,
        agentKey: lead.agentKey,
        text,
      });
      const dataRecord = result.data && typeof result.data === "object" ? (result.data as Record<string, unknown>) : {};
      setManualReply("");
      setFeedback({
        type: "ok",
        msg: typeof dataRecord.providerStatus === "string"
          ? `Mensagem humana enviada: ${dataRecord.providerStatus}.`
          : "Mensagem humana enviada.",
      });
      refreshSoon();
    } catch (error) {
      setFeedback({
        type: "err",
        msg: error instanceof Error ? error.message : "Falha ao enviar mensagem humana.",
      });
    } finally {
      setBusyAction(null);
    }
  }

  const openConversationsMetric = getMetric(data, "Conversas abertas", {
    value: String(data.leads.filter((lead) => lead.conversationStatus !== "closed").length),
    detail: "fila de atendimento",
    tone: "cyan",
  });
  const handoffMetric = getMetric(data, "Handoff humano", {
    value: String(counts.handoff),
    detail: "pedem humano ou revisao",
    tone: counts.handoff ? "yellow" : "green",
  });
  const hotLeadsMetric = getMetric(data, "Leads quentes", {
    value: String(counts.quentes),
    detail: "score 70+",
    tone: "green",
  });
  const qualityMetric = getMetric(data, "Qualidade IA", {
    value: data.reviews.length
      ? String(Math.round(data.reviews.reduce((sum, review) => sum + Math.max(0, review.score), 0) / data.reviews.length))
      : "-",
    detail: "auditoria das conversas",
    tone: data.reviews.length ? "green" : "muted",
  });
  const agentInstances = willianInstance?.agentInstances || [];
  const configuredAgentCount = Math.max(data.agents.length, agentInstances.length, willianAgentConfig ? 1 : 0);
  const primaryAgentConnected = Boolean(
    willianInstance &&
      hasActiveWhatsappAgent({
        connected: Boolean(willianInstance.status?.connected || willianInstance.status?.loggedIn),
        connectedAt: willianInstance.profileImageSyncedAt,
        displayName: willianInstance.displayName,
        phoneNumber: willianInstance.phoneNumber,
        profileImageSyncedAt: willianInstance.profileImageSyncedAt,
        profileImageUrl: willianInstance.profileImageUrl,
        runtimeStatus: willianInstance.primaryAgentPaused ? "paused" : "active",
        status: willianInstance.status?.state || willianInstance.finalStatus || willianInstance.connection?.status,
      })
  );
  const connectedAgentCount =
    agentInstances.length > 0
      ? Math.max(agentInstances.filter(hasActiveWhatsappAgent).length, primaryAgentConnected ? 1 : 0)
      : data.agents.filter((agent) => agent.connected).length;
  const primaryConnected = connectedAgentCount > 0;
  const criticalLeads = data.leads.filter(
    (lead) => lead.humanInterventionActive || lead.slaStatus === "vencido" || lead.score >= 85
  );
  const pendingFollowUps = data.followUps.filter(
    (followUp) => !["sent", "cancelled", "canceled", "failed"].includes(followUp.status.toLowerCase())
  );
  const reviewAlerts = data.reviews.filter((review) => review.score > 0 && review.score < 62).length;
  const overviewCards: Array<{
    label: string;
    value: string;
    detail: string;
    icon: ActionIcon;
    tone: ResourceTone;
  }> = [
    {
      label: "Conexao WhatsApp",
      value: primaryConnected ? `${connectedAgentCount}/${configuredAgentCount || 1}` : "pendente",
      detail: primaryConnected ? "agentes online" : "aguardando leitura do QR",
      icon: Radio,
      tone: primaryConnected ? "green" : "yellow",
    },
    {
      label: openConversationsMetric.label,
      value: openConversationsMetric.value,
      detail: openConversationsMetric.detail,
      icon: MessageCircle,
      tone: openConversationsMetric.tone,
    },
    {
      label: handoffMetric.label,
      value: handoffMetric.value,
      detail: handoffMetric.detail,
      icon: Users,
      tone: handoffMetric.tone,
    },
    {
      label: qualityMetric.label,
      value: qualityMetric.value,
      detail: reviewAlerts ? `${reviewAlerts} alertas de revisao` : qualityMetric.detail,
      icon: Sparkles,
      tone: reviewAlerts ? "yellow" : qualityMetric.tone,
    },
  ];
  const cockpitCards: Array<{
    label: string;
    value: string;
    detail: string;
    icon: ActionIcon;
    tone: ResourceTone;
  }> = [
    {
      label: "Leads quentes",
      value: hotLeadsMetric.value,
      detail: hotLeadsMetric.detail,
      icon: Flame,
      tone: hotLeadsMetric.tone,
    },
    {
      label: "Sem resposta",
      value: String(counts.semresposta),
      detail: "ultima mensagem foi do lead",
      icon: AlertTriangle,
      tone: counts.semresposta ? "red" : "green",
    },
    {
      label: "Follow-ups",
      value: String(pendingFollowUps.length),
      detail: data.followUps.length ? "pendentes ou agendados" : "sem fila pendente",
      icon: CalendarClock,
      tone: pendingFollowUps.length ? "yellow" : "muted",
    },
    {
      label: "Fila critica",
      value: String(criticalLeads.length),
      detail: "handoff, SLA ou score alto",
      icon: ShieldAlert,
      tone: criticalLeads.length ? "red" : "green",
    },
  ];

  return (
    <div className="mx-auto grid min-h-screen max-w-[1760px] gap-4 px-4 py-4 lg:px-6">
      <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--admin-muted)]">Betel AI / Agentes WhatsApp</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">Agentes WhatsApp</h1>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Gerencie conexao, comportamento e operacao dos atendentes.
          </p>
        </div>
        <div className="flex flex-col gap-1.5 lg:items-end">
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <StatusBadge tone={crmData.source === "supabase" ? "green" : "yellow"}>
              {crmData.source === "supabase" ? "dados reais" : "modo exemplo"}
            </StatusBadge>
            <ActionButton
              icon={RefreshCw}
              tone="muted"
              busy={busyAction === "page:refresh"}
              onClick={() => {
                setBusyAction("page:refresh");
                router.refresh();
                window.setTimeout(() => setBusyAction(null), 500);
              }}
            >
              Atualizar
            </ActionButton>
            <ActionButton
              icon={ClipboardCheck}
              tone="cyan"
              busy={busyAction === "reviews:audit"}
              onClick={() => void runReviewCommand()}
              title="Auditar conversas recentes com IA"
            >
              Auditar IA
            </ActionButton>
          </div>
          <p className="text-xs text-[var(--admin-muted)]">Ultima atualizacao: {formatDateTime(data.generatedAt)}</p>
        </div>
      </header>

      <nav className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 shadow-sm shadow-[rgba(81,60,36,0.04)]">
        <div className="flex min-w-0 gap-5 overflow-x-auto">
          {panelTabs.map((tab) => {
            const Icon = tab.icon;
            const active = panelTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPanelTab(tab.key)}
                className={cn(
                  "relative inline-flex h-11 shrink-0 items-center gap-2 border-b-2 px-1 text-sm font-semibold transition",
                  active
                    ? "border-[var(--admin-cyan)] text-[var(--admin-cyan)]"
                    : "border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-foreground)]"
                )}
              >
                <Icon size={15} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {overviewCards.map((card) => {
          const Icon = card.icon;
          const value = card.label === "Conexao WhatsApp" && card.value.includes("/")
            ? card.value.replace("/", " de ")
            : card.value;
          return (
            <article
              key={card.label}
              className="grid min-h-[82px] grid-cols-[38px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 shadow-sm shadow-[rgba(81,60,36,0.04)]"
            >
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-md border", toneBg[card.tone])}>
                <Icon size={15} className={toneText[card.tone]} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--admin-muted)]">{card.label}</p>
                <p className={cn("mt-1 truncate font-mono text-xl font-bold leading-none tracking-tight", toneText[card.tone])}>
                  {value}
                </p>
                <p className="mt-1 truncate text-xs leading-4 text-[var(--admin-muted)]">{card.detail}</p>
              </div>
            </article>
          );
        })}
      </section>

      {operationalHealth && (
        <section>
          <OperationalReadinessPanel
            health={operationalHealth}
            busy={busyAction === "health:refresh"}
            onRefresh={() => {
              setBusyAction("health:refresh");
              router.refresh();
              window.setTimeout(() => setBusyAction(null), 500);
            }}
          />
        </section>
      )}

      {crmData.reason && (
        <div className="rounded-md border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-3 py-2 text-xs text-[var(--admin-yellow)]">
          {crmData.reason}
        </div>
      )}
      {feedback && (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-xs",
            feedback.type === "ok"
              ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
              : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
          )}
        >
          {feedback.msg}
        </div>
      )}

      {panelTab !== "inbox" ? (
        <section>
          <WillianAgentPanel
            initialAgentKey={willianAgentConfig?.agentKey || willianInstance?.agentKey}
            initialConfig={willianAgentConfig}
            initialState={willianInstance}
          />
        </section>
      ) : (
        <>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(380px,0.75fr)]">
        <DashboardCard
          title="Fila de atendimento"
          eyebrow="leads / mensagens / prioridade"
          action={<StatusBadge tone="cyan">{filteredLeads.length} na visao</StatusBadge>}
          contentClassName="p-0"
        >
          <div className="border-b border-[var(--admin-border)] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar lead, telefone, agente ou mensagem"
                  className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-white pl-9 pr-3 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "h-9 rounded-md border px-3 text-xs font-semibold transition",
                      filter === key
                        ? "border-[rgba(200,90,31,0.28)] bg-[rgba(200,90,31,0.1)] text-[var(--admin-cyan)]"
                        : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)] hover:text-[var(--admin-foreground)]"
                    )}
                  >
                    {filterLabels[key]} {counts[key]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="max-h-[740px] overflow-auto">
            {filteredLeads.length ? (
              filteredLeads.map((lead) => (
                <LeadQueueItem
                  key={lead.id}
                  lead={lead}
                  selected={selectedLead?.id === lead.id}
                  onSelect={() => {
                    setSelectedId(lead.id);
                    setManualReply("");
                    setContextDraft(contextDraftFromLead(lead));
                    setStageDraft(stageDraftFromLead(lead));
                  }}
                />
              ))
            ) : (
              <div className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
                Nenhum atendimento encontrado para este filtro.
              </div>
            )}
          </div>
        </DashboardCard>

        <div className="grid content-start gap-4">
          <DashboardCard title="Cockpit do CRM" eyebrow="prioridade / automacao">
            <div className="grid gap-2 sm:grid-cols-2">
              {cockpitCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className={cn("rounded-md border px-3 py-3", toneBg[card.tone])}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                        {card.label}
                      </p>
                      <Icon size={14} className={toneText[card.tone]} />
                    </div>
                    <p className={cn("mt-2 font-mono text-xl font-bold", toneText[card.tone])}>{card.value}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[var(--admin-muted)]">{card.detail}</p>
                  </div>
                );
              })}
            </div>
          </DashboardCard>

          <LeadDetail
            lead={selectedLead}
            busyAction={busyAction}
            manualReply={manualReply}
            contextDraft={selectedContextDraft}
            stageDraft={selectedStageDraft}
            onLeadAction={(action, lead) => void runLeadAction(action, lead)}
            onManualReplyChange={setManualReply}
            onSendManualReply={(lead) => void sendManualReply(lead)}
            onContextDraftChange={(patch) => {
              if (selectedLead) updateLeadContextDraft(selectedLead, patch);
            }}
            onSaveContext={(lead) => void saveLeadContext(lead)}
            onStageDraftChange={(patch) => {
              if (selectedLead) updateLeadStageDraft(selectedLead, patch);
            }}
            onSaveStage={(lead) => void saveLeadStage(lead)}
          />

          <DashboardCard title="Atendentes" eyebrow="numeros / agentes / carga">
            <div className="grid gap-3">
              {data.agents.map((agent) => (
                <article key={agent.agentKey} className="rounded-lg border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{agent.name}</p>
                      <p className="mt-1 truncate font-mono text-[10px] text-[var(--admin-muted)]">{agent.agentKey}</p>
                    </div>
                    <StatusBadge tone={agent.connected ? "green" : "yellow"}>{agent.connected ? "online" : agent.status}</StatusBadge>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <InfoCell label="Abertas" value={String(agent.openConversations)} />
                    <InfoCell label="Handoff" value={String(agent.handoffs)} />
                    <InfoCell label="Score" value={String(agent.averageScore)} />
                    <InfoCell label="Numero" value={agent.phone || "-"} />
                  </div>
                </article>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>

      <section className="mt-4">
        <CrmFunnel
          leads={data.leads}
          onSelect={(lead) => {
            setFilter("todos");
            setSearch("");
            setSelectedId(lead.id);
            setManualReply("");
            setContextDraft(contextDraftFromLead(lead));
            setStageDraft(stageDraftFromLead(lead));
          }}
        />
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-2">
        <DashboardCard
          title="Follow-ups"
          eyebrow="agendados / pendentes"
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                icon={Play}
                tone="muted"
                busy={busyAction === "followups:preview"}
                onClick={() => void runFollowUpCommand("preview")}
                title="Simular follow-ups elegiveis sem agendar"
              >
                Simular
              </ActionButton>
              <ActionButton
                icon={CalendarClock}
                tone="yellow"
                busy={busyAction === "followups:schedule"}
                onClick={() => void runFollowUpCommand("schedule")}
                title="Agendar follow-ups elegiveis"
              >
                Agendar
              </ActionButton>
              <ActionButton
                icon={Send}
                tone="green"
                busy={busyAction === "followups:process"}
                onClick={() => void runFollowUpCommand("process")}
                title="Processar follow-ups vencidos agora"
              >
                Enviar
              </ActionButton>
            </div>
          }
        >
          <div className="grid gap-2">
            {data.followUps.length ? (
              data.followUps.slice(0, 8).map((followUp) => (
                <div key={followUp.id} className="grid gap-3 rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{followUp.leadName}</p>
                    <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">{followUp.reason} / {formatPhone(followUp.phone)}</p>
                  </div>
                  <div className="flex flex-col items-start gap-1 sm:items-end">
                    <StatusBadge tone={followUp.status === "failed" ? "red" : followUp.status === "sent" ? "green" : "yellow"}>
                      {followUp.status}
                    </StatusBadge>
                    <span className="text-[10px] text-[var(--admin-muted)]">{formatDateTime(followUp.scheduledFor)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-3 rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-4 text-sm text-[var(--admin-muted)]">
                <PauseCircle size={16} />
                Nenhum follow-up registrado ainda.
              </div>
            )}
          </div>
        </DashboardCard>

        <DashboardCard title="Fila critica" eyebrow="handoff / sla / quente" action={<ShieldAlert size={16} className="text-[var(--admin-red)]" />}>
          <div className="grid gap-2">
            {data.leads
              .filter((lead) => lead.humanInterventionActive || lead.slaStatus === "vencido" || lead.score >= 85)
              .slice(0, 8)
              .map((lead) => (
                <div key={lead.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{lead.name}</p>
                    <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">{lead.nextAction}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {lead.score >= 85 && <Flame size={15} className="text-[var(--admin-cyan)]" />}
                    <StatusBadge tone={lead.humanInterventionActive ? "yellow" : slaTone[lead.slaStatus]}>
                      {lead.humanInterventionActive ? "humano" : slaLabel[lead.slaStatus]}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            {!data.leads.some((lead) => lead.humanInterventionActive || lead.slaStatus === "vencido" || lead.score >= 85) && (
              <div className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-4 text-sm text-[var(--admin-muted)]">
                Sem atendimento critico na visao atual.
              </div>
            )}
          </div>
        </DashboardCard>
      </section>

      <section className="mt-4">
        <DashboardCard
          title="Auditoria IA"
          eyebrow="naturalidade / utilidade / transparencia"
          action={<Gauge size={16} className="text-[var(--admin-cyan)]" />}
        >
          <div className="grid gap-2 xl:grid-cols-2">
            {data.reviews.length ? (
              data.reviews.slice(0, 10).map((review) => {
                const tone = reviewTone(review.score, review.verdict);
                return (
                  <article key={review.id} className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{review.leadName}</p>
                        <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">
                          {review.reviewType} / {review.agentKey} / {formatRelative(review.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn("font-mono text-lg font-bold", toneText[tone])}>{review.score || "-"}</span>
                        <StatusBadge tone={tone}>{review.verdict}</StatusBadge>
                      </div>
                    </div>
                    {review.notes && <p className="mt-3 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{review.notes}</p>}
                    {review.flags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {review.flags.slice(0, 5).map((flag) => (
                          <span key={flag} className="rounded border border-[var(--admin-border)] bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                            {flag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                );
              })
            ) : (
              <div className="rounded-md border border-[var(--admin-border)] bg-white/[0.02] px-3 py-4 text-sm text-[var(--admin-muted)]">
                Nenhuma auditoria registrada ainda.
              </div>
            )}
          </div>
        </DashboardCard>
      </section>
        </>
      )}
    </div>
  );
}
