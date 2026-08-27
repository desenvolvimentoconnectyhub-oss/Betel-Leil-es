import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Link2,
  Mail,
  MessageCircle,
  MessageSquareText,
  MousePointerClick,
  Route,
  Search,
  Send,
  Settings2,
  Smartphone,
  TimerReset,
  Users,
  type LucideIcon,
} from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { getMessagingAdminData, type MessagingAdminData, type MessagingRecipientOption } from "@/lib/admin/repository";
import {
  getSystemWhatsAppSenderConfig,
  listSystemWhatsAppSenderOptions,
  type SystemWhatsAppSenderOption,
} from "@/lib/communication/system-whatsapp-sender";
import {
  getWhatsAppSdrAppointmentSettings,
  listSdrAppointmentRecipients,
} from "@/lib/whatsapp/sdr-appointments";
import type {
  WhatsAppSdrAppointmentMessageTemplates,
  WhatsAppSdrAppointmentRecipient,
  WhatsAppSdrAppointmentSettings,
} from "@/lib/whatsapp/sdr-appointment-types";
import { cn } from "@/lib/utils";
import { saveSystemWhatsappSenderAction } from "../whatsapp/actions";
import {
  queueDirectMessageAction,
  saveMessageRouteAction,
  saveSdrAppointmentFlowAction,
  saveMessageTemplateAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QueryParams = Record<string, string | string[] | undefined>;
type TabKey = "modelos" | "rotas" | "remetente" | "envio" | "destinatarios" | "historico";
type MessageTemplate = MessagingAdminData["templates"][number];
type MessageRoute = MessagingAdminData["routes"][number];
type BadgeTone = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

const tabOptions: Array<{ key: TabKey; label: string; detail: string; icon: LucideIcon }> = [
  { key: "modelos", label: "Modelos", detail: "Textos e botoes", icon: MessageSquareText },
  { key: "rotas", label: "Rotas automaticas", detail: "Eventos do sistema", icon: Route },
  { key: "remetente", label: "Remetente", detail: "Agente do sistema", icon: Smartphone },
  { key: "envio", label: "Envio manual", detail: "Mensagem supervisionada", icon: Send },
  { key: "destinatarios", label: "Destinatarios", detail: "Usuarios e setores", icon: Users },
  { key: "historico", label: "Historico", detail: "Outbox recente", icon: History },
];

const templateGroups = [
  { key: "acesso", label: "Acesso e senha" },
  { key: "pipeline", label: "Pipeline interno" },
  { key: "oportunidades", label: "Oportunidades" },
  { key: "manual", label: "Envio manual" },
  { key: "sistema", label: "Sistema" },
] as const;

const PRIMARY_WHATSAPP_AGENT_KEY = "multichannel-dispatch";
const PRIMARY_WHATSAPP_AGENT_LABEL = "Evelyn";
const PRIMARY_WHATSAPP_LEGACY_NAMES = ["willian", "william", "willian-betel", "william-betel"];

const sdrTemplateFields: Array<{
  key: keyof WhatsAppSdrAppointmentMessageTemplates;
  label: string;
  helper: string;
  rows: number;
}> = [
  {
    key: "leadConfirmation",
    label: "Confirmacao enviada ao lead",
    helper: "Sai antes da ligacao, com botoes Confirmar e Marcar por outro dia.",
    rows: 4,
  },
  {
    key: "leadConfirmedReply",
    label: "Resposta ao lead confirmado",
    helper: "Enviada quando o lead confirma o horario.",
    rows: 3,
  },
  {
    key: "leadReschedulePrompt",
    label: "Pedido de novo horario",
    helper: "Enviada quando o lead escolhe marcar por outro dia.",
    rows: 3,
  },
  {
    key: "leadGroupInviteAfterScheduled",
    label: "Convite ao grupo apos agenda",
    helper: "Texto enviado com o botao do grupo quando a ligacao foi marcada.",
    rows: 4,
  },
  {
    key: "leadGroupInviteAfterDisqualified",
    label: "Convite ao grupo para lead frio",
    helper: "Texto enviado com o botao do grupo quando a Evelyn encerra um lead desqualificado.",
    rows: 4,
  },
  {
    key: "adminScheduled",
    label: "Aviso ao admin no agendamento",
    helper: "Resumo enviado quando Evelyn reserva a ligacao.",
    rows: 6,
  },
  {
    key: "adminLeadConfirmed",
    label: "Aviso ao admin quando confirmou",
    helper: "Enviado quando o lead confirma a ligacao.",
    rows: 6,
  },
  {
    key: "adminUnconfirmedReminder",
    label: "Aviso ao admin sem confirmacao",
    helper: "Enviado antes da ligacao quando o lead nao respondeu.",
    rows: 6,
  },
  {
    key: "adminRescheduleRequested",
    label: "Aviso ao admin ao pedir remarcacao",
    helper: "Enviado quando o lead pede outro dia ou horario.",
    rows: 5,
  },
  {
    key: "adminRescheduled",
    label: "Aviso ao admin apos remarcar",
    helper: "Enviado quando Evelyn conclui o reagendamento.",
    rows: 6,
  },
];

function paramValue(params: QueryParams, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function normalizeTab(value: string): TabKey {
  return tabOptions.some((tab) => tab.key === value) ? (value as TabKey) : "modelos";
}

function messagesHref(input: { tab: TabKey; template?: string; route?: string; q?: string }) {
  const params = new URLSearchParams({ tab: input.tab });
  if (input.template) params.set("template", input.template);
  if (input.route) params.set("route", input.route);
  if (input.q) params.set("q", input.q);
  return `/admin/mensagens?${params.toString()}`;
}

function templateParam(template: MessageTemplate) {
  return template.id ? `id:${template.id}` : template.templateKey;
}

function routeParam(route: MessageRoute) {
  return route.routeKey;
}

function matchesTemplateParam(template: MessageTemplate, value: string) {
  if (!value) return false;
  if (value.startsWith("id:")) return template.id === value.slice(3);
  return template.templateKey === value;
}

function templateStatusTone(status: string): BadgeTone {
  if (status === "active") return "green";
  if (status === "draft") return "yellow";
  if (status === "archived") return "muted";
  return "cyan";
}

function outboxStatusTone(status: string): BadgeTone {
  const value = status.toLowerCase();
  if (value.includes("sent") || value.includes("delivered") || value.includes("success")) return "green";
  if (value.includes("fail") || value.includes("error")) return "red";
  if (value.includes("queue") || value.includes("retry") || value.includes("draft")) return "yellow";
  return "muted";
}

function channelLabel(value: string) {
  const channel = value.toLowerCase();
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "Email";
  if (channel === "push") return "Push";
  if (channel === "community") return "Comunidade";
  return value || "Canal";
}

function statusLabel(value: string) {
  if (value === "active") return "Ativo";
  if (value === "draft") return "Rascunho";
  if (value === "archived") return "Arquivado";
  return value || "Status";
}

function recipientTypeLabel(value: string) {
  if (value === "admin") return "Operador";
  if (value === "investor") return "Investidor";
  if (value === "lead") return "Lead";
  if (value === "manual") return "Manual";
  return value;
}

function senderDisplayName(input?: Pick<SystemWhatsAppSenderOption, "instanceName" | "agentKey"> | null) {
  if (!input) return "WhatsApp Global";
  const instanceName = input.instanceName?.trim() || "";
  const normalizedInstanceName = instanceName.toLowerCase();
  const agentKey = input.agentKey?.trim() || "";
  if (agentKey === PRIMARY_WHATSAPP_AGENT_KEY || PRIMARY_WHATSAPP_LEGACY_NAMES.includes(normalizedInstanceName)) {
    return PRIMARY_WHATSAPP_AGENT_LABEL;
  }
  return instanceName || agentKey || "WhatsApp Global";
}

function senderLabel(input: Pick<SystemWhatsAppSenderOption, "instanceName" | "agentKey" | "phone" | "connected" | "status">) {
  const name = senderDisplayName(input);
  const phone = input.phone ? ` - ${input.phone}` : "";
  const status = input.connected ? "conectado" : input.status || "pendente";
  return `${name}${phone} - ${status}`;
}

function senderTitle(input?: SystemWhatsAppSenderOption) {
  return senderDisplayName(input);
}

function formatDate(value?: string) {
  if (!value) return "Sem data";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(timestamp);
}

function templateCategory(template: MessageTemplate) {
  const haystack = `${template.templateKey} ${template.name} ${template.description} ${template.audienceKey}`.toLowerCase();
  if (haystack.includes("invite") || haystack.includes("recovery") || haystack.includes("password") || haystack.includes("senha")) {
    return "acesso";
  }
  if (haystack.includes("workflow") || haystack.includes("scraper") || haystack.includes("relatorio") || haystack.includes("lote")) {
    return "pipeline";
  }
  if (haystack.includes("opportunity") || haystack.includes("oportunidade") || haystack.includes("cliente") || haystack.includes("lead")) {
    return "oportunidades";
  }
  if (haystack.includes("message.direct") || haystack.includes("direta")) return "manual";
  return "sistema";
}

function templateMatchesSearch(template: MessageTemplate, search: string) {
  if (!search) return true;
  const value = search.toLowerCase();
  return [
    template.templateKey,
    template.name,
    template.description,
    template.channel,
    template.audienceKey,
    template.variables.join(" "),
  ]
    .join(" ")
    .toLowerCase()
    .includes(value);
}

function renderTemplateSnippet(value: string) {
  return value.trim() || "Sem conteudo configurado.";
}

function Message({ status, message }: { status?: string; message?: string }) {
  if (!message) return null;
  const isSuccess = status === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={cn(
        "mb-4 flex gap-2 rounded-lg border px-3 py-2 text-sm",
        isSuccess
          ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
          : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue = "",
  placeholder = "",
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        {label}
      </span>
      <input
        className="h-9 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.66)] px-3 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue = "",
  placeholder = "",
  rows = 4,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        {label}
      </span>
      <textarea
        className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.66)] px-3 py-2 text-sm leading-5 text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        rows={rows}
      />
    </label>
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
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        {label}
      </span>
      <select
        className="h-9 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.66)] px-3 text-sm text-[var(--admin-foreground)] outline-none focus:border-[var(--admin-cyan)]"
        defaultValue={defaultValue}
        name={name}
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

function SegmentChecks({
  segments,
  selected,
}: {
  segments: MessagingAdminData["segments"];
  selected?: string[];
}) {
  const selectedSet = new Set(selected || []);
  return (
    <div className="grid gap-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        Segmentos
      </p>
      <div className="grid gap-2 md:grid-cols-2">
        {segments.map((segment) => (
          <label
            key={segment.segmentKey}
            className="flex min-h-12 items-start gap-2 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.48)] px-3 py-2 text-xs"
          >
            <input
              className="mt-0.5 size-4 rounded border-[var(--admin-border)]"
              defaultChecked={selectedSet.has(segment.segmentKey)}
              name="recipientSegmentKeys"
              type="checkbox"
              value={segment.segmentKey}
            />
            <span>
              <span className="block font-semibold text-[var(--admin-foreground)]">{segment.label}</span>
              <span className="mt-0.5 block text-[var(--admin-muted)]">{segment.segmentKey}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TabNavigation({ activeTab, counts }: { activeTab: TabKey; counts: Record<TabKey, number> }) {
  return (
    <nav className="mb-4 overflow-x-auto rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-2">
      <div className="flex min-w-max gap-2">
        {tabOptions.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <Link
              key={tab.key}
              className={cn(
                "flex min-w-[170px] items-center gap-3 rounded-md border px-3 py-2 text-left transition",
                active
                  ? "border-[rgba(255,90,31,0.32)] bg-[rgba(255,90,31,0.09)] text-[var(--admin-foreground)]"
                  : "border-transparent text-[var(--admin-muted)] hover:border-[var(--admin-border)] hover:bg-[rgba(255,255,255,0.42)] hover:text-[var(--admin-foreground)]"
              )}
              href={messagesHref({ tab: tab.key })}
            >
              <Icon size={17} className={active ? "text-[var(--admin-cyan)]" : ""} />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {tab.label}
                  <span className="rounded-md border border-[var(--admin-border)] px-1.5 py-0.5 font-mono text-[10px]">
                    {counts[tab.key]}
                  </span>
                </span>
                <span className="mt-0.5 block text-[11px]">{tab.detail}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function SummaryNumber({ label, value, tone = "muted" }: { label: string; value: number; tone?: BadgeTone }) {
  const toneClass: Record<BadgeTone, string> = {
    cyan: "text-[var(--admin-cyan)]",
    green: "text-[var(--admin-green)]",
    yellow: "text-[var(--admin-yellow)]",
    red: "text-[var(--admin-red)]",
    purple: "text-[var(--admin-purple)]",
    muted: "text-[var(--admin-foreground)]",
  };
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.36)] px-3 py-2 text-right">
      <div className={cn("font-mono text-xl font-bold", toneClass[tone])}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</div>
    </div>
  );
}

function TemplateSearch({ search }: { search: string }) {
  return (
    <form action="/admin/mensagens" className="relative">
      <input type="hidden" name="tab" value="modelos" />
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]" />
      <input
        className="h-9 w-full rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.66)] pl-9 pr-3 text-sm text-[var(--admin-foreground)] outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
        defaultValue={search}
        name="q"
        placeholder="Buscar por nome, chave, canal ou variavel"
      />
    </form>
  );
}

function TemplateLibrary({
  templates,
  selected,
  search,
}: {
  templates: MessageTemplate[];
  selected?: MessageTemplate;
  search: string;
}) {
  const filtered = templates.filter((template) => templateMatchesSearch(template, search));

  return (
    <DashboardCard
      title="Biblioteca de modelos"
      eyebrow="um modelo aberto por vez"
      contentClassName="grid gap-3"
      action={<MessageSquareText size={18} className="text-[var(--admin-purple)]" />}
    >
      <TemplateSearch search={search} />
      <div className="max-h-[720px] overflow-auto pr-1">
        {templateGroups.map((group) => {
          const items = filtered.filter((template) => templateCategory(template) === group.key);
          if (!items.length) return null;
          return (
            <div key={group.key} className="mb-4 last:mb-0">
              <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                {group.label}
              </p>
              <div className="grid gap-2">
                {items.map((template) => {
                  const active = selected ? templateParam(selected) === templateParam(template) : false;
                  return (
                    <Link
                      key={`${templateParam(template)}-${template.channel}-${template.audienceKey}-${template.version}`}
                      className={cn(
                        "grid gap-2 rounded-md border px-3 py-3 transition",
                        active
                          ? "border-[rgba(255,90,31,0.38)] bg-[rgba(255,90,31,0.09)]"
                          : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.42)] hover:border-[rgba(255,90,31,0.25)]"
                      )}
                      href={messagesHref({ tab: "modelos", template: templateParam(template), q: search })}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-[var(--admin-foreground)]">
                            {template.name || template.templateKey}
                          </span>
                          <span className="mt-1 block truncate font-mono text-[10px] text-[var(--admin-muted)]">
                            {template.templateKey}
                          </span>
                        </span>
                        <StatusBadge tone={templateStatusTone(template.status)}>{statusLabel(template.status)}</StatusBadge>
                      </span>
                      <span className="flex flex-wrap gap-1.5">
                        <span className="rounded-md border border-[var(--admin-border)] px-2 py-1 text-[10px] text-[var(--admin-muted)]">
                          {channelLabel(template.channel)}
                        </span>
                        <span className="rounded-md border border-[var(--admin-border)] px-2 py-1 text-[10px] text-[var(--admin-muted)]">
                          {template.audienceKey}
                        </span>
                        <span className="rounded-md border border-[var(--admin-border)] px-2 py-1 text-[10px] text-[var(--admin-muted)]">
                          v{template.version}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="rounded-md border border-[var(--admin-border)] px-3 py-8 text-center text-sm text-[var(--admin-muted)]">
            Nenhum modelo encontrado.
          </div>
        )}
      </div>
    </DashboardCard>
  );
}

function TemplatePreview({ template }: { template: MessageTemplate }) {
  return (
    <aside className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.42)] p-3">
      <div>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
          Previa
        </p>
        <h3 className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">Como a mensagem esta estruturada</h3>
      </div>
      <div className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] p-3">
        <p className="text-xs font-semibold text-[var(--admin-muted)]">Assunto</p>
        <p className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">
          {renderTemplateSnippet(template.subjectTemplate)}
        </p>
      </div>
      <div className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] p-3">
        <p className="text-xs font-semibold text-[var(--admin-muted)]">Mensagem</p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--admin-foreground)]">
          {renderTemplateSnippet(template.bodyTemplate)}
        </p>
      </div>
      {(template.buttonLabelTemplate || template.buttonUrlTemplate) && (
        <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(34,197,94,0.06)] p-3">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Botao clicavel</p>
          <p className="mt-1 text-sm font-semibold text-[var(--admin-green)]">
            {template.buttonLabelTemplate || "Sem label"}
          </p>
          <p className="mt-1 break-all font-mono text-[10px] text-[var(--admin-muted)]">
            {template.buttonUrlTemplate || "Sem URL"}
          </p>
        </div>
      )}
      <div>
        <p className="mb-2 text-xs font-semibold text-[var(--admin-muted)]">Variaveis disponiveis</p>
        <div className="flex flex-wrap gap-1.5">
          {template.variables.map((variable) => (
            <span
              key={variable}
              className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] px-2 py-1 font-mono text-[10px] text-[var(--admin-muted)]"
            >
              {`{{${variable}}}`}
            </span>
          ))}
          {!template.variables.length && <span className="text-xs text-[var(--admin-muted)]">Sem variaveis.</span>}
        </div>
      </div>
    </aside>
  );
}

function TemplateEditor({ template }: { template?: MessageTemplate }) {
  if (!template) {
    return (
      <DashboardCard title="Editor do modelo" eyebrow="selecione um item">
        <div className="rounded-md border border-[var(--admin-border)] px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
          Escolha um modelo na lista para editar.
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title={template.name || "Editor do modelo"}
      eyebrow="texto / variaveis / botao"
      action={<StatusBadge tone={templateStatusTone(template.status)}>{statusLabel(template.status)}</StatusBadge>}
    >
      <form action={saveMessageTemplateAction} className="grid gap-4">
        <input type="hidden" name="id" value={template.id || ""} />
        <input type="hidden" name="returnTab" value="modelos" />
        <input type="hidden" name="returnTemplate" value={templateParam(template)} />

        <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Chave" name="templateKey" defaultValue={template.templateKey} />
              <Field label="Canal" name="channel" defaultValue={template.channel} />
              <Field label="Publico" name="audienceKey" defaultValue={template.audienceKey} />
              <Field label="Versao" name="version" defaultValue={template.version} type="number" />
            </div>
            <Field label="Nome" name="name" defaultValue={template.name} />
            <TextArea label="Descricao" name="description" defaultValue={template.description} rows={2} />
            <Field label="Assunto" name="subjectTemplate" defaultValue={template.subjectTemplate} />
            <TextArea label="Corpo da mensagem" name="bodyTemplate" defaultValue={template.bodyTemplate} rows={8} />
            <TextArea label="Regra interna" name="guardrailTemplate" defaultValue={template.guardrailTemplate} rows={2} />
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Texto do botao" name="buttonLabelTemplate" defaultValue={template.buttonLabelTemplate} />
              <Field label="URL do botao" name="buttonUrlTemplate" defaultValue={template.buttonUrlTemplate} />
            </div>
            <TextArea label="Variaveis" name="variables" defaultValue={template.variables.join(", ")} rows={2} />
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.35)] p-3">
              <SelectField
                label="Status"
                name="status"
                defaultValue={template.status}
                options={[
                  { value: "active", label: "Ativo" },
                  { value: "draft", label: "Rascunho" },
                  { value: "archived", label: "Arquivado" },
                ]}
              />
              <Button className="h-9 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white" type="submit">
                Salvar modelo
              </Button>
            </div>
          </div>
          <TemplatePreview template={template} />
        </div>
      </form>
    </DashboardCard>
  );
}

function TemplatesTab({
  templates,
  selectedTemplate,
  search,
}: {
  templates: MessageTemplate[];
  selectedTemplate?: MessageTemplate;
  search: string;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <TemplateLibrary templates={templates} selected={selectedTemplate} search={search} />
      <TemplateEditor template={selectedTemplate} />
    </section>
  );
}

function RouteLibrary({
  routes,
  selectedRoute,
}: {
  routes: MessageRoute[];
  selectedRoute?: MessageRoute;
}) {
  return (
    <DashboardCard title="Eventos automaticos" eyebrow="rotas cadastradas" contentClassName="p-0">
      <div className="divide-y divide-[var(--admin-border)]">
        {routes.map((route) => {
          const active = selectedRoute?.routeKey === route.routeKey;
          return (
            <Link
              key={route.routeKey}
              className={cn(
                "grid gap-2 px-4 py-3 transition hover:bg-[rgba(255,255,255,0.42)]",
                active && "bg-[rgba(255,90,31,0.09)]"
              )}
              href={messagesHref({ tab: "rotas", route: routeParam(route) })}
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[var(--admin-foreground)]">
                    {route.name || route.routeKey}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[10px] text-[var(--admin-muted)]">
                    {route.routeKey}
                  </span>
                </span>
                <StatusBadge tone={route.enabled ? "green" : "muted"}>{route.enabled ? "Ativa" : "Inativa"}</StatusBadge>
              </span>
              <span className="text-xs text-[var(--admin-muted)]">
                {channelLabel(route.channel)} / {route.templateKey}
              </span>
            </Link>
          );
        })}
      </div>
    </DashboardCard>
  );
}

function RouteEditor({
  route,
  segments,
  templateOptions,
}: {
  route?: MessageRoute;
  segments: MessagingAdminData["segments"];
  templateOptions: Array<{ value: string; label: string }>;
}) {
  if (!route) {
    return (
      <DashboardCard title="Editor da rota" eyebrow="sem rota">
        <div className="rounded-md border border-[var(--admin-border)] px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
          Nenhuma rota automatica cadastrada.
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title={route.name || "Editor da rota"}
      eyebrow="evento / template / destinatarios"
      action={<Route size={18} className="text-[var(--admin-cyan)]" />}
    >
      <form action={saveMessageRouteAction} className="grid gap-3">
        <input type="hidden" name="returnTab" value="rotas" />
        <input type="hidden" name="returnRoute" value={routeParam(route)} />
        <Field label="Chave da rota" name="routeKey" defaultValue={route.routeKey} />
        <Field label="Nome" name="name" defaultValue={route.name} />
        <TextArea label="Descricao" name="description" defaultValue={route.description} rows={2} />
        <div className="grid gap-3 md:grid-cols-2">
          <SelectField label="Template" name="templateKey" defaultValue={route.templateKey} options={templateOptions} />
          <SelectField
            label="Canal"
            name="channel"
            defaultValue={route.channel}
            options={[
              { value: "whatsapp", label: "WhatsApp" },
              { value: "email", label: "Email" },
              { value: "push", label: "Push" },
              { value: "community", label: "Comunidade" },
            ]}
          />
        </div>
        <SegmentChecks segments={segments} selected={route.recipientSegmentKeys} />
        <TextArea label="Usuarios especificos" name="recipientKeys" defaultValue={route.recipientKeys.join(", ")} rows={2} />
        <TextArea
          label="Destinatarios manuais"
          name="manualRecipients"
          defaultValue={route.manualRecipients
            .map((recipient) => `${recipient.name || recipient.label || ""}|${recipient.phone || recipient.email || ""}`)
            .join("\n")}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.35)] p-3">
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
            <input defaultChecked={route.enabled !== false} name="enabled" type="checkbox" value="true" />
            Rota ativa
          </label>
          <Button className="h-9 bg-[var(--admin-cyan)] text-xs font-bold text-black hover:bg-white" type="submit">
            <Route size={14} />
            Salvar rota
          </Button>
        </div>
      </form>
    </DashboardCard>
  );
}

function RoutesTab({
  routes,
  selectedRoute,
  segments,
  templateOptions,
}: {
  routes: MessageRoute[];
  selectedRoute?: MessageRoute;
  segments: MessagingAdminData["segments"];
  templateOptions: Array<{ value: string; label: string }>;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <RouteLibrary routes={routes} selectedRoute={selectedRoute} />
      <RouteEditor route={selectedRoute} segments={segments} templateOptions={templateOptions} />
    </section>
  );
}

function ManualSendTab({
  templateOptions,
  segments,
  recipients,
}: {
  templateOptions: Array<{ value: string; label: string }>;
  segments: MessagingAdminData["segments"];
  recipients: MessagingRecipientOption[];
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <DashboardCard title="Nova mensagem" eyebrow="envio supervisionado" action={<Send size={18} className="text-[var(--admin-green)]" />}>
        <form action={queueDirectMessageAction} className="grid gap-3">
          <input type="hidden" name="returnTab" value="envio" />
          <div className="grid gap-3 md:grid-cols-2">
            <SelectField label="Template" name="templateKey" defaultValue="message.direct" options={templateOptions} />
            <SelectField
              label="Canal"
              name="channel"
              defaultValue="whatsapp"
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "email", label: "Email" },
                { value: "push", label: "Push" },
                { value: "community", label: "Comunidade" },
              ]}
            />
          </div>
          <input type="hidden" name="audienceKey" value="general" />
          <SegmentChecks segments={segments} />
          <TextArea
            label="Usuarios especificos"
            name="recipientKeys"
            placeholder="admin:uuid, investor:uuid ou uma chave da lista de destinatarios"
            rows={2}
          />
          <TextArea
            label="Destinatarios manuais"
            name="manualRecipients"
            placeholder="Nome|5547999999999 ou Nome|email@dominio.com"
            rows={2}
          />
          <Field label="Assunto" name="subject" placeholder="Titulo da mensagem" />
          <TextArea label="Mensagem" name="body" placeholder="Texto que sera renderizado no template direto." rows={5} />
          <TextArea label="Regra interna" name="guardrail" placeholder="Observacao interna opcional." rows={2} />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Texto do botao" name="buttonLabel" placeholder="Abrir painel" />
            <Field label="URL do botao" name="buttonUrl" placeholder="https://..." />
          </div>
          <TextArea label="Variaveis JSON" name="variablesJson" placeholder='{"panel_url":"https://..."}' rows={3} />
          <Button className="h-9 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white" type="submit">
            <Send size={14} />
            Criar no outbox
          </Button>
        </form>
      </DashboardCard>

      <DashboardCard title="Atalhos de destinatario" eyebrow="copie a chave" contentClassName="p-0" action={<Users size={18} className="text-[var(--admin-green)]" />}>
        <div className="max-h-[620px] divide-y divide-[var(--admin-border)] overflow-auto">
          {recipients.slice(0, 40).map((recipient) => (
            <div key={recipient.key} className="grid gap-1 px-4 py-3">
              <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{recipient.label}</p>
              <p className="truncate font-mono text-[10px] text-[var(--admin-muted)]">{recipient.key}</p>
              <p className="truncate text-xs text-[var(--admin-muted)]">{recipient.phone || recipient.email || "sem contato"}</p>
            </div>
          ))}
        </div>
      </DashboardCard>
    </section>
  );
}

