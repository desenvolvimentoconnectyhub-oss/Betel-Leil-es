"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  FileSearch,
  HeartPulse,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  Save,
  Scale,
  Server,
  Shield,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";

type GeminiModelOption = {
  id: string;
  name: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
};

type Status = "ok" | "warning" | "missing" | "error";

type IntegrationItem = {
  name: string;
  label: string;
  configured: boolean;
  value: string;
  editable?: boolean;
  secret?: boolean;
  configKey?: string;
};

type Integration = {
  id: string;
  title: string;
  status: Status;
  message: string;
  items: IntegrationItem[];
  group?: string;
  usedBy?: string;
  site?: string;
};

type MaintenanceStatus = {
  success: boolean;
  checked_at: string;
  app: { name: string; environment: string; site_url: string };
  counts: Record<Status, number>;
  integrations: Integration[];
};

type LlmCheck = {
  success: boolean;
  checked_at: string;
  active_provider: string;
  gemini: {
    configured: boolean;
    model: string;
    status: Status | "no_credits" | "invalid_key" | "missing_key";
    message: string;
  };
};

type TestResult = {
  success: boolean;
  integration: string;
  message: string;
  latencyMs: number;
};

const icons: Record<string, typeof Database> = {
  supabase: Database,
  r2: Cloud,
  inngest: Zap,
  connectyhub: MessageSquare,
  gemini: Sparkles,
  resend: Mail,
  datazap: TrendingUp,
  fipezap: BarChart3,
  ibge: MapPin,
  datajud: Scale,
  receitaws: FileSearch,
  bigdata: Server,
  registry: Landmark,
  infosimples: Shield,
  serpro: Building2,
};

const integrationDescriptions: Record<string, string> = {
  supabase: "Banco de dados PostgreSQL, autenticacao e storage.",
  r2: "Cloudflare R2 para armazenamento de arquivos e dossies.",
  inngest: "Orquestrador de tarefas, filas e automacoes agendadas.",
  connectyhub: "Ponte WhatsApp: instancias, mensagens, webhooks e automacoes.",
  gemini: "Google Gemini para analise IA, diagnosticos e agentes.",
  resend: "Email transacional. Gratis ate 3k emails/mes.",
  datazap: "Avaliacao de imoveis, preco/m² e comparaveis. Contrato comercial OLX Group.",
  fipezap: "Indice de precos de imoveis por cidade e regiao.",
  ibge: "Dados demograficos das cidades brasileiras. API publica gratuita.",
  datajud: "Consulta de processos judiciais no CNJ. API publica gratuita.",
  receitaws: "Verificacao de CNPJ de leiloeiros. Gratis ate 3 consultas/min.",
  bigdata: "Enriquecimento de dados de pessoa, empresa e imovel. Contrato comercial.",
  registry: "Matricula e cadeia dominial do imovel. Pago por consulta.",
  infosimples: "Dados legais agregados de multiplas fontes. Pago por creditos.",
  serpro: "Dados governamentais — CPF, CNPJ, certidoes. Contrato gov.",
};

const statusCopy: Record<string, string> = {
  ok: "Configurado",
  warning: "Atenção",
  missing: "Pendente",
  error: "Erro",
  no_credits: "Sem quota",
  invalid_key: "Chave inválida",
  missing_key: "Pendente",
};

function statusTone(status: string) {
  if (status === "ok")
    return { text: "text-[var(--green)]", bg: "bg-[rgba(81,200,120,0.12)]", border: "border-[rgba(81,200,120,0.35)]", Icon: CheckCircle2 };
  if (status === "warning" || status === "no_credits")
    return { text: "text-[var(--gold)]", bg: "bg-[rgba(216,173,88,0.12)]", border: "border-[rgba(216,173,88,0.38)]", Icon: AlertTriangle };
  if (status === "error" || status === "invalid_key")
    return { text: "text-[var(--red)]", bg: "bg-[rgba(239,107,94,0.12)]", border: "border-[rgba(239,107,94,0.38)]", Icon: XCircle };
  return { text: "text-[var(--muted)]", bg: "bg-[rgba(167,162,154,0.12)]", border: "border-[rgba(167,162,154,0.28)]", Icon: AlertTriangle };
}

function formatDate(value?: string) {
  if (!value) return "Aguardando";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(value));
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Falha inesperada.";
}

