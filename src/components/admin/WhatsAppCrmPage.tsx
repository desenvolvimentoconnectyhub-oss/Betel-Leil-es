"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BellRing,
  Bot,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Headphones,
  Loader2,
  MapPin,
  MessageCircle,
  MonitorSmartphone,
  MousePointerClick,
  Paperclip,
  Phone,
  Save,
  Search,
  Send,
  StickyNote,
  Tags,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  UserMinus,
  UserRound,
  UserX,
  Volume2,
  Wifi,
  WifiOff,
  X,
  XCircle,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type {
  DataResult,
  WhatsAppCrmAgentSummary,
  WhatsAppCrmData,
  WhatsAppCrmLeadCard,
  WhatsAppCrmStage,
  WhatsAppCrmTimelineItem,
} from "@/lib/admin/repository";
import { StatusBadge } from "@/components/admin/StatusBadge";
import type { ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

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
type LiveSyncState = { status: "live" | "syncing" | "error"; lastSyncedAt: string; message: string };
type IncomingLeadNotice = { leadId: string; leadName: string; preview: string; createdAt: string };
type LeadActivitySnapshot = {
  messageCount: number;
  lastMessageAt: string;
  lastMessageDirection: string;
  lastMessagePreview: string;
};
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
  cyan: "border-[rgba(15,124,144,0.24)] bg-[rgba(15,124,144,0.08)]",
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
const whatsappChatBackgroundStyle: CSSProperties = {
  backgroundColor: "#f7f1e8",
  backgroundImage:
    'linear-gradient(rgba(247, 241, 232, 0.48), rgba(247, 241, 232, 0.48)), url("/images/fundo-whatsapp.jpg")',
  backgroundPosition: "center top",
  backgroundRepeat: "repeat",
  backgroundSize: "420px auto",
};
const LIVE_CRM_REFRESH_MS = 3_000;
const EXTERNAL_OUTBOUND_RECONCILE_MS = 15_000;
const LIVE_NOTICE_TTL_MS = 12_000;

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

function sdrAppointmentStatusLabel(status: string) {
  if (status === "notified") return "Avisado";
  if (status === "scheduled") return "Agendado";
  if (status === "pending_confirmation") return "A confirmar";
  if (status === "completed") return "Concluido";
  if (status === "cancelled") return "Cancelado";
  if (status === "missed") return "Perdido";
  if (status === "rescheduled") return "Remarcado";
  return status || "Agenda";
}

function sdrAppointmentTone(status: string): ResourceTone {
  if (status === "completed") return "green";
  if (status === "cancelled" || status === "missed") return "red";
  if (status === "notified") return "cyan";
  return "yellow";
}

function sdrLeadConfirmationLabel(status: string) {
  if (status === "confirmed") return "Lead confirmou";
  if (status === "reschedule_requested") return "Remarcar";
  return "Confirmacao pendente";
}

function dateMs(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function leadActivityKey(lead: WhatsAppCrmLeadCard) {
  return lead.id || lead.conversationId || lead.leadId || lead.phone;
}

function leadActivitySnapshot(lead: WhatsAppCrmLeadCard): LeadActivitySnapshot {
  return {
    messageCount: lead.messageCount,
    lastMessageAt: lead.lastMessageAt,
    lastMessageDirection: lead.lastMessageDirection,
    lastMessagePreview: lead.lastMessagePreview,
  };
}

function buildLeadActivityMap(leads: WhatsAppCrmLeadCard[]) {
  return new Map(leads.map((lead) => [leadActivityKey(lead), leadActivitySnapshot(lead)]));
}

function leadHasNewActivity(previous: LeadActivitySnapshot | undefined, lead: WhatsAppCrmLeadCard) {
  if (!previous) return lead.messageCount > 0;
  const previousTime = dateMs(previous.lastMessageAt);
  const nextTime = dateMs(lead.lastMessageAt);
  return nextTime > previousTime || lead.messageCount > previous.messageCount;
}

function incomingLeadsSince(previous: Map<string, LeadActivitySnapshot>, leads: WhatsAppCrmLeadCard[]) {
  return leads
    .filter((lead) => lead.lastMessageDirection === "inbound" && leadHasNewActivity(previous.get(leadActivityKey(lead)), lead))
    .sort((left, right) => dateMs(right.lastMessageAt) - dateMs(left.lastMessageAt));
}

function activeLeadsSince(previous: Map<string, LeadActivitySnapshot>, leads: WhatsAppCrmLeadCard[]) {
  return leads
    .filter((lead) => leadHasNewActivity(previous.get(leadActivityKey(lead)), lead))
    .sort((left, right) => dateMs(right.lastMessageAt) - dateMs(left.lastMessageAt));
}

function notificationPreview(lead: WhatsAppCrmLeadCard) {
  const preview = (lead.lastMessagePreview || "Nova mensagem recebida.").replace(/\s+/g, " ").trim();
  return preview.length > 160 ? `${preview.slice(0, 157)}...` : preview;
}

function formatCountdown(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

function handoffCountdownState(lead: WhatsAppCrmLeadCard, nowMs: number) {
  if (!lead.humanInterventionActive || lead.optOut) return null;

  const autoResumeAt = dateMs(lead.manualHandoff.autoResumeAfter);
  const pendingInboundAt = dateMs(lead.manualHandoff.pendingInboundAt);
  const hasPendingLeadReply = lead.waitingForReply && autoResumeAt > 0 && pendingInboundAt > 0;

  if (hasPendingLeadReply) {
    const remainingMs = autoResumeAt - nowMs;
    return {
      label: remainingMs > 0 ? "IA retoma em" : "IA retomando",
      value: formatCountdown(remainingMs),
      detail: remainingMs > 0 ? "lead aguardando humano" : "aguardando worker",
      tone: remainingMs <= 60_000 ? "red" : "yellow",
      deadlineMs: autoResumeAt,
    } satisfies {
      label: string;
      value: string;
      detail: string;
      tone: ResourceTone;
      deadlineMs: number;
    };
  }

  const activeUntil = dateMs(lead.manualHandoff.activeUntil);
  if (activeUntil > 0) {
    const remainingMs = activeUntil - nowMs;
    return {
      label: remainingMs > 0 ? "Pausa IA" : "Pausa vencida",
      value: formatCountdown(remainingMs),
      detail: remainingMs > 0 ? "controle humano" : "IA responde no proximo contato",
      tone: remainingMs <= 5 * 60_000 ? "yellow" : "cyan",
      deadlineMs: activeUntil,
    } satisfies {
      label: string;
      value: string;
      detail: string;
      tone: ResourceTone;
      deadlineMs: number;
    };
  }

  return {
    label: "Pausa IA",
    value: "60:00",
    detail: "renova a cada resposta",
    tone: "yellow",
    deadlineMs: 0,
  } satisfies {
    label: string;
    value: string;
    detail: string;
    tone: ResourceTone;
    deadlineMs: number;
  };
}

function HandoffCountdown({
  lead,
  nowMs,
  compact = false,
}: {
  lead: WhatsAppCrmLeadCard;
  nowMs: number;
  compact?: boolean;
}) {
  const state = handoffCountdownState(lead, nowMs);
  if (!state) return null;

  return (
    <div
      className={cn(
        "inline-flex min-w-0 items-center gap-1.5 rounded-full border font-semibold",
        compact ? "h-6 px-2 text-[9px]" : "min-h-8 px-2.5 py-1 text-[10px]",
        toneBg[state.tone]
      )}
      title={`${state.label} ${state.value} - ${state.detail}`}
    >
      <CalendarClock size={compact ? 12 : 14} className={cn("shrink-0", toneText[state.tone])} />
      <span className="truncate text-[var(--admin-muted)]">{state.label}</span>
      <span className={cn("shrink-0 font-mono font-bold tabular-nums", toneText[state.tone])}>{state.value}</span>
      {!compact && <span className="truncate text-[var(--admin-muted)]">{state.detail}</span>}
    </div>
  );
}

function LiveSyncBadge({ sync }: { sync: LiveSyncState }) {
  const isError = sync.status === "error";
  const isSyncing = sync.status === "syncing";
  const Icon = isError ? WifiOff : isSyncing ? Loader2 : Wifi;

  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[9px] font-bold uppercase tracking-[0.12em]",
        isError ? toneBg.red : isSyncing ? toneBg.yellow : toneBg.green
      )}
      title={sync.message}
    >
      <Icon size={12} className={cn(isSyncing ? "animate-spin" : "", isError ? toneText.red : isSyncing ? toneText.yellow : toneText.green)} />
      {isError ? "offline" : isSyncing ? "sincronizando" : "ao vivo"}
    </span>
  );
}

