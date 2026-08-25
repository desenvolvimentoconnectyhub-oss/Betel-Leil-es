"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Phone,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  TimerReset,
  UserRoundCheck,
  Users,
  XCircle,
} from "lucide-react";
import type {
  SdrAppointmentStatus,
  WhatsAppSdrAppointmentData,
  WhatsAppSdrAppointmentMessageTemplates,
  WhatsAppSdrAppointmentRecipient,
  WhatsAppSdrAppointmentSettings,
  WhatsAppSdrAppointmentSummary,
} from "@/lib/whatsapp/sdr-appointment-types";
import { cn } from "@/lib/utils";

type WhatsAppSdrAgendaPageProps = {
  initialData: WhatsAppSdrAppointmentData;
};

type SettingsForm = {
  notificationAdminUserId: string;
  businessStartHour: string;
  businessEndHour: string;
  maxBookingsPerHour: string;
  leadConfirmationMinutesBefore: string;
  adminUnconfirmedNoticeMinutesBefore: string;
  messageTemplates: WhatsAppSdrAppointmentMessageTemplates;
};

const ACTIVE_STATUSES: SdrAppointmentStatus[] = ["pending_confirmation", "scheduled", "notified"];

const TEMPLATE_FIELDS: Array<{
  key: keyof WhatsAppSdrAppointmentMessageTemplates;
  label: string;
  helper: string;
}> = [
  {
    key: "leadConfirmation",
    label: "Confirmacao enviada ao lead",
    helper: "Sai automaticamente antes da ligacao, com botoes Confirmar e Marcar por outro dia.",
  },
  {
    key: "leadConfirmedReply",
    label: "Resposta ao lead confirmado",
    helper: "Mensagem enviada quando o lead confirma o horario.",
  },
  {
    key: "leadReschedulePrompt",
    label: "Pedido de novo horario",
    helper: "Mensagem enviada quando o lead escolhe marcar por outro dia.",
  },
  {
    key: "adminScheduled",
    label: "Aviso ao admin no agendamento",
    helper: "Resumo enviado assim que Evelyn reserva a ligacao.",
  },
  {
    key: "adminLeadConfirmed",
    label: "Aviso ao admin quando confirmou",
    helper: "Mensagem enviada quando o lead confirma a ligacao.",
  },
  {
    key: "adminUnconfirmedReminder",
    label: "Aviso ao admin sem confirmacao",
    helper: "Mensagem enviada antes da ligacao quando o lead nao confirmou nem remarcou.",
  },
  {
    key: "adminRescheduleRequested",
    label: "Aviso ao admin ao pedir remarcacao",
    helper: "Mensagem enviada quando o lead pede outro dia ou horario.",
  },
  {
    key: "adminRescheduled",
    label: "Aviso ao admin apos remarcar",
    helper: "Mensagem enviada quando Evelyn conclui o reagendamento.",
  },
];

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

function dateKey(iso: string | Date) {
  return dateKeyFormatter.format(typeof iso === "string" ? new Date(iso) : iso);
}

function addDays(date: Date, days: number) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function formatHour(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function statusLabel(status: SdrAppointmentStatus) {
  const labels: Record<SdrAppointmentStatus, string> = {
    pending_confirmation: "A confirmar",
    scheduled: "Agendado",
    notified: "Avisado",
    completed: "Concluido",
    missed: "Perdido",
    cancelled: "Cancelado",
    rescheduled: "Remarcado",
  };
  return labels[status] ?? status;
}

function statusClassName(status: SdrAppointmentStatus) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "cancelled" || status === "missed") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "notified") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function leadConfirmationLabel(status: WhatsAppSdrAppointmentSummary["leadConfirmationStatus"]) {
  if (status === "confirmed") return "lead confirmou";
  if (status === "reschedule_requested") return "remarcando";
  return "confirmacao pendente";
}

function leadConfirmationClassName(status: WhatsAppSdrAppointmentSummary["leadConfirmationStatus"]) {
  if (status === "confirmed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "reschedule_requested") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function isActiveAppointment(appointment: WhatsAppSdrAppointmentSummary) {
  return ACTIVE_STATUSES.includes(appointment.status);
}

function settingsToForm(settings: WhatsAppSdrAppointmentSettings): SettingsForm {
  return {
    notificationAdminUserId: settings.notificationAdminUserId ?? "",
    businessStartHour: String(settings.businessStartHour),
    businessEndHour: String(settings.businessEndHour),
    maxBookingsPerHour: String(settings.maxBookingsPerHour),
    leadConfirmationMinutesBefore: String(settings.leadConfirmationMinutesBefore),
    adminUnconfirmedNoticeMinutesBefore: String(settings.adminUnconfirmedNoticeMinutesBefore),
    messageTemplates: settings.messageTemplates,
  };
}

function firstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] || "Lead";
}