function RecipientList({ recipients }: { recipients: MessagingRecipientOption[] }) {
  return (
    <div className="max-h-[720px] overflow-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="sticky top-0 bg-[var(--admin-card)] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
          <tr className="border-b border-[var(--admin-border)]">
            <th className="px-4 py-3 font-semibold">Destinatario</th>
            <th className="px-4 py-3 font-semibold">Tipo</th>
            <th className="px-4 py-3 font-semibold">Contato</th>
            <th className="px-4 py-3 font-semibold">Canais</th>
            <th className="px-4 py-3 font-semibold">Chave</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--admin-border)]">
          {recipients.map((recipient) => (
            <tr key={recipient.key}>
              <td className="px-4 py-3">
                <p className="font-semibold text-[var(--admin-foreground)]">{recipient.label}</p>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">{recipient.source}</p>
              </td>
              <td className="px-4 py-3">
                <StatusBadge tone={recipient.type === "admin" ? "purple" : recipient.type === "investor" ? "green" : "cyan"}>
                  {recipientTypeLabel(recipient.type)}
                </StatusBadge>
              </td>
              <td className="px-4 py-3 text-xs leading-5 text-[var(--admin-muted)]">
                <p>{recipient.phone || "sem WhatsApp"}</p>
                <p>{recipient.email || "sem email"}</p>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {recipient.channelReady.map((channel) => (
                    <span
                      key={`${recipient.key}-${channel}`}
                      className="rounded-md border border-[var(--admin-border)] px-2 py-1 font-mono text-[10px] text-[var(--admin-muted)]"
                    >
                      {channelLabel(channel)}
                    </span>
                  ))}
                </div>
              </td>
              <td className="max-w-[220px] truncate px-4 py-3 font-mono text-[10px] text-[var(--admin-muted)]">
                {recipient.key}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecipientsTab({ recipients }: { recipients: MessagingRecipientOption[] }) {
  const admins = recipients.filter((recipient) => recipient.type === "admin").length;
  const investors = recipients.filter((recipient) => recipient.type === "investor").length;
  const leads = recipients.filter((recipient) => recipient.type === "lead").length;

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <SummaryNumber label="operadores" value={admins} tone="purple" />
        <SummaryNumber label="investidores" value={investors} tone="green" />
        <SummaryNumber label="leads" value={leads} tone="cyan" />
      </div>
      <DashboardCard title="Destinatarios configurados" eyebrow="usuarios / setores / contatos" contentClassName="p-0">
        <RecipientList recipients={recipients} />
      </DashboardCard>
    </section>
  );
}

function CheckboxField({
  name,
  label,
  helper,
  defaultChecked,
}: {
  name: string;
  label: string;
  helper: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-[var(--admin-border)] bg-white/70 p-3">
      <input
        className="mt-1 h-4 w-4 rounded border-[var(--admin-border)] text-[var(--admin-cyan)]"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
        value="1"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[var(--admin-foreground)]">{label}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--admin-muted)]">{helper}</span>
      </span>
    </label>
  );
}

function SdrAppointmentFlowCard({
  settings,
  recipients,
}: {
  settings: WhatsAppSdrAppointmentSettings;
  recipients: WhatsAppSdrAppointmentRecipient[];
}) {
  const recipientOptions = [
    { value: "", label: "Selecione um usuario com telefone" },
    ...recipients.map((recipient) => ({
      value: recipient.id,
      label: `${recipient.displayName} - ${recipient.phone}`,
    })),
  ];

  return (
    <DashboardCard
      title="Automacao da Agenda SDR"
      eyebrow="evelyn / confirmacao / lembretes"
      action={<CalendarClock size={18} className="text-[var(--admin-cyan)]" />}
    >
      <form action={saveSdrAppointmentFlowAction} className="grid gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-[var(--admin-border)] bg-white/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
              <Clock3 size={14} />
              Confirmacao do lead
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--admin-foreground)]">
              {settings.leadConfirmationMinutesBefore} min antes
            </p>
          </article>
          <article className="rounded-lg border border-[var(--admin-border)] bg-white/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
              <TimerReset size={14} />
              Sem resposta
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--admin-foreground)]">
              {settings.adminUnconfirmedNoticeMinutesBefore} min antes
            </p>
          </article>
          <article className="rounded-lg border border-[var(--admin-border)] bg-white/70 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
              <Users size={14} />
              Capacidade
            </div>
            <p className="mt-2 text-xl font-semibold text-[var(--admin-foreground)]">
              {settings.maxBookingsPerHour}/hora
            </p>
          </article>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.2fr)]">
          <section className="grid gap-3">
            <section className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] p-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                  agenda / avisos
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">Regras do fluxo</h3>
              </div>
              <SelectField
                label="Usuario da agenda SDR"
                name="notificationAdminUserId"
                defaultValue={settings.notificationAdminUserId ?? ""}
                options={recipientOptions}
              />
              <SelectField
                label="Usuario do handoff/alerta"
                name="handoffAlertAdminUserId"
                defaultValue={settings.handoffAlertAdminUserId ?? ""}
                options={recipientOptions}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Inicio" name="businessStartHour" defaultValue={settings.businessStartHour} type="number" />
                <Field label="Fim" name="businessEndHour" defaultValue={settings.businessEndHour} type="number" />
                <Field label="Leads por hora" name="maxBookingsPerHour" defaultValue={settings.maxBookingsPerHour} type="number" />
                <Field
                  label="Confirmar com lead"
                  name="leadConfirmationMinutesBefore"
                  defaultValue={settings.leadConfirmationMinutesBefore}
                  type="number"
                />
                <Field
                  label="Avisar admin sem resposta"
                  name="adminUnconfirmedNoticeMinutesBefore"
                  defaultValue={settings.adminUnconfirmedNoticeMinutesBefore}
                  type="number"
                />
              </div>
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(8,145,178,0.08)] p-3 text-xs leading-5 text-[var(--admin-muted)]">
                A Evelyn agenda entre {String(settings.businessStartHour).padStart(2, "0")}h e{" "}
                {String(settings.businessEndHour).padStart(2, "0")}h. O aviso sem confirmacao deve ficar mais perto da ligacao do que a pergunta ao lead.
              </div>
            </section>

            <section className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                    grupo betel / rastreio
                  </p>
                  <h3 className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">Convite ao fim do atendimento</h3>
                </div>
                <Link2 size={18} className="text-[var(--admin-green)]" />
              </div>
              <CheckboxField
                defaultChecked={settings.groupInvite.enabled}
                helper="Permite enviar o botao do grupo quando a Evelyn concluir o atendimento."
                label="Enviar convite automaticamente"
                name="groupInviteEnabled"
              />
              <div className="grid gap-3">
                <Field
                  label="Link do grupo"
                  name="groupInviteGroupUrl"
                  defaultValue={settings.groupInvite.groupUrl}
                  placeholder="https://chat.whatsapp.com/..."
                  type="url"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Texto do botao"
                    name="groupInviteButtonLabel"
                    defaultValue={settings.groupInvite.buttonLabel}
                    placeholder="Entrar no grupo da Betel"
                  />
                  <Field
                    label="Rodape do botao"
                    name="groupInviteFooterText"
                    defaultValue={settings.groupInvite.footerText}
                    placeholder="Grupo Betel"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckboxField
                  defaultChecked={settings.groupInvite.sendAfterScheduled}
                  helper="Dispara depois que a ligacao SDR foi marcada."
                  label="Depois de agendar"
                  name="groupInviteAfterScheduled"
                />
                <CheckboxField
                  defaultChecked={settings.groupInvite.sendAfterDisqualified}
                  helper="Dispara quando a Evelyn encerra um lead frio."
                  label="Depois de desqualificar"
                  name="groupInviteAfterDisqualified"
                />
              </div>
              <CheckboxField
                defaultChecked={settings.groupInvite.trackingEnabled}
                helper="Ao clicar, o sistema grava IP, local aproximado, navegador e dispositivo no arquivo do lead."
                label="Rastrear clique no botao"
                name="groupInviteTrackingEnabled"
              />
              <div className="flex flex-wrap gap-2">
                {["IP", "Local aproximado", "Dispositivo", "Navegador"].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-full border border-[var(--admin-border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--admin-muted)]"
                  >
                    <MousePointerClick size={12} />
                    {item}
                  </span>
                ))}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] p-4">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                usar nos textos
              </p>
              <h3 className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">Variaveis disponiveis</h3>
              <div className="flex flex-wrap gap-2 text-[11px] font-semibold text-[var(--admin-muted)]">
                {[
                  "{{lead_nome}}",
                  "{{lead_primeiro_nome}}",
                  "{{lead_telefone}}",
                  "{{lead_email}}",
                  "{{horario}}",
                  "{{resumo_sdr}}",
                  "{{grupo_betel_link}}",
                  "{{grupo_betel_botao}}",
                  "{{hora_inicio}}",
                  "{{hora_fim}}",
                  "{{limite_por_hora}}",
                ].map((variable) => (
                  <code key={variable} className="rounded-full border border-[var(--admin-border)] bg-white px-2 py-1">
                    {variable}
                  </code>
                ))}
              </div>
            </section>
          </section>

          <section className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.62)] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                  templates do agendamento
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[var(--admin-foreground)]">Mensagens automaticas</h3>
              </div>
              <MessageSquareText size={18} className="text-[var(--admin-green)]" />
            </div>
            <div className="grid gap-3">
              {sdrTemplateFields.map((field) => (
                <div key={field.key} className="rounded-lg border border-[var(--admin-border)] bg-white/70 p-3">
                  <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                    {field.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{field.helper}</p>
                  <TextArea
                    label="Texto"
                    name={`sdrTemplate_${field.key}`}
                    defaultValue={settings.messageTemplates[field.key]}
                    rows={field.rows}
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-white/70 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--admin-foreground)]">
            <Settings2 size={16} className="text-[var(--admin-cyan)]" />
            Alteracoes valem para os proximos disparos da automacao.
          </div>
          <Button className="h-9 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white" type="submit">
            <Settings2 size={14} />
            Salvar automacao SDR
          </Button>
        </div>
      </form>
    </DashboardCard>
  );
}

