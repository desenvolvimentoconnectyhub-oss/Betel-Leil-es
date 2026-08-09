import Link from "next/link";
import { AlertCircle, Bot, CheckCircle2, MessageCircle, Smartphone } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  getSystemWhatsAppSenderConfig,
  listSystemWhatsAppSenderOptions,
  type SystemWhatsAppSenderOption,
} from "@/lib/communication/system-whatsapp-sender";
import { cn } from "@/lib/utils";
import { saveSystemWhatsappSenderAction } from "../actions";

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
          ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
          : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
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
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        {label}
      </span>
      <select
        className="h-10 rounded-md border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none focus:border-[var(--admin-cyan)]"
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

function senderLabel(input: Pick<SystemWhatsAppSenderOption, "instanceName" | "agentKey" | "phone" | "connected" | "status">) {
  const name = input.instanceName || input.agentKey || "Agente WhatsApp";
  const phone = input.phone ? ` - ${input.phone}` : "";
  const status = input.connected ? "conectado" : input.status || "pendente";
  return `${name}${phone} - ${status}`;
}

function senderTitle(input?: SystemWhatsAppSenderOption) {
  return input?.instanceName || input?.agentKey || "WhatsApp Global";
}

export default async function SystemWhatsAppSenderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [systemSender, whatsappSenders, params] = await Promise.all([
    getSystemWhatsAppSenderConfig(),
    listSystemWhatsAppSenderOptions(),
    searchParams || Promise.resolve({}),
  ]);
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");
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
        ? `${selectedSender.instanceName || selectedSender.agentKey || "Agente configurado"} - indisponivel`
        : "Agente configurado - indisponivel",
    });
  }

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-4 lg:px-6">
      <Message status={status} message={message} />

      <header className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-[var(--admin-muted)]">Betel AI / Agentes WhatsApp</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">
              Remetente do sistema
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Escolha qual agente WhatsApp envia convites, avisos do pipeline e mensagens automaticas do painel.
            </p>
          </div>
          <Button asChild className="h-9 border-[var(--admin-border)] bg-white text-xs font-bold text-[var(--admin-foreground)] hover:bg-[rgba(184,122,22,0.08)]" variant="outline">
            <Link href="/admin/whatsapp">
              <Bot size={14} />
              Agentes WhatsApp
            </Link>
          </Button>
        </div>
      </header>

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Remetente atual</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={selectedSender?.connected ? "green" : selectedSender ? "yellow" : "muted"}>
              {selectedSender?.connected ? "conectado" : selectedSender ? selectedSender.status : "padrao"}
            </StatusBadge>
            <span className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{senderTitle(selectedSender)}</span>
          </div>
          <p className="mt-3 truncate text-xs text-[var(--admin-muted)]">
            {selectedSender?.phone || selectedSender?.providerInstanceId || "Sem agente especifico selecionado"}
          </p>
        </article>
        <article className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Agentes disponiveis</p>
          <p className="mt-3 font-mono text-2xl font-bold text-[var(--admin-green)]">{connectedCount}</p>
          <p className="mt-2 text-xs text-[var(--admin-muted)]">{whatsappSenders.length} instancia(s) cadastrada(s)</p>
        </article>
        <article className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
          <p className="text-xs font-semibold text-[var(--admin-muted)]">Uso</p>
          <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">Automacoes do sistema</p>
          <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
            Convites de usuarios e notificacoes de etapa usam este remetente.
          </p>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.18fr)]">
        <DashboardCard
          title="Selecionar remetente"
          eyebrow="whatsapp / automaticos"
          action={<Smartphone size={18} className="text-[var(--admin-green)]" />}
        >
          <form action={saveSystemWhatsappSenderAction} className="grid gap-4">
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
              <Button asChild className="h-9 border-[var(--admin-border)] bg-white text-xs font-bold text-[var(--admin-foreground)] hover:bg-[rgba(184,122,22,0.08)]" variant="outline">
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
    </div>
  );
}