function IncomingMessageNotice({
  notice,
  onOpen,
  onClose,
}: {
  notice: IncomingLeadNotice;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-[rgba(15,124,144,0.22)] bg-[rgba(15,124,144,0.08)] px-3 py-2 text-[12px] text-[var(--admin-foreground)] shadow-sm shadow-[rgba(81,60,36,0.06)]">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[rgba(15,124,144,0.12)] text-[var(--admin-cyan)]">
          <BellRing size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">Nova mensagem de {notice.leadName}</p>
          <p className="truncate text-[11px] text-[var(--admin-muted)]">{notice.preview}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          title="Alerta sonoro ativo apos a primeira interacao com a pagina"
          className="grid h-7 w-7 place-items-center rounded-full border border-[rgba(15,124,144,0.18)] bg-white text-[var(--admin-cyan)]"
        >
          <Volume2 size={13} />
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-7 items-center rounded-full border border-[rgba(15,124,144,0.26)] bg-white px-2.5 text-[11px] font-semibold text-[var(--admin-cyan)] transition hover:border-[var(--admin-cyan)]"
        >
          Abrir
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar aviso"
          className="grid h-7 w-7 place-items-center rounded-full border border-[var(--admin-border)] bg-white text-[var(--admin-muted)] transition hover:text-[var(--admin-foreground)]"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
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
  const sizeClass = size === "lg" ? "h-12 w-12 text-sm" : size === "sm" ? "h-8 w-8 text-[10px]" : "h-10 w-10 text-xs";

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-full border border-[rgba(15,124,144,0.24)] bg-[rgba(15,124,144,0.10)] bg-cover bg-center font-bold text-[var(--admin-cyan)] shadow-sm",
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

function agentInitials(agent?: Pick<WhatsAppCrmAgentSummary, "name" | "agentKey">) {
  const source = agent?.name || agent?.agentKey || "Agente";
  const words = source
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("");
  return initials || "AI";
}

function AgentAvatar({ agent }: { agent?: Pick<WhatsAppCrmAgentSummary, "agentKey" | "name" | "profileImageUrl"> }) {
  const safeImageUrl = (agent?.profileImageUrl || "").replace(/"/g, "%22");
  const label = agent?.name || "Agente de WhatsApp";

  return (
    <div
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[rgba(15,124,144,0.22)] bg-[rgba(15,124,144,0.10)] bg-cover bg-center text-[10px] font-bold text-[var(--admin-cyan)] shadow-sm shadow-[rgba(15,124,144,0.12)]"
      style={safeImageUrl ? { backgroundImage: `url("${safeImageUrl}")` } : undefined}
      title={safeImageUrl ? `${label} - foto do WhatsApp` : `${label} - foto ainda nao sincronizada`}
    >
      {!safeImageUrl && agentInitials(agent)}
    </div>
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

function leadPriorityTone(lead: WhatsAppCrmLeadCard): ResourceTone {
  if (lead.slaStatus === "vencido" || lead.waitingForReply) return "red";
  if (lead.humanInterventionActive || lead.slaStatus === "urgente") return "yellow";
  if (lead.score >= 85) return "cyan";
  if (lead.score >= 70) return "green";
  return "muted";
}

function leadPriorityLabel(lead: WhatsAppCrmLeadCard) {
  if (lead.slaStatus === "vencido") return "SLA vencido";
  if (lead.waitingForReply) return "Responder agora";
  if (lead.humanInterventionActive) return "Humano";
  if (lead.slaStatus === "urgente") return "SLA urgente";
  if (lead.score >= 85) return "VIP";
  if (lead.score >= 70) return "Quente";
  if (lead.nextFollowUpAt || lead.followUpCount > 0) return "Follow-up";
  return "Monitorar";
}

function leadHeatBadge(lead: WhatsAppCrmLeadCard): { label: string; tone: ResourceTone } {
  const temperature = lead.temperature.toLowerCase();
  if (lead.optOut || lead.crmStage === "perdido") return { label: "Frio", tone: "red" };
  if (temperature.includes("vip") || lead.score >= 85) return { label: "VIP", tone: "cyan" };
  if (temperature.includes("quente") || lead.crmStage === "quente" || lead.score >= 70) {
    return { label: "Quente", tone: "green" };
  }
  if (temperature.includes("morno") || lead.crmStage === "qualificando" || lead.score >= 40) {
    return { label: "Morno", tone: "yellow" };
  }
  return { label: "Frio", tone: "muted" };
}

function reviewTone(score: number, verdict: string): ResourceTone {
  const normalized = verdict.toLowerCase();
  if (normalized.includes("bloquear") || score < 55) return "red";
  if (normalized.includes("handoff") || normalized.includes("monitorar") || score < 75) return "yellow";
  return "green";
}

function TimelineMessageIcon({ item }: { item: WhatsAppCrmTimelineItem }) {
  const messageType = item.messageType.toLowerCase();
  const mimeType = item.mediaMimeType.toLowerCase();
  if (messageType.includes("audio") || mimeType.includes("audio")) return <Headphones size={13} />;
  if (item.mediaUrl) return <Paperclip size={13} />;
  if (item.authorType === "lead") return <UserRound size={13} />;
  if (item.authorType === "human") return <CheckCircle2 size={13} />;
  if (item.authorType === "external") return <Phone size={13} />;
  return <Bot size={13} />;
}

function isAudioTimelineItem(item: WhatsAppCrmTimelineItem) {
  const messageType = item.messageType.toLowerCase();
  const mimeType = item.mediaMimeType.toLowerCase();
  return messageType.includes("audio") || messageType.includes("ptt") || mimeType.includes("audio");
}

function timelineTimestamp(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortedTimeline(items: WhatsAppCrmTimelineItem[]) {
  return [...items].sort((left, right) => timelineTimestamp(left.createdAt) - timelineTimestamp(right.createdAt));
}

function timelineActorLabel(item: WhatsAppCrmTimelineItem) {
  if (item.direction === "inbound") return item.authorLabel || "Lead";
  if (item.authorType === "human") return item.authorLabel || "Atendente";
  if (item.authorType === "external") return item.authorLabel || "WhatsApp externo";
  if (item.authorType === "ai") return "Evelyn";
  return item.authorLabel || "Sistema";
}

function timelineOriginTone(item: WhatsAppCrmTimelineItem): ResourceTone {
  if (item.direction === "inbound") return "cyan";
  if (item.authorType === "external") return "red";
  if (item.authorType === "human") return "yellow";
  if (item.authorType === "ai") return "green";
  return "muted";
}

function timelineOriginLabel(item: WhatsAppCrmTimelineItem) {
  if (item.originLabel) return item.originLabel;
  if (item.direction === "inbound") return "Lead";
  if (item.authorType === "external") return "WhatsApp externo";
  if (item.authorType === "human") return "Painel Betel";
  if (item.authorType === "ai") return "IA Betel";
  return "Sistema";
}

function conversationStatusLabel(lead: WhatsAppCrmLeadCard) {
  if (lead.optOut) return "opt-out";
  if (lead.humanInterventionActive) return "humano ativo";
  if (lead.waitingForReply) return "lead aguardando";
  if (lead.conversationStatus === "closed") return "fechado";
  return "IA ativa";
}

function conversationStatusTone(lead: WhatsAppCrmLeadCard): ResourceTone {
  if (lead.optOut) return "muted";
  if (lead.humanInterventionActive) return "yellow";
  if (lead.waitingForReply) return "red";
  if (lead.conversationStatus === "closed") return "muted";
  return "green";
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
    <div className="min-w-[76px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={cn("font-mono text-[11px] font-bold", toneText[tone])}>{score}</span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">score</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(113,128,140,0.18)]">
        <div className={cn("h-full rounded-full", tone === "cyan" ? "bg-[var(--admin-cyan)]" : tone === "green" ? "bg-[var(--admin-green)]" : tone === "yellow" ? "bg-[var(--admin-yellow)]" : "bg-white/25")} style={{ width: `${Math.max(4, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[var(--admin-border)] bg-[#fbfdff] px-2.5 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-0.5 truncate text-[13px] leading-5 text-[var(--admin-foreground)]">{value || "Nao informado"}</p>
    </div>
  );
}

function SdrAppointmentBlock({
  appointment,
  compact = false,
}: {
  appointment: WhatsAppCrmLeadCard["nextSdrAppointment"];
  compact?: boolean;
}) {
  if (!appointment) return null;
  const tone = sdrAppointmentTone(appointment.status);

  return (
    <div className={cn("rounded-xl border px-3 py-2.5", toneBg[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            <CalendarClock size={12} className={toneText[tone]} />
            Ligacao SDR
          </p>
          <p className="mt-1 text-[13px] font-semibold leading-5 text-[var(--admin-foreground)]">
            {appointment.scheduleLabel || formatDateTime(appointment.scheduledFor)}
          </p>
        </div>
        <StatusBadge tone={tone} className="h-5 shrink-0 px-1.5 text-[9px]">
          {sdrAppointmentStatusLabel(appointment.status)}
        </StatusBadge>
      </div>
      {!compact && (
        <div className="mt-2 grid gap-1.5 text-[12px] leading-5 text-[var(--admin-soft)]">
          <p>Responsavel: {appointment.assignedAdminName || "usuario nao definido"}</p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge tone={appointment.leadConfirmationStatus === "confirmed" ? "green" : appointment.leadConfirmationStatus === "reschedule_requested" ? "yellow" : "muted"} className="h-5 px-1.5 text-[9px]">
              {sdrLeadConfirmationLabel(appointment.leadConfirmationStatus)}
            </StatusBadge>
            {appointment.confirmationSentAt ? (
              <StatusBadge tone="cyan" className="h-5 px-1.5 text-[9px]">
                Confirmacao enviada
              </StatusBadge>
            ) : null}
            {appointment.adminReminderSentAt ? (
              <StatusBadge tone="green" className="h-5 px-1.5 text-[9px]">
                Admin avisado
              </StatusBadge>
            ) : null}
          </div>
          <p className="line-clamp-2">{appointment.sdrBriefing || appointment.conversationSummary || "Resumo ainda nao gerado."}</p>
        </div>
      )}
    </div>
  );
}

function groupInviteEventLabel(eventType: WhatsAppCrmLeadCard["groupInviteEvents"][number]["eventType"]) {
  if (eventType === "click") return "Clique";
  if (eventType === "failed") return "Falha";
  return "Enviado";
}

function groupInviteEventTone(eventType: WhatsAppCrmLeadCard["groupInviteEvents"][number]["eventType"]): ResourceTone {
  if (eventType === "click") return "green";
  if (eventType === "failed") return "red";
  return "cyan";
}

function groupInviteOutcomeLabel(outcome: string) {
  if (outcome === "scheduled") return "apos agenda";
  if (outcome === "disqualified") return "lead frio";
  return "grupo";
}

function GroupInviteTrackingBlock({
  events,
  compact = false,
}: {
  events: WhatsAppCrmLeadCard["groupInviteEvents"];
  compact?: boolean;
}) {
  if (!events.length) return null;

  const clicks = events.filter((event) => event.eventType === "click").length;
  const visibleEvents = events.slice(0, compact ? 1 : 5);

  return (
    <details className={cn("group rounded-xl border border-[var(--admin-border)] bg-white", !compact && "mt-2")} open={!compact}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--admin-foreground)]">
          <MousePointerClick size={13} className="text-[var(--admin-cyan)]" />
          Grupo Betel
        </span>
        <StatusBadge tone={clicks ? "green" : "cyan"} className="h-5 shrink-0 px-1.5 text-[9px]">
          {clicks ? `${clicks} clique${clicks > 1 ? "s" : ""}` : "enviado"}
        </StatusBadge>
      </summary>
      <div className="grid gap-2 border-t border-[var(--admin-border)] p-2.5">
        {visibleEvents.map((event) => {
          const tone = groupInviteEventTone(event.eventType);
          return (
            <article key={event.id} className={cn("rounded-lg border px-2.5 py-2", toneBg[tone])}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[var(--admin-foreground)]">
                  {groupInviteEventLabel(event.eventType)} - {groupInviteOutcomeLabel(event.outcome)}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                  {formatDateTime(event.createdAt)}
                </span>
              </div>
              <div className="mt-1.5 grid gap-1 text-[11px] leading-4 text-[var(--admin-muted)]">
                <p className="inline-flex min-w-0 items-center gap-1.5">
                  <MapPin size={12} className={toneText[tone]} />
                  <span className="truncate">{event.location || event.ip || "localizacao ainda nao registrada"}</span>
                </p>
                <p className="inline-flex min-w-0 items-center gap-1.5">
                  <MonitorSmartphone size={12} className={toneText[tone]} />
                  <span className="truncate">
                    {[event.deviceType, event.browser, event.os].filter(Boolean).join(" / ") || "dispositivo nao identificado"}
                  </span>
                </p>
                {event.groupUrl ? (
                  <a
                    className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-[var(--admin-cyan)] transition hover:text-[var(--admin-foreground)]"
                    href={event.groupUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir grupo
                    <ExternalLink size={11} />
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </details>
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
        "inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2.5 text-[11px] font-semibold text-[var(--admin-foreground)] transition disabled:cursor-not-allowed disabled:opacity-55",
        toneBg[tone],
        !disabled && !busy ? "hover:border-white/50 hover:bg-white/[0.06]" : ""
      )}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
      <span className="truncate">{children}</span>
    </button>
  );
}

function formatHealthPercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(value, 1)) * 100)}%`;
}

function LeadQueueItem({
  lead,
  selected,
  onSelect,
  nowMs,
}: {
  lead: WhatsAppCrmLeadCard;
  selected: boolean;
  onSelect: () => void;
  nowMs: number;
}) {
  const heat = leadHeatBadge(lead);
  const countdown = handoffCountdownState(lead, nowMs);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full overflow-hidden border-b border-[var(--admin-border)] px-3 py-2.5 text-left transition last:border-b-0",
        selected
          ? "bg-[rgba(15,124,144,0.08)] shadow-[inset_3px_0_0_var(--admin-cyan)]"
          : "hover:bg-[rgba(15,124,144,0.04)]"
      )}
    >
      <div className="grid min-w-0 grid-cols-[32px_minmax(0,1fr)] gap-2.5">
        <LeadAvatar lead={lead} size="sm" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-[var(--admin-foreground)]">{lead.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--admin-muted)]">{formatPhone(lead.phone)}</p>
            </div>
            <StatusBadge tone={heat.tone} className="h-5 shrink-0 px-1.5 text-[9px]">
              {heat.label}
            </StatusBadge>
          </div>
          {countdown && (
            <div className="mt-1.5">
              <HandoffCountdown lead={lead} nowMs={nowMs} compact />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

function ChatBubble({ item }: { item: WhatsAppCrmTimelineItem }) {
  const isOutbound = item.direction === "outbound";
  const isInbound = item.direction === "inbound";
  const isSystem = !isOutbound && !isInbound;
  const isAudio = isAudioTimelineItem(item);
  const itemTone: ResourceTone = timelineOriginTone(item);
  const body = item.text || item.transcript || "Mensagem sem texto.";

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <span className="max-w-[88%] rounded-md border border-[var(--admin-border)] bg-white/85 px-2.5 py-1 text-center text-[10px] font-medium text-[var(--admin-muted)] shadow-sm">
          {body}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("mb-2.5 flex last:mb-0", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg border px-3 py-2 shadow-sm sm:max-w-[72%]",
          isOutbound
            ? item.authorType === "human"
              ? "rounded-br-sm border-[rgba(234,179,8,0.28)] bg-[#fff6d8]"
              : item.authorType === "external"
                ? "rounded-br-sm border-[rgba(239,68,68,0.26)] bg-[#fff4ed]"
                : "rounded-br-sm border-[#bde7b7] bg-[#d9fdd3]"
            : "rounded-bl-sm border-[#f5efe6] bg-white"
        )}
      >
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[10px] font-semibold", toneText[itemTone])}>
            <TimelineMessageIcon item={item} />
            <span className="truncate">{timelineActorLabel(item)}</span>
            <StatusBadge tone={itemTone} className="h-4 px-1.5 text-[8px]">
              {timelineOriginLabel(item)}
            </StatusBadge>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[var(--admin-muted)]">{formatRelative(item.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-[var(--admin-foreground)]">{body}</p>
        {item.transcript && item.transcript !== item.text && (
          <div className="mt-2 rounded-md border border-[var(--admin-border)] bg-white/70 px-2 py-1.5 text-[11px] leading-4 text-[var(--admin-muted)]">
            <span className="font-semibold text-[var(--admin-foreground)]">Transcricao: </span>
            {item.transcript}
          </div>
        )}
        {item.mediaUrl && isAudio && (
          <div className="mt-2 rounded-lg border border-[rgba(15,124,144,0.14)] bg-white/80 px-2.5 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--admin-muted)]">
              <span className="inline-flex items-center gap-1.5">
                <Headphones size={13} className="text-[var(--admin-cyan)]" />
                Ouvir audio
              </span>
              <a
                href={item.mediaUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--admin-cyan)] transition hover:text-[var(--admin-foreground)]"
                title="Abrir audio em nova aba se o navegador nao reproduzir aqui"
              >
                abrir
                <ExternalLink size={11} />
              </a>
            </div>
            <audio
              controls
              preload="metadata"
              src={item.mediaUrl}
              className="h-9 w-full min-w-[220px] max-w-full rounded-full"
            >
              Seu navegador nao conseguiu reproduzir este audio.
            </audio>
          </div>
        )}
        {item.mediaUrl && !isAudio && (
          <a
            href={item.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-white/70 px-2 py-1 text-[11px] font-semibold text-[var(--admin-cyan)] transition hover:border-[var(--admin-cyan)] hover:text-[var(--admin-foreground)]"
          >
            <Paperclip size={13} />
            Abrir midia
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function LiveChatPanel({
  lead,
  busyAction,
  manualReply,
  onManualReplyChange,
  onSendManualReply,
  onLeadAction,
  onOpenLeadFile,
  nowMs,
}: {
  lead?: WhatsAppCrmLeadCard;
  busyAction: string | null;
  manualReply: string;
  onManualReplyChange: (value: string) => void;
  onSendManualReply: (lead: WhatsAppCrmLeadCard) => void;
  onLeadAction: (action: LeadActionKey, lead: WhatsAppCrmLeadCard) => void;
  onOpenLeadFile: () => void;
  nowMs: number;
}) {
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const timeline = useMemo(() => (lead ? sortedTimeline(lead.timeline) : []), [lead]);
  const latestTimelineItem = timeline[timeline.length - 1];

  useEffect(() => {
    if (!lead) return;
    const container = chatScrollRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldFollowConversation = distanceFromBottom < 180 || latestTimelineItem?.direction === "inbound";
    if (!shouldFollowConversation) return;

    window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
  }, [lead, latestTimelineItem?.createdAt, latestTimelineItem?.direction, timeline.length]);

  if (!lead) {
    return (
      <section className="grid min-h-[360px] place-items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-5 text-center text-[13px] text-[var(--admin-muted)] shadow-sm shadow-[rgba(81,60,36,0.06)] xl:h-full xl:min-h-0">
        Nenhum atendimento na fila atual.
      </section>
    );
  }

  const statusTone = conversationStatusTone(lead);
  const toggleAction: LeadActionKey = lead.humanInterventionActive ? "resume_ai" : "pause_ai";
  const toggleLabel = lead.humanInterventionActive ? "Retomar IA" : "Assumir";
  const toggleBusy = busyAction === `${lead.id}:${toggleAction}`;

  return (
    <section className="grid min-h-[560px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[18px] border border-[rgba(15,124,144,0.16)] bg-[var(--admin-card)] shadow-sm shadow-[rgba(81,60,36,0.08)] xl:h-full xl:min-h-0">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-[var(--admin-border)] bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <LeadAvatar lead={lead} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold text-[var(--admin-foreground)]">{lead.name}</h2>
              <StatusBadge tone={statusTone} className="h-5 px-1.5 text-[9px]">{conversationStatusLabel(lead)}</StatusBadge>
              <StatusBadge tone={crmStageTone[lead.crmStage]} className="h-5 px-1.5 text-[9px]">{crmStageLabels[lead.crmStage]}</StatusBadge>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[var(--admin-muted)]">
              <span className="inline-flex items-center gap-1">
                <Phone size={12} />
                {formatPhone(lead.phone)}
              </span>
              <span>{lead.messageCount} mensagens</span>
              <span>ultima {formatRelative(lead.lastMessageAt)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HandoffCountdown lead={lead} nowMs={nowMs} />
          <button
            type="button"
            disabled={lead.optOut}
            onClick={() => onLeadAction(toggleAction, lead)}
            title={lead.humanInterventionActive ? "Retomar atendimento automatico" : "Pausar a IA e assumir atendimento humano"}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold text-[#fffaf0] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-55",
              lead.humanInterventionActive
                ? "border-[var(--admin-green)] bg-[var(--admin-green)] hover:bg-[#0f6d4f]"
                : "border-[var(--admin-cyan)] bg-[var(--admin-cyan)] hover:bg-[#0b6676]"
            )}
          >
            {toggleBusy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : lead.humanInterventionActive ? (
              <Bot size={14} />
            ) : (
              <UserCheck size={14} />
            )}
            {toggleLabel}
          </button>
          <button
            type="button"
            onClick={onOpenLeadFile}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-[rgba(18,128,92,0.24)] bg-[rgba(18,128,92,0.08)] px-3 text-[11px] font-semibold text-[var(--admin-green)] transition hover:border-[var(--admin-green)] hover:bg-[rgba(18,128,92,0.12)]"
          >
            <ClipboardCheck size={13} />
            CRM do lead
          </button>
        </div>
      </div>

      <div
        ref={chatScrollRef}
        className="min-h-0 overflow-auto px-3 py-3.5 sm:px-4"
        style={whatsappChatBackgroundStyle}
      >
        {timeline.length ? (
          timeline.map((item) => <ChatBubble key={item.id} item={item} />)
        ) : (
          <div className="grid min-h-[300px] place-items-center rounded-lg border border-dashed border-[var(--admin-border)] bg-white/70 px-4 text-center text-[13px] text-[var(--admin-muted)]">
            Sem mensagens salvas para este lead.
          </div>
        )}
      </div>

      <div className="border-t border-[var(--admin-border)] bg-[#f9fafb] p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--admin-foreground)]">
            <Send size={14} className="text-[var(--admin-cyan)]" />
            Resposta humana
          </span>
          <HandoffCountdown lead={lead} nowMs={nowMs} compact />
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_118px] lg:items-end">
          <textarea
            value={manualReply}
            onChange={(event) => onManualReplyChange(event.target.value)}
            placeholder="Digite uma resposta aqui no painel"
            rows={2}
            className="min-h-[58px] w-full resize-none rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2.5 text-[13px] leading-5 text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)] focus:ring-3 focus:ring-[rgba(15,124,144,0.12)]"
          />
          <div className="flex items-center justify-between gap-3 lg:grid lg:justify-items-end">
            <span className="text-[10px] text-[var(--admin-muted)]">{manualReply.trim().length}/2200</span>
            <ActionButton
              icon={Send}
              tone="green"
              busy={busyAction === `${lead.id}:manual_reply`}
              disabled={!lead.conversationId || !manualReply.trim()}
              onClick={() => onSendManualReply(lead)}
              title="Enviar mensagem humana por WhatsApp"
            >
              Responder
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function LeadDetail({
  lead,
  busyAction,
  nowMs,
  onLeadAction,
  contextDraft,
  onContextDraftChange,
  onSaveContext,
  stageDraft,
  onStageDraftChange,
  onSaveStage,
}: {
  lead?: WhatsAppCrmLeadCard;
  busyAction: string | null;
  nowMs: number;
  onLeadAction: (action: LeadActionKey, lead: WhatsAppCrmLeadCard) => void;
  contextDraft: ContextDraft;
  onContextDraftChange: (patch: Partial<ContextDraft>) => void;
  onSaveContext: (lead: WhatsAppCrmLeadCard) => void;
  stageDraft: StageDraft;
  onStageDraftChange: (patch: Partial<StageDraft>) => void;
  onSaveStage: (lead: WhatsAppCrmLeadCard) => void;
}) {
  if (!lead) {
    return (
      <div className="rounded-xl border border-[var(--admin-border)] bg-white p-4">
        <div className="py-8 text-center text-[13px] text-[var(--admin-muted)]">Nenhum lead na fila atual.</div>
      </div>
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
    <div className="grid gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <LeadAvatar lead={lead} />
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-[var(--admin-foreground)]">{lead.name}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--admin-muted)]">
              <span>{formatPhone(lead.phone)}</span>
              {lead.whatsappUrl && (
                <a
                  href={lead.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--admin-cyan)] transition hover:text-[var(--admin-foreground)]"
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

      <HandoffCountdown lead={lead} nowMs={nowMs} />
      <SdrAppointmentBlock appointment={lead.nextSdrAppointment} />
      <GroupInviteTrackingBlock events={lead.groupInviteEvents} />

      <div className={cn("mt-2 rounded-lg border px-3 py-2.5", toneBg[lead.humanInterventionActive ? "yellow" : "cyan"])}>
        <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Resumo inteligente</p>
        <p className="mt-1.5 text-[13px] leading-5 text-[var(--admin-foreground)]">{lead.nextAction}</p>
      </div>

      <div className="mt-2">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-[var(--admin-foreground)]">Panorama de qualificacao</p>
          <span className="font-mono text-[10px] text-[var(--admin-muted)]">{filled}/6 campos</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {qualificationItems.map(([label, value]) => (
            <InfoCell key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <details className="group mt-2 rounded-lg border border-[var(--admin-border)] bg-white">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3">
          <span className="text-[11px] font-semibold text-[var(--admin-foreground)]">Ficha tecnica</span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)] group-open:hidden">Abrir</span>
          <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)] group-open:inline">Fechar</span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--admin-border)] p-2.5 sm:grid-cols-2">
          <InfoCell label="Agente" value={lead.agentName} />
          <InfoCell label="Origem" value={lead.source} />
          <InfoCell label="Etapa CRM" value={crmStageLabels[lead.crmStage]} />
          <InfoCell label="Status" value={lead.status} />
          <InfoCell label="Responsavel" value={lead.assignedToLabel || "Fila IA"} />
          <InfoCell label="Ultima direcao" value={directionLabel(lead.lastMessageDirection)} />
          <InfoCell label="Ultima msg" value={formatDateTime(lead.lastMessageAt)} />
        </div>
      </details>

      {lead.runtimeDecision.primaryIntent && (
        <details className="group mt-2 rounded-lg border border-[var(--admin-border)] bg-white">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--admin-foreground)]">
              <Bot size={13} className="text-[var(--admin-cyan)]" />
              Motor de atendimento
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={lead.runtimeDecision.riskFlags.length ? "yellow" : "cyan"} className="h-5 px-1.5 text-[9px]">
                {lead.runtimeDecision.stage ? crmStageLabels[lead.runtimeDecision.stage] : lead.runtimeDecision.primaryIntent}
              </StatusBadge>
              <ChevronDown size={14} className="text-[var(--admin-muted)] transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-[var(--admin-border)] p-2.5">
            <div className="grid gap-2 sm:grid-cols-3">
              <InfoCell label="Intencao" value={lead.runtimeDecision.primaryIntent} />
              <InfoCell label="Confianca" value={formatHealthPercent(lead.runtimeDecision.confidence)} />
              <InfoCell label="Atualizado" value={formatRelative(lead.runtimeDecision.updatedAt)} />
            </div>
            <div className="mt-3 grid gap-2">
              {lead.runtimeDecision.qualificationMissing.length > 0 && (
                <p className="rounded border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-2 py-1.5 text-[11px] leading-4 text-[var(--admin-yellow)]">
                  Falta coletar: {lead.runtimeDecision.qualificationMissing.slice(0, 3).join(", ")}
                </p>
              )}
              {lead.runtimeDecision.riskFlags.length > 0 && (
                <p className="rounded border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-2 py-1.5 text-[11px] leading-4 text-[var(--admin-red)]">
                  Risco: {lead.runtimeDecision.riskFlags.slice(0, 3).join(", ")}
                </p>
              )}
            </div>
          </div>
        </details>
      )}

      <div className="mt-2 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-2.5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold text-[var(--admin-foreground)]">Etapa do funil</p>
          <StatusBadge tone={crmStageTone[lead.crmStage]} className="h-5 px-1.5 text-[9px]">{crmStageLabels[lead.crmStage]}</StatusBadge>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">CRM WhatsApp</span>
            <select
              value={selectedCrmStage}
              onChange={(event) => onStageDraftChange({ crmStage: event.target.value as WhatsAppCrmStage })}
              className="h-8 rounded-md border border-[var(--admin-border)] bg-white px-2.5 text-[13px] text-[var(--admin-foreground)] outline-none focus:border-[var(--admin-cyan)]"
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

      <div className="mt-2 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-2.5">
        <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
          <p className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--admin-foreground)]">
            <StickyNote size={13} className="text-[var(--admin-cyan)]" />
            Contexto interno
          </p>
          <StatusBadge tone={lead.assignedToLabel ? "purple" : "muted"} className="h-5 max-w-[120px] px-1.5 text-[9px]">
            {lead.assignedToLabel ? `resp. ${lead.assignedToLabel}` : "fila"}
          </StatusBadge>
        </div>
        <div className="grid gap-2">
          <label className="grid gap-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">Responsavel</span>
            <input
              value={contextDraft.assignedToLabel}
              onChange={(event) => onContextDraftChange({ assignedToLabel: event.target.value })}
              placeholder="Nome do atendente"
              className="h-8 min-w-0 rounded-md border border-[var(--admin-border)] bg-white px-2.5 text-[13px] text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
              <Tags size={12} />
              Tags
            </span>
            <input
              value={contextDraft.internalTags}
              onChange={(event) => onContextDraftChange({ internalTags: event.target.value })}
              placeholder="ex: visita, edital"
              className="h-8 min-w-0 rounded-md border border-[var(--admin-border)] bg-white px-2.5 text-[13px] text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
            />
          </label>
        </div>
        <textarea
          value={contextDraft.internalNotes}
          onChange={(event) => onContextDraftChange({ internalNotes: event.target.value })}
          placeholder="Notas internas do atendimento"
          rows={2}
          className="mt-2 min-h-[64px] w-full resize-none rounded-md border border-[var(--admin-border)] bg-white px-2.5 py-2 text-[13px] leading-5 text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
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
        <div className={cn("mt-2 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5", toneBg[reviewTone(lead.latestReviewScore, lead.latestReviewVerdict)])}>
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Auditoria IA</p>
            <p className="mt-0.5 truncate text-[13px] text-[var(--admin-foreground)]">{lead.latestReviewVerdict || "monitorar"}</p>
          </div>
          <div className={cn("font-mono text-xl font-bold", toneText[reviewTone(lead.latestReviewScore, lead.latestReviewVerdict)])}>
            {lead.latestReviewScore}
          </div>
        </div>
      )}

      <details className="group mt-2 rounded-lg border border-[var(--admin-border)] bg-white">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3">
          <span className="text-[11px] font-semibold text-[var(--admin-foreground)]">Acoes administrativas</span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)] group-open:hidden">Abrir</span>
          <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)] group-open:inline">Fechar</span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--admin-border)] p-2.5 sm:grid-cols-2">
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
      </details>

    </div>
  );
}

function LeadSidePanel({ lead, nowMs }: { lead?: WhatsAppCrmLeadCard; nowMs: number }) {
  if (!lead) {
    return (
      <aside className="rounded-[18px] border border-[rgba(15,124,144,0.14)] bg-white p-4 text-[13px] text-[var(--admin-muted)] shadow-sm shadow-[rgba(81,60,36,0.06)]">
        Nenhum lead selecionado.
      </aside>
    );
  }

  const qualificationItems = [
    ["Capital", lead.qualification.capital],
    ["Regiao", lead.qualification.region],
    ["Objetivo", lead.qualification.objective],
    ["Experiencia", lead.qualification.experience],
    ["Prazo", lead.qualification.urgency],
    ["Tipo", lead.qualification.propertyType],
  ] as const;
  const filled = qualificationItems.filter(([, value]) => hasQualificationValue(value)).length;
  const lastInbound = sortedTimeline(lead.timeline)
    .filter((item) => item.direction === "inbound")
    .at(-1);

  return (
    <aside className="grid min-w-0 gap-3 2xl:h-full 2xl:min-h-0 2xl:overflow-auto">
      <section className="overflow-hidden rounded-[18px] border border-[rgba(15,124,144,0.14)] bg-white shadow-sm shadow-[rgba(81,60,36,0.06)]">
        <div className="border-b border-[var(--admin-border)] bg-[#fbfdff] px-3.5 py-3">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            arquivo do lead
          </p>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-lg font-semibold text-[var(--admin-foreground)]">Perfil rapido</h3>
              <p className="mt-0.5 text-[12px] text-[var(--admin-muted)]">{filled}/6 campos de qualificacao</p>
            </div>
            <StatusBadge tone={crmStageTone[lead.crmStage]} className="h-5 px-1.5 text-[9px]">{crmStageLabels[lead.crmStage]}</StatusBadge>
          </div>
        </div>

        <div className="grid gap-2.5 p-3">
          <div className={cn("rounded-xl border px-3 py-2.5", toneBg[leadPriorityTone(lead)])}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12px] font-semibold text-[var(--admin-foreground)]">{leadPriorityLabel(lead)}</span>
              <LeadScore score={lead.score} />
            </div>
            <p className="mt-2 line-clamp-3 text-[13px] leading-5 text-[var(--admin-foreground)]">{lead.nextAction}</p>
          </div>

          <HandoffCountdown lead={lead} nowMs={nowMs} />
          <SdrAppointmentBlock appointment={lead.nextSdrAppointment} compact />
          <GroupInviteTrackingBlock events={lead.groupInviteEvents} compact />

          <div className="grid gap-2">
            {qualificationItems.slice(0, 4).map(([label, value]) => (
              <InfoCell key={label} label={label} value={value} />
            ))}
          </div>

          <div className="rounded-xl border border-[var(--admin-border)] bg-[#fbfdff] px-3 py-2.5">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
              ultima entrada
            </p>
            <p className="mt-1.5 line-clamp-3 text-[13px] leading-5 text-[var(--admin-foreground)]">
              {lastInbound?.text || lastInbound?.transcript || lead.lastMessagePreview || "Sem mensagem recente do lead."}
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
}

function LeadFileModal({
  open,
  lead,
  busyAction,
  nowMs,
  contextDraft,
  stageDraft,
  onClose,
  onLeadAction,
  onContextDraftChange,
  onSaveContext,
  onStageDraftChange,
  onSaveStage,
}: {
  open: boolean;
  lead?: WhatsAppCrmLeadCard;
  busyAction: string | null;
  nowMs: number;
  contextDraft: ContextDraft;
  stageDraft: StageDraft;
  onClose: () => void;
  onLeadAction: (action: LeadActionKey, lead: WhatsAppCrmLeadCard) => void;
  onContextDraftChange: (patch: Partial<ContextDraft>) => void;
  onSaveContext: (lead: WhatsAppCrmLeadCard) => void;
  onStageDraftChange: (patch: Partial<StageDraft>) => void;
  onSaveStage: (lead: WhatsAppCrmLeadCard) => void;
}) {
  if (!open || !lead) return null;

  const timeline = sortedTimeline(lead.timeline);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(15,23,42,0.24)] p-3 backdrop-blur-sm sm:p-5">
      <section className="grid h-[min(840px,calc(100vh-32px))] w-full max-w-[1240px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-[rgba(15,124,144,0.18)] bg-white shadow-2xl shadow-[rgba(15,23,42,0.18)]">
        <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <LeadAvatar lead={lead} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-base font-semibold text-[var(--admin-foreground)]">Arquivo inteligente do lead</h2>
                <StatusBadge tone={crmStageTone[lead.crmStage]} className="h-5 px-1.5 text-[9px]">{crmStageLabels[lead.crmStage]}</StatusBadge>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-[var(--admin-muted)]">
                <span className="font-semibold text-[var(--admin-foreground)]">{lead.name}</span>
                <span>{formatPhone(lead.phone)}</span>
                <HandoffCountdown lead={lead} nowMs={nowMs} compact />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full border border-[var(--admin-border)] bg-white text-[var(--admin-muted)] transition hover:border-[var(--admin-cyan)] hover:text-[var(--admin-foreground)]"
            title="Fechar arquivo do lead"
          >
            <X size={16} />
          </button>
        </header>

        <div className="grid min-h-0 lg:grid-cols-[328px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-r border-[var(--admin-border)] bg-[#f8fbff] p-3">
            <LeadDetail
              lead={lead}
              busyAction={busyAction}
              nowMs={nowMs}
              contextDraft={contextDraft}
              stageDraft={stageDraft}
              onLeadAction={onLeadAction}
              onContextDraftChange={onContextDraftChange}
              onSaveContext={onSaveContext}
              onStageDraftChange={onStageDraftChange}
              onSaveStage={onSaveStage}
            />
          </div>

          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
            <div className="flex min-h-16 items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <LeadAvatar lead={lead} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-[var(--admin-foreground)]">{lead.name}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--admin-muted)]">{formatPhone(lead.phone)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <HandoffCountdown lead={lead} nowMs={nowMs} compact />
                <StatusBadge tone={conversationStatusTone(lead)} className="h-5 px-1.5 text-[9px]">{conversationStatusLabel(lead)}</StatusBadge>
                <StatusBadge tone="cyan" className="h-5 px-1.5 text-[9px]">{lead.messageCount} mensagens</StatusBadge>
              </div>
            </div>

            <div
              className="min-h-0 overflow-auto px-3 py-3.5 sm:px-4"
              style={whatsappChatBackgroundStyle}
            >
              {timeline.length ? (
                timeline.map((item) => <ChatBubble key={item.id} item={item} />)
              ) : (
                <div className="grid min-h-[280px] place-items-center rounded-xl border border-dashed border-[var(--admin-border)] bg-white/70 px-4 text-center text-[13px] text-[var(--admin-muted)]">
                  Sem historico salvo para este lead.
                </div>
              )}
            </div>

            <div className="border-t border-[rgba(18,128,92,0.18)] bg-[rgba(18,128,92,0.08)] px-4 py-2.5 text-[12px] text-[var(--admin-foreground)]">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MessageCircle size={14} className="shrink-0 text-[var(--admin-green)]" />
                WhatsApp - status {lead.conversationStatus || "open"} - {formatDateTime(lead.lastMessageAt)}
              </span>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

