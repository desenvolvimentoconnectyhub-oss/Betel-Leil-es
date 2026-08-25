"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  CalendarClock,
  ChevronDown,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Headphones,
  Loader2,
  MessageCircle,
  Paperclip,
  Phone,
  RefreshCw,
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
  X,
  XCircle,
} from "lucide-react";
import type { ComponentType, CSSProperties } from "react";
import type {
  DataResult,
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
  return <Bot size={13} />;
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
  if (item.authorType === "ai") return "Evelyn";
  return item.authorLabel || "Sistema";
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
    <div className="min-w-[92px]">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={cn("font-mono text-xs font-bold", toneText[tone])}>{score}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">score</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(113,128,140,0.18)]">
        <div className={cn("h-full rounded-full", tone === "cyan" ? "bg-[var(--admin-cyan)]" : tone === "green" ? "bg-[var(--admin-green)]" : tone === "yellow" ? "bg-[var(--admin-yellow)]" : "bg-white/25")} style={{ width: `${Math.max(4, Math.min(score, 100))}%` }} />
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--admin-border)] bg-[#fbfdff] px-3 py-2">
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
        "inline-flex h-9 items-center justify-center gap-2 rounded-full border px-3 text-xs font-semibold text-[var(--admin-foreground)] transition disabled:cursor-not-allowed disabled:opacity-55",
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

function LeadQueueItem({
  lead,
  selected,
  onSelect,
}: {
  lead: WhatsAppCrmLeadCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const priorityTone = leadPriorityTone(lead);
  const visibleTags = [...lead.tags, ...lead.internalTags].slice(0, 2);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "grid w-full gap-3 border-b border-[var(--admin-border)] px-3 py-3 text-left transition last:border-b-0",
        selected
          ? "bg-[rgba(15,124,144,0.08)] shadow-[inset_3px_0_0_var(--admin-cyan)]"
          : "hover:bg-[rgba(15,124,144,0.04)]"
      )}
    >
      <div className="grid min-w-0 grid-cols-[36px_minmax(0,1fr)] gap-3">
        <LeadAvatar lead={lead} size="sm" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{lead.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--admin-muted)]">{formatPhone(lead.phone)}</p>
            </div>
            <span className="shrink-0 text-[11px] text-[var(--admin-muted)]">{formatRelative(lead.lastMessageAt)}</span>
          </div>

          <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">
            {lead.lastMessagePreview || lead.nextAction}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={priorityTone}>{leadPriorityLabel(lead)}</StatusBadge>
            <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
            {lead.humanInterventionActive && <StatusBadge tone="yellow">em atendimento</StatusBadge>}
            {visibleTags.map((tag) => (
              <span key={tag} className="rounded border border-[var(--admin-border)] bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </button>
  );
}

function ChatBubble({ item }: { item: WhatsAppCrmTimelineItem }) {
  const isOutbound = item.direction === "outbound";
  const isInbound = item.direction === "inbound";
  const isSystem = !isOutbound && !isInbound;
  const itemTone: ResourceTone = item.authorType === "human" ? "yellow" : item.tone;
  const body = item.text || item.transcript || "Mensagem sem texto.";

  if (isSystem) {
    return (
      <div className="my-3 flex justify-center">
        <span className="max-w-[88%] rounded-md border border-[var(--admin-border)] bg-white/85 px-3 py-1.5 text-center text-[11px] font-medium text-[var(--admin-muted)] shadow-sm">
          {body}
        </span>
      </div>
    );
  }

  return (
    <div className={cn("mb-3 flex last:mb-0", isOutbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-lg border px-3.5 py-2.5 shadow-sm sm:max-w-[78%]",
          isOutbound
            ? item.authorType === "human"
              ? "rounded-br-sm border-[rgba(234,179,8,0.28)] bg-[#fff6d8]"
              : "rounded-br-sm border-[#bde7b7] bg-[#d9fdd3]"
            : "rounded-bl-sm border-[#f5efe6] bg-white"
        )}
      >
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold", toneText[itemTone])}>
            <TimelineMessageIcon item={item} />
            <span className="truncate">{timelineActorLabel(item)}</span>
          </span>
          <span className="shrink-0 font-mono text-[10px] text-[var(--admin-muted)]">{formatRelative(item.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--admin-foreground)]">{body}</p>
        {item.transcript && item.transcript !== item.text && (
          <div className="mt-2 rounded-md border border-[var(--admin-border)] bg-white/70 px-2 py-1.5 text-xs leading-5 text-[var(--admin-muted)]">
            <span className="font-semibold text-[var(--admin-foreground)]">Transcricao: </span>
            {item.transcript}
          </div>
        )}
        {item.mediaUrl && (
          <a
            href={item.mediaUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-white/70 px-2 py-1 text-xs font-semibold text-[var(--admin-cyan)] transition hover:border-[var(--admin-cyan)] hover:text-[var(--admin-foreground)]"
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
}: {
  lead?: WhatsAppCrmLeadCard;
  busyAction: string | null;
  manualReply: string;
  onManualReplyChange: (value: string) => void;
  onSendManualReply: (lead: WhatsAppCrmLeadCard) => void;
  onLeadAction: (action: LeadActionKey, lead: WhatsAppCrmLeadCard) => void;
  onOpenLeadFile: () => void;
}) {
  if (!lead) {
    return (
      <section className="grid min-h-[620px] place-items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-6 text-center text-sm text-[var(--admin-muted)] shadow-sm shadow-[rgba(81,60,36,0.06)]">
        Nenhum atendimento na fila atual.
      </section>
    );
  }

  const timeline = sortedTimeline(lead.timeline);
  const statusTone = conversationStatusTone(lead);
  const toggleAction: LeadActionKey = lead.humanInterventionActive ? "resume_ai" : "pause_ai";
  const toggleLabel = lead.humanInterventionActive ? "Retomar IA" : "Assumir";
  const toggleBusy = busyAction === `${lead.id}:${toggleAction}`;

  return (
    <section className="grid min-h-[640px] min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[22px] border border-[rgba(15,124,144,0.16)] bg-[var(--admin-card)] shadow-sm shadow-[rgba(81,60,36,0.08)] xl:h-[calc(100vh-188px)] xl:max-h-[820px]">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <LeadAvatar lead={lead} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold text-[var(--admin-foreground)]">{lead.name}</h2>
              <StatusBadge tone={statusTone}>{conversationStatusLabel(lead)}</StatusBadge>
              <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--admin-muted)]">
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
          <button
            type="button"
            disabled={lead.optOut}
            onClick={() => onLeadAction(toggleAction, lead)}
            title={lead.humanInterventionActive ? "Retomar atendimento automatico" : "Pausar a IA e assumir atendimento humano"}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold text-[#fffaf0] shadow-sm transition disabled:cursor-not-allowed disabled:opacity-55",
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
            className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[rgba(18,128,92,0.24)] bg-[rgba(18,128,92,0.08)] px-4 text-xs font-semibold text-[var(--admin-green)] transition hover:border-[var(--admin-green)] hover:bg-[rgba(18,128,92,0.12)]"
          >
            <ClipboardCheck size={14} />
            CRM do lead
          </button>
        </div>
      </div>

      <div
        className="min-h-0 overflow-auto px-3 py-4 sm:px-5"
        style={whatsappChatBackgroundStyle}
      >
        {timeline.length ? (
          timeline.map((item) => <ChatBubble key={item.id} item={item} />)
        ) : (
          <div className="grid min-h-[360px] place-items-center rounded-lg border border-dashed border-[var(--admin-border)] bg-white/70 px-4 text-center text-sm text-[var(--admin-muted)]">
            Sem mensagens salvas para este lead.
          </div>
        )}
      </div>

      <div className="border-t border-[var(--admin-border)] bg-[#f9fafb] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-foreground)]">
            <Send size={14} className="text-[var(--admin-cyan)]" />
            Resposta humana
          </span>
          <StatusBadge tone={lead.humanInterventionActive ? "yellow" : "muted"}>
            {lead.humanInterventionActive ? "humano ativo" : "opcional"}
          </StatusBadge>
        </div>
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_132px] lg:items-end">
          <textarea
            value={manualReply}
            onChange={(event) => onManualReplyChange(event.target.value)}
            placeholder="Digite uma resposta aqui no painel"
            rows={3}
            className="min-h-[66px] w-full resize-none rounded-lg border border-[var(--admin-border)] bg-white px-4 py-3 text-sm leading-6 text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)] focus:ring-3 focus:ring-[rgba(15,124,144,0.12)]"
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
      <div className="rounded-2xl border border-[var(--admin-border)] bg-white p-6">
        <div className="py-10 text-center text-sm text-[var(--admin-muted)]">Nenhum lead na fila atual.</div>
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
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <LeadAvatar lead={lead} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-[var(--admin-foreground)]">{lead.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--admin-muted)]">
              <span>{formatPhone(lead.phone)}</span>
              {lead.whatsappUrl && (
                <a
                  href={lead.whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] transition hover:text-[var(--admin-foreground)]"
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

      <div className={cn("mt-5 rounded-lg border px-4 py-3", toneBg[lead.humanInterventionActive ? "yellow" : "cyan"])}>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Resumo inteligente</p>
        <p className="mt-2 text-sm leading-6 text-[var(--admin-foreground)]">{lead.nextAction}</p>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--admin-foreground)]">Panorama de qualificacao</p>
          <span className="font-mono text-[10px] text-[var(--admin-muted)]">{filled}/6 campos</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {qualificationItems.map(([label, value]) => (
            <InfoCell key={label} label={label} value={value} />
          ))}
        </div>
      </div>

      <details className="group mt-4 rounded-lg border border-[var(--admin-border)] bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3">
          <span className="text-xs font-semibold text-[var(--admin-foreground)]">Ficha tecnica</span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)] group-open:hidden">Abrir</span>
          <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)] group-open:inline">Fechar</span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--admin-border)] p-3 sm:grid-cols-2">
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
        <details className="group mt-3 rounded-lg border border-[var(--admin-border)] bg-white">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3">
            <span className="inline-flex min-w-0 items-center gap-2 text-xs font-semibold text-[var(--admin-foreground)]">
              <Bot size={14} className="text-[var(--admin-cyan)]" />
              Motor de atendimento
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <StatusBadge tone={lead.runtimeDecision.riskFlags.length ? "yellow" : "cyan"}>
                {lead.runtimeDecision.stage ? crmStageLabels[lead.runtimeDecision.stage] : lead.runtimeDecision.primaryIntent}
              </StatusBadge>
              <ChevronDown size={14} className="text-[var(--admin-muted)] transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-[var(--admin-border)] p-3">
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
        </details>
      )}

      <div className="mt-3 rounded-lg border border-[var(--admin-border)] bg-white/[0.02] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[var(--admin-foreground)]">Etapa do funil</p>
          <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
        </div>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-muted)]">CRM WhatsApp</span>
            <select
              value={selectedCrmStage}
              onChange={(event) => onStageDraftChange({ crmStage: event.target.value as WhatsAppCrmStage })}
              className="h-9 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none focus:border-[var(--admin-cyan)]"
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
          <p className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-foreground)]">
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
              className="h-9 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
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
              className="h-9 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
            />
          </label>
        </div>
        <textarea
          value={contextDraft.internalNotes}
          onChange={(event) => onContextDraftChange({ internalNotes: event.target.value })}
          placeholder="Notas internas do atendimento"
          rows={3}
          className="mt-2 min-h-[84px] w-full resize-none rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm leading-6 text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
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
            <p className="mt-1 truncate text-sm text-[var(--admin-foreground)]">{lead.latestReviewVerdict || "monitorar"}</p>
          </div>
          <div className={cn("font-mono text-2xl font-bold", toneText[reviewTone(lead.latestReviewScore, lead.latestReviewVerdict)])}>
            {lead.latestReviewScore}
          </div>
        </div>
      )}

      <details className="group mt-4 rounded-lg border border-[var(--admin-border)] bg-white">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3">
          <span className="text-xs font-semibold text-[var(--admin-foreground)]">Acoes administrativas</span>
          <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)] group-open:hidden">Abrir</span>
          <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)] group-open:inline">Fechar</span>
        </summary>
        <div className="grid gap-2 border-t border-[var(--admin-border)] p-3 sm:grid-cols-2">
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

