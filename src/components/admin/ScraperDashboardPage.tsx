"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  Globe,
  Search,
  Play,
  Pause,
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Database,
  TrendingUp,
  Zap,
  BarChart3,
  Activity,
  RefreshCw,
  Eye,
  Save,
  Power,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type {
  ScraperDashboardData,
  ScraperTarget,
  ScraperRun,
} from "@/lib/scraper";
import type { DataResult } from "@/lib/admin/repository";
import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";

const targetTypeLabel: Record<string, string> = {
  auctioneer: "Leiloeiro",
  bank: "Banco",
  court: "Tribunal",
  portal: "Portal",
  aggregator: "Agregador",
};

const targetTypeIcon: Record<string, string> = {
  auctioneer: "🏛️",
  bank: "🏦",
  court: "⚖️",
  portal: "🌐",
  aggregator: "📊",
};

const strategyLabel: Record<string, string> = {
  playwright: "Navegador",
  fetch: "HTTP",
  api: "API",
};

function formatRelative(iso: string) {
  if (!iso) return "Nunca";
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Agora";
    if (mins < 60) return `${mins}min atras`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h atras`;
    const days = Math.floor(hours / 24);
    return `${days}d atras`;
  } catch {
    return iso;
  }
}

const inputClass =
  "h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-white placeholder:text-[var(--admin-muted)] outline-none transition focus:border-[var(--admin-cyan)]";

const selectClass =
  "h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-2 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)] appearance-none";

type TargetFormData = {
  targetCode: string;
  name: string;
  url: string;
  targetType: string;
  scrapeStrategy: string;
  region: string;
  priority: number;
  rateLimitMs: number;
  maxPages: number;
  notes: string;
};

const emptyForm: TargetFormData = {
  targetCode: "",
  name: "",
  url: "",
  targetType: "auctioneer",
  scrapeStrategy: "fetch",
  region: "",
  priority: 50,
  rateLimitMs: 2000,
  maxPages: 10,
  notes: "",
};

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ── SVG Donut Chart ── */
function DonutChart({
  segments,
  size = 120,
  stroke = 14,
  centerLabel,
  centerValue,
}: {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  stroke?: number;
  centerLabel: string;
  centerValue: string | number;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const paths = segments.reduce<Array<(typeof segments)[number] & { dashLen: number; dashOffset: number }>>((items, seg) => {
    const currentOffset = items.reduce((sum, item) => sum + item.dashLen, 0);
    const pct = total > 0 ? seg.value / total : 0;
    const dashLen = pct * circumference;
    return [...items, { ...seg, dashLen, dashOffset: -currentOffset }];
  }, []);

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        {paths.map((p) => (
          <circle
            key={p.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={p.color}
            strokeWidth={stroke}
            strokeDasharray={`${p.dashLen} ${circumference - p.dashLen}`}
            strokeDashoffset={p.dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        ))}
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          fill="white"
          fontSize="22"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {centerValue}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.45)"
          fontSize="9"
          fontWeight="600"
          letterSpacing="0.12em"
          style={{ textTransform: "uppercase" }}
        >
          {centerLabel}
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-[10px] text-[var(--admin-muted)]">
            <span className="h-2 w-2 rounded-full" style={{ background: seg.color }} />
            {seg.label}: {seg.value}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Mini Bar Chart for runs ── */
function MiniBarChart({ runs }: { runs: ScraperRun[] }) {
  const last7 = useMemo(() => {
    const days: Record<string, { ok: number; fail: number }> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days[key] = { ok: 0, fail: 0 };
    }
    for (const run of runs) {
      const key = run.createdAt.slice(0, 10);
      if (days[key]) {
        if (run.status === "completed" || run.status === "partial") days[key].ok++;
        else if (run.status === "failed") days[key].fail++;
      }
    }
    return Object.entries(days).map(([date, counts]) => ({
      date,
      day: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(date + "T12:00:00")),
      ...counts,
    }));
  }, [runs]);

  const maxVal = Math.max(1, ...last7.map((d) => d.ok + d.fail));

  return (
    <div className="flex items-end justify-between gap-1.5" style={{ height: 64 }}>
      {last7.map((d) => {
        const okH = (d.ok / maxVal) * 52;
        const failH = (d.fail / maxVal) * 52;
        return (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex w-full flex-col items-center" style={{ height: 52 }}>
              <div className="absolute bottom-0 w-full max-w-[18px] flex flex-col gap-px">
                {d.fail > 0 && (
                  <div
                    className="w-full rounded-t-sm bg-[var(--admin-red)]"
                    style={{ height: Math.max(2, failH), opacity: 0.7 }}
                  />
                )}
                {d.ok > 0 && (
                  <div
                    className="w-full rounded-t-sm bg-[var(--admin-green)]"
                    style={{ height: Math.max(2, okH) }}
                  />
                )}
                {d.ok === 0 && d.fail === 0 && (
                  <div className="w-full rounded-t-sm bg-[rgba(255,255,255,0.08)]" style={{ height: 2 }} />
                )}
              </div>
            </div>
            <span className="text-[8px] font-semibold uppercase text-[var(--admin-muted)]">{d.day}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Progress bar ── */
function ProgressBar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-[var(--admin-muted)]">{label}</span>
        <span className="font-mono text-[10px] font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

export function ScraperDashboardPage({
  module,
  data,
}: {
  module: AdminModule;
  data: DataResult<ScraperDashboardData>;
}) {
  const [targets, setTargets] = useState(data.data.targets);
  const [recentRuns, setRecentRuns] = useState(data.data.recentRuns);

  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [form, setForm] = useState<TargetFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [runningCode, setRunningCode] = useState<string | null>(null);
  const [togglingCode, setTogglingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [clearingErrors, setClearingErrors] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  }, []);

  const showError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 4000);
  }, []);

  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of targets) {
      counts[t.targetType] = (counts[t.targetType] || 0) + 1;
    }
    return counts;
  }, [targets]);

  const statusBreakdown = useMemo(() => {
    let active = 0, paused = 0, error = 0;
    for (const t of targets) {
      if (!t.enabled) paused++;
      else if (t.consecutiveErrors > 0) error++;
      else active++;
    }
    return { active, paused, error };
  }, [targets]);

  const runStatusBreakdown = useMemo(() => {
    let completed = 0, failed = 0, partial = 0, running = 0;
    for (const r of recentRuns) {
      if (r.status === "completed") completed++;
      else if (r.status === "failed") failed++;
      else if (r.status === "partial") partial++;
      else if (r.status === "running") running++;
    }
    return { completed, failed, partial, running };
  }, [recentRuns]);

  const totalIngested = useMemo(() => recentRuns.reduce((s, r) => s + r.itemsIngested, 0), [recentRuns]);
  const totalFound = useMemo(() => recentRuns.reduce((s, r) => s + r.itemsFound, 0), [recentRuns]);

  async function refreshData() {
    try {
      const res = await fetch("/api/admin/scraper");
      const result = await res.json();
      if (result.data) {
        setTargets(result.data.targets);
        setRecentRuns(result.data.recentRuns);
      }
    } catch { /* ignore */ }
  }

  function openNew() { setForm(emptyForm); setEditingCode(null); setShowForm(true); }

  function openEdit(target: ScraperTarget) {
    setForm({
      targetCode: target.targetCode, name: target.name, url: target.url,
      targetType: target.targetType, scrapeStrategy: target.scrapeStrategy,
      region: target.region, priority: target.priority, rateLimitMs: target.rateLimitMs,
      maxPages: target.maxPages, notes: target.notes,
    });
    setEditingCode(target.targetCode);
    setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingCode(null); setForm(emptyForm); }

  async function handleSave() {
    if (!form.name || !form.url) { showError("Nome e URL sao obrigatorios."); return; }
    setSaving(true);
    const action = editingCode ? "update" : "create";
    const code = editingCode || slugify(form.name);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...form, targetCode: code }),
      });
      const result = await res.json();
      if (result.ok) { showSuccess(editingCode ? "Alvo atualizado." : "Alvo cadastrado."); closeForm(); await refreshData(); }
      else showError(result.error || "Erro ao salvar.");
    } catch { showError("Erro de conexao."); }
    finally { setSaving(false); }
  }

  async function handleToggle(target: ScraperTarget) {
    setTogglingCode(target.targetCode);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", targetCode: target.targetCode, enabled: !target.enabled }),
      });
      const result = await res.json();
      if (result.ok) {
        setTargets((prev) => prev.map((t) =>
          t.targetCode === target.targetCode ? { ...t, enabled: !t.enabled, tone: !t.enabled ? "green" : "muted" } : t
        ));
      }
    } catch { /* ignore */ }
    setTogglingCode(null);
  }

  async function handleRun(targetCode: string) {
    setRunningCode(targetCode);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run", targetCode }),
      });
      const result = await res.json();
      if (result.ok) { showSuccess(`Coleta iniciada.`); await refreshData(); }
      else showError(result.error || "Erro ao executar.");
    } catch { showError("Erro de conexao."); }
    setRunningCode(null);
  }

  async function handleDelete(targetCode: string) {
    setDeletingCode(targetCode);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", targetCode }),
      });
      const result = await res.json();
      if (result.ok) { showSuccess("Alvo removido."); await refreshData(); }
      else showError(result.error || "Erro ao excluir.");
    } catch { showError("Erro de conexao."); }
    setDeletingCode(null);
  }

  async function handleClearErrors() {
    setClearingErrors(true);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_errors" }),
      });
      const result = await res.json();

      if (result.ok) {
        const cleared = Number(result.data?.cleared || 0);
        setTargets((prev) =>
          prev.map((target) => ({
            ...target,
            consecutiveErrors: 0,
            errorCount: 0,
            tone: target.enabled ? "green" : target.tone,
          }))
        );
        showSuccess(cleared > 0 ? `${cleared} fonte(s) limpas.` : "Nenhum erro ativo para limpar.");
        await refreshData();
      } else {
        showError(result.error || "Erro ao limpar.");
      }
    } catch {
      showError("Erro de conexao.");
    }
    setClearingErrors(false);
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]">
              <Globe size={24} className="text-[var(--admin-cyan)]" />
            </div>
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
                {module.eyebrow}
              </p>
              <h1 className="text-xl font-bold text-white">{module.title}</h1>
            </div>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-4 py-2.5 text-xs font-semibold text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.2)] transition"
          >
            <Plus size={14} /> Novo Alvo
          </button>
        </div>

        {/* Agente Renata */}
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[rgba(0,243,255,0.2)] bg-[rgba(0,243,255,0.04)] px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.12)]">
            <Search size={18} className="text-[var(--admin-cyan)]" />
          </div>
          <div className="flex-1">
            <p className="text-xs font-bold text-white">Renata — Buscadora de Imoveis</p>
            <p className="text-[10px] text-[var(--admin-muted)]">
              Coleta automatizada via Inngest · Horario de Brasilia · Gemini 2.5 Flash
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[var(--admin-green)]">
              <Activity size={10} className="mr-1 inline" /> ATIVO
            </span>
            <span className="rounded-full border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[var(--admin-cyan)]">
              COLETOR
            </span>
          </div>
        </div>
      </header>

      {/* Toast */}
      {successMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-4 py-2.5 text-xs font-semibold text-[var(--admin-green)]">
          <CheckCircle2 size={14} /> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] px-4 py-2.5 text-xs font-semibold text-[var(--admin-red)]">
          <AlertTriangle size={14} /> {errorMsg}
        </div>
      )}

      {data.source === "mock" && data.reason && (
        <div className="rounded-lg border border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.06)] px-4 py-3 text-xs text-[var(--admin-yellow)]">
          {data.reason}
        </div>
      )}

      {/* ═══ KPI Row ═══ */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={<Database size={18} />} label="Fontes Monitoradas" value={targets.length} sub={`${statusBreakdown.active} ativas`} color="var(--admin-cyan)" />
        <KpiCard icon={<TrendingUp size={18} />} label="Imoveis Encontrados" value={totalFound} sub={`${totalIngested} ingeridos`} color="var(--admin-green)" />
        <KpiCard icon={<Zap size={18} />} label="Coletas Realizadas" value={recentRuns.length} sub={`${runStatusBreakdown.completed} com sucesso`} color="var(--admin-purple)" />
        <KpiCard icon={<AlertTriangle size={18} />} label="Fontes com Erro" value={statusBreakdown.error} sub={`${statusBreakdown.paused} pausadas`} color={statusBreakdown.error > 0 ? "var(--admin-red)" : "var(--admin-muted)"} />
      </div>

      {/* ═══ Charts Row ═══ */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Donut: tipo de fonte */}
        <DashboardCard title="Fontes por Tipo" eyebrow="distribuicao">
          <div className="flex justify-center py-2">
            <DonutChart
              centerValue={targets.length}
              centerLabel="FONTES"
              segments={[
                { value: typeBreakdown["auctioneer"] || 0, color: "#00f3ff", label: "Leiloeiros" },
                { value: typeBreakdown["bank"] || 0, color: "#22c55e", label: "Bancos" },
                { value: typeBreakdown["court"] || 0, color: "#eab308", label: "Tribunais" },
                { value: typeBreakdown["portal"] || 0, color: "#8b5cf6", label: "Portais" },
                { value: typeBreakdown["aggregator"] || 0, color: "#ef4444", label: "Agregadores" },
              ]}
            />
          </div>
        </DashboardCard>

        {/* Bar chart: coletas nos ultimos 7 dias */}
        <DashboardCard title="Coletas — Ultimos 7 dias" eyebrow="atividade">
          <div className="px-1 py-2">
            <MiniBarChart runs={recentRuns} />
            <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-[var(--admin-muted)]">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--admin-green)]" /> Sucesso</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--admin-red)]" /> Erro</span>
            </div>
          </div>
        </DashboardCard>

        {/* Status overview */}
        <DashboardCard
          title="Status das Fontes"
          eyebrow="saude"
          action={
            statusBreakdown.error > 0 ? (
              <button
                type="button"
                onClick={handleClearErrors}
                disabled={clearingErrors}
                className="flex items-center gap-1 rounded-md border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-green)] transition hover:bg-[rgba(34,197,94,0.14)] disabled:opacity-50"
                title="Zerar contadores de falha das fontes"
              >
                {clearingErrors ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
                Limpar
              </button>
            ) : null
          }
        >
          <div className="space-y-3 py-2">
            <ProgressBar value={statusBreakdown.active} max={targets.length} color="var(--admin-green)" label="Ativas" />
            <ProgressBar value={statusBreakdown.paused} max={targets.length} color="var(--admin-muted)" label="Pausadas" />
            <ProgressBar value={statusBreakdown.error} max={targets.length} color="var(--admin-red)" label="Com Erro" />
            <div className="mt-2 h-px bg-[var(--admin-border)]" />
            <ProgressBar value={runStatusBreakdown.completed} max={recentRuns.length || 1} color="var(--admin-green)" label="Coletas OK" />
            <ProgressBar value={runStatusBreakdown.failed} max={recentRuns.length || 1} color="var(--admin-red)" label="Coletas Falhas" />
          </div>
        </DashboardCard>
      </div>

      {/* ═══ Form Modal ═══ */}
      {showForm && (
        <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">
              {editingCode ? `Editar: ${editingCode}` : "Cadastrar Nova Fonte"}
            </h2>
            <button type="button" onClick={closeForm} className="text-[var(--admin-muted)] hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Nome *</label>
              <input type="text" className={inputClass} placeholder="Ex: Zukerman Leiloes" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">URL *</label>
              <input type="url" className={inputClass} placeholder="https://www.exemplo.com.br" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Tipo de Fonte</label>
              <select className={selectClass} value={form.targetType} onChange={(e) => setForm((f) => ({ ...f, targetType: e.target.value }))}>
                <option value="auctioneer">🏛️ Leiloeiro</option>
                <option value="bank">🏦 Banco</option>
                <option value="court">⚖️ Tribunal</option>
                <option value="portal">🌐 Portal</option>
                <option value="aggregator">📊 Agregador</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Metodo de Coleta</label>
              <select className={selectClass} value={form.scrapeStrategy} onChange={(e) => setForm((f) => ({ ...f, scrapeStrategy: e.target.value }))}>
                <option value="playwright">🌐 Navegador (JavaScript rendering)</option>
                <option value="fetch">📄 HTTP (paginas estaticas)</option>
                <option value="api">🔌 API (endpoint JSON)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Regiao</label>
              <input type="text" className={inputClass} placeholder="Ex: SP, RJ, Nacional" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Prioridade</label>
                <input type="number" className={inputClass} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: Number(e.target.value) || 50 }))} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Intervalo (ms)</label>
                <input type="number" className={inputClass} value={form.rateLimitMs} onChange={(e) => setForm((f) => ({ ...f, rateLimitMs: Number(e.target.value) || 2000 }))} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Max paginas</label>
                <input type="number" className={inputClass} value={form.maxPages} onChange={(e) => setForm((f) => ({ ...f, maxPages: Number(e.target.value) || 10 }))} />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">Observacoes</label>
              <input type="text" className={inputClass} placeholder="Notas sobre esta fonte (opcional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-3">
            <button type="button" onClick={closeForm} className="rounded-lg border border-[var(--admin-border)] px-4 py-2 text-xs font-semibold text-[var(--admin-muted)] hover:text-white transition">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.12)] px-4 py-2 text-xs font-semibold text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.2)] transition disabled:opacity-50">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {editingCode ? "Salvar Alteracoes" : "Cadastrar Fonte"}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Main content ═══ */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Fontes */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <DashboardCard
            title="Fontes Monitoradas"
            eyebrow="scraper_targets"
            action={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode(viewMode === "cards" ? "list" : "cards")}
                  className="rounded-md p-1.5 text-[var(--admin-muted)] hover:text-white transition"
                  title={viewMode === "cards" ? "Modo lista" : "Modo cards"}
                >
                  {viewMode === "cards" ? <BarChart3 size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  onClick={refreshData}
                  className="rounded-md p-1.5 text-[var(--admin-muted)] hover:text-white transition"
                  title="Atualizar dados"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            }
          >
            {targets.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Globe size={48} className="text-[var(--admin-muted)] opacity-20" />
                <p className="text-sm text-[var(--admin-muted)]">Nenhuma fonte cadastrada.</p>
                <button type="button" onClick={openNew} className="flex items-center gap-1.5 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-4 py-2 text-xs font-semibold text-[var(--admin-cyan)]">
                  <Plus size={12} /> Adicionar primeira fonte
                </button>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid gap-3 md:grid-cols-2">
                {targets.map((target) => (
                  <TargetCard
                    key={target.targetCode}
                    target={target}
                    onToggle={() => handleToggle(target)}
                    onEdit={() => openEdit(target)}
                    onRun={() => handleRun(target.targetCode)}
                    onDelete={() => handleDelete(target.targetCode)}
                    toggling={togglingCode === target.targetCode}
                    running={runningCode === target.targetCode}
                    deleting={deletingCode === target.targetCode}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-1.5">
                {targets.map((target) => (
                  <TargetListRow
                    key={target.targetCode}
                    target={target}
                    onToggle={() => handleToggle(target)}
                    onEdit={() => openEdit(target)}
                    onRun={() => handleRun(target.targetCode)}
                    onDelete={() => handleDelete(target.targetCode)}
                    toggling={togglingCode === target.targetCode}
                    running={runningCode === target.targetCode}
                    deleting={deletingCode === target.targetCode}
                  />
                ))}
              </div>
            )}
          </DashboardCard>
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6">
          {/* Agenda de Coleta — admin configura dias e horarios */}
          <ScheduleEditor />

          {/* Coletas recentes */}
          <DashboardCard
            title="Ultimas Coletas"
            eyebrow="scraper_runs"
            action={
              <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
                {recentRuns.length} registro(s)
              </span>
            }
          >
            {recentRuns.length === 0 ? (
              <p className="py-4 text-center text-xs italic text-[var(--admin-muted)]">
                Nenhuma coleta executada ainda.
              </p>
            ) : (
              <div className="space-y-2">
                {recentRuns.slice(0, 8).map((run) => (
                  <RunCard key={run.id} run={run} />
                ))}
                {recentRuns.length > 8 && (
                  <p className="text-center text-[10px] text-[var(--admin-muted)]">
                    + {recentRuns.length - 8} coletas anteriores
                  </p>
                )}
              </div>
            )}
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════ Sub-components ══════════════════ */

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: number; sub: string; color: string }) {
  return (
    <div className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-4">
      <div className="flex items-center justify-between">
        <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] p-2" style={{ color }}>{icon}</div>
        <span className="font-mono text-2xl font-bold" style={{ color }}>{value}</span>
      </div>
      <p className="mt-2 text-xs font-semibold text-white">{label}</p>
      <p className="text-[10px] text-[var(--admin-muted)]">{sub}</p>
    </div>
  );
}

type ScheduleConfig = {
  days: number[];
  times: string[];
  hours?: number[];
  maxResults: number;
  enabled: boolean;
  timezone?: string;
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const DEFAULT_SCHEDULE_TIMES = ["08:00", "12:00", "16:00", "20:00"];

function scheduleTimeToMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeScheduleTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function sortScheduleTimes(times: string[]) {
  return [...times].sort((a, b) => scheduleTimeToMinutes(a) - scheduleTimeToMinutes(b));
}

function normalizeScheduleTimes(schedule: Partial<ScheduleConfig>) {
  const fromTimes = Array.isArray(schedule.times)
    ? schedule.times.map(normalizeScheduleTime).filter(Boolean)
    : [];
  const fromHours = Array.isArray(schedule.hours)
    ? schedule.hours
        .map((hour) => Number(hour))
        .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
        .map((hour) => `${String(hour).padStart(2, "0")}:00`)
    : [];
  const times = fromTimes.length ? fromTimes : fromHours;

  return sortScheduleTimes(Array.from(new Set(times.length ? times : DEFAULT_SCHEDULE_TIMES)));
}

function ScheduleEditor() {
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    days: [1, 2, 3, 4, 5],
    times: DEFAULT_SCHEDULE_TIMES,
    maxResults: 50,
    enabled: true,
    timezone: "America/Sao_Paulo",
  });
  const [newTime, setNewTime] = useState("15:40");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    fetch("/api/admin/scraper")
      .then((r) => r.json())
      .then((d) => {
        if (d.schedule) {
          setSchedule({
            ...d.schedule,
            times: normalizeScheduleTimes(d.schedule),
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  function toggleDay(day: number) {
    setSchedule((s) => ({
      ...s,
      days: s.days.includes(day) ? s.days.filter((d) => d !== day) : [...s.days, day].sort(),
    }));
    setDirty(true);
  }

  function addTime() {
    const time = normalizeScheduleTime(newTime);
    if (!time) return;

    setSchedule((s) => ({
      ...s,
      times: sortScheduleTimes(Array.from(new Set([...s.times, time]))),
    }));
    setDirty(true);
  }

  function removeTime(time: string) {
    setSchedule((s) => ({
      ...s,
      times: s.times.length > 1 ? s.times.filter((item) => item !== time) : s.times,
    }));
    setDirty(true);
  }

  function toggleEnabled() {
    setSchedule((s) => ({ ...s, enabled: !s.enabled }));
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setFeedback("");
    try {
      const cleanSchedule = { ...schedule, times: normalizeScheduleTimes(schedule) };
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "schedule_save", ...cleanSchedule }),
      });
      const result = await res.json();
      if (result.ok) {
        if (result.schedule) {
          setSchedule({
            ...result.schedule,
            times: normalizeScheduleTimes(result.schedule),
          });
        }
        setFeedback("Agenda salva!");
        setDirty(false);
        setTimeout(() => setFeedback(""), 3000);
      } else {
        setFeedback(result.error || "Erro ao salvar.");
      }
    } catch {
      setFeedback("Erro de rede.");
    }
    setSaving(false);
  }

  const nextRuns = useMemo(() => {
    const times = normalizeScheduleTimes(schedule);
    if (!schedule.enabled || schedule.days.length === 0 || times.length === 0) return [];
    const now = new Date();
    const results: string[] = [];
    for (let dayOffset = 0; dayOffset < 7 && results.length < 3; dayOffset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      if (!schedule.days.includes(candidate.getDay())) continue;
      for (const time of times) {
        const [hour, minute] = time.split(":").map(Number);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate > now && results.length < 3) {
          results.push(
            new Intl.DateTimeFormat("pt-BR", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(candidate)
          );
        }
      }
    }
    return results;
  }, [schedule]);

  if (!loaded) {
    return (
      <DashboardCard title="Agenda de Coleta" eyebrow="config">
        <div className="flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[var(--admin-muted)]" />
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard
      title="Agenda de Coleta"
      eyebrow="config"
      action={
        <button
          type="button"
          onClick={toggleEnabled}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold transition",
            schedule.enabled
              ? "text-[var(--admin-green)] bg-[rgba(34,197,94,0.1)]"
              : "text-[var(--admin-muted)] bg-[rgba(255,255,255,0.04)]"
          )}
        >
          <Power size={10} />
          {schedule.enabled ? "Ativo" : "Pausado"}
        </button>
      }
    >
      <div className={cn("space-y-4 transition-opacity", !schedule.enabled && "opacity-40 pointer-events-none")}>
        {/* Dias da semana */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">
            Dias da semana
          </p>
          <div className="flex gap-1">
            {DAY_LABELS.map((label, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => toggleDay(idx)}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-[10px] font-semibold transition border",
                  schedule.days.includes(idx)
                    ? "border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.12)] text-[var(--admin-cyan)]"
                    : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] text-[var(--admin-muted)] hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Horarios */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">
            Horarios de coleta
          </p>
          <div className="flex gap-2">
            <input
              type="time"
              step={60}
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-3 font-mono text-xs font-semibold text-white outline-none transition focus:border-[var(--admin-purple)]"
            />
            <button
              type="button"
              onClick={addTime}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.12)] px-3 text-[10px] font-semibold text-[var(--admin-purple)] transition hover:bg-[rgba(139,92,246,0.2)]"
            >
              <Plus size={12} />
              Adicionar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {schedule.times.map((time) => (
              <button
                key={time}
                type="button"
                onClick={() => removeTime(time)}
                className="flex items-center gap-1 rounded-md border border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.12)] px-2 py-1.5 font-mono text-[10px] font-semibold text-[var(--admin-purple)] transition hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--admin-red)]"
              >
                {time}
                <X size={10} />
              </button>
            ))}
          </div>
        </div>

        {/* Limite de imoveis */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--admin-muted)]">
            Maximo de imoveis por coleta
          </p>
          <div className="flex items-center gap-2">
            {[10, 25, 50, 100, 200].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => { setSchedule((s) => ({ ...s, maxResults: n })); setDirty(true); }}
                className={cn(
                  "flex-1 rounded-md py-1.5 text-[10px] font-mono font-semibold transition border",
                  schedule.maxResults === n
                    ? "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.12)] text-[var(--admin-green)]"
                    : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] text-[var(--admin-muted)] hover:text-white"
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Proximas coletas */}
        {nextRuns.length > 0 && (
          <div className="rounded-lg border border-[rgba(139,92,246,0.15)] bg-[rgba(139,92,246,0.04)] p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={12} className="text-[var(--admin-purple)]" />
              <p className="text-[10px] font-semibold text-white">Proximas coletas</p>
            </div>
            {nextRuns.map((s) => (
              <p key={s} className="text-[10px] text-[var(--admin-muted)]">• {s}</p>
            ))}
          </div>
        )}
      </div>

      {/* Summary + Save */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--admin-border)] pt-3">
        <div>
          {feedback && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[var(--admin-green)]">
              <CheckCircle2 size={10} /> {feedback}
            </span>
          )}
          {!feedback && (
            <span className="text-[10px] text-[var(--admin-muted)]">
              {schedule.days.length} dias · {schedule.times.length} horarios
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-2.5 py-1 text-[10px] font-semibold text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.2)] transition disabled:opacity-40"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          Salvar
        </button>
      </div>
    </DashboardCard>
  );
}

type TargetActionProps = {
  target: ScraperTarget;
  onToggle: () => void;
  onEdit: () => void;
  onRun: () => void;
  onDelete: () => void;
  toggling: boolean;
  running: boolean;
  deleting: boolean;
};

function TargetCard(props: TargetActionProps) {
  const { target, onToggle, onEdit, onRun, onDelete, toggling, running, deleting } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className={cn(
      "group relative rounded-xl border p-4 transition",
      target.enabled
        ? target.consecutiveErrors > 0
          ? "border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.04)]"
          : "border-[rgba(34,197,94,0.15)] bg-[rgba(34,197,94,0.03)]"
        : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]"
    )}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{targetTypeIcon[target.targetType] || "🌐"}</span>
          <div>
            <p className="text-sm font-semibold text-white">{target.name}</p>
            <p className="text-[10px] text-[var(--admin-muted)]">{targetTypeLabel[target.targetType]}</p>
          </div>
        </div>
        <span className={cn(
          "h-2.5 w-2.5 rounded-full",
          target.enabled
            ? target.consecutiveErrors > 0 ? "bg-[var(--admin-red)] animate-pulse" : "bg-[var(--admin-green)]"
            : "bg-[var(--admin-muted)]"
        )} />
      </div>

      <p className="mt-2 font-mono text-[10px] text-[var(--admin-muted)] truncate">{target.url}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
        <span className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[var(--admin-muted)]">
          {strategyLabel[target.scrapeStrategy]}
        </span>
        {target.region && (
          <span className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-1.5 py-0.5 text-[var(--admin-muted)]">
            {target.region}
          </span>
        )}
        <span className="text-[var(--admin-muted)]">
          <Clock size={9} className="mr-0.5 inline" />
          {formatRelative(target.lastScrapedAt)}
        </span>
      </div>

      {target.consecutiveErrors > 0 && (
        <p className="mt-2 text-[10px] font-semibold text-[var(--admin-red)]">
          <AlertTriangle size={10} className="mr-0.5 inline" />
          {target.consecutiveErrors} erro(s) consecutivo(s)
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex items-center gap-1 border-t border-[var(--admin-border)] pt-3">
        <button type="button" onClick={onToggle} disabled={toggling} title={target.enabled ? "Pausar" : "Ativar"}
          className={cn("rounded-md px-2 py-1.5 text-[10px] font-semibold transition", target.enabled ? "text-[var(--admin-green)] hover:bg-[rgba(34,197,94,0.12)]" : "text-[var(--admin-muted)] hover:bg-[rgba(255,255,255,0.06)]")}>
          {toggling ? <Loader2 size={12} className="animate-spin" /> : target.enabled ? <><Pause size={10} className="mr-1 inline" />Pausar</> : <><Play size={10} className="mr-1 inline" />Ativar</>}
        </button>
        <button type="button" onClick={onRun} disabled={running || !target.enabled} title="Coletar agora"
          className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.1)] transition disabled:opacity-30">
          {running ? <Loader2 size={12} className="animate-spin" /> : <><Zap size={10} className="mr-1 inline" />Coletar</>}
        </button>
        <button type="button" onClick={onEdit} title="Editar" className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-[var(--admin-yellow)] hover:bg-[rgba(234,179,8,0.1)] transition">
          <Pencil size={10} className="mr-1 inline" />Editar
        </button>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} title="Excluir" className="ml-auto rounded-md p-1.5 text-[var(--admin-red)] hover:bg-[rgba(239,68,68,0.1)] transition opacity-0 group-hover:opacity-100">
            <Trash2 size={12} />
          </button>
        ) : (
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => { onDelete(); setConfirmDelete(false); }} disabled={deleting} className="rounded-md bg-[rgba(239,68,68,0.2)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-red)]">
              {deleting ? <Loader2 size={10} className="animate-spin" /> : "Excluir"}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 text-[10px] text-[var(--admin-muted)] hover:text-white">
              Nao
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TargetListRow(props: TargetActionProps) {
  const { target, onToggle, onEdit, onRun, onDelete, toggling, running, deleting } = props;
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-4 py-2.5">
      <span className={cn("h-2 w-2 shrink-0 rounded-full", target.enabled ? target.consecutiveErrors > 0 ? "bg-[var(--admin-red)]" : "bg-[var(--admin-green)]" : "bg-[var(--admin-muted)]")} />
      <span className="text-sm">{targetTypeIcon[target.targetType]}</span>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold text-white">{target.name}</span>
        <span className="ml-2 text-[10px] text-[var(--admin-muted)]">{target.region || ""}</span>
      </div>
      <span className="text-[10px] text-[var(--admin-muted)]">{formatRelative(target.lastScrapedAt)}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onToggle} disabled={toggling} className={cn("rounded-md p-1.5 transition", target.enabled ? "text-[var(--admin-green)] hover:bg-[rgba(34,197,94,0.12)]" : "text-[var(--admin-muted)] hover:bg-[rgba(255,255,255,0.06)]")}>
          {toggling ? <Loader2 size={13} className="animate-spin" /> : target.enabled ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button type="button" onClick={onRun} disabled={running || !target.enabled} className="rounded-md p-1.5 text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.1)] transition disabled:opacity-30">
          {running ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
        </button>
        <button type="button" onClick={onEdit} className="rounded-md p-1.5 text-[var(--admin-yellow)] hover:bg-[rgba(234,179,8,0.1)] transition">
          <Pencil size={13} />
        </button>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className="rounded-md p-1.5 text-[var(--admin-red)] hover:bg-[rgba(239,68,68,0.1)] transition">
            <Trash2 size={13} />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => { onDelete(); setConfirmDelete(false); }} disabled={deleting} className="rounded-md bg-[rgba(239,68,68,0.2)] px-2 py-1 text-[10px] font-semibold text-[var(--admin-red)]">
              {deleting ? <Loader2 size={10} className="animate-spin" /> : "Sim"}
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 text-[10px] text-[var(--admin-muted)]">Nao</button>
          </div>
        )}
      </div>
    </div>
  );
}

function RunCard({ run }: { run: ScraperRun }) {
  const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
    completed: { icon: <CheckCircle2 size={12} />, color: "var(--admin-green)", label: "Sucesso" },
    failed: { icon: <AlertTriangle size={12} />, color: "var(--admin-red)", label: "Falha" },
    running: { icon: <Loader2 size={12} className="animate-spin" />, color: "var(--admin-cyan)", label: "Executando" },
    partial: { icon: <Activity size={12} />, color: "var(--admin-yellow)", label: "Parcial" },
    queued: { icon: <Clock size={12} />, color: "var(--admin-muted)", label: "Na fila" },
  };
  const cfg = statusConfig[run.status] || statusConfig["queued"];

  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: cfg.color }}>{cfg.icon}</span>
          <span className="text-xs font-semibold text-white">{run.targetName || run.runCode}</span>
        </div>
        <span className="text-[10px] text-[var(--admin-muted)]">{formatRelative(run.createdAt)}</span>
      </div>
      {(run.itemsFound > 0 || run.itemsIngested > 0) && (
        <div className="mt-2 flex gap-3 text-[10px]">
          <span className="text-[var(--admin-cyan)]">{run.itemsFound} encontrados</span>
          <span className="text-[var(--admin-green)]">{run.itemsIngested} ingeridos</span>
          {run.pagesScraped > 0 && <span className="text-[var(--admin-muted)]">{run.pagesScraped} pag</span>}
        </div>
      )}
      {run.errorMessage && (
        <p className="mt-1 text-[10px] text-[var(--admin-red)] truncate">{run.errorMessage}</p>
      )}
    </div>
  );
}
