import { AlertCircle, CheckCircle2, Mail, MessageSquareText, Route, Send, Users } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { getMessagingAdminData, type MessagingRecipientOption } from "@/lib/admin/repository";
import { cn } from "@/lib/utils";
import { queueDirectMessageAction, saveMessageRouteAction, saveMessageTemplateAction } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
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
          ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-green-100"
          : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-red-100"
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
        className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
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
        className="rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2 text-sm leading-5 text-white outline-none placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
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
        className="h-9 rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none focus:border-[var(--admin-cyan)]"
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
  segments: Array<{ segmentKey: string; label: string; description: string }>;
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
            className="flex min-h-12 items-start gap-2 rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 py-2 text-xs"
          >
            <input
              className="mt-0.5 size-4 rounded border-[var(--admin-border)] bg-[#050505]"
              defaultChecked={selectedSet.has(segment.segmentKey)}
              name="recipientSegmentKeys"
              type="checkbox"
              value={segment.segmentKey}
            />
            <span>
              <span className="block font-semibold text-white">{segment.label}</span>
              <span className="mt-0.5 block text-[var(--admin-muted)]">{segment.segmentKey}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function RecipientList({ recipients }: { recipients: MessagingRecipientOption[] }) {
  return (
    <div className="divide-y divide-[var(--admin-border)]">
      {recipients.slice(0, 18).map((recipient) => (
        <div key={recipient.key} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_1fr_1.2fr]">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{recipient.label}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">{recipient.key}</p>
          </div>
          <div className="min-w-0 text-xs leading-5 text-[var(--admin-muted)]">
            <p className="truncate">{recipient.phone || "sem WhatsApp"}</p>
            <p className="truncate">{recipient.email || "sem email"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={recipient.type === "admin" ? "purple" : recipient.type === "investor" ? "green" : "cyan"}>
              {recipient.type}
            </StatusBadge>
            {recipient.channelReady.slice(0, 2).map((channel) => (
              <span
                key={`${recipient.key}-${channel}`}
                className="rounded-md border border-[var(--admin-border)] px-2 py-1 font-mono text-[10px] text-[var(--admin-muted)]"
              >
                {channel}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function AdminMessagesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [data, params] = await Promise.all([getMessagingAdminData(), searchParams || Promise.resolve({})]);
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");
  const route = data.routes.find((item) => item.routeKey === "scraper.report.admin") || data.routes[0];
  const templateOptions = data.templates
    .filter((template) => template.status !== "archived")
    .map((template) => ({
      value: template.templateKey,
      label: `${template.templateKey} / ${template.channel}`,
    }));
  const activeTemplates = data.templates.filter((template) => template.status === "active");
  const pendingOutbox = data.recentOutbox.filter((item) => ["draft", "queued", "retry"].includes(item.status)).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <Message status={status} message={message} />

      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="green">templates</StatusBadge>
              <StatusBadge tone="purple">destinatarios</StatusBadge>
              <StatusBadge tone="cyan">outbox</StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Mensagens</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Configure o texto, o canal e exatamente quem recebe cada mensagem operacional ou comercial.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-white">{activeTemplates.length}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">ativos</div>
            </div>
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-[var(--admin-green)]">{data.recipients.length}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">destinatarios</div>
            </div>
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-[var(--admin-yellow)]">{pendingOutbox}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">outbox</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.78fr)_minmax(0,1.22fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Nova mensagem" eyebrow="template / destinatarios / rascunho" action={<Send size={18} className="text-[var(--admin-green)]" />}>
            <form action={queueDirectMessageAction} className="grid gap-3">
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
              <SegmentChecks segments={data.segments} />
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
              <TextArea label="Guardrail interno" name="guardrail" placeholder="Observacao interna opcional." rows={2} />
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Botao" name="buttonLabel" placeholder="Abrir painel" />
                <Field label="URL do botao" name="buttonUrl" placeholder="https://..." />
              </div>
              <TextArea label="Variaveis JSON" name="variablesJson" placeholder='{"panel_url":"https://..."}' rows={3} />
              <Button className="h-9 bg-[var(--admin-green)] text-xs font-bold text-black hover:bg-white" type="submit">
                <Send size={14} />
                Criar no outbox
              </Button>
            </form>
          </DashboardCard>

          <DashboardCard title="Rota do scraper" eyebrow="quem recebe relatorio" action={<Route size={18} className="text-[var(--admin-cyan)]" />}>
            <form action={saveMessageRouteAction} className="grid gap-3">
              <input type="hidden" name="routeKey" value={route?.routeKey || "scraper.report.admin"} />
              <Field label="Nome" name="name" defaultValue={route?.name || "Relatorio do scraper"} />
              <TextArea label="Descricao" name="description" defaultValue={route?.description || ""} rows={2} />
              <div className="grid gap-3 md:grid-cols-2">
                <SelectField label="Template" name="templateKey" defaultValue={route?.templateKey || "scraper.report.admin"} options={templateOptions} />
                <SelectField
                  label="Canal"
                  name="channel"
                  defaultValue={route?.channel || "whatsapp"}
                  options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "email", label: "Email" }]}
                />
              </div>
              <SegmentChecks segments={data.segments} selected={route?.recipientSegmentKeys || ["admin.operations"]} />
              <TextArea
                label="Usuarios especificos"
                name="recipientKeys"
                defaultValue={(route?.recipientKeys || []).join(", ")}
                rows={2}
              />
              <TextArea
                label="Destinatarios manuais"
                name="manualRecipients"
                defaultValue={(route?.manualRecipients || [])
                  .map((recipient) => `${recipient.name || recipient.label || ""}|${recipient.phone || recipient.email || ""}`)
                  .join("\n")}
                rows={2}
              />
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)]">
                <input defaultChecked={route?.enabled !== false} name="enabled" type="checkbox" value="true" />
                Rota ativa
              </label>
              <Button className="h-9 bg-[var(--admin-cyan)] text-xs font-bold text-black hover:bg-white" type="submit">
                <Route size={14} />
                Salvar rota
              </Button>
            </form>
          </DashboardCard>
        </div>

        <div className="grid gap-4">
          <DashboardCard title="Templates" eyebrow="texto / variaveis / botao" contentClassName="p-0" action={<MessageSquareText size={18} className="text-[var(--admin-purple)]" />}>
            <div className="divide-y divide-[var(--admin-border)]">
              {data.templates.slice(0, 8).map((template) => (
                <form key={`${template.templateKey}-${template.channel}-${template.audienceKey}`} action={saveMessageTemplateAction} className="grid gap-3 px-4 py-4">
                  <input type="hidden" name="id" value={template.id || ""} />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                        {template.templateKey}
                      </p>
                      <h2 className="mt-1 text-sm font-semibold text-white">{template.name}</h2>
                    </div>
                    <StatusBadge tone={template.status === "active" ? "green" : template.status === "draft" ? "yellow" : "muted"}>
                      {template.status}
                    </StatusBadge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Chave" name="templateKey" defaultValue={template.templateKey} />
                    <Field label="Canal" name="channel" defaultValue={template.channel} />
                    <Field label="Publico" name="audienceKey" defaultValue={template.audienceKey} />
                    <Field label="Versao" name="version" defaultValue={template.version} type="number" />
                  </div>
                  <Field label="Nome" name="name" defaultValue={template.name} />
                  <TextArea label="Descricao" name="description" defaultValue={template.description} rows={2} />
                  <Field label="Assunto" name="subjectTemplate" defaultValue={template.subjectTemplate} />
                  <TextArea label="Corpo" name="bodyTemplate" defaultValue={template.bodyTemplate} rows={5} />
                  <TextArea label="Guardrail" name="guardrailTemplate" defaultValue={template.guardrailTemplate} rows={2} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Label botao" name="buttonLabelTemplate" defaultValue={template.buttonLabelTemplate} />
                    <Field label="URL botao" name="buttonUrlTemplate" defaultValue={template.buttonUrlTemplate} />
                  </div>
                  <TextArea label="Variaveis" name="variables" defaultValue={template.variables.join(", ")} rows={2} />
                  <div className="flex flex-wrap items-end gap-3">
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
                    <Button className="h-9 bg-white text-xs font-bold text-black hover:bg-[var(--admin-cyan)]" type="submit">
                      Salvar template
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          </DashboardCard>

          <div className="grid gap-4 xl:grid-cols-2">
            <DashboardCard title="Destinatarios" eyebrow="chaves para selecao" contentClassName="p-0" action={<Users size={18} className="text-[var(--admin-green)]" />}>
              <RecipientList recipients={data.recipients} />
            </DashboardCard>

            <DashboardCard title="Outbox recente" eyebrow="rascunhos / entregas" contentClassName="p-0" action={<Mail size={18} className="text-[var(--admin-yellow)]" />}>
              <div className="divide-y divide-[var(--admin-border)]">
                {data.recentOutbox.slice(0, 10).map((item) => (
                  <div key={item.messageCode} className="grid gap-2 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-[10px] text-[var(--admin-muted)]">{item.messageCode}</p>
                        <p className="mt-1 text-sm font-semibold text-white">{item.recipientLabel}</p>
                      </div>
                      <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">{item.preview}</p>
                    <p className="font-mono text-[10px] text-[var(--admin-muted)]">
                      {item.channel} / {item.audience}
                    </p>
                  </div>
                ))}
                {!data.recentOutbox.length && (
                  <div className="px-4 py-5 text-sm text-[var(--admin-muted)]">Nenhuma mensagem criada ainda.</div>
                )}
              </div>
            </DashboardCard>
          </div>
        </div>
      </section>
    </div>
  );
}