function hourLabel(hour: string) {
  const value = Number(hour);
  if (!Number.isFinite(value)) return "--h";
  return `${String(value).padStart(2, "0")}h`;
}

function renderTemplatePreview(
  template: string,
  form: SettingsForm,
  appointment: WhatsAppSdrAppointmentSummary | null,
) {
  const summary = appointment?.sdrBriefing || appointment?.conversationSummary || "Resumo da conversa e pontos de abordagem do SDR.";
  const replacements: Record<string, string> = {
    lead_nome: appointment?.leadName || "Lead exemplo",
    lead_primeiro_nome: firstName(appointment?.leadName || "Lead exemplo"),
    lead_telefone: appointment?.leadPhone || "+55 00 00000-0000",
    lead_email: appointment?.leadEmail || "nao informado",
    lead_email_linha: appointment?.leadEmail ? `Email: ${appointment.leadEmail}\n` : "",
    horario: appointment?.scheduleLabel || "amanha as 15:00",
    resumo: summary,
    resumo_sdr: summary,
    hora_inicio: hourLabel(form.businessStartHour),
    hora_fim: hourLabel(form.businessEndHour),
    limite_por_hora: form.maxBookingsPerHour,
    minutos_confirmacao_lead: form.leadConfirmationMinutesBefore,
    minutos_aviso_admin: form.adminUnconfirmedNoticeMinutesBefore,
  };

  return template
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => replacements[key] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function AppointmentCard({
  appointment,
  onStatusChange,
  disabled,
}: {
  appointment: WhatsAppSdrAppointmentSummary;
  onStatusChange: (appointmentId: string, status: SdrAppointmentStatus) => void;
  disabled: boolean;
}) {
  return (
    <article className="rounded-[18px] border border-[var(--admin-border)] bg-white p-4 shadow-sm shadow-[rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{appointment.leadName}</h3>
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]", statusClassName(appointment.status))}>
              {statusLabel(appointment.status)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--admin-muted)]">
            <Phone size={12} />
            <span>{appointment.leadPhone || "telefone nao informado"}</span>
            <span>-</span>
            <span>{dateTimeFormatter.format(new Date(appointment.scheduledFor)).replace(".", "")}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em]", leadConfirmationClassName(appointment.leadConfirmationStatus))}>
              {leadConfirmationLabel(appointment.leadConfirmationStatus)}
            </span>
            {appointment.confirmationSentAt ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-cyan-700">
                pedido enviado
              </span>
            ) : null}
            {appointment.adminReminderSentAt ? (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700">
                admin avisado
              </span>
            ) : null}
          </div>
        </div>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-1 text-[10px] font-bold text-cyan-700">
          slot {appointment.slotPosition}
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-xs leading-5 text-[var(--admin-soft)]">
        {appointment.conversationSummary || appointment.sdrBriefing || "Sem resumo gerado ainda."}
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-[var(--admin-muted)]">
          Aviso: {appointment.assignedAdminName || "usuario nao definido"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled || appointment.status === "completed"}
            onClick={() => onStatusChange(appointment.id, "completed")}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <CheckCircle2 size={13} />
            Concluir
          </button>
          <button
            type="button"
            disabled={disabled || appointment.status === "cancelled"}
            onClick={() => onStatusChange(appointment.id, "cancelled")}
            className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <XCircle size={13} />
            Cancelar
          </button>
        </div>
      </div>
    </article>
  );
}

function RecipientOption({ recipient }: { recipient: WhatsAppSdrAppointmentRecipient }) {
  return (
    <option value={recipient.id}>
      {recipient.displayName} - {recipient.phone}
    </option>
  );
}

