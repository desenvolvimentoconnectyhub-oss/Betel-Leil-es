"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  ExternalLink,
  FileUp,
  ImageOff,
  ListChecks,
  LoaderCircle,
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
type LinkFormat = "source_buttons" | "source_links" | "betel_button";

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

const linkFormatCopy: Record<LinkFormat, { title: string; detail: string; icon: typeof Send }> = {
  source_buttons: {
    title: "3 botoes",
    detail: "Envia as 3 referencias como botoes.",
    icon: ExternalLink,
  },
  source_links: {
    title: "3 links",
    detail: "Inclui leilao e referencias no texto.",
    icon: ListChecks,
  },
  betel_button: {
    title: "Ficha Betel",
    detail: "Mantem somente o botao da ficha interna.",
    icon: Eye,
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

function sendProcessingTitle(mode: SendMode) {
  if (mode === "test") return "Enviando teste WhatsApp";
  if (mode === "channel") return "Publicando no canal";
  if (mode === "broadcast") return "Enviando para a lista";
  return "Enviando para o grupo";
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

type AutoSyncState = "idle" | "syncing" | "done" | "error";

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
  const router = useRouter();
  const { pending } = useFormStatus();
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
  const availableCount = destinationsForAgent.filter((destination) => destination.status === "active" || destination.status === "paused").length;
  const syncedCount = destinationsForAgent.length;
  const initialMode: SendMode = groups.length ? "group" : channels.length ? "channel" : "test";
  const [mode, setMode] = useState<SendMode>(initialMode);
  const [linkFormat, setLinkFormat] = useState<LinkFormat>("source_buttons");
  const [groupId, setGroupId] = useState(groups[0]?.id || "");
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [broadcastSourceId, setBroadcastSourceId] = useState("");
  const [testNumber, setTestNumber] = useState("");
  const [broadcastNumbers, setBroadcastNumbers] = useState("");
  const [contactImportMessage, setContactImportMessage] = useState("");
  const [contactImportOk, setContactImportOk] = useState(true);
  const [autoSyncState, setAutoSyncState] = useState<AutoSyncState>("idle");
  const [autoSyncMessage, setAutoSyncMessage] = useState("");
  const [modeManuallySelected, setModeManuallySelected] = useState(false);
  const [sendProcessingOpen, setSendProcessingOpen] = useState(false);
  const sendPendingSeenRef = useRef(false);
  const currentMode = modeManuallySelected ? mode : initialMode;
  const currentGroupId = groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id || "";
  const currentChannelId = channels.some((channel) => channel.id === channelId) ? channelId : channels[0]?.id || "";
  const currentBroadcastSourceId = groups.some((group) => group.id === broadcastSourceId) ? broadcastSourceId : "";

  useEffect(() => {
    if (!agentKey) return;

    const storageKey = `betel-wa-auto-sync:${opportunityCode}:${agentKey}`;
    const lastSync = Number(window.sessionStorage.getItem(storageKey) || "0");
    if (Date.now() - lastSync < 15000) return;

    let cancelled = false;
    window.sessionStorage.setItem(storageKey, String(Date.now()));
    const syncStateTimer = window.setTimeout(() => {
      if (cancelled) return;
      setAutoSyncState("syncing");
      setAutoSyncMessage("Atualizando grupos automaticamente...");
    }, 0);

    fetch("/api/admin/whatsapp/groups", {
      body: JSON.stringify({
        action: "sync",
        agentKey,
        force: true,
        noParticipants: false,
      }),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "POST",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          data?: { synced?: number; groups?: number };
          error?: string;
        };
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || "Nao foi possivel atualizar os grupos.");
        }
        if (cancelled) return;
        const groups = Number(payload.data?.groups || 0);
        const synced = Number(payload.data?.synced || 0);
        setAutoSyncState("done");
        setAutoSyncMessage(`${groups} grupo(s) encontrados; ${synced} destino(s) sincronizado(s).`);
        router.refresh();
      })
      .catch((error) => {
        if (cancelled) return;
        setAutoSyncState("error");
        setAutoSyncMessage(error instanceof Error ? error.message : "Nao foi possivel atualizar os grupos automaticamente.");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(syncStateTimer);
    };
  }, [agentKey, opportunityCode, router]);

  const selectedDestination =
    currentMode === "group"
      ? groups.find((destination) => destination.id === currentGroupId)
      : currentMode === "channel"
        ? channels.find((destination) => destination.id === currentChannelId)
        : currentMode === "broadcast"
          ? groups.find((destination) => destination.id === currentBroadcastSourceId)
          : null;
  const broadcastNumberCount = useMemo(() => extractPhoneNumbersFromText(broadcastNumbers).length, [broadcastNumbers]);
  const hasBroadcastTargets = Boolean(currentBroadcastSourceId || broadcastNumberCount);
  const modeReady =
    currentMode === "test"
      ? Boolean(testNumber.trim())
      : currentMode === "group"
        ? Boolean(currentGroupId)
        : currentMode === "channel"
          ? Boolean(currentChannelId)
          : hasBroadcastTargets;
  const submitDisabled = !canSubmit || !agents.length || !modeReady;
  const destinationName = currentMode === "test" ? testNumber.trim() || "numero de teste" : selectedDestination?.name || "destino selecionado";
  const sendButtonHint = `Destino: ${destinationName} | Fontes: ${linkFormatCopy[linkFormat].title}`;

  useEffect(() => {
    if (!sendProcessingOpen) {
      sendPendingSeenRef.current = false;
      return;
    }
    if (sendProcessingOpen && pending) {
      sendPendingSeenRef.current = true;
      return;
    }
    if (sendPendingSeenRef.current && !pending) {
      const closeTimer = window.setTimeout(() => {
        sendPendingSeenRef.current = false;
        setSendProcessingOpen(false);
      }, 0);
      return () => window.clearTimeout(closeTimer);
    }
  }, [pending, sendProcessingOpen]);

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
    <>
    {sendProcessingOpen ? (
      <div
        aria-live="assertive"
        aria-modal="true"
        className="fixed inset-0 z-[80] grid place-items-center bg-black/25 px-4 backdrop-blur-[2px]"
        role="alertdialog"
      >
        <div className="w-full max-w-md rounded-xl border border-[var(--admin-border)] bg-white p-5 text-left shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[rgba(200,90,31,0.1)] text-[var(--admin-cyan)]">
              <LoaderCircle size={22} className="animate-spin" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--admin-foreground)]">{sendProcessingTitle(currentMode)}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
                O criativo esta sendo montado e enviado pela ConnectyHub. Aguarde a confirmacao antes de mexer nesta revisao.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-3 text-xs leading-5">
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-[var(--admin-muted)]">Destino</span>
              <span className="max-w-[220px] truncate font-semibold text-[var(--admin-foreground)]">{destinationName}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-[var(--admin-muted)]">Formato</span>
              <span className="font-semibold text-[var(--admin-foreground)]">{linkFormatCopy[linkFormat].title}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium text-[var(--admin-muted)]">Status</span>
              <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--admin-cyan)]">
                <LoaderCircle size={13} className="animate-spin" />
                processando
              </span>
            </div>
          </div>
        </div>
      </div>
    ) : null}

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
          disabled={!agents.length || autoSyncState === "syncing"}
          formAction={syncOpportunityWhatsAppGroupsAction}
          name="submitStatus"
          type="submit"
          value="sync_whatsapp_groups"
          variant="outline"
        >
          <RefreshCcw size={14} className={autoSyncState === "syncing" ? "animate-spin" : ""} />
          {autoSyncState === "syncing" ? "Atualizando..." : "Atualizar grupos"}
        </Button>
      </div>

      <input name="opportunityCode" type="hidden" value={opportunityCode} />
      <input name="whatsappLinkFormat" type="hidden" value={linkFormat} />

      <div className="mt-3 grid gap-3">
        <label className="grid gap-1">
          <span className={labelClass}>Agente remetente</span>
          <select
            className={selectClass}
            name="whatsappAgentKey"
            value={agentKey}
            onChange={(event) => {
              setAgentKey(event.target.value);
              setModeManuallySelected(false);
            }}
          >
            {agents.length ? null : <option value="">Nenhum agente conectado</option>}
            {agents.map((agent) => (
              <option key={agent.instanceId || agent.agentKey} value={agent.agentKey}>
                {agent.label}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
          {autoSyncState === "syncing" ? (
            <span className="inline-flex items-start gap-2" aria-live="polite">
              <RefreshCcw size={14} className="mt-0.5 shrink-0 animate-spin text-[var(--admin-cyan)]" />
              {autoSyncMessage}
            </span>
          ) : syncedCount ? (
            <span>
              {syncedCount} destino(s) sincronizado(s), {availableCount} disponivel(is) para envio manual.
              {autoSyncState === "done" && autoSyncMessage ? ` Atualizacao automatica: ${autoSyncMessage}` : ""}
            </span>
          ) : (
            <span className="inline-flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--admin-yellow)]" />
              {autoSyncState === "error" && autoSyncMessage
                ? `${autoSyncMessage} Use o botao Atualizar grupos para tentar novamente.`
                : "Nenhum grupo ou canal apareceu para este agente. A pagina tenta atualizar automaticamente; se continuar 0, confira se a instancia acima e a mesma que esta nos grupos."}
            </span>
          )}
        </div>

        <div>
          <p className={labelClass}>Modo de envio</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {(["group", "channel", "broadcast", "test"] as SendMode[]).map((item) => {
              const Icon = modeCopy[item].icon;
              const disabled = item === "group" && !groups.length ? true : item === "channel" && !channels.length;
              const selected = currentMode === item;
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
                  onClick={() => {
                    setMode(item);
                    setModeManuallySelected(true);
                  }}
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

        <div>
          <p className={labelClass}>Links do criativo</p>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            {(["source_buttons", "source_links", "betel_button"] as LinkFormat[]).map((item) => {
              const Icon = linkFormatCopy[item].icon;
              const selected = linkFormat === item;
              return (
                <button
                  className={cn(
                    "min-h-16 rounded-lg border px-3 py-2 text-left transition",
                    selected
                      ? "border-[rgba(200,90,31,0.42)] bg-[rgba(200,90,31,0.08)]"
                      : "border-[var(--admin-border)] bg-white hover:bg-[var(--admin-card-2)]"
                  )}
                  key={item}
                  type="button"
                  onClick={() => setLinkFormat(item)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--admin-foreground)]">
                    <Icon size={15} className={selected ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]"} />
                    {linkFormatCopy[item].title}
                    {selected ? <CheckCircle2 size={14} className="ml-auto text-[var(--admin-green)]" /> : null}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--admin-muted)]">{linkFormatCopy[item].detail}</span>
                </button>
              );
            })}
          </div>
        </div>

        {currentMode === "test" ? (
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

        {currentMode === "group" ? (
          <label className="grid gap-1">
            <span className={labelClass}>Grupo de destino</span>
            <select className={selectClass} name="whatsappSpecificGroupId" value={currentGroupId} onChange={(event) => setGroupId(event.target.value)}>
              {groups.length ? null : <option value="">Nenhum grupo sincronizado</option>}
              {groups.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {currentMode === "channel" ? (
          <label className="grid gap-1">
            <span className={labelClass}>Canal WhatsApp</span>
            <select className={selectClass} name="whatsappChannelId" value={currentChannelId} onChange={(event) => setChannelId(event.target.value)}>
              {channels.length ? null : <option value="">Nenhum canal sincronizado</option>}
              {channels.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationLabel(destination)}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {currentMode === "broadcast" ? (
          <div className="grid gap-2">
            <label className="grid gap-1">
              <span className={labelClass}>Base sincronizada opcional</span>
              <select
                className={selectClass}
                name="whatsappBroadcastSourceGroupId"
                value={currentBroadcastSourceId}
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
                Destino: {currentMode === "test" ? testNumber || "numero de teste" : selectedDestination?.name || "selecione um destino"}
              </p>
              <p className="text-[var(--admin-muted)]">Fontes: {linkFormatCopy[linkFormat].title}</p>
            </div>
          </div>
        </div>

        <Button
          className="h-auto min-h-14 w-full justify-start gap-3 whitespace-normal rounded-lg border border-[rgba(200,90,31,0.34)] bg-[var(--admin-cyan)] px-3 py-3 text-left text-white shadow-sm shadow-[rgba(200,90,31,0.18)] hover:brightness-95"
          disabled={submitDisabled || pending}
          name="submitStatus"
          type="submit"
          value={submitValueForMode(currentMode)}
          onClick={() => {
            if (submitDisabled || pending) return;
            sendPendingSeenRef.current = false;
            setSendProcessingOpen(true);
          }}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15">
            {pending && sendProcessingOpen ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5">
              {pending && sendProcessingOpen ? "Enviando WhatsApp..." : submitLabelForMode(currentMode)}
            </span>
            <span className="block truncate text-xs font-normal leading-5 text-white/80">{sendButtonHint}</span>
          </span>
          <CheckCircle2 size={18} className="hidden text-white/80 sm:block" />
        </Button>
      </div>
    </section>
    </>
  );
}
