"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Copy,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Mic2,
  Paperclip,
  Phone,
  Power,
  Plus,
  QrCode,
  Radio,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Trash2,
  Timer,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WILLIAN_AGENT_CONFIG,
  type WhatsAppAgentInstanceSummary,
  type WillianAgentConfig,
  type WillianAgentConfigTab,
  type WillianBehaviorConfig,
  type WillianConnectionInfo,
  type WillianFilesConfig,
  type WillianInstanceState,
  type WillianMemoryConfig,
  type WillianMultichannelConfig,
  type WillianPromptConfig,
  type WillianQualificationConfig,
} from "@/lib/communication/willian-types";

const defaultWillianState: WillianInstanceState = {
  agentKey: "multichannel-dispatch",
  agentName: "Willian",
  baseUrl: "https://www.connectyhub.com.br/api/v1",
  baseUrlSource: "default",
  adminTokenConfigured: false,
  adminTokenSource: "missing",
  adminTokenPreview: "",
  adminTokenLooksValid: false,
  instanceName: "willian-betel",
  instanceTokenConfigured: false,
  instanceTokenPreview: "",
  webhookUrl: "",
  webhookConfiguredUrl: "",
  webhookSecretConfigured: false,
  whatsappProviderReleased: false,
  whatsappReady: false,
  emailProvider: "resend",
  emailTokenConfigured: false,
  emailFromConfigured: false,
  emailReady: false,
  missing: [],
};

const tabs: Array<{ key: WillianAgentConfigTab; label: string; subtitle: string; icon: typeof MessageCircle }> = [
  { key: "connection", label: "Conexao", subtitle: "Numero e status", icon: Phone },
  { key: "prompt", label: "Prompt", subtitle: "Texto do agente", icon: FileText },
  { key: "qualification", label: "Qualificacao", subtitle: "CRM e score", icon: ClipboardCheck },
  { key: "behavior", label: "Comportamento", subtitle: "Modos e timers", icon: SlidersHorizontal },
  { key: "multichannel", label: "Multicanal", subtitle: "Grupos e campanhas", icon: Send },
  { key: "files", label: "Arquivos", subtitle: "Conhecimento", icon: Paperclip },
];

type ElevenLabsVoice = {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
};

const WILLIAN_VOICE_ENDPOINT = "/api/admin/agentes-ia/communication/willian-voice";
const PRIMARY_WHATSAPP_AGENT_KEY = "multichannel-dispatch";
const PRIMARY_WHATSAPP_AGENT_LABEL = "Agente de WhatsApp";

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(value: string[]) {
  return value.join("\n");
}

