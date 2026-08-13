"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileUp,
  ImageOff,
  ListChecks,
  Radio,
  RefreshCcw,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { syncOpportunityWhatsAppGroupsAction } from "@/app/admin/oportunidades/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OpportunityWhatsAppPublicationOptions } from "@/lib/whatsapp/opportunity-publication";
import { cn } from "@/lib/utils";

type Destination = OpportunityWhatsAppPublicationOptions["destinations"][number];
type SendMode = "test" | "group" | "channel" | "broadcast";

type WhatsAppPreview = {
  title: string;
  location: string;
  imageUrl: string;
  marketValue: string;
  bid: string;
  discount: string;
};

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.16)]";
const labelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

const modeCopy: Record<SendMode, { title: string; detail: string; icon: typeof Send }> = {
  group: {
    title: "Grupo",
    detail: "Aprova e agenda no grupo escolhido.",
    icon: Users,
  },
  channel: {
    title: "Canal",
    detail: "Aprova e publica no canal selecionado.",
    icon: Radio,
  },
  broadcast: {
    title: "Lista",
    detail: "Aprova e envia para contatos da lista.",
    icon: ListChecks,
  },
  test: {
    title: "Teste",
    detail: "Envia so para um numero.",
    icon: Smartphone,
  },
};

function destinationStatusLabel(status: string) {
  if (status === "active") return "ativo";
  if (status === "paused") return "sincronizado";
  if (status === "external") return "externo";
  return status || "sincronizado";
}

function destinationLabel(destination: Destination) {
  const participants = destination.participantCount ? ` - ${destination.participantCount} contatos` : "";
  return `${destination.name}${participants} (${destinationStatusLabel(destination.status)})`;
}

function isSelectableDestination(destination: Destination) {
  return destination.status !== "archived";
}

function submitValueForMode(mode: SendMode) {
  if (mode === "test") return "approve_send_test_number";
  if (mode === "channel") return "approve_send_channel";
  if (mode === "broadcast") return "approve_send_broadcast";
  return "approve_send_specific_group";
}

function submitLabelForMode(mode: SendMode) {
  if (mode === "test") return "Enviar teste";
  if (mode === "channel") return "Aprovar e enviar canal";
  if (mode === "broadcast") return "Aprovar e enviar lista";
  return "Aprovar e enviar grupo";
}

function extractPhoneNumbersFromText(text: string) {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
  const seen = new Set<string>();

  return candidates
    .map((candidate) => {
      const digits = candidate.replace(/\D/g, "").replace(/^00/, "");
      return digits.length >= 10 && digits.length <= 15 ? digits : "";
    })
    .filter((digits) => {
      if (!digits || seen.has(digits)) return false;
      seen.add(digits);
      return true;
    });
}

function mergePhoneLists(currentValue: string, importedNumbers: string[]) {
  const currentNumbers = extractPhoneNumbersFromText(currentValue);
  const nextNumbers = new Set([...currentNumbers, ...importedNumbers]);
  return Array.from(nextNumbers).join("\n");
}

