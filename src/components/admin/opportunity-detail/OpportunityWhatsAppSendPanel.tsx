"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileUp,
  ListChecks,
  LoaderCircle,
  Radio,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { OpportunityMessagePhone, type OpportunityMessagePreview } from "./OpportunityMessagePhone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  OpportunityWhatsAppPublicationOptions,
  OpportunityWhatsAppReferenceStatus,
} from "@/lib/whatsapp/opportunity-publication";
import { cn } from "@/lib/utils";
import { useSendPanelOpen, useSendBusy } from "./OpportunityWorkspace";

type Destination = OpportunityWhatsAppPublicationOptions["destinations"][number];
type SendMode = "test" | "group" | "channel" | "broadcast";
type LinkFormat = "source_buttons" | "source_links";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.16)]";
const labelClass = "text-xs font-semibold text-[var(--admin-muted)]";

const modeCopy: Record<SendMode, { title: string; detail: string; icon: typeof Send }> = {
  group: {
    title: "Grupo",
    detail: "Pessoas de um grupo.",
    icon: Users,
  },
  channel: {
    title: "Canal",
    detail: "Seguidores de um canal.",
    icon: Radio,
  },
  broadcast: {
    title: "Lista",
    detail: "Contatos de uma lista.",
    icon: ListChecks,
  },
  test: {
    title: "Teste",
    detail: "Somente um número para conferir.",
    icon: Smartphone,
  },
};