function SenderTab({
  systemSender,
  whatsappSenders,
  sdrSettings,
  sdrRecipients,
}: {
  systemSender: Awaited<ReturnType<typeof getSystemWhatsAppSenderConfig>>;
  whatsappSenders: SystemWhatsAppSenderOption[];
  sdrSettings: WhatsAppSdrAppointmentSettings;
  sdrRecipients: WhatsAppSdrAppointmentRecipient[];
}) {
  const selectedSender = systemSender.selected;
  const selectedSenderValue = selectedSender?.id || systemSender.instanceId || "";
  const connectedCount = whatsappSenders.filter((sender) => sender.connected).length;
  const senderOptions = [
    { value: "", label: "Padrao global atual" },
    ...whatsappSenders.map((sender) => ({
      value: sender.id,
      label: senderLabel(sender),
    })),
  ];

  if (selectedSenderValue && !senderOptions.some((option) => option.value === selectedSenderValue)) {
    senderOptions.push({
      value: selectedSenderValue,
      label: selectedSender
        ? `${senderTitle(selectedSender)} - indisponivel`
        : "Agente configurado - indisponivel",
    });
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Remetente atual</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={selectedSender?.connected ? "green" : selectedSender ? "yellow" : "muted"}>
              {selectedSender?.connected ? "conectado" : selectedSender ? selectedSender.status : "padrao"}
            </StatusBadge>
            <span className="truncate text-sm font-semibold text-[var(--admin-foreground)]">
              {senderTitle(selectedSender)}
            </span>
          </div>
          <p className="mt-3 truncate text-xs text-[var(--admin-muted)]">
            {selectedSender?.phone || selectedSender?.providerInstanceId || "Sem agente especifico selecionado"}
          </p>
        </article>
        <SummaryNumber label="agentes conectados" value={connectedCount} tone="green" />
        <article className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Uso</p>
          <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">Automacoes do sistema</p>
          <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
            Convites de usuarios, avisos do pipeline e mensagens automaticas usam este remetente.
          </p>
        </article>
      </div>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
        <DashboardCard
          title="Selecionar remetente"
          eyebrow="whatsapp / automaticos"
          action={<Smartphone size={18} className="text-[var(--admin-green)]" />}
        >
          <form action={saveSystemWhatsappSenderAction} className="grid gap-4">
            <input type="hidden" name="returnTab" value="remetente" />
            <SelectField
              label="Agente que envia"
              name="instanceId"
              defaultValue={selectedSenderValue}
              options={senderOptions}
            />
            <div className="rounded-lg border border-[var(--admin-border)] bg-white/70 px-3 py-3">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                Regra atual
              </p>
              <p className="mt-2 text-sm font-semibold text-[var(--admin-foreground)]">
                {selectedSender
                  ? `Enviar por ${senderTitle(selectedSender)}`
                  : "Usar o padrao global do ConnectyHub"}
              </p>
              <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                O sistema so aceita como remetente uma instancia WhatsApp conectada e vinculada ao ConnectyHub.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="h-9 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white" type="submit">
                <Smartphone size={14} />
                Salvar remetente
              </Button>
              <Button
                asChild
                className="h-9 border-[var(--admin-border)] bg-white text-xs font-bold text-[var(--admin-foreground)] hover:bg-[rgba(184,122,22,0.08)]"
                variant="outline"
              >
                <Link href="/admin/whatsapp">
                  <MessageCircle size={14} />
                  Cadastrar agente
                </Link>
              </Button>
            </div>
          </form>
        </DashboardCard>

        <DashboardCard
          title="Instancias WhatsApp"
          eyebrow="agentes cadastrados"
          contentClassName="p-0"
          action={<StatusBadge tone={connectedCount ? "green" : "yellow"}>{connectedCount} conectados</StatusBadge>}
        >
          <div className="divide-y divide-[var(--admin-border)]">
            {whatsappSenders.map((sender) => (
              <div key={sender.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{senderTitle(sender)}</p>
                    <StatusBadge tone={sender.connected ? "green" : "yellow"}>
                      {sender.connected ? "conectado" : sender.status || "pendente"}
                    </StatusBadge>
                    {selectedSender?.id === sender.id && <StatusBadge tone="cyan">remetente</StatusBadge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">
                    {sender.phone || "sem telefone"} / {sender.providerInstanceId || "sem instancia"}
                  </p>
                </div>
                <p className="font-mono text-[10px] text-[var(--admin-muted)]">{sender.agentKey}</p>
              </div>
            ))}
            {!whatsappSenders.length && (
              <div className="px-4 py-6 text-sm text-[var(--admin-muted)]">
                Nenhuma instancia WhatsApp com ConnectyHub foi encontrada. Cadastre um agente antes de escolher o remetente do sistema.
              </div>
            )}
          </div>
        </DashboardCard>
      </section>

      <SdrAppointmentFlowCard settings={sdrSettings} recipients={sdrRecipients} />
    </section>
  );
}

function OutboxTab({ items }: { items: MessagingAdminData["recentOutbox"] }) {
  return (
    <DashboardCard title="Historico recente" eyebrow="rascunhos / filas / entregas" contentClassName="p-0" action={<Mail size={18} className="text-[var(--admin-yellow)]" />}>
      <div className="overflow-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="sticky top-0 bg-[var(--admin-card)] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            <tr className="border-b border-[var(--admin-border)]">
              <th className="px-4 py-3 font-semibold">Mensagem</th>
              <th className="px-4 py-3 font-semibold">Destinatario</th>
              <th className="px-4 py-3 font-semibold">Canal</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Criada em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-border)]">
            {items.map((item) => (
              <tr key={item.messageCode}>
                <td className="max-w-[360px] px-4 py-3">
                  <p className="font-mono text-[10px] text-[var(--admin-muted)]">{item.messageCode}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-foreground)]">{item.preview}</p>
                </td>
                <td className="px-4 py-3 text-sm font-semibold text-[var(--admin-foreground)]">{item.recipientLabel}</td>
                <td className="px-4 py-3 text-xs text-[var(--admin-muted)]">{channelLabel(item.channel)}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={item.tone || outboxStatusTone(item.status)}>{item.status}</StatusBadge>
                </td>
                <td className="px-4 py-3 text-xs text-[var(--admin-muted)]">{formatDate(item.createdAt)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
                  Nenhuma mensagem criada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </DashboardCard>
  );
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<QueryParams>;
}) {
  const [data, systemSender, whatsappSenders, sdrSettings, sdrRecipients, params] = await Promise.all([
    getMessagingAdminData(),
    getSystemWhatsAppSenderConfig(),
    listSystemWhatsAppSenderOptions(),
    getWhatsAppSdrAppointmentSettings(),
    listSdrAppointmentRecipients(),
    searchParams || Promise.resolve({}),
  ]);
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");
  const activeTab = normalizeTab(paramValue(params, "tab"));
  const templateSearch = paramValue(params, "q");
  const selectedTemplateParam = paramValue(params, "template");
  const selectedRouteParam = paramValue(params, "route");

  const templateOptions = [
    ...new Map(
      data.templates
        .filter((template) => template.status !== "archived")
        .map((template) => [
          template.templateKey,
          {
            value: template.templateKey,
            label: `${template.name || template.templateKey} / ${channelLabel(template.channel)}`,
          },
        ])
    ).values(),
  ];
  const activeTemplates = data.templates.filter((template) => template.status === "active");
  const pendingOutbox = data.recentOutbox.filter((item) => ["draft", "queued", "retry"].includes(item.status)).length;
  const selectedTemplate =
    data.templates.find((template) => matchesTemplateParam(template, selectedTemplateParam)) ||
    activeTemplates[0] ||
    data.templates[0];
  const selectedRoute =
    data.routes.find((item) => item.routeKey === selectedRouteParam) ||
    data.routes.find((item) => item.routeKey === "scraper.report.admin") ||
    data.routes[0];
  const counts: Record<TabKey, number> = {
    modelos: data.templates.length,
    rotas: data.routes.length,
    remetente: whatsappSenders.length,
    envio: data.segments.length,
    destinatarios: data.recipients.length,
    historico: data.recentOutbox.length,
  };

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <Message status={status} message={message} />

      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="green">configuracao</StatusBadge>
              <StatusBadge tone="purple">templates</StatusBadge>
              <StatusBadge tone="cyan">notificacoes</StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">
              Mensagens e remetente
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Configure modelos, rotas automaticas, remetente WhatsApp, destinatarios e envios supervisionados em um unico ambiente.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <SummaryNumber label="ativos" value={activeTemplates.length} tone="green" />
            <SummaryNumber label="destinatarios" value={data.recipients.length} tone="cyan" />
            <SummaryNumber label="pendentes" value={pendingOutbox} tone="yellow" />
          </div>
        </div>
      </section>

      <TabNavigation activeTab={activeTab} counts={counts} />

      {activeTab === "modelos" && (
        <TemplatesTab templates={data.templates} selectedTemplate={selectedTemplate} search={templateSearch} />
      )}
      {activeTab === "rotas" && (
        <RoutesTab
          routes={data.routes}
          selectedRoute={selectedRoute}
          segments={data.segments}
          templateOptions={templateOptions}
        />
      )}
      {activeTab === "remetente" && (
        <SenderTab
          systemSender={systemSender}
          whatsappSenders={whatsappSenders}
          sdrSettings={sdrSettings}
          sdrRecipients={sdrRecipients}
        />
      )}
      {activeTab === "envio" && (
        <ManualSendTab templateOptions={templateOptions} segments={data.segments} recipients={data.recipients} />
      )}
      {activeTab === "destinatarios" && <RecipientsTab recipients={data.recipients} />}
      {activeTab === "historico" && <OutboxTab items={data.recentOutbox} />}
    </div>
  );
}
