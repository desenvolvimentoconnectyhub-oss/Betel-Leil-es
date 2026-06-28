"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Bot,
  Search,
  Shield,
  FileSearch,
  Eye,
  Users,
  Send,
  Megaphone,
  Radio,
  Swords,
  Gavel,
  PenTool,
  Newspaper,
  Globe,
  AlertTriangle,
  ChevronRight,
  Camera,
  Loader2,
  Save,
  CheckCircle2,
  Pencil,
  XCircle,
} from "lucide-react";
import Image from "next/image";
import { WillianAgentPanel } from "@/components/admin/WillianAgentPanel";
import type { AdminModule } from "@/lib/admin/modules";
import type { AgentOfficeData, DataResult } from "@/lib/admin/repository";
import type { WillianAgentConfig, WillianInstanceState } from "@/lib/communication/willian-types";
import type {
  AgentGroup,
  AgentDirectoryEntry,
  AgentWorkflowEdge,
} from "@/lib/admin/agent-workforce";
import type { ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneSolid: Record<ResourceTone, string> = {
  cyan: "bg-[rgba(0,243,255,0.15)] border-[rgba(0,243,255,0.3)]",
  green: "bg-[rgba(34,197,94,0.15)] border-[rgba(34,197,94,0.3)]",
  yellow: "bg-[rgba(234,179,8,0.15)] border-[rgba(234,179,8,0.3)]",
  red: "bg-[rgba(239,68,68,0.15)] border-[rgba(239,68,68,0.3)]",
  purple: "bg-[rgba(139,92,246,0.15)] border-[rgba(139,92,246,0.3)]",
  muted: "bg-[rgba(255,255,255,0.05)] border-[var(--admin-border)]",
};

const iconMap: Record<string, typeof Bot> = {
  "source-scout": Search,
  "source-watchdog": Eye,
  "notice-curator": FileSearch,
  "hidden-risk": Shield,
  "human-handoff": Users,
  "compliance-guard": Shield,
  "paid-lead-alert": Send,
  "cold-lead-teaser": Megaphone,
  "community-broadcaster": Radio,
  "multichannel-dispatch": Send,
  "bid-strategy": Swords,
  "post-auction": Gavel,
  "blog-writer": PenTool,
  "news-writer": Newspaper,
  "site-publisher": Globe,
  "admin-alert": AlertTriangle,
};

type AgentType = "coletor" | "consumidor" | "hibrido";

function getAgentType(key: string): AgentType {
  if (["source-scout", "source-watchdog"].includes(key)) return "coletor";
  if (
    [
      "paid-lead-alert",
      "cold-lead-teaser",
      "community-broadcaster",
      "multichannel-dispatch",
      "blog-writer",
      "news-writer",
      "admin-alert",
    ].includes(key)
  )
    return "consumidor";
  return "hibrido";
}

const typeLabel: Record<AgentType, string> = {
  coletor: "COLETOR",
  consumidor: "CONSUMIDOR",
  hibrido: "HIBRIDO",
};

const typeColor: Record<AgentType, string> = {
  coletor: "text-[var(--admin-cyan)]",
  consumidor: "text-[var(--admin-green)]",
  hibrido: "text-[var(--admin-yellow)]",
};

const statusLabel: Record<string, string> = {
  active: "Ativo",
  supervised: "Supervisionado",
  paused: "Pausado",
  planned: "Planejado",
};

function AgentAvatar({
  agentKey,
  avatarUrl,
  tone,
  size = "md",
}: {
  agentKey: string;
  avatarUrl?: string | null;
  tone: ResourceTone;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = iconMap[agentKey] || Bot;
  const sizeClass = size === "sm" ? "size-11" : size === "lg" ? "size-16" : "size-12";
  const iconSize = size === "sm" ? 20 : size === "lg" ? 32 : 24;
  const roundedClass = size === "lg" ? "rounded-2xl" : "rounded-full";
  const borderClass = size === "lg" ? "border-2" : "border";

  if (avatarUrl) {
    const isDataUrl = avatarUrl.startsWith("data:");
    return (
      <div className={cn("relative shrink-0 overflow-hidden", sizeClass, roundedClass, borderClass, toneSolid[tone])}>
        {isDataUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={avatarUrl} alt={agentKey} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Image
            src={avatarUrl}
            alt={agentKey}
            fill
            className="object-cover"
            sizes={size === "lg" ? "64px" : size === "sm" ? "44px" : "48px"}
          />
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex shrink-0 items-center justify-center", sizeClass, roundedClass, borderClass, toneSolid[tone])}>
      <Icon size={iconSize} className={toneText[tone]} />
    </div>
  );
}

function getIntelligenceData(agent: AgentDirectoryEntry, groups: AgentGroup[], edges: AgentWorkflowEdge[]) {
  const group = groups.find((g) => g.agents.some((a) => a.key === agent.key));
  const agentDef = group?.agents.find((a) => a.key === agent.key);

  const consome = agentDef?.inputs || [];
  const alimenta = agentDef?.outputs || [];

  const entregaPara = edges
    .filter((e) => e.fromAgentKey === agent.key)
    .map((e) => e.toAgent.split(" — ")[0]);

  const recebeDe = edges
    .filter((e) => e.toAgentKey === agent.key)
    .map((e) => e.fromAgent.split(" — ")[0]);

  const isCollector = consome.length > 0 && alimenta.length > 0;
  const hasCycle = recebeDe.length > 0 && entregaPara.length > 0;

  let cicloLabel = "CONTRATO DEFINIDO";
  if (hasCycle && isCollector) cicloLabel = "CICLO COMPLETO";
  else if (entregaPara.length === 0) cicloLabel = "TERMINAL";

  return { consome, alimenta, entregaPara, recebeDe, cicloLabel, agentDef };
}

export function AgentOfficePage({
  module,
  officeData,
}: {
  module: AdminModule;
  officeData: DataResult<AgentOfficeData>;
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const data = officeData.data;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"todos" | AgentType>("todos");
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => data.directory[0]?.key || null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [avatars, setAvatars] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const agent of data.directory) {
      if (agent.avatarIcon) initial[agent.key] = agent.avatarIcon;
    }
    return initial;
  });
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const handleAvatarUpload = useCallback(async (agentKey: string, file: File) => {
    setUploadingKey(agentKey);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("agentKey", agentKey);

      const res = await fetch("/api/admin/agentes-ia/avatar", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (result.success && result.avatarUrl) {
        setAvatars((prev) => ({ ...prev, [agentKey]: result.avatarUrl }));
      }
    } catch {
      // silently fail
    } finally {
      setUploadingKey(null);
    }
  }, []);

  const filtered = useMemo(() => {
    let agents = data.directory;

    if (search) {
      const q = search.toLowerCase();
      agents = agents.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.department.toLowerCase().includes(q) ||
          a.jobTitle.toLowerCase().includes(q)
      );
    }

    if (activeTab !== "todos") {
      agents = agents.filter((a) => getAgentType(a.key) === activeTab);
    }

    if (activeGroup) {
      agents = agents.filter((a) => {
        const group = data.groups.find((g) => g.agents.some((ag) => ag.key === a.key));
        return group?.key === activeGroup;
      });
    }

    return agents;
  }, [data, search, activeTab, activeGroup]);

  const effectiveSelectedKey =
    selectedKey && filtered.some((agent) => agent.key === selectedKey)
      ? selectedKey
      : filtered[0]?.key || null;

  const selected = effectiveSelectedKey
    ? data.directory.find((a) => a.key === effectiveSelectedKey) || null
    : null;

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const agent of data.directory) {
      const group = data.groups.find((g) => g.agents.some((a) => a.key === agent.key));
      if (group) counts[group.key] = (counts[group.key] || 0) + 1;
    }
    return counts;
  }, [data]);

  const typeCounts = useMemo(() => {
    const counts: Record<AgentType, number> = { coletor: 0, consumidor: 0, hibrido: 0 };
    for (const agent of data.directory) {
      counts[getAgentType(agent.key)]++;
    }
    return counts;
  }, [data]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-[var(--admin-border)] bg-[var(--admin-card)] px-5 py-6 lg:px-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-yellow)]">
              AGENTES
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Escritorio dos colaboradores digitais
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--admin-muted)]">
              Central para visualizar, organizar e controlar os prompts dos agentes que
              trabalham no ecossistema Betel AI.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-green)]">
            <span className="size-2 rounded-full bg-[var(--admin-green)]" />
            Operacao ativa
          </div>
        </div>
      </header>

      {/* Search + Tabs + Filters + Carousel */}
      <section className="border-b border-[var(--admin-border)] bg-[var(--admin-card)] px-5 py-5 lg:px-8">
        {/* Search bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--admin-muted)]"
            />
            <input
              type="text"
              placeholder="Buscar agente, setor ou funcao"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] pl-9 pr-3 text-sm text-white placeholder:text-[var(--admin-muted)] outline-none transition focus:border-[var(--admin-cyan)]"
            />
          </div>
          <span className="text-sm font-semibold text-white">
            {filtered.length}{" "}
            <span className="font-normal text-[var(--admin-muted)]">AGENTES NA VISAO</span>
          </span>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-0 border-b border-[var(--admin-border)]">
          {(
            [
              { key: "todos" as const, label: "TODOS", count: data.directory.length },
              { key: "coletor" as const, label: "COLETORES", count: typeCounts.coletor },
              { key: "consumidor" as const, label: "CONSUMIDORES", count: typeCounts.consumidor },
              { key: "hibrido" as const, label: "HIBRIDOS", count: typeCounts.hibrido },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setSelectedKey(null);
              }}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold tracking-[0.08em] transition",
                activeTab === tab.key
                  ? "border-white text-white"
                  : "border-transparent text-[var(--admin-muted)] hover:text-white"
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px]",
                  activeTab === tab.key
                    ? "bg-white/10 text-white"
                    : "bg-white/5 text-[var(--admin-muted)]"
                )}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Group filter chips */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveGroup(null);
              setSelectedKey(null);
            }}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              !activeGroup
                ? "bg-white text-black"
                : "bg-[rgba(255,255,255,0.06)] text-[var(--admin-muted)] hover:text-white"
            )}
          >
            Todos {data.directory.length}
          </button>
          {data.groups.map((group) => (
            <button
              key={group.key}
              type="button"
              onClick={() => {
                setActiveGroup(activeGroup === group.key ? null : group.key);
                setSelectedKey(null);
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                activeGroup === group.key
                  ? "bg-white text-black"
                  : "bg-[rgba(255,255,255,0.06)] text-[var(--admin-muted)] hover:text-white"
              )}
            >
              {group.name.replace("Grupo ", "")} {groupCounts[group.key] || 0}
            </button>
          ))}
        </div>

        {/* Agent carousel */}
        <div className="relative mt-5">
          <div
            ref={scrollRef}
            className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[var(--admin-border)]"
          >
            {filtered.map((agent) => {
              const type = getAgentType(agent.key);
              const isSelected = effectiveSelectedKey === agent.key;

              return (
                <button
                  key={agent.key}
                  type="button"
                  onClick={() => setSelectedKey(agent.key)}
                  className={cn(
                    "flex shrink-0 items-center gap-3 rounded-xl border px-4 py-3 transition",
                    isSelected
                      ? "border-[var(--admin-cyan)] bg-[rgba(0,243,255,0.06)]"
                      : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(255,255,255,0.15)]"
                  )}
                  style={{ minWidth: 200 }}
                >
                  <AgentAvatar agentKey={agent.key} avatarUrl={avatars[agent.key]} tone={agent.tone} size="sm" />
                  <div className="min-w-0 text-left">
                    <p className="truncate text-sm font-semibold text-white">{agent.name.replace("Agente ", "")}</p>
                    <p className="truncate text-[11px] text-[var(--admin-muted)]">
                      {agent.jobTitle}
                    </p>
                    <p className={cn("mt-0.5 text-[10px] font-bold tracking-[0.12em]", typeColor[type])}>
                      {typeLabel[type]}
                    </p>
                  </div>
                  <ChevronRight size={14} className="shrink-0 text-[var(--admin-muted)]" />
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Selected agent detail */}
      {selected && (
        <AgentDetailPanel
          agent={selected}
          groups={data.groups}
          edges={data.workflowEdges}
          avatarUrl={avatars[selected.key]}
          uploadingKey={uploadingKey}
          onAvatarUpload={handleAvatarUpload}
          willianInstance={data.willianInstance}
          willianAgentConfig={data.willianAgentConfig}
        />
      )}
    </div>
  );
}

