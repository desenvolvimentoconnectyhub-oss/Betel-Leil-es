"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  Database,
  FileText,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Mic2,
  Paperclip,
  Phone,
  QrCode,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Timer,
  Trash2,
  Unplug,
  Users,
  Webhook,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_WILLIAN_AGENT_CONFIG,
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
  { key: "memory", label: "Memoria/CRM", subtitle: "Leads e eventos", icon: Database },
];

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

const voiceOptions = [
  { id: "clone-willian", label: "Clone Willian", detail: "Voz principal para envio consultivo.", status: "Pronto" },
  { id: "willian-neutro", label: "Willian neutro", detail: "Tom mais direto para resumo de oportunidade.", status: "Backup" },
  { id: "willian-alerta", label: "Willian alerta", detail: "Usar em leads urgentes e leiloes proximos.", status: "Teste" },
];

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
  { key: "cloneConsistency", title: "Memoria do clone", detail: "Mantem tom do Willian." },
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
  const [instanceName, setInstanceName] = useState(initialState?.instanceName || "willian-betel");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [connection, setConnection] = useState<WillianConnectionInfo | null>(null);
  const [operationResult, setOperationResult] = useState<Record<string, unknown> | null>(null);

  const connected = Boolean(state.status?.connected || state.status?.loggedIn);
  useEffect(() => {
    if (!connection || connected) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

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

        setState(nextState);
        if (nextState.status?.connected || nextState.status?.loggedIn) {
          setConnection(null);
          setFeedback({ type: "ok", msg: "WhatsApp conectado. Numero, nome e foto sincronizados." });
          return;
        }
      } catch {
        // Keep the QR flow quiet while the user is scanning.
      }

      if (!cancelled && attempts < 15) {
        timer = window.setTimeout(pollStatus, 4000);
      }
    }

    timer = window.setTimeout(pollStatus, 3500);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [connected, connection]);

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
        body: JSON.stringify(config),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        setFeedback({ type: "err", msg: result.error || "Nao foi possivel salvar o comportamento." });
      } else {
        setConfig(result.data.config);
        setFeedback({ type: "ok", msg: "Configuracao do Willian salva." });
      }
    } catch {
      setFeedback({ type: "err", msg: "Falha de rede ao salvar o Willian." });
    } finally {
      setSavingConfig(false);
    }
  }

  async function runInstanceAction(action: string) {
    const confirmations: Record<string, string> = {
      disconnect: "Desconectar este WhatsApp? Sera necessario gerar um novo QR Code para reconectar.",
      deleteInstance: "Excluir a instancia do Willian na ConnectyHub? Use apenas quando quiser recriar o vinculo.",
      reset: "Reiniciar o runtime da instancia na ConnectyHub?",
    };
    if (confirmations[action] && !window.confirm(confirmations[action])) return;

    setLoading(action);
    setFeedback(null);
    setOperationResult(null);
    if (action === "connect" || action === "generateQr") setConnection(null);
    try {
      const res = await fetch("/api/admin/agentes-ia/communication/willian-instance", {
        body: JSON.stringify({
          action,
          instanceName,
          phone,
          browser: "auto",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const result = await res.json();
      const nextState = result?.data?.state || result?.data?.data?.state;
      if (nextState) setState(nextState);
      const nextConnection = result?.data?.result?.connection || result?.data?.result?.connect?.connection;
      if (nextConnection) setConnection(nextConnection);
      if (result?.data?.result) setOperationResult(result.data.result as Record<string, unknown>);
      if (!res.ok || !result.success) {
        setFeedback({ type: "err", msg: result.error || "Nao foi possivel operar a instancia." });
      } else {
        const labels: Record<string, string> = {
          create: "Instancia criada ou atualizada.",
          generateQr: nextConnection
            ? "QR Code gerado. Escaneie pelo WhatsApp para conectar o Willian."
            : "Fluxo executado, mas a ConnectyHub nao retornou QR Code nesta tentativa.",
          connect: "Ciclo de conexao iniciado.",
          status: "Status atualizado.",
          configureWebhook: "Webhook configurado.",
          testWebhook: "Teste de webhook disparado pela ConnectyHub.",
          webhookDeliveries: "Entregas recentes carregadas.",
          syncOverview: "Dados sincronizados da ConnectyHub carregados.",
          disconnect: "Instancia desconectada. Gere um novo QR Code para reconectar.",
          reset: "Reset solicitado para a instancia.",
          deleteInstance: "Instancia excluida e vinculo local limpo.",
        };
        setFeedback({ type: "ok", msg: labels[action] || "Acao concluida." });
      }
    } catch {
      setFeedback({ type: "err", msg: "Falha de rede ao falar com a rota do Willian." });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="mt-6 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)]">
      <div className="border-b border-[var(--admin-border)] bg-[linear-gradient(120deg,rgba(0,243,255,0.08),rgba(229,178,74,0.05),rgba(255,255,255,0.02))] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-cyan)]">
              Agentes / WhatsApp comercial
            </p>
            <h3 className="mt-1 text-xl font-bold text-white">Conexao, prompt e comportamento</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Willian distribui oportunidades por WhatsApp e email, qualifica investidores e registra historico para o CRM da Betel.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill ok={connected} label={connected ? "WhatsApp online" : "WhatsApp pendente"} />
            <StatusPill ok={config.status === "saved"} label={config.status === "saved" ? "Salvo" : "Alteracoes"} />
            <ActionButton
              icon={<Save size={14} />}
              label="Salvar tudo"
              loading={savingConfig}
              onClick={saveConfig}
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[1.5fr_1fr]">
          <div className="grid gap-3 md:grid-cols-2">
            <AgentCard active title="Willian" detail="Betel / Distribuicao WhatsApp e Email" status={config.behavior.active ? "ABERTO" : "RASCUNHO"} />
            <AgentCard title="Novo agente" detail="Atendimento WhatsApp futuro" status="EM BREVE" disabled />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniKpi label="Pronto" value={`${readyScore}%`} tone={readyScore >= 70 ? "green" : "yellow"} />
            <MiniKpi label="Score VIP" value={`${config.qualification.vipScore}+`} tone="cyan" />
            <MiniKpi label="Perguntas" value={String(config.qualification.questionsLimit)} tone="purple" />
          </div>
        </div>
      </div>

      <div className="border-b border-[var(--admin-border)] p-4">
        <div className="grid gap-3 lg:grid-cols-5">
          <InfoBox label="Agente" value="Willian" />
          <InfoBox label="Empresa" value={config.companyName} />
          <InfoBox label="WhatsApp" value={connected ? "conectado" : "pendente"} tone={connected ? "green" : "yellow"} />
          <InfoBox label="Conversa" value={conversationModeLabels[config.behavior.conversationMode]} />
          <InfoBox label="Alteracoes" value={config.status === "saved" ? "Salvo" : "Revisar"} tone={config.status === "saved" ? "green" : "yellow"} />
        </div>
      </div>

      <div className="grid border-b border-[var(--admin-border)] lg:grid-cols-7">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex min-h-16 items-center gap-3 border-b border-[var(--admin-border)] px-4 py-3 text-left transition lg:border-b-0 lg:border-r",
                active
                  ? "bg-[rgba(0,243,255,0.1)] text-white"
                  : "text-[var(--admin-muted)] hover:bg-[rgba(255,255,255,0.03)] hover:text-white"
              )}
            >
              <Icon size={17} className={active ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]"} />
              <span>
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                  {tab.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {activeTab === "connection" && (
          <ConnectionTab
            connection={connection}
            instanceName={instanceName}
            loading={loading}
            operationResult={operationResult}
            phone={phone}
            runInstanceAction={runInstanceAction}
            setInstanceName={setInstanceName}
            setPhone={setPhone}
            state={state}
          />
        )}
        {activeTab === "prompt" && <PromptTab config={config.prompt} setPrompt={setPrompt} />}
        {activeTab === "qualification" && (
          <QualificationTab config={config.qualification} setQualification={setQualification} />
        )}
        {activeTab === "behavior" && <BehaviorTab config={config.behavior} setBehavior={setBehavior} />}
        {activeTab === "multichannel" && (
          <MultichannelTab config={config.multichannel} setMultichannel={setMultichannel} />
        )}
        {activeTab === "files" && <FilesTab config={config.files} setFiles={setFiles} />}
        {activeTab === "memory" && <MemoryTab config={config.memory} setMemory={setMemory} />}

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

function ConnectionTab({
  connection,
  instanceName,
  loading,
  operationResult,
  phone,
  runInstanceAction,
  setInstanceName,
  setPhone,
  state,
}: {
  connection: WillianConnectionInfo | null;
  instanceName: string;
  loading: string | null;
  operationResult: Record<string, unknown> | null;
  phone: string;
  runInstanceAction: (action: string) => void;
  setInstanceName: (value: string) => void;
  setPhone: (value: string) => void;
  state: WillianInstanceState;
}) {
  const connected = Boolean(state.status?.connected || state.status?.loggedIn);
  const canGenerateQr = state.adminTokenConfigured || state.instanceTokenConfigured;
  const whatsappLabel = state.displayName || state.phoneNumber || state.instanceName;
  const operationPreview = operationResult ? JSON.stringify(operationResult, null, 2).slice(0, 1200) : "";

  return (
    <div className="grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
      <Panel title="Conexao e identidade" eyebrow="Numero / agente / status" action={<StatusPill ok={connected} label={connected ? "Online" : "Pendente"} />}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Nome da instancia" value={instanceName} onChange={setInstanceName} />
          <Field label="Telefone opcional" value={phone} onChange={setPhone} placeholder="5547999999999" />
          <InfoBox label="Base ConnectyHub" value={state.baseUrl} />
          <InfoBox label="Instancia" value={state.instanceName} />
          <InfoBox label="Numero" value={state.phoneNumber || "pendente"} tone={state.phoneNumber ? "green" : "yellow"} />
          <InfoBox label="Perfil" value={state.displayName || "pendente"} tone={state.displayName ? "green" : "yellow"} />
          <InfoBox label="Instance ID" value={state.instanceTokenConfigured ? state.instanceTokenPreview || "configurado" : "ausente"} tone={state.instanceTokenConfigured ? "green" : "yellow"} />
          <InfoBox label="Email" value={state.emailReady ? "resend pronto" : "pendente"} tone={state.emailReady ? "green" : "yellow"} />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            disabled={!state.adminTokenConfigured}
            icon={<MessageCircle size={14} />}
            label="Criar/vincular"
            loading={loading === "create"}
            onClick={() => runInstanceAction("create")}
          />
          <ActionButton
            disabled={!canGenerateQr}
            icon={<QrCode size={14} />}
            label="Gerar QR Code"
            loading={loading === "generateQr"}
            onClick={() => runInstanceAction("generateQr")}
          />
          <ActionButton
            disabled={!state.instanceTokenConfigured}
            icon={<RefreshCw size={14} />}
            label="Atualizar status"
            loading={loading === "status"}
            onClick={() => runInstanceAction("status")}
          />
          <ActionButton
            disabled={!state.adminTokenConfigured}
            icon={<Webhook size={14} />}
            label="Configurar webhook"
            loading={loading === "configureWebhook"}
            onClick={() => runInstanceAction("configureWebhook")}
          />
          <ActionButton
            disabled={!state.instanceTokenConfigured}
            icon={<RotateCcw size={14} />}
            label="Resetar"
            loading={loading === "reset"}
            onClick={() => runInstanceAction("reset")}
          />
          <ActionButton
            disabled={!state.instanceTokenConfigured}
            icon={<Unplug size={14} />}
            label="Desconectar"
            loading={loading === "disconnect"}
            onClick={() => runInstanceAction("disconnect")}
          />
          <ActionButton
            disabled={!state.instanceTokenConfigured}
            icon={<Trash2 size={14} />}
            label="Excluir instancia"
            loading={loading === "deleteInstance"}
            onClick={() => runInstanceAction("deleteInstance")}
            tone="danger"
          />
        </div>
      </Panel>

      <Panel title="WhatsApp conectado" eyebrow="Conexao WhatsApp">
        <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex items-center gap-3">
            <WhatsappProfileAvatar connected={connected} imageUrl={state.profileImageUrl} label={whatsappLabel} />
            <div>
              <p className="font-semibold text-white">{connected ? whatsappLabel : "Aguardando leitura"}</p>
              <p className="mt-1 text-xs text-[var(--admin-muted)]">{connected ? "WhatsApp conectado" : state.status?.state || "sem status remoto"}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-xs leading-5 text-[var(--admin-muted)]">
            <p className="break-all"><span className="text-white">Webhook:</span> {state.webhookConfiguredUrl || "pendente"}</p>
            <p><span className="text-white">Webhooks:</span> {state.webhookCount ?? 0}</p>
            <p><span className="text-white">Leitura:</span> {state.status?.loggedIn ? "login ok" : "aguardando login"}</p>
            <p><span className="text-white">Numero:</span> {state.phoneNumber || "pendente"}</p>
            <p><span className="text-white">Foto:</span> {state.profileImageUrl ? "sincronizada" : "pendente"}</p>
            {state.profileImageSyncedAt && <p><span className="text-white">Atualizada:</span> {formatDateTime(state.profileImageSyncedAt)}</p>}
          </div>
        </div>

        {!!state.missing.length && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.missing.map((item) => (
              <span key={item} className="rounded border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-yellow)]">
                {item}
              </span>
            ))}
          </div>
        )}

        {connection && (
          <div className="mt-4 rounded-lg border border-[rgba(0,243,255,0.22)] bg-[rgba(0,243,255,0.06)] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">Pareamento</p>
            {connection.pairingCode && <p className="mt-2 font-mono text-lg font-bold text-white">{connection.pairingCode}</p>}
            {connection.qrCodeDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img alt="QR code de conexao do WhatsApp" src={connection.qrCodeDataUrl} className="mt-3 h-44 w-44 rounded-lg border border-[var(--admin-border)] bg-white p-2" />
            )}
            {connection.qrCode && <p className="mt-2 break-all font-mono text-xs text-[var(--admin-muted)]">{connection.qrCode}</p>}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            disabled={!state.webhookConfiguredUrl}
            icon={<Radio size={14} />}
            label="Testar webhook"
            loading={loading === "testWebhook"}
            onClick={() => runInstanceAction("testWebhook")}
          />
          <ActionButton
            disabled={!state.webhookConfiguredUrl}
            icon={<Activity size={14} />}
            label="Entregas"
            loading={loading === "webhookDeliveries"}
            onClick={() => runInstanceAction("webhookDeliveries")}
          />
          <ActionButton
            disabled={!state.instanceTokenConfigured}
            icon={<Database size={14} />}
            label="Ler dados"
            loading={loading === "syncOverview"}
            onClick={() => runInstanceAction("syncOverview")}
          />
        </div>

        {operationPreview && (
          <pre className="mt-4 max-h-52 overflow-auto rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3 text-[11px] leading-5 text-[var(--admin-muted)]">
            {operationPreview}
          </pre>
        )}
      </Panel>
    </div>
  );
}

function PromptTab({ config, setPrompt }: { config: WillianPromptConfig; setPrompt: (patch: Partial<WillianPromptConfig>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title="Prompt do agente" eyebrow="Atendimento / distribuicao">
        <TextAreaField label="Prompt principal" rows={12} value={config.agentPrompt} onChange={(value) => setPrompt({ agentPrompt: value })} />
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <TextAreaField label="DNA manual do agente" rows={5} value={config.dnaManual} onChange={(value) => setPrompt({ dnaManual: value })} />
          <TextAreaField label="Memoria do clone" rows={5} value={config.cloneMemory} onChange={(value) => setPrompt({ cloneMemory: value })} />
        </div>
        <div className="mt-3">
          <TextAreaField label="Metrica de humanizacao" rows={4} value={config.humanizationMetric} onChange={(value) => setPrompt({ humanizationMetric: value })} />
        </div>
      </Panel>

      <Panel title="Links e botoes" eyebrow="Tags / produto">
        <ToggleTile title="Enviar como botao" detail="Usar botao quando o canal permitir." checked={config.sendButton} onChange={(sendButton) => setPrompt({ sendButton })} />
        <div className="mt-3 grid gap-3">
          <Field label="Nome do botao" value={config.buttonLabel} onChange={(buttonLabel) => setPrompt({ buttonLabel })} />
          <Field label="URL do botao" value={config.buttonUrl} onChange={(buttonUrl) => setPrompt({ buttonUrl })} />
          <Field label="Link do produto" value={config.productLink} onChange={(productLink) => setPrompt({ productLink })} />
          <TextAreaField label="Notas do produto" rows={5} value={config.productNotes} onChange={(productNotes) => setPrompt({ productNotes })} />
          <TextAreaField label="Tags do prompt" rows={4} value={config.tags.join(", ")} onChange={(value) => setPrompt({ tags: csvToArray(value) })} />
        </div>
      </Panel>
    </div>
  );
}

function QualificationTab({ config, setQualification }: { config: WillianQualificationConfig; setQualification: (patch: Partial<WillianQualificationConfig>) => void }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
      <Panel title="Qualificacao do lead" eyebrow="CRM / perguntas / score" action={<StatusPill ok={config.enabled} label={config.enabled ? "Ativa" : "Pausada"} />}>
        <ToggleTile title="Qualificacao ativa" detail="Willian deve pontuar o lead antes de distribuir oportunidade." checked={config.enabled} onChange={(enabled) => setQualification({ enabled })} />
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
          <ToggleTile title="Clone de voz" detail="Libera uso da voz clonada do Willian." checked={config.voiceCloneEnabled} onChange={(voiceCloneEnabled) => setBehavior({ voiceCloneEnabled })} />
          <ToggleTile title="Consentimento do clone" detail="Marca que a voz foi autorizada." checked={config.voiceCloneConsent} onChange={(voiceCloneConsent) => setBehavior({ voiceCloneConsent })} />
          <ToggleTile title="Preview de audio" detail="Mostra player de teste antes de salvar." checked={config.audioPreviewEnabled} onChange={(audioPreviewEnabled) => setBehavior({ audioPreviewEnabled })} />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <Field label="Origem da voz" value={config.audioVoiceSource} onChange={(audioVoiceSource) => setBehavior({ audioVoiceSource })} placeholder="manual, clone, public" />
          <Field label="Modelo de audio" value={config.audioModelId} onChange={(audioModelId) => setBehavior({ audioModelId })} placeholder="eleven_multilingual_v2" />
          <Field label="Owner publico" value={config.audioVoicePublicOwnerId} onChange={(audioVoicePublicOwnerId) => setBehavior({ audioVoicePublicOwnerId })} />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {voiceOptions.map((voice) => (
            <VoiceCard
              key={voice.id}
              active={config.selectedVoiceId === voice.id}
              detail={voice.detail}
              label={voice.label}
              status={voice.status}
              onClick={() => setBehavior({ selectedVoiceId: voice.id, selectedVoiceLabel: voice.label })}
            />
          ))}
        </div>
        {config.audioPreviewEnabled && (
          <div className="mt-4 rounded-lg border border-[var(--admin-border)] bg-[#050505] px-4 py-3">
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--admin-muted)]">
              <BehaviorIcon icon={<Radio size={14} />} label="Preview" />
              <span className="font-semibold text-white">{config.selectedVoiceLabel}</span>
              <span>00:00 / 00:18</span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
              <span className="block h-full w-2/5 rounded-full bg-[var(--admin-cyan)]" />
            </div>
          </div>
        )}
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
          <ToggleTile title="Memoria do clone" detail="Preserva padrao do Willian." checked={config.cloneMemory} onChange={(cloneMemory) => setBehavior({ cloneMemory })} />
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

function FilesTab({ config, setFiles }: { config: WillianFilesConfig; setFiles: (patch: Partial<WillianFilesConfig>) => void }) {
  return (
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

function AgentCard({ active, detail, disabled, status, title }: { active?: boolean; detail: string; disabled?: boolean; status: string; title: string }) {
  return (
    <div className={cn("rounded-lg border p-4", active ? "border-[rgba(0,243,255,0.28)] bg-[rgba(0,243,255,0.06)]" : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]", disabled && "opacity-60")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-[var(--admin-muted)]">{detail}</p>
        </div>
        <span className="rounded-full border border-[rgba(0,243,255,0.22)] bg-[rgba(0,243,255,0.08)] px-2 py-1 text-[10px] font-bold text-[var(--admin-cyan)]">
          {status}
        </span>
      </div>
    </div>
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
  onClick,
  status,
}: {
  active: boolean;
  detail: string;
  label: string;
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
          {status}
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