function ModelSelect({
  value,
  onChange,
  models,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  models: GeminiModelOption[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = models.find((m) => m.id === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="py-3" ref={containerRef}>
      <label className="mb-1.5 block text-xs font-semibold text-[var(--gold)]">
        Modelo
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => !loading && setOpen((v) => !v)}
          disabled={loading}
          className="flex w-full items-center justify-between rounded-lg border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 font-mono text-sm text-white outline-none transition hover:border-[var(--gold)] focus:border-[var(--gold)] disabled:opacity-60"
        >
          <span className="truncate">
            {loading
              ? "Carregando modelos..."
              : selected
                ? `${selected.id} — ${formatTokenLimit(selected.inputTokenLimit)} in / ${formatTokenLimit(selected.outputTokenLimit)} out`
                : value || "Selecione um modelo"}
          </span>
          {loading ? <Loader2 size={16} className="shrink-0 animate-spin text-[var(--muted)]" /> : <ChevronDown size={16} className={`shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`} />}
        </button>

        {open && models.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
            {models.map((model) => {
              const isActive = model.id === value;
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-[rgba(216,173,88,0.12)] text-[var(--gold)]"
                      : "text-white hover:bg-[rgba(255,255,255,0.06)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-mono text-sm font-semibold">{model.id}</div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--muted)]">
                      {model.name}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[11px] text-[var(--green)]">
                      {formatTokenLimit(model.inputTokenLimit)} in
                    </div>
                    <div className="font-mono text-[11px] text-[var(--muted)]">
                      {formatTokenLimit(model.outputTokenLimit)} out
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {!loading && models.length > 0 && (
        <div className="mt-1.5 text-[11px] text-[var(--muted)]">
          {models.length} modelo(s) disponíveis na sua API key
        </div>
      )}
    </div>
  );
}

function formatTokenLimit(limit: number) {
  if (!limit) return "?";
  if (limit >= 1_000_000) return `${(limit / 1_000_000).toFixed(1)}M`;
  if (limit >= 1_000) return `${Math.round(limit / 1_000)}k`;
  return String(limit);
}

function FieldInput({
  item,
  value,
  onChange,
}: {
  item: IntegrationItem;
  value: string;
  onChange: (configKey: string, value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const configKey = item.configKey || item.name.toLowerCase();

  return (
    <div className="py-3">
      <label className="mb-1.5 block text-xs font-semibold text-[var(--gold)]">
        {item.label}
      </label>
      <div className="relative">
        <input
          type={item.secret && !visible ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(configKey, e.target.value)}
          placeholder={item.configured ? "" : "Cole o valor aqui..."}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg)] px-4 py-2.5 pr-10 font-mono text-sm text-white placeholder-[var(--muted)] outline-none transition focus:border-[var(--gold)]"
        />
        {item.secret && (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] transition hover:text-white"
          >
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  fieldValues,
  onFieldChange,
  testResult,
  testingId,
  onTest,
  geminiModels,
  geminiModelsLoading,
}: {
  integration: Integration;
  fieldValues: Record<string, string>;
  onFieldChange: (configKey: string, value: string) => void;
  testResult: TestResult | null;
  testingId: string | null;
  onTest: (id: string) => void;
  geminiModels: GeminiModelOption[];
  geminiModelsLoading: boolean;
}) {
  const Icon = icons[integration.id] || HeartPulse;
  const tone = statusTone(integration.status);
  const StatusIcon = tone.Icon;
  const isTesting = testingId === integration.id;
  const description = integrationDescriptions[integration.id] || integration.message;

  return (
    <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--panel-soft)]">
            <Icon size={22} className="text-[var(--gold)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-white">{integration.title}</h3>
              {integration.site && (
                <a
                  href={`https://${integration.site}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--muted)] transition hover:text-[var(--gold)]"
                  title={`Abrir ${integration.site}`}
                >
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">{description}</p>
            {integration.usedBy && (
              <p className="mt-0.5 text-xs text-[var(--gold)] opacity-70">Usado por: {integration.usedBy}</p>
            )}
          </div>
        </div>
        <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
          <StatusIcon size={14} />
          {statusCopy[integration.status]}
        </div>
      </div>

      {/* Fields */}
      <div className="mt-4 divide-y divide-[var(--line)]">
        {integration.items.map((item) => {
          const configKey = item.configKey || item.name.toLowerCase();
          const currentValue = fieldValues[configKey] ?? item.value;

          if (configKey === "gemini_model") {
            return (
              <ModelSelect
                key={configKey}
                value={currentValue}
                onChange={(v) => onFieldChange(configKey, v)}
                models={geminiModels}
                loading={geminiModelsLoading}
              />
            );
          }

          return (
            <FieldInput
              key={configKey}
              item={item}
              value={currentValue}
              onChange={onFieldChange}
            />
          );
        })}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            testResult.success
              ? "border-[rgba(81,200,120,0.35)] bg-[rgba(81,200,120,0.08)] text-[var(--green)]"
              : "border-[rgba(239,107,94,0.35)] bg-[rgba(239,107,94,0.08)] text-[var(--red)]"
          }`}
        >
          <div className="flex items-center gap-2">
            {testResult.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
            <span className="font-semibold">{testResult.success ? "Conexão OK" : "Falha na conexão"}</span>
            <span className="ml-auto text-xs opacity-75">{testResult.latencyMs}ms</span>
          </div>
          <div className="mt-1 text-xs opacity-85">{testResult.message}</div>
        </div>
      )}

      {/* Test button */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => onTest(integration.id)}
          disabled={isTesting}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] px-4 py-2 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--gold)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Testar Conexão
        </button>
      </div>
    </article>
  );
}

function groupIntegrations(integrations: Integration[]) {
  const groups: { group: string; items: Integration[]; stats: { ok: number } }[] = [];
  const seen = new Set<string>();

  for (const item of integrations) {
    const g = item.group || "Geral";
    if (!seen.has(g)) {
      seen.add(g);
      groups.push({ group: g, items: [], stats: { ok: 0 } });
    }
    const entry = groups.find((x) => x.group === g)!;
    entry.items.push(item);
    if (item.status === "ok") entry.stats.ok += 1;
  }

  return groups;
}

export default function MaintenanceClient({
  initialStatus,
}: {
  initialStatus: MaintenanceStatus;
}) {
  const [status, setStatus] = useState<MaintenanceStatus | null>(initialStatus);
  const [llmCheck, setLlmCheck] = useState<LlmCheck | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [loadingLlm, setLoadingLlm] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (initialStatus?.integrations) {
      for (const integration of initialStatus.integrations) {
        for (const item of integration.items) {
          const key = item.configKey || item.name.toLowerCase();
          initial[key] = item.value || "";
        }
      }
    }
    return initial;
  });

  const [saving, setSaving] = useState(false);

  const [geminiModels, setGeminiModels] = useState<GeminiModelOption[]>([]);
  const [geminiModelsLoading, setGeminiModelsLoading] = useState(true);

  useEffect(() => {
    async function fetchModels() {
      try {
        const res = await fetch("/api/admin/maintenance/gemini-models", { cache: "no-store" });
        const data = await res.json();
        if (data.success && Array.isArray(data.models)) {
          setGeminiModels(data.models);
        }
      } catch {
        // models will remain empty, select shows current value
      } finally {
        setGeminiModelsLoading(false);
      }
    }
    fetchModels();
  }, []);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    setError("");
    try {
      const res = await fetch("/api/admin/maintenance/status", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha no status.");
      setStatus(data);
      const newFields: Record<string, string> = {};
      for (const integration of data.integrations) {
        for (const item of integration.items) {
          const key = item.configKey || item.name.toLowerCase();
          newFields[key] = item.value || "";
        }
      }
      setFieldValues(newFields);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  const runLlmCheck = useCallback(async () => {
    setLoadingLlm(true);
    setError("");
    try {
      const res = await fetch("/api/admin/llm-credits", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Falha no Gemini.");
      setLlmCheck(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingLlm(false);
    }
  }, []);

  const handleTest = useCallback(async (integrationId: string) => {
    setTestingId(integrationId);
    try {
      const res = await fetch("/api/admin/maintenance/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ integration: integrationId }),
      });
      const data = (await res.json()) as TestResult;
      setTestResults((prev) => ({ ...prev, [integrationId]: data }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [integrationId]: { success: false, integration: integrationId, message: getErrorMessage(err), latencyMs: 0 },
      }));
    } finally {
      setTestingId(null);
    }
  }, []);

  const handleFieldChange = useCallback((configKey: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [configKey]: value }));
  }, []);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");

    const credentials: { key: string; value: string; secret: boolean }[] = [];

    if (status?.integrations) {
      for (const integration of status.integrations) {
        for (const item of integration.items) {
          if (!item.editable) continue;
          const configKey = item.configKey || item.name.toLowerCase();
          const newValue = fieldValues[configKey] ?? "";
          if (newValue && newValue !== item.value) {
            credentials.push({ key: configKey, value: newValue, secret: Boolean(item.secret) });
          }
        }
      }
    }

    if (credentials.length === 0) {
      setSuccessMsg("Nenhuma alteração detectada.");
      setSaving(false);
      setTimeout(() => setSuccessMsg(""), 3000);
      return;
    }

    try {
      const res = await fetch("/api/admin/maintenance/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credentials }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      setSuccessMsg(`${credentials.length} credencial(is) salva(s) com sucesso.`);
      setTimeout(() => setSuccessMsg(""), 5000);
      await loadStatus();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [status, fieldValues, loadStatus]);

  const topLine = useMemo(() => {
    if (!status) return { label: "Carregando", status: "warning" };
    if (status.counts.error > 0) return { label: "Intervenção", status: "error" };
    if (status.counts.missing > 0 || status.counts.warning > 0) return { label: "Configuração", status: "warning" };
    return { label: "Operacional", status: "ok" };
  }, [status]);

  const topTone = statusTone(topLine.status);
  const TopIcon = topTone.Icon;

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* Header */}
      <section className="flex flex-col gap-5 border-b border-[var(--line)] pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sala de Manutenção</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Gerencie as chaves de API e integrações externas do sistema.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold ${topTone.bg} ${topTone.border} ${topTone.text}`}>
            <TopIcon size={17} />
            {topLine.label}
          </div>
          <button
            type="button"
            onClick={loadStatus}
            disabled={loadingStatus}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-sm font-semibold text-white transition hover:border-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={16} className={loadingStatus ? "animate-spin" : ""} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--gold)] bg-[rgba(216,173,88,0.18)] px-4 text-sm font-semibold text-[var(--gold)] transition hover:bg-[rgba(216,173,88,0.3)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Tudo
          </button>
        </div>
      </section>

      {error && (
        <div className="mt-5 rounded-md border border-[rgba(239,107,94,0.4)] bg-[rgba(239,107,94,0.1)] px-4 py-3 text-sm text-[var(--red)]">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-5 rounded-md border border-[rgba(81,200,120,0.4)] bg-[rgba(81,200,120,0.1)] px-4 py-3 text-sm text-[var(--green)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} />
            {successMsg}
          </div>
        </div>
      )}

      {/* Integration cards — grouped by category */}
      <section className="mt-6 flex flex-col gap-8">
        {groupIntegrations(status?.integrations || []).map(({ group, items, stats }) => (
          <div key={group}>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[var(--gold)]">{group}</h2>
                <span className="text-xs text-[var(--muted)]">
                  {stats.ok}/{items.length} configurado{items.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="h-px flex-1 ml-4 bg-[var(--line)]" />
            </div>
            <div className="flex flex-col gap-4">
              {items.map((integration) => (
                <IntegrationCard
                  key={integration.id}
                  integration={integration}
                  fieldValues={fieldValues}
                  onFieldChange={handleFieldChange}
                  testResult={testResults[integration.id] || null}
                  testingId={testingId}
                  onTest={handleTest}
                  geminiModels={geminiModels}
                  geminiModelsLoading={geminiModelsLoading}
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Gemini LLM deep test */}
      <section className="mt-8 pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Teste profundo — Gemini LLM</h2>
          <button
            type="button"
            onClick={runLlmCheck}
            disabled={loadingLlm}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 text-xs font-semibold text-white transition hover:border-[var(--gold)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw size={15} className={loadingLlm ? "animate-spin" : ""} />
            Verificar
          </button>
        </div>

        <article className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <div className="flex items-center gap-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl border border-[rgba(216,173,88,0.35)] bg-[rgba(216,173,88,0.12)]">
              <Sparkles size={22} className="text-[var(--gold)]" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Provider ativo</div>
              <div className="mt-1 text-2xl font-semibold text-white">{llmCheck?.active_provider || "gemini"}</div>
            </div>
          </div>

          <div className="mt-5 border-t border-[var(--line)] pt-4">
            {llmCheck ? (
              <GeminiResult check={llmCheck} />
            ) : (
              <div className="text-sm leading-6 text-[var(--muted)]">
                Envia uma mensagem de teste real ao Gemini para verificar chave, modelo e quota.
                Clique em &quot;Verificar&quot; para executar.
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function GeminiResult({ check }: { check: LlmCheck }) {
  const tone = statusTone(check.gemini.status);
  const Icon = tone.Icon;

  return (
    <div className="grid gap-4">
      <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${tone.bg} ${tone.border} ${tone.text}`}>
        <Icon size={16} />
        {statusCopy[check.gemini.status]}
      </div>
      <div className="grid gap-3 text-sm">
        <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Modelo</span>
          <span className="font-mono text-[#d7d1c6]">{check.gemini.model}</span>
        </div>
        <div className="flex items-start justify-between gap-4 border-b border-[var(--line)] pb-3">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Retorno</span>
          <span className="text-right leading-6 text-[#d7d1c6]">{check.gemini.message}</span>
        </div>
        <div className="text-xs text-[var(--muted)]">Verificado em {formatDate(check.checked_at)}</div>
      </div>
    </div>
  );
}