function AgentDetailPanel({
  agent,
  groups,
  edges,
  avatarUrl,
  uploadingKey,
  onAvatarUpload,
  willianInstance,
  willianAgentConfig,
}: {
  agent: AgentDirectoryEntry;
  groups: AgentGroup[];
  edges: AgentWorkflowEdge[];
  avatarUrl?: string | null;
  uploadingKey: string | null;
  onAvatarUpload: (agentKey: string, file: File) => void;
  willianInstance?: WillianInstanceState;
  willianAgentConfig?: WillianAgentConfig;
}) {
  const group = groups.find((g) => g.agents.some((a) => a.key === agent.key));
  const intel = getIntelligenceData(agent, groups, edges);
  const type = getAgentType(agent.key);
  const agentDef = intel.agentDef;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploading = uploadingKey === agent.key;

  return (
    <div className="px-5 py-6 lg:px-8">
      {/* Group header */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-yellow)]">
          {group ? group.name.replace("Grupo ", "").toUpperCase() : agent.department.toUpperCase()} — BETEL AI
        </p>
        <div className="flex items-center gap-1.5 rounded-full border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1 text-[10px] font-bold tracking-[0.08em] text-[var(--admin-green)]">
          <CheckCircle2 size={12} />
          {statusLabel[agent.status] ? statusLabel[agent.status].toUpperCase() : "CONFIGURADO"}
        </div>
      </div>

      {/* Agent identity */}
      <div className="mt-4 flex items-start gap-5">
        <div className="relative">
          <AgentAvatar agentKey={agent.key} avatarUrl={avatarUrl} tone={agent.tone} size="lg" />
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60">
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-white">{agent.name}</h2>
          <p className="mt-0.5 text-sm text-[var(--admin-muted)]">{agent.jobTitle}</p>
          <p className="mt-3 text-sm leading-6 text-[var(--admin-muted)]">
            {agent.functionSummary}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onAvatarUpload(agent.key, file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-muted)] transition hover:border-[var(--admin-cyan)] hover:text-white disabled:opacity-50"
          >
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
            {avatarUrl ? "TROCAR FOTO" : "ENVIAR FOTO"}
          </button>
        </div>
      </div>

      {/* Central de Inteligencia */}
      <div className="mt-8 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot size={16} className="text-[var(--admin-muted)]" />
            <h3 className="text-base font-semibold text-white">Central de Inteligencia</h3>
          </div>
          <span
            className={cn(
              "rounded-full border px-3 py-1 text-[10px] font-bold tracking-[0.1em]",
              intel.cicloLabel === "CICLO COMPLETO"
                ? "border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.08)] text-[var(--admin-cyan)]"
                : intel.cicloLabel === "TERMINAL"
                  ? "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
                  : "border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
            )}
          >
            {intel.cicloLabel}
          </span>
        </div>

        <p className="mt-2 text-sm text-[var(--admin-muted)]">
          {agent.name} opera como agente de{" "}
          <span className="text-white">{typeLabel[type].toLowerCase()}</span> e participa do
          ciclo de coleta, consumo e handoff de dados.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <IntelColumn
            label="CONSOME DA CENTRAL"
            items={intel.consome}
            tone="cyan"
          />
          <IntelColumn
            label="ALIMENTA A CENTRAL"
            items={intel.alimenta}
            tone="green"
          />
          <IntelColumn
            label="ENTREGA PARA"
            items={intel.entregaPara}
            tone="yellow"
          />
        </div>
      </div>

      {agent.key === "multichannel-dispatch" && (
        <WillianAgentPanel initialState={willianInstance} initialConfig={willianAgentConfig} />
      )}

      {/* Guardrails */}
      {agentDef && agentDef.guardrails.length > 0 && (
        <div className="mt-6 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-5">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[var(--admin-red)]" />
            <h3 className="text-base font-semibold text-white">Guardrails</h3>
          </div>
          <ul className="mt-3 space-y-2">
            {agentDef.guardrails.map((g) => (
              <li key={g} className="flex items-start gap-2 text-sm text-[var(--admin-muted)]">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[var(--admin-red)]" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Prompt do agente — editavel */}
      <AgentPromptPanel agentKey={agent.key} promptName={agent.promptName} promptVersion={agent.promptVersion} />

      {/* Dados tecnicos */}
      <div className="mt-6 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
          Dados do contrato
        </h3>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <InfoCell label="Agent key" value={agent.key} mono />
          <InfoCell label="Grupo" value={group?.key || "—"} mono />
          <InfoCell label="Departamento" value={agent.department} />
          <InfoCell label="Reporta a" value={agent.reportsTo} />
          <InfoCell label="Prompt" value={`${agent.promptName} ${agent.promptVersion}`} mono />
          <InfoCell label="Status" value={statusLabel[agent.status] || agent.status} />
          <InfoCell label="Turno" value={agent.currentShift} />
          <InfoCell label="Mesa" value={agent.currentDesk} />
        </div>
      </div>
    </div>
  );
}

function AgentPromptPanel({ agentKey, promptName, promptVersion }: { agentKey: string; promptName: string; promptVersion: string }) {
  const [prompt, setPrompt] = useState("");
  const [original, setOriginal] = useState("");
  const [loadedAgentKey, setLoadedAgentKey] = useState("");
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);
  const [source, setSource] = useState("");
  const loaded = loadedAgentKey === agentKey;

  useEffect(() => {
    let active = true;

    fetch(`/api/admin/agentes-ia/prompt?agentKey=${encodeURIComponent(agentKey)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!active) return;
        setMode("view");
        setFeedback(null);
        if (d.ok) {
          setPrompt(d.prompt || "");
          setOriginal(d.prompt || "");
          setSource(d.source || "");
        }
        setLoadedAgentKey(agentKey);
      })
      .catch(() => {
        if (active) setLoadedAgentKey(agentKey);
      });

    return () => {
      active = false;
    };
  }, [agentKey]);

  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const charCount = prompt.length;

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/agentes-ia/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentKey, prompt }),
      });
      const result = await res.json();
      if (result.ok) {
        setFeedback({ type: "ok", msg: "Prompt salvo com sucesso!" });
        setOriginal(prompt);
        setMode("view");
        setTimeout(() => setFeedback(null), 4000);
      } else {
        setFeedback({ type: "err", msg: result.error || "Erro ao salvar." });
      }
    } catch {
      setFeedback({ type: "err", msg: "Erro de rede." });
    }
    setSaving(false);
  }

  return (
    <div className="mt-6 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-card)] p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h3 className="text-base font-semibold text-white">Prompt do agente</h3>
          {source === "builtin" && (
            <span className="rounded border border-[rgba(139,92,246,0.3)] bg-[rgba(139,92,246,0.08)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--admin-purple)]">PADRAO</span>
          )}
          {source === "supabase" && (
            <span className="rounded border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--admin-green)]">PERSONALIZADO</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--admin-muted)]">{wordCount} palavras · {charCount} caracteres</span>
          <button
            type="button"
            onClick={() => setMode(mode === "view" ? "edit" : "view")}
            className={cn(
              "flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition",
              mode === "edit"
                ? "text-[var(--admin-cyan)] bg-[rgba(0,243,255,0.1)]"
                : "text-[var(--admin-muted)] hover:text-white"
            )}
          >
            {mode === "edit" ? <><Eye size={11} /> Visualizar</> : <><Pencil size={11} /> Editar</>}
          </button>
        </div>
      </div>

      <p className="mt-2 text-xs text-[var(--admin-muted)]">
        Chave: <span className="font-mono text-white">{promptName}</span>{" "}
        <span className="text-[var(--admin-muted)]">{promptVersion}</span>
      </p>

      {!loaded ? (
        <div className="mt-4 flex items-center justify-center py-8">
          <Loader2 size={18} className="animate-spin text-[var(--admin-muted)]" />
        </div>
      ) : mode === "view" ? (
        prompt ? (
          <div className="mt-4 max-h-96 overflow-auto rounded-lg border border-[var(--admin-border)] bg-[rgba(0,0,0,0.4)] p-4">
            <div className="space-y-3">
              {prompt.split(/\n## /).map((section, idx) => {
                if (idx === 0) {
                  return (
                    <p key={idx} className="text-sm leading-relaxed text-[var(--admin-muted)]">
                      {section.replace(/^## /, "")}
                    </p>
                  );
                }
                const [title, ...body] = section.split("\n");
                return (
                  <div key={idx}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--admin-cyan)] mb-1">{title}</p>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--admin-muted)]">{body.join("\n").trim()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(0,0,0,0.2)] py-8 text-center">
            <p className="text-sm text-[var(--admin-muted)]">Nenhum prompt configurado para este agente.</p>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-3 py-1.5 text-xs font-semibold text-[var(--admin-cyan)]"
            >
              <Pencil size={12} /> Criar Prompt
            </button>
          </div>
        )
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-[10px] text-[var(--admin-muted)]">
            Edite o system prompt deste agente. Use <code className="text-[var(--admin-cyan)]">## </code> para criar secoes.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={18}
            className="w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(0,0,0,0.4)] p-4 font-mono text-xs leading-relaxed text-white placeholder:text-[var(--admin-muted)] outline-none transition focus:border-[var(--admin-cyan)]"
            placeholder={`Voce e [Nome], agente [Funcao] da Betel AI.

## Objetivo
Descreva o que este agente faz...

## Formato de Entrada
O que ele recebe como input...

## Formato de Saida
JSON com os campos esperados...

## Regras
1. Regra importante`}
          />
          <div className="flex items-center justify-between">
            <div>
              {feedback && (
                <span className={cn(
                  "flex items-center gap-1 text-xs font-semibold",
                  feedback.type === "ok" ? "text-[var(--admin-green)]" : "text-[var(--admin-red)]"
                )}>
                  {feedback.type === "ok" ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {feedback.msg}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { setPrompt(original); setMode("view"); setFeedback(null); }}
                className="rounded-md border border-[var(--admin-border)] px-4 py-2 text-xs font-semibold text-[var(--admin-muted)] transition hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || prompt === original}
                className="inline-flex items-center gap-2 rounded-md border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.12)] px-4 py-2 text-xs font-semibold text-[var(--admin-cyan)] transition hover:bg-[rgba(0,243,255,0.2)] disabled:opacity-40"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Salvar Prompt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IntelColumn({
  label,
  items,
  tone,
}: {
  label: string;
  items: string[];
  tone: ResourceTone;
}) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
      <p className={cn("text-[10px] font-bold uppercase tracking-[0.14em]", toneText[tone])}>
        {label}
      </p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--admin-muted)]">—</p>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
          {items.join(", ").toLowerCase()}
        </p>
      )}
    </div>
  );
}

function InfoCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
        {label}
      </p>
      <p className={cn("mt-1 text-white", mono && "font-mono")}>{value}</p>
    </div>
  );
}