function csvToArray(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function cleanFormValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isPrimaryWhatsappAgentName(value: unknown) {
  const name = cleanFormValue(value).toLowerCase();
  return /^willia[mn]\b/.test(name);
}

function displayWhatsappAgentName(agent?: Pick<WhatsAppAgentInstanceSummary, "agentKey" | "agentName"> | null) {
  const name = cleanFormValue(agent?.agentName);
  if (!name || agent?.agentKey === PRIMARY_WHATSAPP_AGENT_KEY || isPrimaryWhatsappAgentName(name)) {
    return PRIMARY_WHATSAPP_AGENT_LABEL;
  }
  return name;
}

function displayWhatsappProfileName(value: unknown, fallback: string) {
  const name = cleanFormValue(value);
  if (!name || isPrimaryWhatsappAgentName(name)) return fallback;
  return name;
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function safeNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

type BehaviorToggleKey = {
  [Key in keyof WillianBehaviorConfig]: WillianBehaviorConfig[Key] extends boolean ? Key : never;
}[keyof WillianBehaviorConfig];

type BehaviorNumberKey = {
  [Key in keyof WillianBehaviorConfig]: WillianBehaviorConfig[Key] extends number ? Key : never;
}[keyof WillianBehaviorConfig];

type BehaviorToggleSpec = {
  key: BehaviorToggleKey;
  title: string;
  detail: string;
};

type BehaviorNumberSpec = {
  key: BehaviorNumberKey;
  label: string;
};

const conversationModeLabels: Record<WillianBehaviorConfig["conversationMode"], string> = {
  always_text: "Sempre texto",
  always_audio: "Sempre audio",
  mirror: "Espelho",
  prompt: "Segue prompt",
};

const voiceCloneStatusLabels: Record<WillianBehaviorConfig["voiceCloneStatus"], string> = {
  inactive: "Inativo",
  testing: "Teste ativo",
  active: "Ativo",
};

const groupReplyModeLabels: Record<WillianBehaviorConfig["groupReplyMode"], string> = {
  all: "Todos",
  mentions: "Mencoes",
  admins: "Admins",
};

const specialTriggerModeLabels: Record<WillianBehaviorConfig["specialTriggerMode"], string> = {
  disabled: "Desligado",
  smart: "Inteligente",
  always: "Sempre",
};

const quoteReplyModeLabels: Record<WillianBehaviorConfig["quoteReplyMode"], string> = {
  off: "Sem citacao",
  smart: "Cita quando ajuda",
  always: "Cita sempre",
};

const humanSimulationToggles: BehaviorToggleSpec[] = [
  { key: "humanizedLanguage", title: "Linguagem humanizada", detail: "Respostas com variacao natural." },
  { key: "emojiFeature", title: "Recursos emoji", detail: "Permite emoji com sobriedade." },
  { key: "typingVariation", title: "Variacao de digitar", detail: "Simula intervalos entre partes." },
  { key: "composingPause", title: "Pausa ao digitar", detail: "Simula parar e voltar a digitar." },
  { key: "statusLookup", title: "Verificacao de status", detail: "Pode observar contexto do WhatsApp." },
  { key: "viewDelay", title: "Delay ao visualizar", detail: "Atrasa leitura antes da resposta." },
  { key: "spontaneousAudio", title: "Audio espontaneo", detail: "Permite audio quando fizer sentido." },
  { key: "intentionalTypos", title: "Tipos intencionais", detail: "Pequenas correcoes controladas." },
  { key: "circadianRhythm", title: "Ritmo circadiano", detail: "Muda tempo conforme horario." },
  { key: "vocalFillers", title: "Figurinhas vocais", detail: "Usa pausas e marcadores humanos." },
  { key: "stickers", title: "Figurinhas", detail: "Libera figurinha em contexto leve." },
  { key: "proactiveMedia", title: "Midia proativa", detail: "Envia apoio visual quando util." },
  { key: "continuousLearning", title: "Aprendizado continuo", detail: "Registra padroes de conversa." },
  { key: "companyMemory", title: "Memoria da empresa", detail: "Usa historico operacional Betel." },
  { key: "cloneConsistency", title: "Memoria do clone", detail: "Mantem tom do agente." },
  { key: "temporalAwareness", title: "Consciencia temporal", detail: "Considera data e urgencia." },
  { key: "rhythmWpmEnabled", title: "Ritmo WPM", detail: "Controla velocidade por palavras." },
  { key: "midMessageContext", title: "Contexto mid-message", detail: "Entende mensagens quebradas." },
  { key: "conversationArc", title: "Arco da conversa", detail: "Mantem progresso do atendimento." },
  { key: "emotionSensing", title: "Leitura emocional", detail: "Adapta resposta ao tom do lead." },
  { key: "confidenceHumility", title: "Confianca e humildade", detail: "Evita certeza falsa e promete pouco." },
  { key: "smallTalk", title: "Small talk", detail: "Permite conversa breve quando caber." },
];

const humanNumberFields: BehaviorNumberSpec[] = [
  { key: "reactionChancePct", label: "Chance reacao %" },
  { key: "minReadSeconds", label: "Leitura min (s)" },
  { key: "maxReadSeconds", label: "Leitura max (s)" },
  { key: "audioChancePct", label: "Chance audio %" },
  { key: "stickerChancePct", label: "Chance figurinha %" },
  { key: "rhythmWpm", label: "WPM" },
  { key: "correctionChancePct", label: "Chance correcao %" },
];

const securityToggles: BehaviorToggleSpec[] = [
  { key: "humanIntervention", title: "Intervencao humana", detail: "Pausa o bot quando humano assumir." },
  { key: "alertHuman", title: "Avisar humano", detail: "Alerta responsavel em risco ou VIP." },
  { key: "antiLoop", title: "Protecao anti-loop", detail: "Ignora eco de mensagens da API." },
  { key: "cooldownEnabled", title: "Cooldown ativo", detail: "Evita respostas em rajada." },
  { key: "interInstanceTest", title: "Teste entre instancias", detail: "QA antes de liberar canal." },
  { key: "realCloneTest", title: "Teste real do clone", detail: "Valida comportamento com numero real." },
  { key: "turingBenchmark", title: "Turing benchmark", detail: "Comparacao com atendimento humano." },
];

const groupToggles: BehaviorToggleSpec[] = [
  { key: "groupsEnabled", title: "Responder grupos", detail: "Libera atendimento em grupos." },
  { key: "serveGroups", title: "Atender grupos", detail: "Considera grupos como canal ativo." },
  { key: "monitorAllGroups", title: "Monitorar todos", detail: "Observa mensagens sem responder sempre." },
  { key: "groupMentionAll", title: "Mencionar todos", detail: "Permite mencao geral quando aplicavel." },
  { key: "interactiveMessages", title: "Mensagens interativas", detail: "Libera botoes e interacoes ConnectyHub." },
  { key: "statusWhatsAppEnabled", title: "Status WhatsApp", detail: "Permite publicar status." },
  { key: "channelsEnabled", title: "Canais", detail: "Libera canal/newsletter." },
  { key: "campaignEnabled", title: "Campanhas", detail: "Envio supervisionado em lote." },
];

const leadTriggerToggles: BehaviorToggleSpec[] = [
  { key: "humanRequestTrigger", title: "Pedido de humano", detail: "Quando o lead pede uma pessoa." },
  { key: "aiHumanRequestTrigger", title: "IA pediu humano", detail: "Quando a IA identifica necessidade." },
  { key: "rescheduleTrigger", title: "Cancelar/remarcar", detail: "Detecta remarcacao ou cancelamento." },
  { key: "captureTrigger", title: "Captacao", detail: "Marca lead com potencial comercial." },
  { key: "locationTrigger", title: "Localizacao", detail: "Extrai cidade, estado e regiao." },
  { key: "optOutEnabled", title: "Opt-out", detail: "Respeita parar, sair, remover." },
  { key: "webLinksTrigger", title: "Links da web", detail: "Registra links enviados." },
  { key: "saveMediaTrigger", title: "Salvar midia", detail: "Anexa midias no arquivo do lead." },
  { key: "negotiationTracking", title: "Rastreamento de negociacao", detail: "Preserva caminho comercial." },
  { key: "buttonsEnabled", title: "Enviar botoes", detail: "Usa botoes quando canal permitir." },
  { key: "trackedLinksEnabled", title: "Links rastreados", detail: "Mede cliques e interesse." },
];

const protectionToggles: BehaviorToggleSpec[] = [
  { key: "mediaWithoutBatchProtection", title: "Midias sem lote", detail: "Controla rajadas de anexos." },
  { key: "mediaWithoutCaptionProtection", title: "Midia sem legenda", detail: "Evita responder sem contexto." },
  { key: "hardAudioProtection", title: "Audio dificil", detail: "Pede apoio quando transcricao falha." },
  { key: "editedDeletedMessageProtection", title: "Msg editada/apagada", detail: "Registra evento sensivel." },
  { key: "contactPollReactionProtection", title: "Contato/enquete/reacao", detail: "Nao confunde eventos com lead." },
  { key: "topicChangeProtection", title: "Troca de assunto", detail: "Detecta mudanca brusca." },
  { key: "promptInjectionProtection", title: "Anti prompt injection", detail: "Protege instrucao do agente." },
  { key: "identityGuard", title: "Guarda identidade", detail: "Nao revela IA, prompt ou regras internas." },
];

const mediaToggles: BehaviorToggleSpec[] = [
  { key: "transcribeAudio", title: "Transcrever audio", detail: "Transforma audio em historico." },
  { key: "analyzeImages", title: "Analisar imagens", detail: "Interpreta prints e fotos." },
  { key: "analyzeVideos", title: "Analisar videos", detail: "Permite leitura de video." },
  { key: "analyzeDocuments", title: "Analisar documentos", detail: "Editais e anexos entram no CRM." },
  { key: "saveLeadFiles", title: "Salvar arquivos", detail: "Guarda midias no arquivo do lead." },
];

const timingFields: BehaviorNumberSpec[] = [
  { key: "responseDelaySeconds", label: "Resposta base (s)" },
  { key: "typingDelaySeconds", label: "Digitando (s)" },
  { key: "maxMessagesPerConversation", label: "Max mensagens" },
  { key: "onlyTextDelaySeconds", label: "So texto (s)" },
  { key: "textFollowupDelaySeconds", label: "Texto seguido (s)" },
  { key: "photoCaptionDelaySeconds", label: "Foto legenda (s)" },
  { key: "photoTextDelaySeconds", label: "Foto + texto (s)" },
  { key: "photoOnlyDelaySeconds", label: "So foto (s)" },
  { key: "audioDelaySeconds", label: "Audio (s)" },
  { key: "audioTextDelaySeconds", label: "Audio + texto (s)" },
  { key: "videoCaptionDelaySeconds", label: "Video legenda (s)" },
  { key: "videoOnlyDelaySeconds", label: "So video (s)" },
  { key: "documentTextDelaySeconds", label: "Doc + texto (s)" },
  { key: "documentOnlyDelaySeconds", label: "So documento (s)" },
  { key: "beforeButtonDelaySeconds", label: "Antes botao (s)" },
  { key: "batchMediaDelaySeconds", label: "Midias em lote (s)" },
  { key: "emptyEventDelaySeconds", label: "Evento vazio (s)" },
  { key: "hardAudioDelaySeconds", label: "Audio dificil (s)" },
  { key: "reactivateAgentDelayMinutes", label: "Reativar agente (min)" },
];

export function WillianAgentPanel({
  initialState,
  initialConfig,
}: {
  initialState?: WillianInstanceState;
  initialConfig?: WillianAgentConfig;
}) {
  const [state, setState] = useState<WillianInstanceState>(initialState || defaultWillianState);
  const [config, setConfig] = useState<WillianAgentConfig>(initialConfig || DEFAULT_WILLIAN_AGENT_CONFIG);
  const [activeTab, setActiveTab] = useState<WillianAgentConfigTab>("connection");
  const [loading, setLoading] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [connection, setConnection] = useState<WillianConnectionInfo | null>(null);
  const [agentInstances, setAgentInstances] = useState<WhatsAppAgentInstanceSummary[]>(initialState?.agentInstances || []);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>(initialState?.agentKey || defaultWillianState.agentKey);
  const [newAgentFormOpen, setNewAgentFormOpen] = useState(false);
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentSector, setNewAgentSector] = useState("Atendimento WhatsApp");
  const [pairingTarget, setPairingTarget] = useState<{ agentKey?: string; agentName: string } | null>(null);

  const connected = Boolean(state.status?.connected || state.status?.loggedIn);
  const applyInstanceState = useCallback((nextState?: WillianInstanceState) => {
    if (!nextState) return;
    setState(nextState);
    setAgentInstances(nextState.agentInstances || []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function refreshRemoteState() {
      try {
        const res = await fetch("/api/admin/agentes-ia/communication/willian-instance?remote=true", {
          cache: "no-store",
          method: "GET",
        });
        const result = await res.json();
        const nextState = result?.data?.state as WillianInstanceState | undefined;
        if (!cancelled) applyInstanceState(nextState);
      } catch {
        // The server render still shows the local state if remote status is temporarily unavailable.
      }
    }

    void refreshRemoteState();

    return () => {
      cancelled = true;
    };
  }, [applyInstanceState]);

  useEffect(() => {
    if (!connection) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;
    const maxAttempts = 45;

    async function pollStatus() {
      attempts += 1;
      try {
        const res = await fetch("/api/admin/agentes-ia/communication/willian-instance?remote=true", {
          cache: "no-store",
          method: "GET",
        });
        const result = await res.json();
        const nextState = result?.data?.state as WillianInstanceState | undefined;
        if (cancelled || !nextState) return;

        applyInstanceState(nextState);
        const targetInstance = pairingTarget?.agentKey
          ? nextState.agentInstances?.find((item) => item.agentKey === pairingTarget.agentKey)
          : null;
        const targetConnected = targetInstance
          ? targetInstance.connected
          : Boolean(nextState.status?.connected || nextState.status?.loggedIn);

        if (targetConnected) {
          if (nextState.profileImageUrl || targetInstance || attempts >= maxAttempts) {
            setConnection(null);
            setPairingTarget(null);
            setFeedback({
              type: "ok",
              msg: nextState.profileImageUrl || targetInstance?.phoneNumber
                ? "WhatsApp conectado. Numero, nome e foto sincronizados."
                : "WhatsApp conectado. Dados do perfil pendentes no provedor.",
            });
            return;
          }

          setFeedback({ type: "ok", msg: "WhatsApp conectado. Sincronizando foto do perfil..." });
        }
      } catch {
        // Keep the QR flow quiet while the user is scanning.
      }

      if (!cancelled && attempts < maxAttempts) {
        timer = window.setTimeout(pollStatus, 4000);
      }
    }

    timer = window.setTimeout(pollStatus, 3500);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [applyInstanceState, connection, pairingTarget]);

  const whatsappAgents = useMemo<WhatsAppAgentInstanceSummary[]>(() => {
    if (agentInstances.length) return agentInstances;
    return [
      {
        agentKey: state.agentKey,
        agentName: PRIMARY_WHATSAPP_AGENT_LABEL,
        companyName: config.companyName,
        connected,
        displayName: state.displayName,
        instanceName: state.instanceName,
        phoneNumber: state.phoneNumber,
        profileImageSyncedAt: state.profileImageSyncedAt,
        profileImageUrl: state.profileImageUrl,
        sector: "Comercial Betel",
        status: connected ? "connected" : state.status?.state || "draft",
      },
    ];
  }, [
    agentInstances,
    config.companyName,
    connected,
    state.agentKey,
    state.displayName,
    state.instanceName,
    state.phoneNumber,
    state.profileImageSyncedAt,
    state.profileImageUrl,
    state.status?.state,
  ]);
  const selectedWhatsappAgent =
    whatsappAgents.find((item) => item.agentKey === selectedAgentKey) ||
    whatsappAgents[0];
  const selectedConfigAgentKey = selectedWhatsappAgent?.agentKey || state.agentKey;

  useEffect(() => {
    if (!selectedConfigAgentKey) return;
    let cancelled = false;

    async function loadSelectedAgentConfig() {
      try {
        const res = await fetch(
          `/api/admin/agentes-ia/communication/willian-config?agentKey=${encodeURIComponent(selectedConfigAgentKey)}`,
          { cache: "no-store", method: "GET" }
        );
        const result = await res.json();
        const nextConfig = result?.data?.config as WillianAgentConfig | undefined;
        if (!cancelled && nextConfig) setConfig(nextConfig);
      } catch {
        if (!cancelled) {
          setFeedback({ type: "err", msg: "Nao foi possivel carregar as configuracoes deste agente." });
        }
      }
    }

    void loadSelectedAgentConfig();

    return () => {
      cancelled = true;
    };
  }, [selectedConfigAgentKey]);

  const readyScore = useMemo(() => {
    const checks = [
      state.instanceTokenConfigured,
      state.webhookUrl,
      state.webhookSecretConfigured,
      state.whatsappProviderReleased,
      state.emailReady,
      config.behavior.active,
      config.qualification.enabled,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [config.behavior.active, config.qualification.enabled, state]);

  function setBehavior(patch: Partial<WillianBehaviorConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", behavior: { ...prev.behavior, ...patch } }));
  }

  function setQualification(patch: Partial<WillianQualificationConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", qualification: { ...prev.qualification, ...patch } }));
  }

  function setPrompt(patch: Partial<WillianPromptConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", prompt: { ...prev.prompt, ...patch } }));
  }

  function setMultichannel(patch: Partial<WillianMultichannelConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", multichannel: { ...prev.multichannel, ...patch } }));
  }

  function setFiles(patch: Partial<WillianFilesConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", files: { ...prev.files, ...patch } }));
  }

  function setMemory(patch: Partial<WillianMemoryConfig>) {
    setConfig((prev) => ({ ...prev, status: "needs_review", memory: { ...prev.memory, ...patch } }));
  }

  async function saveConfig() {
    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/agentes-ia/communication/willian-config", {
        body: JSON.stringify({
          ...config,
          agentKey: selectedConfigAgentKey,
          agentName: displayWhatsappAgentName(selectedWhatsappAgent),
          companyName: selectedWhatsappAgent?.companyName || config.companyName,
          roleTitle: selectedWhatsappAgent?.sector || "Atendimento WhatsApp",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setFeedback({ type: "err", msg: result.error || "Nao foi possivel salvar o comportamento." });
      } else {
        setConfig(result.data.config);
        setFeedback({ type: "ok", msg: "Configuracao do agente salva." });
      }
    } catch {
      setFeedback({ type: "err", msg: "Falha de rede ao salvar o agente." });
    } finally {
      setSavingConfig(false);
    }
  }

  async function runInstanceAction(action: string, payload: Record<string, unknown> = {}) {
    const confirmations: Record<string, string> = {
      disconnect: "Desconectar este WhatsApp? Sera necessario gerar um novo QR Code para reconectar.",
      disconnectWhatsappAgent: "Desconectar este WhatsApp? Sera necessario gerar um novo QR Code para reconectar.",
      deleteInstance: "Excluir a instancia atual na ConnectyHub? Use apenas quando quiser recriar o vinculo.",
      reset: "Reiniciar o runtime da instancia na ConnectyHub?",
    };
    if (confirmations[action] && !window.confirm(confirmations[action])) return;
    if (action === "createWhatsappAgent" && !cleanFormValue(payload.agentName)) {
      setFeedback({ type: "err", msg: "Informe o nome do novo agente WhatsApp." });
      return;
    }

    setLoading(action);
    setFeedback(null);
    if (action === "connect" || action === "generateQr" || action === "disconnectWhatsappAgent") {
      setConnection(null);
      setPairingTarget(null);
    }
    try {
      const res = await fetch("/api/admin/agentes-ia/communication/willian-instance", {
        body: JSON.stringify({
          action,
          browser: "auto",
          ...payload,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await res.json();
      const nextState = result?.data?.state || result?.data?.data?.state;
      if (nextState) applyInstanceState(nextState);
      const createdAgent = result?.data?.result?.createdAgent as
        | { agentKey?: string; agentName?: string }
        | undefined;
      if (cleanFormValue(createdAgent?.agentKey)) setSelectedAgentKey(cleanFormValue(createdAgent?.agentKey));
      const nextConnection = result?.data?.result?.connection || result?.data?.result?.connect?.connection;
      const actionAgentKey = cleanFormValue(payload.agentKey);
      const actionAgentName = cleanFormValue(payload.agentName);
      const hasPairing =
        Boolean(nextConnection?.qrCodeDataUrl) ||
        Boolean(nextConnection?.qrCode) ||
        Boolean(nextConnection?.pairingCode);
      if (nextConnection) {
        setConnection(nextConnection);
        setPairingTarget({
          agentKey: cleanFormValue(createdAgent?.agentKey) || actionAgentKey || selectedConfigAgentKey,
          agentName:
            cleanFormValue(createdAgent?.agentName) ||
            actionAgentName ||
            displayWhatsappAgentName(selectedWhatsappAgent) ||
            PRIMARY_WHATSAPP_AGENT_LABEL,
        });
      }
      if (!res.ok || !result.success) {
        setFeedback({ type: "err", msg: result.error || "Nao foi possivel operar a instancia." });
      } else {
        const labels: Record<string, string> = {
          create: "Instancia criada ou atualizada.",
          createWhatsappAgent: "Agente criado. Abra a aba Conexao para criar a instancia e gerar o QR Code.",
          generateQr: hasPairing
            ? "QR Code gerado. Criacao, webhook e conexao foram preparados automaticamente."
            : "Fluxo automatico executado, mas a ConnectyHub nao retornou QR Code nesta tentativa.",
          connect: "Ciclo de conexao iniciado.",
          status: "Status atualizado.",
          configureWebhook: "Webhook configurado.",
          testWebhook: "Teste de webhook disparado pela ConnectyHub.",
          webhookDeliveries: "Entregas recentes carregadas.",
          syncOverview: "Dados sincronizados da ConnectyHub carregados.",
          disconnect: "Instancia desconectada. Gere um novo QR Code para reconectar.",
          disconnectWhatsappAgent: "WhatsApp desconectado. Gere um novo QR Code para reconectar.",
          reset: "Reset solicitado para a instancia.",
          deleteInstance: "Instancia excluida e vinculo local limpo.",
          deleteWhatsappAgent: "Agente de WhatsApp excluido.",
        };
        setFeedback({ type: "ok", msg: labels[action] || "Acao concluida." });
        if (action === "disconnectWhatsappAgent") {
          setConnection(null);
          setPairingTarget(null);
        }
        if (action === "deleteWhatsappAgent") {
          const deletedAgentKey = cleanFormValue(payload.agentKey);
          if (deletedAgentKey && deletedAgentKey === selectedAgentKey) setSelectedAgentKey(state.agentKey);
          setConnection(null);
          setPairingTarget(null);
        }
        if (action === "createWhatsappAgent") {
          setNewAgentName("");
          setNewAgentFormOpen(false);
        }
      }
    } catch {
      setFeedback({ type: "err", msg: "Falha de rede ao falar com a rota do agente WhatsApp." });
    } finally {
      setLoading(null);
    }
  }

  const changeLabel = config.status === "saved" ? "Salvo" : "Revisar";
  const selectedAgentConnected = selectedWhatsappAgent?.agentKey === state.agentKey
    ? connected
    : Boolean(selectedWhatsappAgent?.connected);

  function cloneWhatsappAgent(agent: WhatsAppAgentInstanceSummary) {
    const baseName = displayWhatsappAgentName(agent);
    setNewAgentSector(agent.sector || "Atendimento WhatsApp");
    setNewAgentName(`${baseName} copia`);
    setNewAgentFormOpen(true);
    setFeedback({ type: "ok", msg: "Formulario preenchido para clonar. Revise o nome e crie o agente." });
  }

  function deleteWhatsappAgent(agent: WhatsAppAgentInstanceSummary) {
    const label = displayWhatsappAgentName(agent);
    const message = agent.agentKey === state.agentKey
      ? `Excluir o vinculo atual de ${label}? O agente principal continua na lista, mas a conexao sera limpa.`
      : `Excluir ${label}? A instancia sera arquivada e nao aparecera mais na lista.`;
    if (!window.confirm(message)) return;
    void runInstanceAction("deleteWhatsappAgent", { agentKey: agent.agentKey });
  }

  return (
    <section className="mt-6">
      <WhatsAppAgentManager
        agents={whatsappAgents}
        companyName={config.companyName}
        formOpen={newAgentFormOpen}
        loading={loading}
        newAgentName={newAgentName}
        newAgentSector={newAgentSector}
        onCreate={() =>
          runInstanceAction("createWhatsappAgent", {
            agentName: newAgentName,
            companyName: config.companyName,
            sector: newAgentSector,
          })
        }
        onClone={cloneWhatsappAgent}
        onDelete={deleteWhatsappAgent}
        onSelect={setSelectedAgentKey}
        selectedAgentKey={selectedWhatsappAgent?.agentKey || state.agentKey}
        setFormOpen={setNewAgentFormOpen}
        setNewAgentName={setNewAgentName}
        setNewAgentSector={setNewAgentSector}
      />

      <div className="mb-4 rounded-xl border border-[var(--admin-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(13,13,13,0.96))] p-3 shadow-2xl shadow-black/20">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <InfoBox label="Agente" value={displayWhatsappAgentName(selectedWhatsappAgent)} />
            <InfoBox label="Empresa" value={selectedWhatsappAgent?.companyName || config.companyName} />
            <InfoBox label="WhatsApp" value={selectedAgentConnected ? "conectado" : "pendente"} tone={selectedAgentConnected ? "green" : "yellow"} />
            <InfoBox label="Conversa" value={conversationModeLabels[config.behavior.conversationMode]} />
            <InfoBox label="Alteracoes" value={changeLabel} tone={config.status === "saved" ? "green" : "yellow"} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3 xl:w-[360px]">
            <MiniKpi label="Pronto" value={`${readyScore}%`} tone={readyScore >= 70 ? "green" : "yellow"} />
            <MiniKpi label="VIP" value={`${config.qualification.vipScore}+`} tone="cyan" />
            <MiniKpi label="Perguntas" value={String(config.qualification.questionsLimit)} tone="purple" />
            <div className="sm:col-span-3">
              <ActionButton
                icon={<Save size={14} />}
                label="Salvar tudo"
                loading={savingConfig}
                onClick={saveConfig}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="mb-4 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] p-1"
        role="tablist"
        aria-label="Secoes do agente WhatsApp"
      >
        <div className="grid min-w-0 grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "grid min-h-[58px] grid-cols-[18px_minmax(0,1fr)] items-center gap-2 rounded-lg px-3 text-left transition",
                  active
                    ? "bg-[linear-gradient(135deg,var(--admin-cyan),var(--admin-yellow))] text-black shadow-[0_0_24px_rgba(255,90,31,0.16)]"
                    : "text-[var(--admin-muted)] hover:bg-[rgba(255,255,255,0.05)] hover:text-white"
                )}
              >
                <Icon size={17} className={active ? "text-black" : "text-[var(--admin-muted)]"} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{tab.label}</span>
                  <span className={cn("mt-0.5 hidden truncate text-[9px] font-bold uppercase tracking-[0.12em] sm:block", active ? "text-black/70" : "text-[var(--admin-muted)]")}>
                    {tab.subtitle}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        {activeTab === "connection" && (
          <ConnectionTab
            connection={connection}
            loading={loading}
            pairingTarget={pairingTarget}
            runInstanceAction={runInstanceAction}
            selectedAgent={selectedWhatsappAgent}
            state={state}
          />
        )}
        {activeTab === "prompt" && (
          <PromptTab
            agentName={displayWhatsappAgentName(selectedWhatsappAgent)}
            companyName={selectedWhatsappAgent?.companyName || config.companyName}
            config={config.prompt}
            setPrompt={setPrompt}
            status={config.status}
            updatedAt={config.updatedAt}
          />
        )}
        {activeTab === "qualification" && (
          <QualificationTab config={config.qualification} setQualification={setQualification} />
        )}
        {activeTab === "behavior" && <BehaviorTab config={config.behavior} setBehavior={setBehavior} />}
        {activeTab === "multichannel" && (
          <MultichannelTab config={config.multichannel} setMultichannel={setMultichannel} />
        )}
        {activeTab === "files" && (
          <FilesTab config={config.files} memory={config.memory} setFiles={setFiles} setMemory={setMemory} />
        )}

        {feedback && (
          <p
            className={cn(
              "mt-5 flex items-center gap-2 text-xs font-semibold",
              feedback.type === "ok" ? "text-[var(--admin-green)]" : "text-[var(--admin-red)]"
            )}
          >
            {feedback.type === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            {feedback.msg}
          </p>
        )}
      </div>
    </section>
  );
}

function WhatsAppAgentManager({
  agents,
  companyName,
  formOpen,
  loading,
  newAgentName,
  newAgentSector,
  onClone,
  onCreate,
  onDelete,
  onSelect,
  selectedAgentKey,
  setFormOpen,
  setNewAgentName,
  setNewAgentSector,
}: {
  agents: WhatsAppAgentInstanceSummary[];
  companyName: string;
  formOpen: boolean;
  loading: string | null;
  newAgentName: string;
  newAgentSector: string;
  onClone: (agent: WhatsAppAgentInstanceSummary) => void;
  onCreate: () => void;
  onDelete: (agent: WhatsAppAgentInstanceSummary) => void;
  onSelect: (agentKey: string) => void;
  selectedAgentKey: string;
  setFormOpen: (open: boolean) => void;
  setNewAgentName: (value: string) => void;
  setNewAgentSector: (value: string) => void;
}) {
  const agentCount = agents.length;

  return (
    <div className="mb-4 rounded-xl border border-[var(--admin-border)] bg-[linear-gradient(180deg,rgba(255,90,31,0.08),rgba(13,13,13,0.98))]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-4 sm:px-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-muted)]">Escolher / criar / clonar</p>
          <h3 className="mt-1 text-base font-bold text-white">Agentes de WhatsApp</h3>
        </div>
        <StatusPill ok label={`${agentCount} ${agentCount === 1 ? "agente" : "agentes"}`} />
      </div>

      <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => {
            const selected = agent.agentKey === selectedAgentKey;
            return (
              <div
                key={agent.agentKey}
                className={cn(
                  "rounded-xl border p-4 transition",
                  selected
                    ? "border-[rgba(255,90,31,0.45)] bg-[rgba(255,90,31,0.08)]"
                    : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.018)]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => onSelect(agent.agentKey)} className="min-w-0 text-left">
                    <p className="truncate text-sm font-bold text-white">{displayWhatsappAgentName(agent)}</p>
                    <p className="mt-2 truncate text-xs font-semibold text-[var(--admin-muted)]">
                      {agent.companyName || companyName} / {agent.sector || "Atendimento WhatsApp"}
                    </p>
                  </button>
                  <StatusPill ok={agent.connected} label={selected ? "Aberto" : agent.connected ? "Online" : "Pendente"} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    icon={<MessageCircle size={14} />}
                    label={selected ? "Aberto" : "Abrir"}
                    onClick={() => onSelect(agent.agentKey)}
                  />
                  <ActionButton
                    icon={<Copy size={14} />}
                    label="Clonar"
                    onClick={() => onClone(agent)}
                  />
                  <ActionButton
                    icon={<Trash2 size={14} />}
                    label="Excluir"
                    loading={loading === "deleteWhatsappAgent" && selected}
                    onClick={() => onDelete(agent)}
                    tone="danger"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="xl:min-w-[180px]">
          <ActionButton
            icon={formOpen ? <X size={14} /> : <Plus size={14} />}
            label={formOpen ? "Formulario aberto" : "Novo agente"}
            onClick={() => setFormOpen(!formOpen)}
          />
        </div>
      </div>

      {formOpen && (
        <div className="border-t border-[var(--admin-border)] p-4 sm:p-5">
          <div className="rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] p-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <Field
                label="Nome do agente"
                onChange={setNewAgentName}
                placeholder="Ex: Atendimento Betel Sul"
                value={newAgentName}
              />
              <Field
                label="Funcao / setor"
                onChange={setNewAgentSector}
                placeholder="Atendimento WhatsApp"
                value={newAgentSector}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton icon={<X size={14} />} label="Fechar" onClick={() => setFormOpen(false)} />
              <ActionButton
                icon={<SlidersHorizontal size={14} />}
                label="Criar agente"
                loading={loading === "createWhatsappAgent"}
                onClick={onCreate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionTab({
  connection,
  loading,
  pairingTarget,
  runInstanceAction,
  selectedAgent,
  state,
}: {
  connection: WillianConnectionInfo | null;
  loading: string | null;
  pairingTarget: { agentKey?: string; agentName: string } | null;
  runInstanceAction: (action: string, payload?: Record<string, unknown>) => void;
  selectedAgent?: WhatsAppAgentInstanceSummary;
  state: WillianInstanceState;
}) {
  const selectedIsPrimary = !selectedAgent || selectedAgent.agentKey === state.agentKey;
  const connected = selectedIsPrimary
    ? Boolean(state.status?.connected || state.status?.loggedIn)
    : Boolean(selectedAgent?.connected);
  const connectyHubKeyReady = state.adminTokenConfigured && state.adminTokenLooksValid;
  const canGenerateQr = connectyHubKeyReady && Boolean(state.webhookUrl) && state.whatsappProviderReleased;
  const agentLabel = displayWhatsappAgentName(selectedAgent || { agentKey: state.agentKey, agentName: state.agentName });
  const phoneNumber = selectedAgent?.phoneNumber || state.phoneNumber;
  const displayName = displayWhatsappProfileName(selectedAgent?.displayName || state.displayName, agentLabel);
  const whatsappLabel =
    displayName ||
    state.phoneNumber ||
    agentLabel;
  const statusLabel = connected ? "Online" : "Aguardando leitura";
  const pairingConnection = connection;
  const pairingLabel = pairingTarget?.agentName || "WhatsApp";
  const profileImageUrl = selectedAgent?.profileImageUrl || state.profileImageUrl;
  const profileImageSyncedAt = selectedAgent?.profileImageSyncedAt || state.profileImageSyncedAt;
  const hasProfileDetails = Boolean(connected && (phoneNumber || displayName || profileImageUrl));
  const setupPending = !connected && (!connectyHubKeyReady || !state.webhookUrl || !state.whatsappProviderReleased);
  const selectedAgentKey = selectedAgent?.agentKey || state.agentKey;
  const selectedHasInstance = Boolean(
    selectedAgent?.providerInstanceId ||
      selectedAgent?.instanceName ||
      (selectedIsPrimary && state.instanceTokenConfigured)
  );
  const generateQrLabel = selectedHasInstance ? "Gerar QR Code" : "Criar instancia e gerar QR";
  const agentPayload = {
    agentKey: selectedAgentKey,
    agentName: agentLabel,
    companyName: selectedAgent?.companyName,
    sector: selectedAgent?.sector,
  };

  return (
    <Panel title={`Conexao de ${agentLabel}`} eyebrow="Numero / agente / status" action={<StatusPill ok={connected} label={connected ? "Online" : "Pendente"} />}>
      <div className="rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <WhatsappProfileAvatar connected={connected} imageUrl={profileImageUrl} label={whatsappLabel} />
            <div className="min-w-0">
              <p className="truncate text-lg font-bold text-white">{connected ? whatsappLabel : "Aguardando leitura"}</p>
              <p className={cn("mt-1 text-xs font-bold uppercase tracking-[0.12em]", connected ? "text-[var(--admin-green)]" : "text-[var(--admin-yellow)]")}>
                {statusLabel}
              </p>
            </div>
          </div>

          {hasProfileDetails && (
            <div className="grid gap-2 text-xs text-[var(--admin-muted)] sm:min-w-64">
              {phoneNumber && (
                <p className="truncate">
                  <span className="font-semibold text-white">Numero:</span> {phoneNumber}
                </p>
              )}
              {displayName && (
                <p className="truncate">
                  <span className="font-semibold text-white">Perfil:</span> {displayName}
                </p>
              )}
              {profileImageSyncedAt && (
                <p className="truncate">
                  <span className="font-semibold text-white">Foto:</span> {formatDateTime(profileImageSyncedAt)}
                </p>
              )}
            </div>
          )}
        </div>

        {connected ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              icon={<RefreshCw size={14} />}
              label="Atualizar status"
              loading={loading === "status"}
              onClick={() => runInstanceAction("status", { agentKey: selectedAgentKey })}
            />
            <ActionButton
              icon={<Power size={14} />}
              label="Desconectar"
              loading={loading === "disconnectWhatsappAgent"}
              onClick={() =>
                runInstanceAction("disconnectWhatsappAgent", {
                  agentKey: selectedAgentKey,
                })
              }
              tone="danger"
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              disabled={!canGenerateQr}
              icon={<QrCode size={14} />}
              label={generateQrLabel}
              loading={loading === "generateQr"}
              onClick={() => runInstanceAction("generateQr", agentPayload)}
            />
            {selectedHasInstance && (
              <ActionButton
                icon={<RefreshCw size={14} />}
                label="Atualizar status"
                loading={loading === "status"}
                onClick={() => runInstanceAction("status", { agentKey: selectedAgentKey })}
              />
            )}
          </div>
        )}

        {setupPending && (
          <div className="mt-4 rounded-lg border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-3 py-2 text-xs font-semibold text-[var(--admin-yellow)]">
            Chave ConnectyHub, webhook ou liberacao do provedor esta pendente na manutencao.
          </div>
        )}

        {pairingConnection && (
          <div className="mt-4 rounded-lg border border-[rgba(0,243,255,0.22)] bg-[rgba(0,243,255,0.06)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">Pareamento de {pairingLabel}</p>
            {pairingConnection.pairingCode && <p className="mt-2 font-mono text-lg font-bold text-white">{pairingConnection.pairingCode}</p>}
            {pairingConnection.qrCodeDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img alt="QR code de conexao do WhatsApp" src={pairingConnection.qrCodeDataUrl} className="mt-3 h-44 w-44 rounded-lg border border-[var(--admin-border)] bg-white p-2" />
            )}
            {pairingConnection.qrCode && <p className="mt-2 break-all font-mono text-xs text-[var(--admin-muted)]">{pairingConnection.qrCode}</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PromptTab({
  agentName,
  companyName,
  config,
  setPrompt,
  status,
  updatedAt,
}: {
  agentName: string;
  companyName: string;
  config: WillianPromptConfig;
  setPrompt: (patch: Partial<WillianPromptConfig>) => void;
  status: WillianAgentConfig["status"];
  updatedAt: string;
}) {
  const charCount = config.agentPrompt.length;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title="Prompt do agente" eyebrow="Atendimento / vendas" action={<StatusPill ok={status === "saved"} label={status === "saved" ? "Salvo" : "Revisar"} />}>
        <div className="grid gap-3 lg:grid-cols-4">
          <InfoBox label="Agente" value={agentName} />
          <InfoBox label="Empresa" value={companyName} />
          <InfoBox label="Plano" value="internal / active" />
          <InfoBox label="Ultima edicao" value={formatDateTime(updatedAt) || "Pendente"} />
        </div>

        <div className="mt-4">
          <TextAreaField label="Prompt do agente" rows={14} value={config.agentPrompt} onChange={(value) => setPrompt({ agentPrompt: value })} />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            {charCount.toLocaleString("pt-BR")} / 8.000 caracteres
          </p>
        </div>

        <div className="mt-4 space-y-2">
          <PromptDrawer title="DNA manual do agente">
            <TextAreaField label="DNA manual" rows={5} value={config.dnaManual} onChange={(value) => setPrompt({ dnaManual: value })} />
          </PromptDrawer>
          <PromptDrawer title="Memoria do clone">
            <TextAreaField label="Memoria do clone" rows={5} value={config.cloneMemory} onChange={(value) => setPrompt({ cloneMemory: value })} />
          </PromptDrawer>
          <PromptDrawer title="Metrica de humanizacao">
            <TextAreaField label="Metrica de humanizacao" rows={4} value={config.humanizationMetric} onChange={(value) => setPrompt({ humanizationMetric: value })} />
          </PromptDrawer>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Tags do prompt</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {config.tags.map((tag) => (
              <span key={tag} className="rounded-md border border-[rgba(255,90,31,0.28)] bg-[rgba(255,90,31,0.08)] px-3 py-1.5 font-mono text-[10px] font-bold text-[var(--admin-cyan)]">
                {`{{${tag}}}`}
              </span>
            ))}
          </div>
          <div className="mt-3">
            <TextAreaField label="Editar tags" rows={3} value={config.tags.join(", ")} onChange={(value) => setPrompt({ tags: csvToArray(value) })} />
          </div>
        </div>
      </Panel>

      <Panel title="Links e botoes" eyebrow="Produto / rastreio">
        <ToggleTile title="Enviar como botao" detail="Usar botao quando o canal permitir." checked={config.sendButton} onChange={(sendButton) => setPrompt({ sendButton })} />
        <div className="mt-3 grid gap-3">
          <Field label="Nome do botao" value={config.buttonLabel} onChange={(buttonLabel) => setPrompt({ buttonLabel })} />
          <Field label="URL do botao" value={config.buttonUrl} onChange={(buttonUrl) => setPrompt({ buttonUrl })} />
          <Field label="Link do produto" value={config.productLink} onChange={(productLink) => setPrompt({ productLink })} />
          <TextAreaField label="Notas do produto" rows={5} value={config.productNotes} onChange={(productNotes) => setPrompt({ productNotes })} />
        </div>
      </Panel>
    </div>
  );
}

function QualificationTab({ config, setQualification }: { config: WillianQualificationConfig; setQualification: (patch: Partial<WillianQualificationConfig>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title="Qualificacao do lead" eyebrow="CRM / perguntas / score" action={<StatusPill ok={config.enabled} label={config.enabled ? "Ativa" : "Pausada"} />}>
        <ToggleTile title="Qualificacao ativa" detail="O agente deve pontuar o lead antes de distribuir oportunidade." checked={config.enabled} onChange={(enabled) => setQualification({ enabled })} />
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_140px_140px_140px]">
          <Field label="Produto ou oferta" value={config.product} onChange={(product) => setQualification({ product })} />
          <NumberField label="Qualificado" value={config.qualifiedScore} onChange={(qualifiedScore) => setQualification({ qualifiedScore })} />
          <NumberField label="VIP" value={config.vipScore} onChange={(vipScore) => setQualification({ vipScore })} />
          <NumberField label="Perguntas" value={config.questionsLimit} onChange={(questionsLimit) => setQualification({ questionsLimit })} />
        </div>
        <div className="mt-3">
          <TextAreaField label="Objetivo comercial" rows={5} value={config.commercialGoal} onChange={(commercialGoal) => setQualification({ commercialGoal })} />
        </div>
        <div className="mt-3">
          <ToggleTile title="Uma pergunta por vez" detail="Evita questionario longo e melhora resposta no WhatsApp." checked={config.oneQuestionAtATime} onChange={(oneQuestionAtATime) => setQualification({ oneQuestionAtATime })} />
        </div>
      </Panel>

      <Panel title="Playbook comercial" eyebrow="Sinais / regras">
        <TextAreaField label="Perguntas obrigatorias" rows={8} value={arrayToLines(config.mandatoryQuestions)} onChange={(value) => setQualification({ mandatoryQuestions: linesToArray(value) })} />
        <div className="mt-3">
          <TextAreaField label="Sinais de baixa qualificacao" rows={5} value={arrayToLines(config.lowQualificationSignals)} onChange={(value) => setQualification({ lowQualificationSignals: linesToArray(value) })} />
        </div>
        <div className="mt-3">
          <TextAreaField label="Regras de proximo passo" rows={5} value={arrayToLines(config.nextStepRules)} onChange={(value) => setQualification({ nextStepRules: linesToArray(value) })} />
        </div>
      </Panel>
    </div>
  );
}

function BehaviorTab({ config, setBehavior }: { config: WillianBehaviorConfig; setBehavior: (patch: Partial<WillianBehaviorConfig>) => void }) {
  const initialVoiceLoadRef = useRef(false);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceAction, setVoiceAction] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState("");
  const [voicePreviewUrl, setVoicePreviewUrl] = useState("");
  const [cloneName, setCloneName] = useState(config.selectedVoiceLabel || "Agente Betel");
  const [cloneDescription, setCloneDescription] = useState("Voz autorizada do agente de WhatsApp para atendimento Betel.");
  const [cloneFiles, setCloneFiles] = useState<File[]>([]);

  const filteredVoices = useMemo(() => {
    const query = config.voiceSearch.trim().toLowerCase();
    if (!query) return voices;

    return voices.filter((voice) => {
      const labels = Object.values(voice.labels || {}).join(" ");
      return `${voice.name} ${voice.category} ${voice.description} ${labels}`.toLowerCase().includes(query);
    });
  }, [config.voiceSearch, voices]);

  const selectedVoice = useMemo(
    () => voices.find((voice) => voice.voiceId === config.selectedVoiceId),
    [config.selectedVoiceId, voices]
  );

  const loadVoices = useCallback(async (syncConfiguredVoice = false) => {
    setVoiceLoading(true);
    setVoiceError("");
    try {
      const res = await fetch(WILLIAN_VOICE_ENDPOINT, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao buscar vozes ElevenLabs.");

      const nextVoices = Array.isArray(data.voices) ? data.voices as ElevenLabsVoice[] : [];
      setVoices(nextVoices);

      const configuredVoiceId = typeof data.config?.willianVoiceId === "string" ? data.config.willianVoiceId : "";
      const defaultModelId = typeof data.config?.defaultModelId === "string" ? data.config.defaultModelId : "";
      if (syncConfiguredVoice && configuredVoiceId && (!config.selectedVoiceId || config.selectedVoiceId === "clone-willian")) {
        const configuredVoice = nextVoices.find((voice) => voice.voiceId === configuredVoiceId);
        setBehavior({
          selectedVoiceId: configuredVoiceId,
          selectedVoiceLabel: configuredVoice?.name || "Voz Betel",
          audioVoiceSource: "elevenlabs",
          audioModelId: config.audioModelId || defaultModelId,
          voiceCloneStatus: "active",
        });
      } else if (defaultModelId && !config.audioModelId) {
        setBehavior({ audioModelId: defaultModelId });
      }
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Falha ao buscar vozes ElevenLabs.");
    } finally {
      setVoiceLoading(false);
    }
  }, [config.audioModelId, config.selectedVoiceId, setBehavior]);

  useEffect(() => {
    if (initialVoiceLoadRef.current) return;
    initialVoiceLoadRef.current = true;

    const timer = window.setTimeout(() => {
      void loadVoices(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadVoices]);

  async function selectVoice(voice: ElevenLabsVoice) {
    setVoiceAction(`select:${voice.voiceId}`);
    setVoiceError("");
    try {
      setBehavior({
        selectedVoiceId: voice.voiceId,
        selectedVoiceLabel: voice.name,
        audioVoiceSource: "elevenlabs",
        voiceCloneStatus: "active",
      });
      const res = await fetch(WILLIAN_VOICE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "select_willian_voice", voiceId: voice.voiceId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao vincular voz.");
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Falha ao vincular voz.");
    } finally {
      setVoiceAction(null);
    }
  }

  async function previewVoice() {
    setVoiceAction("preview");
    setVoiceError("");
    setVoicePreviewUrl("");
    try {
      const res = await fetch(WILLIAN_VOICE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "synthesize_preview",
          voiceId: config.selectedVoiceId,
          modelId: config.audioModelId,
          text: "Ola, aqui e a Betel. Estou validando a voz de atendimento.",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao gerar preview.");
      const audio = data.audio || {};
      if (!audio.audioBase64) throw new Error("Audio nao retornado pela ElevenLabs.");
      setVoicePreviewUrl(`data:${audio.contentType || "audio/mpeg"};base64,${audio.audioBase64}`);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Falha ao gerar preview.");
    } finally {
      setVoiceAction(null);
    }
  }

  async function cloneVoice() {
    setVoiceAction("clone");
    setVoiceError("");
    try {
      const form = new FormData();
      form.set("action", "clone_willian");
      form.set("name", cloneName);
      form.set("description", cloneDescription);
      form.set("authorized", String(config.voiceCloneConsent));
      cloneFiles.forEach((file) => form.append("files[]", file, file.name));

      const res = await fetch(WILLIAN_VOICE_ENDPOINT, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha ao clonar voz.");

      setBehavior({
        selectedVoiceId: String(data.voiceId || ""),
        selectedVoiceLabel: cloneName,
        voiceCloneEnabled: true,
        voiceCloneStatus: data.requiresVerification ? "testing" : "active",
        audioVoiceSource: "elevenlabs_clone",
        audioModelId: config.audioModelId || "eleven_multilingual_v2",
      });
      setCloneFiles([]);
      await loadVoices(false);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : "Falha ao clonar voz.");
    } finally {
      setVoiceAction(null);
    }
  }

  function setToggle(key: BehaviorToggleKey, checked: boolean) {
    setBehavior({ [key]: checked } as Partial<WillianBehaviorConfig>);
  }

  function setNumber(key: BehaviorNumberKey, value: number) {
    setBehavior({ [key]: value } as Partial<WillianBehaviorConfig>);
  }

  return (
    <div className="space-y-5">
      <Panel
        title="Base do agente"
        eyebrow="Presenca / resposta"
        action={<BehaviorIcon icon={<SlidersHorizontal size={15} />} label={config.active ? "Ativo" : "Pausado"} />}
      >
        <div className="grid gap-3 md:grid-cols-3">
          <ToggleTile title="Agente ativo" detail="Permite atendimento automatico quando runtime for liberado." checked={config.active} onChange={(active) => setBehavior({ active })} />
          <ToggleTile title="Marcar como lido" detail="Usado na entrega ConnectyHub quando aplicavel." checked={config.cloneStyle} onChange={(cloneStyle) => setBehavior({ cloneStyle })} />
          <ToggleTile title="Dividir respostas" detail="Mensagens curtas e naturais." checked={config.splitReplies} onChange={(splitReplies) => setBehavior({ splitReplies })} />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <SegmentedField
            label="Presenca"
            value={config.presenceMode}
            options={[
              ["reply_only", "So responder"],
              ["natural", "Natural"],
              ["always_online", "Online"],
            ]}
            onChange={(presenceMode) => setBehavior({ presenceMode: presenceMode as WillianBehaviorConfig["presenceMode"] })}
          />
          <SelectField
            label="Modo de conversa"
            value={config.conversationMode}
            options={[
              ["always_text", "Sempre texto"],
              ["always_audio", "Sempre audio"],
              ["mirror", "Espelho"],
              ["prompt", "Segue prompt"],
            ]}
            onChange={(conversationMode) => setBehavior({ conversationMode: conversationMode as WillianBehaviorConfig["conversationMode"] })}
          />
          <SelectField label="Disponibilidade" value={config.availability} options={[["business_hours", "Janela Betel"], ["always", "Sempre online"]]} onChange={(availability) => setBehavior({ availability: availability as WillianBehaviorConfig["availability"] })} />
        </div>
        <div className="mt-4">
          <SegmentedField
            label="Rapport adaptativo"
            value={config.rapport}
            options={[
              ["disabled", "Desligado"],
              ["suave", "Suave"],
              ["forte", "Forte"],
            ]}
            onChange={(rapport) => setBehavior({ rapport: rapport as WillianBehaviorConfig["rapport"] })}
          />
        </div>
      </Panel>

      <Panel
        title="Voz do agente"
        eyebrow="Clone / ElevenLabs / preview"
        action={<BehaviorIcon icon={<Mic2 size={15} />} label={voiceCloneStatusLabels[config.voiceCloneStatus]} />}
      >
        <div className="grid gap-3 xl:grid-cols-4">
          <Field label="Provedor de voz" value={config.voiceProvider} onChange={(voiceProvider) => setBehavior({ voiceProvider })} />
          <SelectField
            label="Status do clone"
            value={config.voiceCloneStatus}
            options={[
              ["inactive", "Inativo"],
              ["testing", "Teste ativo"],
              ["active", "Ativo"],
            ]}
            onChange={(voiceCloneStatus) => setBehavior({ voiceCloneStatus: voiceCloneStatus as WillianBehaviorConfig["voiceCloneStatus"] })}
          />
          <Field label="Voz selecionada" value={config.selectedVoiceLabel} onChange={(selectedVoiceLabel) => setBehavior({ selectedVoiceLabel })} />
          <Field label="Buscar voz" value={config.voiceSearch} onChange={(voiceSearch) => setBehavior({ voiceSearch })} placeholder="Nome, categoria ou tipo" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <ToggleTile title="Clone de voz" detail="Libera uso da voz clonada do agente." checked={config.voiceCloneEnabled} onChange={(voiceCloneEnabled) => setBehavior({ voiceCloneEnabled })} />
          <ToggleTile title="Consentimento do clone" detail="Marca que a voz foi autorizada." checked={config.voiceCloneConsent} onChange={(voiceCloneConsent) => setBehavior({ voiceCloneConsent })} />
          <ToggleTile title="Preview de audio" detail="Mostra player de teste antes de salvar." checked={config.audioPreviewEnabled} onChange={(audioPreviewEnabled) => setBehavior({ audioPreviewEnabled })} />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <Field label="Origem da voz" value={config.audioVoiceSource} onChange={(audioVoiceSource) => setBehavior({ audioVoiceSource })} placeholder="manual, clone, public" />
          <Field label="Modelo de audio" value={config.audioModelId} onChange={(audioModelId) => setBehavior({ audioModelId })} placeholder="eleven_multilingual_v2" />
          <Field label="Owner publico" value={config.audioVoicePublicOwnerId} onChange={(audioVoicePublicOwnerId) => setBehavior({ audioVoicePublicOwnerId })} />
        </div>
        <div className="mt-4 rounded-xl border border-[var(--admin-border)] bg-[#050505] p-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Biblioteca ElevenLabs</p>
              <p className="mt-1 text-sm text-[var(--admin-muted)]">
                {voiceLoading ? "Carregando vozes..." : `${filteredVoices.length} voz(es) exibida(s)`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                icon={<RefreshCw size={14} />}
                label="Atualizar vozes"
                loading={voiceLoading}
                onClick={() => void loadVoices(false)}
              />
              <ActionButton
                icon={<Radio size={14} />}
                label="Testar voz"
                loading={voiceAction === "preview"}
                disabled={!config.selectedVoiceId || config.selectedVoiceId === "clone-willian"}
                onClick={() => void previewVoice()}
              />
            </div>
          </div>

          {voiceError && (
            <div className="mt-3 rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-[var(--admin-red)]">
              {voiceError}
            </div>
          )}

          <div className="mt-3 grid max-h-72 gap-2 overflow-y-auto pr-1">
            {filteredVoices.length ? (
              filteredVoices.map((voice) => (
                <VoiceCard
                  key={voice.voiceId}
                  active={config.selectedVoiceId === voice.voiceId}
                  detail={voice.description || [voice.category, Object.values(voice.labels || {}).join(" / ")].filter(Boolean).join(" / ") || voice.voiceId}
                  label={voice.name}
                  loading={voiceAction === `select:${voice.voiceId}`}
                  status={config.selectedVoiceId === voice.voiceId ? "Selecionada" : voice.category || "ElevenLabs"}
                  onClick={() => void selectVoice(voice)}
                />
              ))
            ) : (
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
                {voiceLoading ? "Buscando vozes..." : "Nenhuma voz encontrada. Confira o token na Sala de Manutencao."}
              </div>
            )}
          </div>
        </div>
        {config.audioPreviewEnabled && (
          <div className="mt-4 rounded-lg border border-[var(--admin-border)] bg-[#050505] px-4 py-3">
            {voicePreviewUrl ? (
              <audio controls src={voicePreviewUrl} className="h-10 w-full" />
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted)]">
                <BehaviorIcon icon={<Radio size={14} />} label="Preview" />
                <span className="font-semibold text-white">{selectedVoice?.name || config.selectedVoiceLabel}</span>
                <span>Use o botao Testar voz para gerar uma amostra.</span>
              </div>
            )}
          </div>
        )}
        <div className="mt-4 rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="grid gap-3 xl:grid-cols-[0.8fr_1.2fr]">
            <Field label="Nome do clone" value={cloneName} onChange={setCloneName} />
            <TextAreaField label="Descricao do clone" rows={2} value={cloneDescription} onChange={setCloneDescription} />
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
            <label className="grid gap-1">
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Amostras de audio autorizadas</span>
              <input
                type="file"
                accept="audio/*"
                multiple
                onChange={(event) => setCloneFiles(Array.from(event.target.files || []))}
                className="block h-10 w-full cursor-pointer rounded-lg border border-[var(--admin-border)] bg-[#050505] text-xs text-[var(--admin-muted)] file:mr-3 file:h-10 file:border-0 file:bg-[rgba(0,243,255,0.12)] file:px-3 file:text-xs file:font-bold file:text-[var(--admin-cyan)]"
              />
            </label>
            <ActionButton
              icon={<Paperclip size={14} />}
              label="Clonar voz"
              loading={voiceAction === "clone"}
              disabled={!config.voiceCloneConsent || cloneFiles.length === 0}
              onClick={() => void cloneVoice()}
            />
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
            {cloneFiles.length ? cloneFiles.map((file) => file.name).join(", ") : "O clone exige confirmacao de consentimento e amostras autorizadas do titular da voz."}
          </p>
        </div>
      </Panel>

      <Panel
        title="Simulacao humana"
        eyebrow="Linguagem / ritmo / memoria"
        action={<BehaviorIcon icon={<Smile size={15} />} label={`${humanSimulationToggles.filter((item) => config[item.key]).length} ativos`} />}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {humanSimulationToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {humanNumberFields.map((field) => (
            <NumberField
              key={field.key}
              label={field.label}
              value={config[field.key]}
              onChange={(value) => setNumber(field.key, value)}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Seguranca e testes"
        eyebrow="Humano / QA / responsaveis"
        action={<BehaviorIcon icon={<ShieldCheck size={15} />} label={config.humanIntervention ? "Humano ativo" : "Auto"} />}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {securityToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1.5fr_0.5fr]">
          <TextAreaField label="Numeros responsaveis" rows={3} value={config.responsibleNumbers} onChange={(responsibleNumbers) => setBehavior({ responsibleNumbers })} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <NumberField label="Cooldown (min)" value={config.cooldownMinutes} onChange={(cooldownMinutes) => setBehavior({ cooldownMinutes })} />
            <NumberField label="Max mensagens" value={config.maxMessagesPerConversation} onChange={(maxMessagesPerConversation) => setBehavior({ maxMessagesPerConversation })} />
          </div>
        </div>
      </Panel>

      <Panel
        title="Grupos, status e canais"
        eyebrow="Multicanal / campanhas"
        action={<BehaviorIcon icon={<Users size={15} />} label={groupReplyModeLabels[config.groupReplyMode]} />}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {groupToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <SelectField
            label="Responder em grupos"
            value={config.groupReplyMode}
            options={[
              ["all", "Todos"],
              ["mentions", "Mencoes"],
              ["admins", "Admins"],
            ]}
            onChange={(groupReplyMode) => setBehavior({ groupReplyMode: groupReplyMode as WillianBehaviorConfig["groupReplyMode"] })}
          />
          <NumberField label="Max status" value={config.maxStatuses} onChange={(maxStatuses) => setBehavior({ maxStatuses })} />
          <NumberField label="Lote campanha" value={config.campaignBatchSize} onChange={(campaignBatchSize) => setBehavior({ campaignBatchSize })} />
          <NumberField label="Delay min (s)" value={config.minDelaySeconds} onChange={(minDelaySeconds) => setBehavior({ minDelaySeconds })} />
          <NumberField label="Delay max (s)" value={config.maxDelaySeconds} onChange={(maxDelaySeconds) => setBehavior({ maxDelaySeconds })} />
        </div>
      </Panel>

      <Panel
        title="Gatilhos especiais do lead"
        eyebrow="CRM / eventos / score"
        action={<BehaviorIcon icon={<Activity size={15} />} label={specialTriggerModeLabels[config.specialTriggerMode]} />}
      >
        <div className="grid gap-3 xl:grid-cols-2">
          <SegmentedField
            label="Modo dos gatilhos"
            value={config.specialTriggerMode}
            options={[
              ["disabled", "Desligado"],
              ["smart", "Inteligente"],
              ["always", "Sempre"],
            ]}
            onChange={(specialTriggerMode) => setBehavior({ specialTriggerMode: specialTriggerMode as WillianBehaviorConfig["specialTriggerMode"] })}
          />
          <SegmentedField
            label="Citar mensagens"
            value={config.quoteReplyMode}
            options={[
              ["off", "Desligado"],
              ["smart", "Inteligente"],
              ["always", "Sempre"],
            ]}
            onChange={(quoteReplyMode) =>
              setBehavior({
                quoteReplyMode: quoteReplyMode as WillianBehaviorConfig["quoteReplyMode"],
                quotedReplyContext: quoteReplyMode !== "off",
              })
            }
          />
        </div>
        <p className="mt-3 text-xs text-[var(--admin-muted)]">
          {quoteReplyModeLabels[config.quoteReplyMode]}
        </p>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {leadTriggerToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Follow-up e janela de IA"
        eyebrow="Proativo / horarios"
        action={<BehaviorIcon icon={<Clock3 size={15} />} label={config.followUpEnabled ? "Follow-up" : "Manual"} />}
      >
        <div className="grid gap-3 md:grid-cols-4">
          <ToggleTile title="Follow-up automatico" detail="Retorno supervisionado quando o lead esfriar." checked={config.followUpEnabled} onChange={(followUpEnabled) => setBehavior({ followUpEnabled })} />
          <ToggleTile title="Janela da IA ativa" detail="Controla envio dentro da janela." checked={config.aiWindowActive} onChange={(aiWindowActive) => setBehavior({ aiWindowActive })} />
          <ToggleTile title="Memoria do lead" detail="Mantem preferencias e historico." checked={config.leadMemory} onChange={(leadMemory) => setBehavior({ leadMemory })} />
          <ToggleTile title="Memoria do clone" detail="Preserva padrao do agente." checked={config.cloneMemory} onChange={(cloneMemory) => setBehavior({ cloneMemory })} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <NumberField label="Delay follow-up (min)" value={config.followUpDelayMinutes} onChange={(followUpDelayMinutes) => setBehavior({ followUpDelayMinutes })} />
          <NumberField label="Max follow-ups" value={config.maxFollowUps} onChange={(maxFollowUps) => setBehavior({ maxFollowUps })} />
          <Field label="Inicio follow-up" value={config.followUpWindowStart} onChange={(followUpWindowStart) => setBehavior({ followUpWindowStart })} />
          <Field label="Fim follow-up" value={config.followUpWindowEnd} onChange={(followUpWindowEnd) => setBehavior({ followUpWindowEnd })} />
          <Field label="Inicio IA" value={config.quietHoursStart} onChange={(quietHoursStart) => setBehavior({ quietHoursStart })} />
          <Field label="Fim IA" value={config.quietHoursEnd} onChange={(quietHoursEnd) => setBehavior({ quietHoursEnd })} />
          <Field label="Fuso horario" value={config.timezone} onChange={(timezone) => setBehavior({ timezone })} />
        </div>
      </Panel>

      <Panel
        title="Protecoes de contexto"
        eyebrow="Anti erro / seguranca"
        action={<BehaviorIcon icon={<ShieldCheck size={15} />} label={`${protectionToggles.filter((item) => config[item.key]).length} protecoes`} />}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {protectionToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Audio e midia com IA"
        eyebrow="Analise / anexos / arquivos"
        action={<BehaviorIcon icon={<ImageIcon size={15} />} label={`${config.imageAnalysisLimit} imgs`} />}
      >
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {mediaToggles.map((item) => (
            <CompactToggle
              key={item.key}
              checked={config[item.key]}
              detail={item.detail}
              onChange={(checked) => setToggle(item.key, checked)}
              title={item.title}
            />
          ))}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <NumberField label="Limite imagens" value={config.imageAnalysisLimit} onChange={(imageAnalysisLimit) => setBehavior({ imageAnalysisLimit })} />
          <NumberField label="Limite videos" value={config.videoAnalysisLimit} onChange={(videoAnalysisLimit) => setBehavior({ videoAnalysisLimit })} />
          <NumberField label="Limite documentos" value={config.documentAnalysisLimit} onChange={(documentAnalysisLimit) => setBehavior({ documentAnalysisLimit })} />
        </div>
      </Panel>

      <Panel
        title="Temporizadores"
        eyebrow="Resposta por tipo de mensagem"
        action={<BehaviorIcon icon={<Timer size={15} />} label={config.smartTiming ? "Smart timing" : "Manual"} />}
      >
        <ToggleTile title="Temporizacao inteligente" detail="Ajusta delays pelo tipo de evento e urgencia." checked={config.smartTiming} onChange={(smartTiming) => setBehavior({ smartTiming })} />
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {timingFields.map((field) => (
            <NumberField
              key={field.key}
              label={field.label}
              value={config[field.key]}
              onChange={(value) => setNumber(field.key, value)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function MultichannelTab({ config, setMultichannel }: { config: WillianMultichannelConfig; setMultichannel: (patch: Partial<WillianMultichannelConfig>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <Panel title="Operacao multicanal" eyebrow="Grupos / status / canais / campanhas">
        <div className="grid gap-3 md:grid-cols-4">
          <ChannelStatus label="Grupos" value={config.groupStatus} />
          <ChannelStatus label="Status" value={config.statusStatus} />
          <ChannelStatus label="Canais" value={config.channelsStatus} />
          <ChannelStatus label="Campanhas" value={config.campaignsStatus} />
        </div>
        <div className="mt-4 grid gap-3">
          <Field label="Agendar para" value={config.scheduleAt} onChange={(scheduleAt) => setMultichannel({ scheduleAt })} placeholder="dd/mm/aaaa --:--" />
          <TextAreaField label="Status WhatsApp" rows={5} value={config.whatsappStatusText} onChange={(whatsappStatusText) => setMultichannel({ whatsappStatusText })} />
        </div>
      </Panel>

      <Panel title="Campanha simples" eyebrow="Envio futuro supervisionado">
        <Field label="Nome da campanha" value={config.campaignName} onChange={(campaignName) => setMultichannel({ campaignName })} />
        <div className="mt-3">
          <TextAreaField label="Destinatarios" rows={5} value={config.campaignRecipients} onChange={(campaignRecipients) => setMultichannel({ campaignRecipients })} />
        </div>
        <div className="mt-3">
          <TextAreaField label="Mensagem da campanha" rows={6} value={config.campaignMessage} onChange={(campaignMessage) => setMultichannel({ campaignMessage })} />
        </div>
        <div className="mt-3">
          <Field label="Canal / newsletter" value={config.newsletterChannel} onChange={(newsletterChannel) => setMultichannel({ newsletterChannel })} />
        </div>
        <div className="mt-3">
          <TextAreaField label="Texto para canal" rows={5} value={config.newsletterMessage} onChange={(newsletterMessage) => setMultichannel({ newsletterMessage })} />
        </div>
      </Panel>
    </div>
  );
}

function FilesTab({
  config,
  memory,
  setFiles,
  setMemory,
}: {
  config: WillianFilesConfig;
  memory: WillianMemoryConfig;
  setFiles: (patch: Partial<WillianFilesConfig>) => void;
  setMemory: (patch: Partial<WillianMemoryConfig>) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Panel title="Arquivos da empresa" eyebrow="Base de conhecimento" action={<StatusPill ok={config.uploadEnabled} label={`${config.companyFiles.length} arquivos`} />}>
          <ToggleTile title="Upload habilitado" detail="Pode anexar documentos quando storage for ligado." checked={config.uploadEnabled} onChange={(uploadEnabled) => setFiles({ uploadEnabled })} />
          <div className="mt-4 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
            {config.companyFiles.length ? (
              <ul className="space-y-2">
                {config.companyFiles.map((file) => (
                  <li key={file} className="flex items-center gap-2 text-sm text-[var(--admin-muted)]">
                    <Paperclip size={14} className="text-[var(--admin-cyan)]" />
                    {file}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--admin-muted)]">Nenhum arquivo anexado.</p>
            )}
          </div>
        </Panel>

        <Panel title="Conhecimento operacional" eyebrow="Notas / arquivos planejados">
          <TextAreaField label="Notas da base de conhecimento" rows={8} value={config.knowledgeNotes} onChange={(knowledgeNotes) => setFiles({ knowledgeNotes })} />
          <div className="mt-3">
            <TextAreaField label="Lista de arquivos" rows={8} value={arrayToLines(config.companyFiles)} onChange={(value) => setFiles({ companyFiles: linesToArray(value) })} />
          </div>
        </Panel>
      </div>

      <MemoryTab config={memory} setMemory={setMemory} />
    </div>
  );
}

function MemoryTab({ config, setMemory }: { config: WillianMemoryConfig; setMemory: (patch: Partial<WillianMemoryConfig>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel title="Memoria e CRM" eyebrow="Leads / tags / historico" action={<StatusPill ok={config.crmEnabled} label={config.crmEnabled ? "CRM ativo" : "CRM pausado"} />}>
        <div className="grid gap-3 md:grid-cols-2">
          <ToggleTile title="CRM ativo" detail="Salva lead, conversa, mensagens e eventos." checked={config.crmEnabled} onChange={(crmEnabled) => setMemory({ crmEnabled })} />
          <ToggleTile title="Historico completo" detail="Mantem trilha da conversa no arquivo do lead." checked={config.saveConversationHistory} onChange={(saveConversationHistory) => setMemory({ saveConversationHistory })} />
          <ToggleTile title="Tags do lead" detail="Permite classificar momento e prioridade." checked={config.saveLeadTags} onChange={(saveLeadTags) => setMemory({ saveLeadTags })} />
          <ToggleTile title="Resumo automatico" detail="Atualiza memoria operacional do lead." checked={config.autoSummaries} onChange={(autoSummaries) => setMemory({ autoSummaries })} />
        </div>
        <div className="mt-4">
          <TextAreaField label="Notas de memoria" rows={8} value={config.memoryNotes} onChange={(memoryNotes) => setMemory({ memoryNotes })} />
        </div>
      </Panel>

      <Panel title="Regras de lead" eyebrow="Stop words / handoff / eventos">
        <div className="grid gap-3 md:grid-cols-2">
          <TextAreaField label="Tags possiveis" rows={6} value={arrayToLines(config.leadTags)} onChange={(value) => setMemory({ leadTags: linesToArray(value) })} />
          <TextAreaField label="Stop words" rows={6} value={arrayToLines(config.stopWords)} onChange={(value) => setMemory({ stopWords: linesToArray(value) })} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextAreaField label="Eventos importantes" rows={7} value={arrayToLines(config.importantEvents)} onChange={(value) => setMemory({ importantEvents: linesToArray(value) })} />
          <TextAreaField label="Regras de handoff" rows={7} value={arrayToLines(config.handoffRules)} onChange={(value) => setMemory({ handoffRules: linesToArray(value) })} />
        </div>
      </Panel>
    </div>
  );
}

function PromptDrawer({ children, title }: { children: ReactNode; title: string }) {
  return (
    <details className="group rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white">{title}</span>
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)] group-open:hidden">Abrir</span>
        <span className="hidden font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)] group-open:inline">Fechar</span>
      </summary>
      <div className="border-t border-[var(--admin-border)] p-4">{children}</div>
    </details>
  );
}

function Panel({ action, children, eyebrow, title }: { action?: ReactNode; children: ReactNode; eyebrow: string; title: string }) {
  return (
    <div className="rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-muted)]">{eyebrow}</p>
          <h4 className="mt-1 font-semibold text-white">{title}</h4>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, onChange, placeholder, value }: { label: string; onChange: (value: string) => void; placeholder?: string; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 rounded-lg border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)]"
      />
    </label>
  );
}

function TextAreaField({ label, onChange, rows, value }: { label: string; onChange: (value: string) => void; rows: number; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className="w-full rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3 text-sm leading-6 text-white outline-none transition focus:border-[var(--admin-cyan)]"
      />
    </label>
  );
}

function NumberField({ label, onChange, value }: { label: string; onChange: (value: number) => void; value: number }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(safeNumber(event.target.value, value))}
        inputMode="numeric"
        className="h-10 rounded-lg border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)]"
      />
    </label>
  );
}

function SelectField({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string, string]>; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-lg border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)]"
      >
        {options.map(([optionValue, labelText]) => (
          <option key={optionValue} value={optionValue}>{labelText}</option>
        ))}
      </select>
    </label>
  );
}

function SegmentedField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div className="grid gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-1 sm:grid-cols-3">
        {options.map(([optionValue, labelText]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={cn(
              "min-h-9 rounded-md px-3 text-xs font-bold text-[var(--admin-muted)] transition",
              value === optionValue
                ? "bg-[rgba(0,243,255,0.13)] text-[var(--admin-cyan)] shadow-[0_0_0_1px_rgba(0,243,255,0.2)]"
                : "hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
            )}
          >
            {labelText}
          </button>
        ))}
      </div>
    </div>
  );
}

function BehaviorIcon({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-border)] bg-[#050505] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-cyan)]">
      {icon}
      {label}
    </span>
  );
}

function CompactToggle({ checked, detail, onChange, title }: { checked: boolean; detail: string; onChange: (checked: boolean) => void; title: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-16 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition",
        checked
          ? "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.075)]"
          : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.018)] hover:border-[rgba(255,255,255,0.18)]"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-white">{title}</span>
        <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-[var(--admin-muted)]">{detail}</span>
      </span>
      <span className={cn("h-5 w-9 shrink-0 rounded-full border p-0.5 transition", checked ? "border-[rgba(0,243,255,0.45)] bg-[rgba(0,243,255,0.25)]" : "border-[var(--admin-border)] bg-black")}>
        <span className={cn("block size-3.5 rounded-full transition", checked ? "translate-x-4 bg-[var(--admin-cyan)]" : "bg-[var(--admin-muted)]")} />
      </span>
    </button>
  );
}

function VoiceCard({
  active,
  detail,
  label,
  loading = false,
  onClick,
  status,
}: {
  active: boolean;
  detail: string;
  label: string;
  loading?: boolean;
  onClick: () => void;
  status: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left transition",
        active
          ? "border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.08)]"
          : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.18)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{label}</p>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>
        </div>
        <span className="rounded-full border border-[rgba(229,178,74,0.24)] bg-[rgba(229,178,74,0.08)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--admin-yellow)]">
          {loading ? <Loader2 size={12} className="animate-spin" /> : status}
        </span>
      </div>
    </button>
  );
}

function ToggleTile({ checked, detail, onChange, title }: { checked: boolean; detail: string; onChange: (checked: boolean) => void; title: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-20 items-start justify-between gap-3 rounded-lg border p-3 text-left transition",
        checked
          ? "border-[rgba(0,243,255,0.25)] bg-[rgba(0,243,255,0.08)]"
          : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.18)]"
      )}
    >
      <span>
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-[var(--admin-muted)]">{detail}</span>
      </span>
      <span className={cn("mt-0.5 h-5 w-9 rounded-full border p-0.5 transition", checked ? "border-[rgba(0,243,255,0.45)] bg-[rgba(0,243,255,0.25)]" : "border-[var(--admin-border)] bg-black")}>
        <span className={cn("block size-3.5 rounded-full transition", checked ? "translate-x-4 bg-[var(--admin-cyan)]" : "bg-[var(--admin-muted)]")} />
      </span>
    </button>
  );
}

function WhatsappProfileAvatar({ connected, imageUrl, label }: { connected: boolean; imageUrl?: string; label: string }) {
  if (imageUrl) {
    return (
      <div className="relative size-14 overflow-hidden rounded-xl border border-[rgba(0,243,255,0.28)] bg-[#050505]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={`Foto do WhatsApp ${label}`} src={imageUrl} className="size-full object-cover" />
        <span
          className={cn(
            "absolute bottom-1 right-1 size-2.5 rounded-full border border-black",
            connected ? "bg-[var(--admin-green)]" : "bg-[var(--admin-yellow)]"
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex size-14 items-center justify-center rounded-xl border",
        connected
          ? "border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.1)] text-[var(--admin-green)]"
          : "border-[rgba(234,179,8,0.35)] bg-[rgba(234,179,8,0.09)] text-[var(--admin-yellow)]"
      )}
    >
      <Phone size={22} />
    </div>
  );
}

function InfoBox({ label, tone = "muted", value }: { label: string; tone?: "green" | "yellow" | "muted"; value: string }) {
  const toneClass = tone === "green" ? "text-[var(--admin-green)]" : tone === "yellow" ? "text-[var(--admin-yellow)]" : "text-white";
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

function MiniKpi({ label, tone, value }: { label: string; tone: "cyan" | "green" | "purple" | "yellow"; value: string }) {
  const toneClass: Record<typeof tone, string> = {
    cyan: "text-[var(--admin-cyan)]",
    green: "text-[var(--admin-green)]",
    purple: "text-[var(--admin-purple)]",
    yellow: "text-[var(--admin-yellow)]",
  };
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] p-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-2 text-2xl font-bold", toneClass[tone])}>{value}</p>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em]", ok ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]" : "border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] text-[var(--admin-yellow)]")}>
      <span className={cn("size-1.5 rounded-full", ok ? "bg-[var(--admin-green)]" : "bg-[var(--admin-yellow)]")} />
      {label}
    </span>
  );
}

function ActionButton({
  disabled,
  icon,
  label,
  loading,
  onClick,
  tone = "default",
}: {
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  loading?: boolean;
  onClick: () => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-45",
        tone === "danger"
          ? "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] hover:border-[var(--admin-red)]"
          : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] hover:border-[var(--admin-cyan)]"
      )}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}

function ChannelStatus({ label, value }: { label: string; value: "paused" | "enabled" | "blocked" }) {
  const labels = { paused: "Pausado", enabled: "Liberado", blocked: "Bloqueado" };
  const ok = value === "enabled";
  const blocked = value === "blocked";
  return (
    <div className={cn("rounded-lg border p-3", ok ? "border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)]" : blocked ? "border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)]" : "border-[rgba(234,179,8,0.25)] bg-[rgba(234,179,8,0.08)]")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-2 font-semibold", ok ? "text-[var(--admin-green)]" : blocked ? "text-[var(--admin-red)]" : "text-[var(--admin-yellow)]")}>{labels[value]}</p>
    </div>
  );
}