export function WhatsAppSdrAgendaPage({ initialData }: WhatsAppSdrAgendaPageProps) {
  const [data, setData] = useState(initialData);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(() => settingsToForm(initialData.settings));
  const [feedback, setFeedback] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  const days = useMemo(() => Array.from({ length: 8 }, (_, index) => addDays(new Date(), index)), []);
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, WhatsAppSdrAppointmentSummary[]>();
    data.appointments.forEach((appointment) => {
      const key = dateKey(appointment.scheduledFor);
      map.set(key, [...(map.get(key) ?? []), appointment]);
    });
    return map;
  }, [data.appointments]);

  const selectedAppointments = appointmentsByDate.get(selectedDate) ?? [];
  const upcomingAppointments = data.appointments
    .filter((appointment) => isActiveAppointment(appointment) && Date.parse(appointment.scheduledFor) >= nowMs - 5 * 60_000)
    .slice(0, 8);
  const previewAppointment = upcomingAppointments[0] ?? data.appointments[0] ?? null;

  function updateSettingField(key: keyof Omit<SettingsForm, "messageTemplates">, value: string) {
    setSettingsForm((current) => ({ ...current, [key]: value }));
  }

  function updateTemplateField(key: keyof WhatsAppSdrAppointmentMessageTemplates, value: string) {
    setSettingsForm((current) => ({
      ...current,
      messageTemplates: {
        ...current.messageTemplates,
        [key]: value,
      },
    }));
  }

  async function refreshData() {
    const response = await fetch("/api/admin/whatsapp/appointments", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { data?: WhatsAppSdrAppointmentData } | null;
    if (payload?.data) {
      setData(payload.data);
      setSettingsForm(settingsToForm(payload.data.settings));
      setNowMs(Date.now());
    }
  }

  function handleRefresh() {
    startTransition(async () => {
      await refreshData();
      setFeedback("Agenda atualizada.");
    });
  }

  function handleSaveSettings() {
    startTransition(async () => {
      setFeedback("");
      const response = await fetch("/api/admin/whatsapp/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save_settings",
          notificationAdminUserId: settingsForm.notificationAdminUserId || null,
          businessStartHour: settingsForm.businessStartHour,
          businessEndHour: settingsForm.businessEndHour,
          maxBookingsPerHour: settingsForm.maxBookingsPerHour,
          leadConfirmationMinutesBefore: settingsForm.leadConfirmationMinutesBefore,
          adminUnconfirmedNoticeMinutesBefore: settingsForm.adminUnconfirmedNoticeMinutesBefore,
          messageTemplates: settingsForm.messageTemplates,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setFeedback(payload?.error || "Nao foi possivel salvar o fluxo agora.");
        return;
      }

      await refreshData();
      setFeedback("Fluxo da agenda salvo.");
    });
  }

  function handleStatusChange(appointmentId: string, status: SdrAppointmentStatus) {
    startTransition(async () => {
      setFeedback("");
      const response = await fetch("/api/admin/whatsapp/appointments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update_status",
          appointmentId,
          status,
          cancellationReason: status === "cancelled" ? "Cancelado no painel" : undefined,
        }),
      });

      if (!response.ok) {
        setFeedback("Nao foi possivel atualizar esse agendamento.");
        return;
      }

      await refreshData();
      setFeedback(status === "completed" ? "Ligacao marcada como concluida." : "Agendamento atualizado.");
    });
  }

  return (
    <main className="min-h-[calc(100vh-4rem)] bg-[#f7fafc] px-5 py-5 text-[var(--admin-foreground)] lg:px-7">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--admin-muted)]">
            Betel AI / Agentes WhatsApp / Agenda
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-[var(--admin-foreground)]">Agenda SDR</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--admin-muted)]">
            Horarios confirmados pela Evelyn, com limite de dois leads por hora das 08h as 19h.
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--admin-foreground)] shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={cn(isPending && "animate-spin")} />
          Atualizar
        </button>
      </div>

      <section className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Hoje", value: data.metrics.today, icon: CalendarClock, tone: "cyan" },
          { label: "Proximas", value: data.metrics.upcoming, icon: Clock3, tone: "emerald" },
          { label: "Ativas", value: data.metrics.active, icon: Users, tone: "amber" },
          { label: "Horas cheias", value: data.metrics.fullHours, icon: ShieldCheck, tone: "rose" },
        ].map((metric) => (
          <div key={metric.label} className="rounded-[18px] border border-[var(--admin-border)] bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[var(--admin-foreground)]">{metric.value}</p>
              </div>
              <div
                className={cn(
                  "grid size-10 place-items-center rounded-full",
                  metric.tone === "cyan" && "bg-cyan-50 text-cyan-700",
                  metric.tone === "emerald" && "bg-emerald-50 text-emerald-700",
                  metric.tone === "amber" && "bg-amber-50 text-amber-700",
                  metric.tone === "rose" && "bg-rose-50 text-rose-700",
                )}
              >
                <metric.icon size={18} />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-[22px] border border-[var(--admin-border)] bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-full bg-cyan-50 text-cyan-700">
              <Settings2 size={17} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--admin-foreground)]">Fluxo automatico da agenda</h2>
              <p className="text-xs text-[var(--admin-muted)]">Configuracao que a Evelyn usa para confirmar e avisar o time.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {feedback ? <span className="text-xs font-semibold text-[var(--admin-muted)]">{feedback}</span> : null}
            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Save size={15} />
              Salvar fluxo
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,480px)_minmax(0,1fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                Usuario que recebe avisos
              </span>
              <select
                value={settingsForm.notificationAdminUserId}
                onChange={(event) => updateSettingField("notificationAdminUserId", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-medium text-[var(--admin-foreground)] outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              >
                <option value="">Selecione um usuario com telefone</option>
                {data.recipients.map((recipient) => (
                  <RecipientOption key={recipient.id} recipient={recipient} />
                ))}
              </select>
            </label>

            <label>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Inicio</span>
              <input
                type="number"
                min={0}
                max={23}
                value={settingsForm.businessStartHour}
                onChange={(event) => updateSettingField("businessStartHour", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-semibold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Fim</span>
              <input
                type="number"
                min={1}
                max={24}
                value={settingsForm.businessEndHour}
                onChange={(event) => updateSettingField("businessEndHour", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-semibold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Leads por hora</span>
              <input
                type="number"
                min={1}
                max={10}
                value={settingsForm.maxBookingsPerHour}
                onChange={(event) => updateSettingField("maxBookingsPerHour", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-semibold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label>
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Perguntar ao lead</span>
              <input
                type="number"
                min={1}
                max={1440}
                value={settingsForm.leadConfirmationMinutesBefore}
                onChange={(event) => updateSettingField("leadConfirmationMinutesBefore", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-semibold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--admin-muted)]">Avisar admin sem resposta</span>
              <input
                type="number"
                min={0}
                max={1440}
                value={settingsForm.adminUnconfirmedNoticeMinutesBefore}
                onChange={(event) => updateSettingField("adminUnconfirmedNoticeMinutesBefore", event.target.value)}
                className="mt-2 h-10 w-full rounded-full border border-[var(--admin-border)] bg-white px-4 text-sm font-semibold outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              />
            </label>
          </div>

          <div className="rounded-[18px] border border-cyan-100 bg-cyan-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-cyan-900">
              <TimerReset size={16} />
              Linha do tempo
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {[
                { label: "1. Agenda", value: "Admin recebe resumo" },
                { label: "2. Confirmacao", value: `${settingsForm.leadConfirmationMinutesBefore || "30"} min antes` },
                { label: "3. Lead responde", value: "Confirma ou remarca" },
                { label: "4. Sem acao", value: `${settingsForm.adminUnconfirmedNoticeMinutesBefore || "10"} min antes` },
              ].map((step) => (
                <div key={step.label} className="rounded-[14px] border border-cyan-100 bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700">{step.label}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--admin-foreground)]">{step.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-[14px] border border-[var(--admin-border)] bg-white p-3">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                <MessageSquareText size={14} />
                Preview da mensagem ao lead
              </div>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-[var(--admin-foreground)]">
                {renderTemplatePreview(settingsForm.messageTemplates.leadConfirmation, settingsForm, previewAppointment)}
              </p>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-[var(--admin-muted)]">
              Variaveis: {"{{lead_nome}}"}, {"{{lead_primeiro_nome}}"}, {"{{lead_telefone}}"}, {"{{lead_email}}"}, {"{{horario}}"}, {"{{resumo_sdr}}"}, {"{{hora_inicio}}"}, {"{{hora_fim}}"}.
            </p>
          </div>
        </div>

        <details className="mt-4 rounded-[18px] border border-[var(--admin-border)] bg-slate-50 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-[var(--admin-foreground)]">
            Mensagens automaticas do fluxo
          </summary>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {TEMPLATE_FIELDS.map((field) => (
              <label key={field.key} className="rounded-[16px] border border-[var(--admin-border)] bg-white p-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{field.label}</span>
                <span className="mt-1 block text-[11px] leading-4 text-[var(--admin-soft)]">{field.helper}</span>
                <textarea
                  value={settingsForm.messageTemplates[field.key]}
                  onChange={(event) => updateTemplateField(field.key, event.target.value)}
                  rows={field.key.includes("admin") ? 7 : 4}
                  className="mt-3 w-full resize-y rounded-[14px] border border-[var(--admin-border)] bg-white px-3 py-2 text-xs leading-5 text-[var(--admin-foreground)] outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
                />
              </label>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-4 grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_360px]">
        <aside className="rounded-[22px] border border-[var(--admin-border)] bg-white p-3 shadow-sm">
          <div className="px-2 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
            Dias
          </div>
          <div className="space-y-2">
            {days.map((day) => {
              const key = dateKey(day);
              const count = (appointmentsByDate.get(key) ?? []).filter(isActiveAppointment).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDate(key)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[16px] border px-3 py-2 text-left text-sm transition",
                    selectedDate === key
                      ? "border-cyan-300 bg-cyan-50 text-cyan-900"
                      : "border-transparent bg-white text-[var(--admin-foreground)] hover:border-[var(--admin-border)] hover:bg-slate-50",
                  )}
                >
                  <span className="font-semibold capitalize">{weekdayFormatter.format(day).replace(".", "")}</span>
                  <span className="rounded-full border border-[var(--admin-border)] bg-white px-2 py-0.5 text-[11px] font-bold">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="rounded-[22px] border border-[var(--admin-border)] bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--admin-foreground)]">Grade do dia</h2>
              <p className="text-xs text-[var(--admin-muted)]">
                {selectedAppointments.filter(isActiveAppointment).length} agendamento(s) ativo(s) no dia selecionado.
              </p>
            </div>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-cyan-700">
              Sao Paulo
            </span>
          </div>

          <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-y-auto p-4">
            <div className="space-y-3">
              {Array.from(
                { length: data.settings.businessEndHour - data.settings.businessStartHour },
                (_, index) => data.settings.businessStartHour + index,
              ).map((hour) => {
                const appointments = selectedAppointments
                  .filter((appointment) => {
                    const parts = timeFormatter.formatToParts(new Date(appointment.scheduledFor));
                    const localHour = Number(parts.find((part) => part.type === "hour")?.value ?? hour);
                    return localHour === hour;
                  })
                  .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor));
                const activeCount = appointments.filter(isActiveAppointment).length;
                const full = activeCount >= data.settings.maxBookingsPerHour;

                return (
                  <div
                    key={hour}
                    className={cn(
                      "grid gap-3 rounded-[18px] border p-3 lg:grid-cols-[110px_92px_minmax(0,1fr)]",
                      full ? "border-rose-200 bg-rose-50/45" : "border-[var(--admin-border)] bg-slate-50/70",
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">
                        {formatHour(hour)} - {formatHour(hour + 1)}
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--admin-muted)]">janela SDR</p>
                    </div>
                    <div>
                      <span
                        className={cn(
                          "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                          full ? "border-rose-200 bg-white text-rose-700" : "border-emerald-200 bg-white text-emerald-700",
                        )}
                      >
                        {activeCount}/{data.settings.maxBookingsPerHour}
                      </span>
                    </div>
                    <div className="grid gap-3">
                      {appointments.length ? (
                        appointments.map((appointment) => (
                          <AppointmentCard
                            key={appointment.id}
                            appointment={appointment}
                            onStatusChange={handleStatusChange}
                            disabled={isPending}
                          />
                        ))
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[var(--admin-border)] bg-white px-4 py-5 text-sm text-[var(--admin-muted)]">
                          Nenhuma ligacao marcada nesta hora.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-[22px] border border-[var(--admin-border)] bg-white shadow-sm">
          <div className="border-b border-[var(--admin-border)] px-5 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              <UserRoundCheck size={14} />
              Proximas ligacoes
            </div>
            <h2 className="mt-1 text-lg font-semibold text-[var(--admin-foreground)]">Fila SDR</h2>
          </div>

          <div className="max-h-[calc(100vh-330px)] min-h-[460px] overflow-y-auto p-4">
            {upcomingAppointments.length ? (
              <div className="space-y-3">
                {upcomingAppointments.map((appointment) => (
                  <article key={appointment.id} className="rounded-[18px] border border-[var(--admin-border)] bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">{appointment.leadName}</h3>
                        <p className="mt-1 text-xs text-[var(--admin-muted)]">{appointment.leadPhone}</p>
                      </div>
                      <span className={cn("rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]", statusClassName(appointment.status))}>
                        {statusLabel(appointment.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-cyan-800">
                      {dateTimeFormatter.format(new Date(appointment.scheduledFor)).replace(".", "")}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
                      {leadConfirmationLabel(appointment.leadConfirmationStatus)}
                    </p>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-[var(--admin-soft)]">{appointment.sdrBriefing}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="grid min-h-[260px] place-items-center rounded-[18px] border border-dashed border-[var(--admin-border)] text-center">
                <div>
                  <CalendarClock className="mx-auto text-[var(--admin-muted)]" size={28} />
                  <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">Sem ligacoes futuras</p>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">Quando a Evelyn marcar, aparece aqui.</p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