const linkFormatCopy: Record<LinkFormat, { title: string; detail: string; icon: typeof Send }> = {
  source_buttons: {
    title: "Botões",
    detail: "Cada anúncio aparece em um botão.",
    icon: ExternalLink,
  },
  source_links: {
    title: "Links no texto",
    detail: "O link do leilão e os anúncios ficam no texto.",
    icon: ListChecks,
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
  if (mode === "test") return "Confirmar envio de teste";
  if (mode === "channel") return "Confirmar aprovação e envio";
  if (mode === "broadcast") return "Confirmar aprovação e envio";
  return "Confirmar aprovação e envio";
}

function sendProcessingTitle(mode: SendMode, validatingReferences = false) {
  if (validatingReferences) return "Validando referencias antes do envio";
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

type SenderConnectionModalState = {
  title: string;
  detail: string;
  status?: string;
};

type SenderStatusResponse = {
  success?: boolean;
  data?: {
    connected?: boolean;
    state?: string;
    lastDisconnectReason?: string;
  };
  error?: string;
};

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isWhatsAppConnectionProblem(message?: string) {
  const text = normalizeForMatch(message || "");
  if (!text) return false;
  return (
    /whatsapp|connectyhub|instancia|instance|sessao|session|remetente/.test(text) &&
    /desconect|disconnect|not reconnectable|not_connected|missing_connectyhub_instance|sem instancia|nao esta conectada|nao conectado|nenhum agente|offline/.test(text)
  );
}

function senderConnectionModalFromMessage(message?: string): SenderConnectionModalState {
  return {
    title: "WhatsApp desconectado",
    detail:
      message ||
      "O número escolhido está desconectado. Reconecte o WhatsApp ou escolha outro número. Reconecte o numero ou escolha outro remetente conectado.",
  };
}

export function OpportunityWhatsAppSendPanel({
  canSubmit,
  options,
  preview,
  referenceStatus,
  submitBlockReason,
  actionStatus,
  actionMessage,
}: {
  canSubmit: boolean;
  opportunityCode: string;
  options?: OpportunityWhatsAppPublicationOptions;
  preview: OpportunityMessagePreview;
  referenceStatus?: OpportunityWhatsAppReferenceStatus;
  submitBlockReason?: string;
  actionStatus?: string;
  actionMessage?: string;
}) {
  const router = useRouter();
  const panelOpen = useSendPanelOpen();
  const setSendBusy = useSendBusy();
  const sendInFlight = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const { pending } = useFormStatus();
  const agents = options?.agents || [];
  const defaultAgentKey = options?.defaultAgentKey || agents[0]?.agentKey || "";
  const [agentKey, setAgentKey] = useState(defaultAgentKey);
  const [freshDestinations, setFreshDestinations] = useState<{ agentKey: string; items: Destination[] } | null>(null);
  const destinations = useMemo(
    () => (freshDestinations?.agentKey === agentKey ? freshDestinations.items : options?.destinations || []).filter((destination) => isSelectableDestination(destination)),
    [options?.destinations, freshDestinations, agentKey]
  );
  const destinationsForAgent = useMemo(
    () => destinations.filter((destination) => !agentKey || destination.agentKey === agentKey),
    [agentKey, destinations]
  );
  const groups = destinationsForAgent.filter((destination) => destination.destinationType === "group");
  const channels = destinationsForAgent.filter((destination) => destination.destinationType === "channel");
  const initialMode: SendMode = "group";
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
  const [senderCheckPending, setSenderCheckPending] = useState(false);
  const [senderConnectionModal, setSenderConnectionModal] = useState<SenderConnectionModalState | null>(null);
  const sendPendingSeenRef = useRef(false);
  const currentMode = modeManuallySelected ? mode : initialMode;
  useEffect(() => {
    setSendBusy(senderCheckPending || sendProcessingOpen || pending);
    return () => setSendBusy(false);
  }, [senderCheckPending, sendProcessingOpen, pending, setSendBusy]);

  const selectedAgent = agents.find((agent) => agent.agentKey === agentKey);
  const currentGroupId = groups.some((group) => group.id === groupId) ? groupId : groups[0]?.id || "";
  const currentChannelId = channels.some((channel) => channel.id === channelId) ? channelId : channels[0]?.id || "";
  const currentBroadcastSourceId = groups.some((group) => group.id === broadcastSourceId) ? broadcastSourceId : "";

  useEffect(() => {
    if (!agentKey || !panelOpen) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    const load = async (attempt = 0) => {
      if (controller.signal.aborted) return;
      setAutoSyncState("syncing");
      setAutoSyncMessage("Atualizando grupos…");
      try {
        const response = await fetch("/api/admin/whatsapp/groups", {
          method: "POST", cache: "no-store", signal: controller.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "sync", agentKey, force: true, noParticipants: true }),
        });
        const payload = await response.json() as { success?: boolean; error?: string; data?: { ok?: boolean; data?: { ok?: boolean; error?: string; destinations?: Destination[] } } };
        const result = payload.data?.data;
        if (!response.ok || !payload.success || !payload.data?.ok || !result?.ok || !Array.isArray(result.destinations)) {
          throw new Error(payload.error || result?.error || "Não foi possível atualizar os grupos.");
        }
        if (controller.signal.aborted) return;
        setFreshDestinations({ agentKey, items: result.destinations.filter(item => item.agentKey === agentKey) });
        setAutoSyncState("done");
        setAutoSyncMessage("Grupos atualizados automaticamente.");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (attempt === 0) { retryTimer = window.setTimeout(() => void load(1), 750); return; }
        setAutoSyncState("error");
        setAutoSyncMessage(error instanceof Error ? error.message : "Não foi possível atualizar os grupos.");
      }
    };
    // Coalesce mount effects; opening and sender changes each start a fresh request.
    const timer = window.setTimeout(() => void load(), 0);
    return () => { controller.abort(); window.clearTimeout(timer); window.clearTimeout(retryTimer); };
  }, [agentKey, panelOpen]);

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
  const activeReferenceStatus = referenceStatus || {
    requiredCount: 3,
    validCount: 0,
    ready: false,
    reason: "A analise ainda nao possui referencias validas de mercado para o criativo.",
  };
  const linkFormatNeedsReferences = linkFormat === "source_buttons" || linkFormat === "source_links";
  const referencesBlocked = linkFormatNeedsReferences && !activeReferenceStatus.ready;
  const hardBlockedReason =
    !agents.length
      ? "Nenhum número de WhatsApp está conectado."
      : !selectedAgent
        ? "Escolha um número de WhatsApp conectado."
        : !selectedAgent.instanceId
          ? "O número escolhido ainda não está pronto para enviar."
          : !modeReady
            ? "Selecione um destino valido para enviar."
            : !canSubmit
              ? submitBlockReason || "Complete a analise antes de aprovar ou enviar pelo WhatsApp."
              : "";
  const blockedReason = hardBlockedReason || ((currentMode === "group" || currentMode === "channel" || Boolean(currentBroadcastSourceId)) && autoSyncState !== "done" ? autoSyncState === "error" ? "Não foi possível confirmar a lista de destinos. Feche e abra para tentar novamente." : "Aguarde a atualização dos destinos." : "");
  const destinationName = currentMode === "test" ? testNumber.trim() || "número de teste" : currentMode === "broadcast" ? `${broadcastNumberCount} contato(s)${selectedDestination ? ` + ${selectedDestination.name}` : ''}` : selectedDestination?.name || "selecione um destino";
  const sendButtonHint =
    blockedReason ||
    (referencesBlocked
      ? "Os anúncios serão conferidos antes de enviar."
      : `Destino: ${destinationName}`);
  const processingDetail = linkFormatNeedsReferences
    ? "O sistema esta validando referencias publicas antes de enviar. Se nao encontrar links suficientes, nada sera disparado e a tela volta com o motivo."
    : "Estamos preparando e enviando a mensagem. Aguarde o resultado antes de tentar novamente.";

  useEffect(() => {
    if (actionStatus !== "error" && actionStatus !== "whatsapp-referencias-bloqueado") return;
    const modalTimer = window.setTimeout(() => {
      setSenderConnectionModal(isWhatsAppConnectionProblem(actionMessage) ? senderConnectionModalFromMessage(actionMessage) : { title: "Não foi possível concluir o envio", detail: actionMessage || "Confira os dados e tente novamente." });
    }, 0);
    return () => window.clearTimeout(modalTimer);
  }, [actionMessage, actionStatus]);

  useEffect(() => {
    if (panelOpen && (senderConnectionModal || sendProcessingOpen)) feedback.current?.focus();
  }, [senderConnectionModal, sendProcessingOpen, panelOpen]);

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
        sendInFlight.current = false;
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

  async function checkSenderConnection() {
    if (!selectedAgent) {
      setSenderConnectionModal({
        title: "Remetente nao selecionado",
        detail: "Selecione um agente WhatsApp conectado antes de enviar.",
      });
      return false;
    }

    if (selectedAgent.connected === false || !selectedAgent.instanceId) {
      setSenderConnectionModal({
        title: "WhatsApp desconectado",
        detail: "Nao foi possivel prosseguir porque a instancia WhatsApp selecionada nao esta conectada.",
        status: selectedAgent.status,
      });
      return false;
    }

    setSenderCheckPending(true);
    try {
      const params = new URLSearchParams({ agentKey: selectedAgent.agentKey });
      const response = await fetch(`/api/admin/whatsapp/sender-status?${params.toString()}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as SenderStatusResponse;
      const connected = Boolean(payload.data?.connected);
      if (!response.ok || !payload.success || !connected) {
        setSenderConnectionModal({
          title: "WhatsApp desconectado",
          detail:
            payload.error ||
            "Nao foi possivel prosseguir porque a instancia WhatsApp selecionada nao esta conectada.",
          status: payload.data?.state || payload.data?.lastDisconnectReason,
        });
        router.refresh();
        return false;
      }

      return true;
    } catch (error) {
      setSenderConnectionModal({
        title: "Status do WhatsApp indisponivel",
        detail: error instanceof Error ? error.message : "Nao foi possivel confirmar se a instancia WhatsApp esta conectada.",
      });
      return false;
    } finally {
      setSenderCheckPending(false);
    }
  }

  async function handleSendClick(event: MouseEvent<HTMLButtonElement>) {
    if (pending || senderCheckPending || sendInFlight.current) {
      event.preventDefault();
      return;
    }

    if (blockedReason) {
      event.preventDefault();
      setSenderConnectionModal(
        isWhatsAppConnectionProblem(blockedReason)
          ? senderConnectionModalFromMessage(blockedReason)
          : {
              title: "Envio nao liberado",
              detail: blockedReason,
            }
      );
      return;
    }

    const button = event.currentTarget;
    event.preventDefault();
    sendInFlight.current = true;
    setSendBusy(true);
    const connected = await checkSenderConnection();
    if (!connected) { sendInFlight.current = false; setSendBusy(false); return; }

    sendPendingSeenRef.current = false;
    setSendProcessingOpen(true);
    window.setTimeout(() => button.form?.requestSubmit(button), 0);
  }

  return (
    <>
    <section className="w-full text-left">
      <input name="whatsappLinkFormat" type="hidden" value={linkFormat} />

      <div className="opportunity-send-layout">
      <div className="opportunity-send-controls grid gap-4">
        <label className="grid gap-1">
          <span className={labelClass}>Número que vai enviar</span>
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



        <div>
          <p className={labelClass}>Quem vai receber?</p>
          <div className="opportunity-send-modes mt-1 grid grid-cols-4 gap-1">
            {(["group", "channel", "broadcast", "test"] as SendMode[]).map((item) => {
              const Icon = modeCopy[item].icon;
              const disabled = !agents.length;
              const selected = currentMode === item;
              return (
                <button
                  className={cn(
                    "min-h-11 rounded-lg border px-2 py-2 text-left transition",
                    selected
                      ? "border-[rgba(200,90,31,0.42)] bg-[rgba(200,90,31,0.08)]"
                      : "border-[var(--admin-border)] bg-white hover:bg-[var(--admin-card-2)]",
                    disabled && "cursor-not-allowed opacity-50"
                  )}
                  disabled={disabled || pending || senderCheckPending}
                  aria-pressed={selected}
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
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className={labelClass}>Formato</p>
          <div className="opportunity-send-format mt-1 grid grid-cols-2 gap-2">
            {(["source_buttons", "source_links"] as LinkFormat[]).map((item) => {
              const Icon = linkFormatCopy[item].icon;
              const selected = linkFormat === item;
              return (
                <button
                  className={cn(
                    "min-h-11 rounded-lg border px-3 py-2 text-left transition",
                    selected
                      ? "border-[rgba(200,90,31,0.42)] bg-[rgba(200,90,31,0.08)]"
                      : "border-[var(--admin-border)] bg-white hover:bg-[var(--admin-card-2)]"
                  )}
                  key={item}
                  aria-pressed={selected}
                  disabled={pending || senderCheckPending}
                  type="button"
                  onClick={() => setLinkFormat(item)}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-[var(--admin-foreground)]">
                    <Icon size={15} className={selected ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]"} />
                    {linkFormatCopy[item].title}
                    {selected ? <CheckCircle2 size={14} className="ml-auto text-[var(--admin-green)]" /> : null}
                  </span>
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
              {groups.length ? null : <option value="">{autoSyncState === 'done' ? 'Nenhum grupo encontrado' : autoSyncState === 'error' ? 'Lista de grupos indisponível' : 'Carregando grupos…'}</option>}
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
              {channels.length ? null : <option value="">{autoSyncState === 'done' ? 'Nenhum canal encontrado' : autoSyncState === 'error' ? 'Lista de canais indisponível' : 'Carregando canais…'}</option>}
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

        <p role="status" className="flex items-start gap-2 text-xs leading-5 text-[var(--admin-muted)]">{autoSyncState === "syncing" ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin" /> : autoSyncState === "error" ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-[var(--admin-red)]" /> : <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[var(--admin-green)]" />}<span>{autoSyncMessage || "A lista será atualizada ao abrir."}{autoSyncState === "done" && !destinationsForAgent.length ? " Nenhum grupo ou canal encontrado para este número." : ""}</span></p>
          {linkFormatNeedsReferences && !activeReferenceStatus.ready ? (
            <div className="mt-2 flex items-start gap-2 rounded-lg border border-[rgba(210,54,43,0.28)] bg-[rgba(210,54,43,0.06)] px-3 py-2 text-xs leading-5 text-[var(--admin-red)]">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>
                Os três anúncios serão validados antes do envio. Pendências impedem o disparo.
              </span>
            </div>
          ) : null}

      <div className="opportunity-send-confirmation grid gap-2 border-t border-[var(--admin-border)] pt-3">
        <div ref={feedback} tabIndex={-1}>
          {senderConnectionModal ? <div role="alert" className="rounded-xl border border-[var(--admin-red)] bg-[#fff4f2] p-4"><p className="font-semibold">{senderConnectionModal.title}</p><p className="mt-1 text-sm">{senderConnectionModal.detail}</p><Button type="button" variant="outline" className="mt-3" onClick={() => setSenderConnectionModal(null)}>Conferir os dados</Button></div> : null}
          {sendProcessingOpen ? <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-[var(--admin-border)] bg-[#f0f8f7] p-4"><LoaderCircle size={20} className="shrink-0 animate-spin" /><div><p className="font-semibold">{sendProcessingTitle(currentMode, linkFormatNeedsReferences)}</p><p className="mt-1 text-sm">{processingDetail}</p><p className="mt-2 text-sm">Destino: {destinationName}</p></div></div> : null}
        </div>
        <p className="text-sm"><strong>Destino:</strong> {currentMode === "test" ? testNumber || "informe o número de teste" : currentMode === "broadcast" ? broadcastNumberCount + " número(s) informado(s)" + (selectedDestination ? " + contatos de " + selectedDestination.name : "") : selectedDestination?.name || "selecione um destino"}</p>
        <p className="text-sm text-[var(--admin-muted)]">{currentMode === "test" ? "O teste envia a versão aprovada somente para este número." : "Ao confirmar, você salva, aprova e envia esta revisão."}</p>

        <Button
          className="opportunity-action-primary min-h-11 w-fit max-w-full gap-2 rounded-lg px-4 py-2 text-sm text-white"
          disabled={pending || senderCheckPending || sendProcessingOpen}
          name="submitStatus"
          type="submit"
          value={submitValueForMode(currentMode)}
          onClick={handleSendClick}
        >
          <span className="shrink-0">
            {(pending && sendProcessingOpen) || senderCheckPending ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-5">
              {senderCheckPending ? "Verificando WhatsApp..." : pending && sendProcessingOpen ? "Enviando WhatsApp..." : submitLabelForMode(currentMode)}
            </span>
          </span>
        </Button>
        {blockedReason ? <p className="text-xs text-[var(--admin-muted)]">{sendButtonHint}</p> : null}
      </div>

      </div>
      <OpportunityMessagePhone preview={preview} format={linkFormat} sender={selectedAgent?.label || "selecione o remetente"} destination={destinationName} open={panelOpen} test={currentMode === "test"} />
      </div>
    </section>
    </>
  );
}