function LeadSidePanel({ lead }: { lead?: WhatsAppCrmLeadCard }) {
  if (!lead) {
    return (
      <aside className="rounded-[22px] border border-[rgba(15,124,144,0.14)] bg-white p-5 text-sm text-[var(--admin-muted)] shadow-sm shadow-[rgba(81,60,36,0.06)]">
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
    <aside className="grid min-w-0 gap-3 2xl:sticky 2xl:top-24 2xl:h-[calc(100vh-188px)] 2xl:max-h-[820px] 2xl:overflow-auto">
      <section className="overflow-hidden rounded-[22px] border border-[rgba(15,124,144,0.14)] bg-white shadow-sm shadow-[rgba(81,60,36,0.06)]">
        <div className="border-b border-[var(--admin-border)] bg-[#fbfdff] px-4 py-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
            arquivo do lead
          </p>
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-xl font-semibold text-[var(--admin-foreground)]">Perfil rapido</h3>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">{filled}/6 campos de qualificacao</p>
            </div>
            <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
          </div>
        </div>

        <div className="grid gap-4 p-4">
          <div className={cn("rounded-2xl border px-4 py-3", toneBg[leadPriorityTone(lead)])}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-[var(--admin-foreground)]">{leadPriorityLabel(lead)}</span>
              <LeadScore score={lead.score} />
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--admin-foreground)]">{lead.nextAction}</p>
          </div>

          <div className="grid gap-2">
            {qualificationItems.slice(0, 4).map(([label, value]) => (
              <InfoCell key={label} label={label} value={value} />
            ))}
          </div>

          <div className="rounded-2xl border border-[var(--admin-border)] bg-[#fbfdff] px-4 py-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
              ultima entrada
            </p>
            <p className="mt-2 line-clamp-4 text-sm leading-6 text-[var(--admin-foreground)]">
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
    <div className="fixed inset-0 z-50 bg-[rgba(15,23,42,0.22)] p-3 backdrop-blur-sm sm:p-6">
      <section className="mx-auto grid h-[calc(100vh-24px)] max-w-[1380px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[24px] border border-[rgba(15,124,144,0.18)] bg-white shadow-2xl shadow-[rgba(15,23,42,0.18)] sm:h-[calc(100vh-48px)]">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-[var(--admin-border)] bg-white px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <LeadAvatar lead={lead} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-xl font-semibold text-[var(--admin-foreground)]">Arquivo inteligente do lead</h2>
                <StatusBadge tone={crmStageTone[lead.crmStage]}>{crmStageLabels[lead.crmStage]}</StatusBadge>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--admin-muted)]">
                <span className="font-semibold text-[var(--admin-foreground)]">{lead.name}</span>
                <span>{formatPhone(lead.phone)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 place-items-center rounded-full border border-[var(--admin-border)] bg-white text-[var(--admin-muted)] transition hover:border-[var(--admin-cyan)] hover:text-[var(--admin-foreground)]"
            title="Fechar arquivo do lead"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 lg:grid-cols-[380px_minmax(0,1fr)]">
          <div className="min-h-0 overflow-auto border-r border-[var(--admin-border)] bg-[#f8fbff] p-4">
            <LeadDetail
              lead={lead}
              busyAction={busyAction}
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
            <div className="flex min-h-20 items-center justify-between gap-4 border-b border-[var(--admin-border)] px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <LeadAvatar lead={lead} />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[var(--admin-foreground)]">{lead.name}</p>
                  <p className="mt-1 text-sm text-[var(--admin-muted)]">{formatPhone(lead.phone)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusBadge tone={conversationStatusTone(lead)}>{conversationStatusLabel(lead)}</StatusBadge>
                <StatusBadge tone="cyan">{lead.messageCount} mensagens</StatusBadge>
              </div>
            </div>

            <div
              className="min-h-0 overflow-auto px-4 py-5 sm:px-6"
              style={whatsappChatBackgroundStyle}
            >
              {timeline.length ? (
                timeline.map((item) => <ChatBubble key={item.id} item={item} />)
              ) : (
                <div className="grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-[var(--admin-border)] bg-white/70 px-4 text-center text-sm text-[var(--admin-muted)]">
                  Sem historico salvo para este lead.
                </div>
              )}
            </div>

            <div className="border-t border-[rgba(18,128,92,0.18)] bg-[rgba(18,128,92,0.08)] px-5 py-3 text-sm text-[var(--admin-foreground)]">
              <span className="inline-flex items-center gap-2">
                <MessageCircle size={16} className="text-[var(--admin-green)]" />
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
  const data = crmData.data;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [selectedId, setSelectedId] = useState<string | null>(data.leads[0]?.id || null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [manualReply, setManualReply] = useState("");
  const [leadFileOpen, setLeadFileOpen] = useState(false);
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

  return (
    <div className="mx-auto grid min-h-screen max-w-[1760px] gap-4 px-4 py-4 lg:px-6">
      <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--admin-muted)]">Betel AI / Agentes WhatsApp / Atendimento</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">Atendimento WhatsApp</h1>
          <p className="mt-1 text-sm text-[var(--admin-muted)]">
            Acompanhe conversas ao vivo, assuma atendimentos e abra o arquivo completo do lead quando precisar.
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

      {crmData.reason && (
        <div className="rounded-[18px] border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-4 py-3 text-xs text-[var(--admin-yellow)]">
          {crmData.reason}
        </div>
      )}
      {feedback && (
        <div
          className={cn(
            "rounded-[18px] border px-4 py-3 text-xs",
            feedback.type === "ok"
              ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
              : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
          )}
        >
          {feedback.msg}
        </div>
      )}

      <section className="grid gap-3 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(560px,1fr)_360px] 2xl:items-start">
        <aside className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-[22px] border border-[rgba(15,124,144,0.14)] bg-[var(--admin-card)] shadow-sm shadow-[rgba(81,60,36,0.08)] xl:h-[calc(100vh-188px)] xl:max-h-[820px] xl:min-h-[640px]">
          <div className="border-b border-[var(--admin-border)] bg-[#fbfdff] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                  central whatsapp
                </p>
                <h2 className="mt-1 truncate text-xl font-semibold text-[var(--admin-foreground)]">Atendimento</h2>
              </div>
              <StatusBadge tone="cyan">{filteredLeads.length} na visao</StatusBadge>
            </div>

            <div className="relative mt-4 min-w-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar lead, telefone ou mensagem"
                className="h-11 w-full rounded-full border border-[var(--admin-border)] bg-white pl-9 pr-4 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)] focus:ring-3 focus:ring-[rgba(15,124,144,0.12)]"
              />
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold transition",
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
              <div className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
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
        />

        <LeadSidePanel lead={selectedLead} />
      </section>

      <LeadFileModal
        open={leadFileOpen}
        lead={selectedLead}
        busyAction={busyAction}
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