export function WhatsAppCrmPage({ crmData }: { crmData: DataResult<WhatsAppCrmData> }) {
  const router = useRouter();
  const [liveCrmData, setLiveCrmData] = useState<DataResult<WhatsAppCrmData>>(crmData);
  const data = liveCrmData.data;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(crmData.data.leads[0]?.id || null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [incomingNotice, setIncomingNotice] = useState<IncomingLeadNotice | null>(null);
  const [liveSync, setLiveSync] = useState<LiveSyncState>(() => ({
    status: "live",
    lastSyncedAt: crmData.data.generatedAt,
    message: "Atendimento ao vivo ativo.",
  }));
  const [manualReply, setManualReply] = useState("");
  const [leadFileOpen, setLeadFileOpen] = useState(false);
  const [contextDraft, setContextDraft] = useState<ContextDraft>(() => contextDraftFromLead(data.leads[0]));
  const [stageDraft, setStageDraft] = useState<StageDraft>(() => stageDraftFromLead(data.leads[0]));
  const [nowMs, setNowMs] = useState(() => Date.now());
  const knownLeadActivityRef = useRef(buildLeadActivityMap(crmData.data.leads));
  const selectedIdRef = useRef(selectedId);
  const manualReplyRef = useRef(manualReply);
  const leadFileOpenRef = useRef(leadFileOpen);
  const pollingInFlightRef = useRef(false);
  const externalOutboundReconcileRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundUnlockedRef = useRef(false);
  const notificationPermissionRequestedRef = useRef(false);

  const playIncomingSound = useCallback(() => {
    if (!soundUnlockedRef.current) return;

    try {
      const AudioContextClass =
        window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      const context = audioContextRef.current || new AudioContextClass();
      audioContextRef.current = context;

      void context
        .resume()
        .then(() => {
          const startedAt = context.currentTime;
          const oscillator = context.createOscillator();
          const gain = context.createGain();

          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(880, startedAt);
          oscillator.frequency.exponentialRampToValueAtTime(640, startedAt + 0.18);
          gain.gain.setValueAtTime(0.0001, startedAt);
          gain.gain.exponentialRampToValueAtTime(0.08, startedAt + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.28);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(startedAt);
          oscillator.stop(startedAt + 0.3);
        })
        .catch(() => undefined);
    } catch {
      // Browsers can block audio before the first user interaction.
    }
  }, []);

  const announceIncomingLeads = useCallback(
    (leads: WhatsAppCrmLeadCard[]) => {
      const lead = leads[0];
      if (!lead) return;

      const preview = notificationPreview(lead);
      setIncomingNotice({
        leadId: lead.id,
        leadName: lead.name || formatPhone(lead.phone),
        preview,
        createdAt: lead.lastMessageAt,
      });
      playIncomingSound();

      if (!("Notification" in window) || Notification.permission !== "granted") return;
      if (!document.hidden && selectedIdRef.current === lead.id) return;

      try {
        const notification = new Notification(`Nova mensagem de ${lead.name || "Lead WhatsApp"}`, {
          body: preview,
          tag: `betel-whatsapp-${lead.id}`,
          silent: true,
        });
        notification.onclick = () => {
          window.focus();
          setSelectedId(lead.id);
          setLeadFileOpen(false);
          setIncomingNotice(null);
        };
      } catch {
        // Desktop notifications may be unavailable depending on browser permissions.
      }
    },
    [playIncomingSound]
  );

  const refreshLiveCrm = useCallback(
    async ({ notify = false }: { notify?: boolean } = {}) => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      setLiveSync((current) =>
        current.status === "error"
          ? { status: "syncing", lastSyncedAt: current.lastSyncedAt, message: "Reconectando atendimento ao vivo." }
          : current
      );

      try {
        const now = Date.now();
        const shouldReconcileExternal = now - externalOutboundReconcileRef.current >= EXTERNAL_OUTBOUND_RECONCILE_MS;
        if (shouldReconcileExternal) externalOutboundReconcileRef.current = now;

        const response = await fetch(`/api/admin/whatsapp/crm${shouldReconcileExternal ? "?reconcile=1" : ""}`, {
          cache: "no-store",
          headers: { accept: "application/json" },
        });
        const result = (await response.json().catch(() => null)) as DataResult<WhatsAppCrmData> | null;
        if (!response.ok || !result?.data || !Array.isArray(result.data.leads)) {
          throw new Error("Nao foi possivel sincronizar o atendimento ao vivo.");
        }

        const activeLeads = notify ? activeLeadsSince(knownLeadActivityRef.current, result.data.leads) : [];
        const incoming = activeLeads.filter((lead) => lead.lastMessageDirection === "inbound");
        knownLeadActivityRef.current = buildLeadActivityMap(result.data.leads);
        setLiveCrmData(result);
        setLiveSync({
          status: "live",
          lastSyncedAt: result.data.generatedAt || new Date().toISOString(),
          message: "Atendimento ao vivo sincronizado.",
        });
        const nextActiveLead = activeLeads.find((lead) => lead.lastMessageDirection === "inbound") || activeLeads[0];
        if (
          nextActiveLead &&
          nextActiveLead.id !== selectedIdRef.current &&
          !document.hidden &&
          !leadFileOpenRef.current &&
          !manualReplyRef.current.trim()
        ) {
          selectedIdRef.current = nextActiveLead.id;
          setSelectedId(nextActiveLead.id);
          setContextDraft(contextDraftFromLead(nextActiveLead));
          setStageDraft(stageDraftFromLead(nextActiveLead));
        }
        if (incoming.length) announceIncomingLeads(incoming);
      } catch (error) {
        setLiveSync({
          status: "error",
          lastSyncedAt: new Date().toISOString(),
          message: error instanceof Error ? error.message : "Falha ao sincronizar atendimento ao vivo.",
        });
      } finally {
        pollingInFlightRef.current = false;
      }
    },
    [announceIncomingLeads]
  );

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    manualReplyRef.current = manualReply;
  }, [manualReply]);

  useEffect(() => {
    leadFileOpenRef.current = leadFileOpen;
  }, [leadFileOpen]);

  useEffect(() => {
    const enableNotifications = () => {
      soundUnlockedRef.current = true;

      try {
        const AudioContextClass =
          window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass && !audioContextRef.current) {
          audioContextRef.current = new AudioContextClass();
        }
        void audioContextRef.current?.resume().catch(() => undefined);
      } catch {
        // Audio unlock is best-effort.
      }

      if ("Notification" in window && Notification.permission === "default" && !notificationPermissionRequestedRef.current) {
        notificationPermissionRequestedRef.current = true;
        void Notification.requestPermission().catch(() => undefined);
      }

      window.removeEventListener("pointerdown", enableNotifications);
      window.removeEventListener("keydown", enableNotifications);
    };

    window.addEventListener("pointerdown", enableNotifications);
    window.addEventListener("keydown", enableNotifications);
    return () => {
      window.removeEventListener("pointerdown", enableNotifications);
      window.removeEventListener("keydown", enableNotifications);
    };
  }, []);

  useEffect(() => {
    if (!incomingNotice) return undefined;
    const timeout = window.setTimeout(() => setIncomingNotice(null), LIVE_NOTICE_TTL_MS);
    return () => window.clearTimeout(timeout);
  }, [incomingNotice]);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      if (cancelled) return;
      void refreshLiveCrm({ notify: true });
    };
    const firstPoll = window.setTimeout(poll, 900);
    const interval = window.setInterval(poll, LIVE_CRM_REFRESH_MS);
    const syncOnFocus = () => void refreshLiveCrm({ notify: true });
    const syncOnVisibility = () => {
      if (!document.hidden) void refreshLiveCrm({ notify: true });
    };

    window.addEventListener("focus", syncOnFocus);
    document.addEventListener("visibilitychange", syncOnVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(firstPoll);
      window.clearInterval(interval);
      window.removeEventListener("focus", syncOnFocus);
      document.removeEventListener("visibilitychange", syncOnVisibility);
    };
  }, [refreshLiveCrm]);

  const activeCountdownDeadlines = useMemo(
    () =>
      data.leads
        .map((lead) => handoffCountdownState(lead, nowMs)?.deadlineMs || 0)
        .filter((deadline) => deadline > nowMs),
    [data.leads, nowMs]
  );
  const hasActiveCountdown = activeCountdownDeadlines.length > 0;
  const nextCountdownDeadline = hasActiveCountdown ? Math.min(...activeCountdownDeadlines) : 0;

  useEffect(() => {
    if (!hasActiveCountdown) return undefined;
    const interval = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [hasActiveCountdown]);

  useEffect(() => {
    if (!nextCountdownDeadline) return undefined;
    const timeout = window.setTimeout(() => router.refresh(), Math.max(1200, nextCountdownDeadline - Date.now() + 1500));
    return () => window.clearTimeout(timeout);
  }, [nextCountdownDeadline, router]);

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
  const activeAgent =
    (selectedLead && data.agents.find((agent) => agent.agentKey === selectedLead.agentKey)) ||
    data.agents.find((agent) => agent.connected) ||
    data.agents[0];
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
    window.setTimeout(() => {
      void refreshLiveCrm();
      router.refresh();
    }, 350);
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

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1780px] flex-col gap-2 px-3 py-2 lg:px-4 xl:h-[calc(100vh-64px)] xl:overflow-hidden">
      {liveCrmData.reason && (
        <div className="rounded-xl border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-3 py-2.5 text-[11px] text-[var(--admin-yellow)]">
          {liveCrmData.reason}
        </div>
      )}
      {feedback && (
        <div
          className={cn(
            "rounded-xl border px-3 py-2.5 text-[11px]",
            feedback.type === "ok"
              ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
              : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
          )}
        >
          {feedback.msg}
        </div>
      )}
      {incomingNotice && (
        <IncomingMessageNotice
          notice={incomingNotice}
          onOpen={() => {
            setSelectedId(incomingNotice.leadId);
            setLeadFileOpen(false);
            setIncomingNotice(null);
          }}
          onClose={() => setIncomingNotice(null)}
        />
      )}

      <section className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(640px,1fr)_300px]">
        <aside className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[18px] border border-[rgba(15,124,144,0.14)] bg-[var(--admin-card)] shadow-sm shadow-[rgba(81,60,36,0.08)] xl:h-full xl:min-h-0">
          <div className="border-b border-[var(--admin-border)] bg-[#fbfdff] p-3">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                  central whatsapp
                </p>
                <h2 className="mt-0.5 truncate text-lg font-semibold text-[var(--admin-foreground)]">Atendimento</h2>
              </div>
              <div className="flex shrink-0 items-start gap-2">
                <AgentAvatar agent={activeAgent} />
                <div className="flex flex-col items-end gap-1">
                  <LiveSyncBadge sync={liveSync} />
                  <StatusBadge tone="cyan" className="h-5 px-1.5 text-[9px]">{filteredLeads.length} na visao</StatusBadge>
                </div>
              </div>
            </div>

            <div className="relative mt-3 min-w-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lead, telefone ou mensagem"
                className="h-9 w-full rounded-full border border-[var(--admin-border)] bg-white pl-9 pr-3 text-[13px] text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)] focus:ring-3 focus:ring-[rgba(15,124,144,0.12)]"
              />
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center rounded-full border px-2.5 text-[11px] font-semibold transition",
                    filter === key
                      ? "border-[rgba(15,124,144,0.28)] bg-[rgba(15,124,144,0.10)] text-[var(--admin-cyan)]"
                      : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)] hover:border-[rgba(15,124,144,0.24)] hover:text-[var(--admin-foreground)]"
                  )}
                >
                  {filterLabels[key]} {counts[key]}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-auto">
            {filteredLeads.length ? (
              filteredLeads.map((lead) => (
                <LeadQueueItem
                  key={lead.id}
                  lead={lead}
                  selected={selectedLead?.id === lead.id}
                  nowMs={nowMs}
                  onSelect={() => {
                    setSelectedId(lead.id);
                    setManualReply("");
                    setLeadFileOpen(false);
                    setContextDraft(contextDraftFromLead(lead));
                    setStageDraft(stageDraftFromLead(lead));
                  }}
                />
              ))
            ) : (
              <div className="px-3 py-8 text-center text-[13px] text-[var(--admin-muted)]">
                Nenhum atendimento encontrado para este filtro.
              </div>
            )}
          </div>
        </aside>

        <LiveChatPanel
          lead={selectedLead}
          busyAction={busyAction}
          manualReply={manualReply}
          onManualReplyChange={setManualReply}
          onSendManualReply={(lead) => void sendManualReply(lead)}
          onLeadAction={(action, lead) => void runLeadAction(action, lead)}
          onOpenLeadFile={() => setLeadFileOpen(true)}
          nowMs={nowMs}
        />

        <LeadSidePanel lead={selectedLead} nowMs={nowMs} />
      </section>

      <LeadFileModal
        open={leadFileOpen}
        lead={selectedLead}
        busyAction={busyAction}
        nowMs={nowMs}
        contextDraft={selectedContextDraft}
        stageDraft={selectedStageDraft}
        onClose={() => setLeadFileOpen(false)}
        onLeadAction={(action, lead) => void runLeadAction(action, lead)}
        onContextDraftChange={(patch) => {
          if (selectedLead) updateLeadContextDraft(selectedLead, patch);
        }}
        onSaveContext={(lead) => void saveLeadContext(lead)}
        onStageDraftChange={(patch) => {
          if (selectedLead) updateLeadStageDraft(selectedLead, patch);
        }}
        onSaveStage={(lead) => void saveLeadStage(lead)}
      />
    </div>
  );
}