export function OpportunityWhatsAppSendPanel({
  canSubmit,
  opportunityCode,
  options,
  preview,
}: {
  canSubmit: boolean;
  opportunityCode: string;
  options?: OpportunityWhatsAppPublicationOptions;
  preview: WhatsAppPreview;
}) {
  const agents = options?.agents || [];
  const defaultAgentKey = options?.defaultAgentKey || agents[0]?.agentKey || "";
  const [agentKey, setAgentKey] = useState(defaultAgentKey);
  const destinations = useMemo(
    () => (options?.destinations || []).filter((destination) => isSelectableDestination(destination)),
    [options?.destinations]
  );
  const destinationsForAgent = useMemo(
    () => destinations.filter((destination) => !agentKey || destination.agentKey === agentKey),
    [agentKey, destinations]
  );
  const groups = destinationsForAgent.filter((destination) => destination.destinationType === "group");
  const channels = destinationsForAgent.filter((destination) => destination.destinationType === "channel");
  const activeCount = destinationsForAgent.filter((destination) => destination.status === "active").length;
  const syncedCount = destinationsForAgent.length;
  const initialMode: SendMode = groups.length ? "group" : channels.length ? "channel" : "test";
  const [mode, setMode] = useState<SendMode>(initialMode);
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [broadcastSourceId, setBroadcastSourceId] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [broadcastNumbers, setBroadcastNumbers] = useState("");
  const [contactImportMessage, setContactImportMessage] = useState("");
  const [contactImportOk, setContactImportOk] = useState(true);

  useEffect(() => {
    setGroupId((current) => (groups.some((group) => group.id === current) ? current : groups[0]?.id || ""));
    setBroadcastSourceId((current) => (groups.some((group) => group.id === current) ? current : ""));
  }, [groups]);

  useEffect(() => {
    setChannelId((current) => (channels.some((channel) => channel.id === current) ? current : channels[0]?.id || ""));
  }, [channels]);

  const selectedDestination =
    mode === "group"
      ? groups.find((destination) => destination.id === groupId)
      : mode === "channel"
        ? channels.find((destination) => destination.id === channelId)
        : mode === "broadcast"
          ? groups.find((destination) => destination.id === broadcastSourceId)
          : null;
  const broadcastNumberCount = useMemo(() => extractPhoneNumbersFromText(broadcastNumbers).length, [broadcastNumbers]);
  const hasBroadcastTargets = Boolean(broadcastSourceId || broadcastNumberCount);
  const modeReady =
    mode === "test"
      ? Boolean(testNumber.trim())
      : mode === "group"
        ? Boolean(groupId)
        : mode === "channel"
          ? Boolean(channelId)
          : hasBroadcastTargets;
  const submitDisabled = !canSubmit || !agents.length || !modeReady;

  async function handleContactFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedNumbers = extractPhoneNumbersFromText(text);

      if (!importedNumbers.length) {
        setContactImportOk(false);
        setContactImportMessage(`Nenhum telefone valido encontrado em ${file.name}.`);
        return;
      }

      setBroadcastNumbers((current) => mergePhoneLists(current, importedNumbers));
      setContactImportOk(true);
      setContactImportMessage(`${importedNumbers.length} telefone(s) importado(s) de ${file.name}.`);
    } catch {
      setContactImportOk(false);
      setContactImportMessage("Nao foi possivel ler o arquivo de contatos.");
    } finally {
      input.value = "";
    }
  }

  return (
    <section className="w-full rounded-lg border border-[var(--admin-border)] bg-white p-3 text-left">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-foreground)]">
            <Send size={14} className="text-[var(--admin-cyan)]" />
            Aprovar e enviar pelo WhatsApp
          </p>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
            Escolha o modo, confirme o destino e envie. O Inngest processa a campanha em seguida.
          </p>
        </div>
        <Button
          className="h-9 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] hover:bg-[var(--admin-card-2)]"
          disabled={!agents.length}
          formAction={syncOpportunityWhatsAppGroupsAction}
          name="submitStatus"
          type="submit"
          value="sync_whatsapp_groups"
          variant="outline"
        >
          <RefreshCcw size={14} />
          Sincronizar grupos
        </Button>
      </div>

      <input name="opportunityCode" type="hidden" value={opportunityCode} />

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1">
          <span className={labelClass}>Agente remetente</span>
          <select className={selectClass} name="whatsappAgentKey" value={agentKey} onChange={(event) => setAgentKey(event.target.value)}>
            {agents.length ? null : <option value="">Nenhum agente conectado</option>}
            {agents.map((agent) => (
              <option key={agent.instanceId || agent.agentKey} value={agent.agentKey}>
                {agent.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
          {syncedCount ? (
            <span>
              {syncedCount} destino(s) sincronizado(s), {activeCount} ativo(s), para este agente.
            </span>
          ) : (
            <span className="inline-flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--admin-yellow)]" />
              Nenhum grupo ou canal apareceu para este agente. Sincronize novamente; se continuar 0, confira se a instancia acima e a mesma que esta nos grupos.
            </span>
          )}
        </div>

        <div>
          <p className={labelClass}>Modo de envio</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {(["group", "channel", "broadcast", "test"] as SendMode[]).map((item) => {
              const Icon = modeCopy[item].icon;
              const disabled = item === "group" && !groups.length ? true : item === "channel" && !channels.length;
              const selected = mode === item;
              return (
                <button
                  className={cn(
                    "min-h-16 rounded-lg border px-3 py-2 text-left transition",
                    selected
                      ? "border-[rgba(200,90,31,0.42)] bg-[rgba(200,90,31,0.08)]"
                      : "border-[var(--admin-border)] bg-white hover:bg-[var(--admin-card-2)]",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                  disabled={disabled}
                  key={item}
                  type="button"
                  onClick={() => setMode(item)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--admin-foreground)]">
                    <Icon size={15} className={selected ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]"} />
                    {modeCopy[item].title}
                    {selected ? <CheckCircle2 size={14} className="ml-auto text-[var(--admin-green)]" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--admin-muted)]">{modeCopy[item].detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        {mode === "test" ? (
          <label className="grid gap-1">
            <span className={labelClass}>Numero para teste</span>
            <Input
              className="h-10 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] placeholder:text-[var(--admin-muted)]"
              inputMode="tel"
              name="whatsappTestNumber"
              placeholder="Ex: 5547999999999"
              value={testNumber}
              onChange={(event) => setTestNumber(event.target.value)}
            />
          </label>
        ) : null}

        {mode === "group" ? (
          <label className="grid gap-1">
            <span className={labelClass}>Grupo de destino</span>
            <select className={selectClass} name="whatsappSpecificGroupId" value={groupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.length ? null : <option value="">Nenhum grupo sincronizado</option>}
              {groups.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === "channel" ? (
          <label className="grid gap-1">
            <span className={labelClass}>Canal WhatsApp</span>
            <select className={selectClass} name="whatsappChannelId" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
              {channels.length ? null : <option value="">Nenhum canal sincronizado</option>}
              {channels.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === "broadcast" ? (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className={labelClass}>Base sincronizada opcional</span>
              <select
                className={selectClass}
                name="whatsappBroadcastSourceGroupId"
                value={broadcastSourceId}
                onChange={(event) => setBroadcastSourceId(event.target.value)}
              >
                <option value="">Somente arquivo ou numeros abaixo</option>
                {groups.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destinationLabel(destination)}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--admin-foreground)]">Arquivo de contatos</p>
                  <p className="mt-0.5 text-xs leading-5 text-[var(--admin-muted)]">
                    {broadcastNumberCount ? `${broadcastNumberCount} telefone(s) na lista.` : "CSV, TXT ou VCF."}
                  </p>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm font-medium text-[var(--admin-foreground)] transition hover:bg-[var(--admin-card)]">
                  <FileUp size={14} />
                  Importar lista
                  <input
                    accept=".csv,.txt,.vcf,text/csv,text/plain,text/vcard,text/x-vcard"
                    className="sr-only"
                    type="file"
                    onChange={handleContactFileChange}
                  />
                </label>
              </div>
              {contactImportMessage ? (
                <p className={cn("text-xs leading-5", contactImportOk ? "text-[var(--admin-green)]" : "text-[var(--admin-red)]")}>
                  {contactImportMessage}
                </p>
              ) : null}
            </div>

            <label className="grid gap-1">
              <span className={labelClass}>Lista importada ou numeros extras</span>
              <Textarea
                className="min-h-16 border-[var(--admin-border)] bg-white text-xs text-[var(--admin-foreground)] placeholder:text-[var(--admin-muted)]"
                name="whatsappBroadcastNumbers"
                placeholder="Um telefone por linha, ou separados por virgula"
                value={broadcastNumbers}
                onChange={(event) => setBroadcastNumbers(event.target.value)}
              />
            </label>
          </div>
        ) : null}

        <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--admin-foreground)]">
            <Eye size={14} className="text-[var(--admin-muted)]" />
            Previa do envio
          </div>
          <div className="grid gap-2 sm:grid-cols-[92px_minmax(0,1fr)]">
            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md border border-[var(--admin-border)] bg-white">
              {preview.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" className="h-full w-full object-cover" src={preview.imageUrl} />
              ) : (
                <ImageOff size={20} className="text-[var(--admin-muted)]" />
              )}
            </div>
            <div className="min-w-0 text-xs leading-5">
              <p className="line-clamp-2 font-semibold text-[var(--admin-foreground)]">{preview.title}</p>
              <p className="text-[var(--admin-muted)]">{preview.location || "Local nao informado"}</p>
              <p className="mt-1 text-[var(--admin-soft)]">
                {preview.marketValue ? `Mercado: ${preview.marketValue}` : ""} {preview.bid ? ` | Lance: ${preview.bid}` : ""}
              </p>
              <p className="text-[var(--admin-muted)]">
                {preview.discount ? `Desconto: ${preview.discount}` : "Texto completo e botao aparecem no WhatsApp."}
              </p>
              <p className="mt-1 font-medium text-[var(--admin-foreground)]">
                Destino: {mode === "test" ? testNumber || "numero de teste" : selectedDestination?.name || "selecione um destino"}
              </p>
            </div>
          </div>
        </div>

        <Button
          className="h-10 w-full bg-[var(--admin-green)] text-white hover:bg-[#0f6338]"
          disabled={submitDisabled}
          name="submitStatus"
          type="submit"
          value={submitValueForMode(mode)}
        >
          <Send size={14} />
          {submitLabelForMode(mode)}
        </Button>
      </div>
    </section>
  );
}
