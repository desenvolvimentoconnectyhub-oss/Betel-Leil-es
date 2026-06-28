"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bot,
  CheckCircle2,
  Clock3,
  Cpu,
  Eye,
  FileText,
  Loader2,
  Pencil,
  PlayCircle,
  Save,
  Settings,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { AgentProfileData, DataResult } from "@/lib/admin/repository";
import type { AgentStatus } from "@/lib/admin/agent-workforce";
import type { ResourceTone } from "@/lib/admin/resources";
import { updateAgentProfileAction, saveAgentPromptAction } from "@/app/admin/agentes-ia/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardCard } from "./DashboardCard";
import { StatusBadge } from "./StatusBadge";
import { cn } from "@/lib/utils";

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBg: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)]",
  yellow: "border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)]",
  red: "border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.08)]",
  purple: "border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]",
};

const statusLabel: Record<AgentStatus, string> = {
  active: "Ativo",
  supervised: "Supervisionado",
  paused: "Pausado",
  planned: "Planejado",
};

const inputClass =
  "h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-sm text-white outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(0,243,255,0.18)]";

const labelClass = "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

function RunStatusIcon({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "completed") return <CheckCircle2 size={14} className="text-[var(--admin-green)]" />;
  if (s === "running") return <PlayCircle size={14} className="text-[var(--admin-cyan)]" />;
  if (s === "failed" || s === "blocked") return <XCircle size={14} className="text-[var(--admin-red)]" />;
  if (s === "waiting_human") return <Clock3 size={14} className="text-[var(--admin-yellow)]" />;
  return <Clock3 size={14} className="text-[var(--admin-muted)]" />;
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function AgentProfilePage({ profile }: { profile: DataResult<AgentProfileData> }) {
  const agent = profile.data;

  return (
    <div className="flex min-h-screen flex-col gap-6 p-4 md:p-6">
      {/* Back link */}
      <Link
        href="/admin/agentes-ia"
        className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-[var(--admin-muted)] transition hover:text-white"
      >
        <ArrowLeft size={14} />
        Voltar ao Escritorio
      </Link>

      {/* Header */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border",
              toneBg[agent.tone]
            )}
          >
            <Bot size={28} className={toneText[agent.tone]} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white">{agent.name}</h1>
              <StatusBadge tone={agent.tone}>{statusLabel[agent.status]}</StatusBadge>
            </div>
            <p className="mt-0.5 text-sm text-[var(--admin-muted)]">{agent.role}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
              {agent.group.name && (
                <span className={cn("rounded border px-2 py-0.5", toneBg[agent.tone])}>
                  {agent.group.name}
                </span>
              )}
              {agent.department && (
                <span className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5">
                  {agent.department}
                </span>
              )}
              <span className="rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 py-0.5">
                Reporta: {agent.reportsTo}
              </span>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="flex gap-3">
          <QuickStat label="Runs hoje" value={String(agent.runsToday)} icon={<Activity size={14} />} />
          <QuickStat label="Ultimo run" value={formatDate(agent.lastRunAt)} icon={<Clock3 size={14} />} />
          <QuickStat label="Modo" value={agent.runtimeMode || "mock"} icon={<Cpu size={14} />} />
        </div>
      </header>

      {profile.source === "mock" && profile.reason && (
        <div className="rounded-lg border border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.06)] px-4 py-3 text-xs text-[var(--admin-yellow)]">
          Dados mock: {profile.reason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: description + prompt + triggers */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Description */}
          {(agent.description || agent.role) && (
            <DashboardCard title="Sobre este agente" eyebrow="perfil">
              <p className="text-sm leading-relaxed text-[var(--admin-muted)]">
                {agent.description || agent.role}
              </p>
              {agent.triggerType && (
                <div className="mt-3">
                  <span className={labelClass}>Trigger: </span>
                  <span className="text-xs text-white">{agent.triggerType}</span>
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-4">
                {agent.inputs.length > 0 && (
                  <TagList label="Inputs" items={agent.inputs} tone="cyan" />
                )}
                {agent.outputs.length > 0 && (
                  <TagList label="Outputs" items={agent.outputs} tone="green" />
                )}
                {agent.guardrails.length > 0 && (
                  <TagList label="Guardrails" items={agent.guardrails} tone="red" />
                )}
              </div>
            </DashboardCard>
          )}

          {/* System prompt — editavel */}
          <EditablePromptCard agent={agent} />

          {/* Recent runs */}
          <DashboardCard
            title="Historico de Execucoes"
            eyebrow="agent_runs"
            action={
              <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
                {agent.recentRuns.length} run(s)
              </span>
            }
          >
            {agent.recentRuns.length === 0 ? (
              <p className="text-xs italic text-[var(--admin-muted)]">Nenhuma execucao registrada.</p>
            ) : (
              <div className="space-y-1.5">
                {agent.recentRuns.map((run) => (
                  <div
                    key={run.id}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <RunStatusIcon status={run.status} />
                      <span className="truncate font-mono text-xs text-white">
                        {run.opportunity || "—"}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <StatusBadge tone={run.tone}>{run.status}</StatusBadge>
                      {run.durationMs !== undefined && run.durationMs > 0 && (
                        <span className="font-mono text-[10px] text-[var(--admin-muted)]">
                          {run.durationMs}ms
                        </span>
                      )}
                      {run.costEstimate !== undefined && run.costEstimate > 0 && (
                        <span className="font-mono text-[10px] text-[var(--admin-muted)]">
                          R$ {run.costEstimate.toFixed(4)}
                        </span>
                      )}
                      {run.startedAt && (
                        <span className="font-mono text-[10px] text-[var(--admin-muted)]">
                          {formatDate(run.startedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          {/* Runtime events */}
          {agent.runtimeEvents.length > 0 && (
            <DashboardCard
              title="Eventos de Runtime"
              eyebrow="agent_runtime_events"
              action={
                <span className="text-[10px] font-semibold text-[var(--admin-muted)]">
                  {agent.runtimeEvents.length} evento(s)
                </span>
              }
            >
              <div className="space-y-1.5">
                {agent.runtimeEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="flex items-center justify-between gap-3 rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Activity size={12} className={toneText[evt.tone]} />
                      <span className="truncate text-xs text-white">{evt.message}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--admin-muted)]">
                        {evt.provider}/{evt.model}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--admin-muted)]">
                        {formatDate(evt.createdAt)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          )}
        </div>

        {/* Right column: controls */}
        <div className="flex flex-col gap-6">
          <DashboardCard title="Controles" eyebrow="admin" action={<Settings size={14} className="text-[var(--admin-muted)]" />}>
            <form action={updateAgentProfileAction} className="space-y-4">
              <input type="hidden" name="agentKey" value={agent.key} />

              <div className="space-y-1.5">
                <Label className={labelClass}>Status</Label>
                <select name="status" defaultValue={agent.status} className={selectClass}>
                  <option value="active">Ativo</option>
                  <option value="supervised">Supervisionado</option>
                  <option value="paused">Pausado</option>
                  <option value="planned">Planejado</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>Descricao</Label>
                <Textarea
                  name="description"
                  defaultValue={agent.description}
                  placeholder="Descreva o que este agente faz..."
                  className={cn(inputClass, "min-h-20 py-2")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>Icone (Lucide)</Label>
                <Input
                  name="avatarIcon"
                  defaultValue={agent.avatarIcon}
                  placeholder="Bot, ShieldCheck, FileSearch..."
                  className={inputClass}
                />
              </div>

              <div className="h-px bg-[var(--admin-border)]" />

              <div className="space-y-1.5">
                <Label className={labelClass}>Modo de Runtime</Label>
                <select name="runtimeMode" defaultValue={agent.runtimeMode} className={selectClass}>
                  <option value="mock">Mock auditavel</option>
                  <option value="sandbox">Sandbox</option>
                  <option value="provider">Provider real</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>Provider</Label>
                <Input
                  name="preferredProvider"
                  defaultValue={agent.preferredProvider}
                  placeholder="gemini, openai..."
                  className={inputClass}
                />
              </div>

              <div className="space-y-1.5">
                <Label className={labelClass}>Modelo</Label>
                <Input
                  name="preferredModel"
                  defaultValue={agent.preferredModel}
                  placeholder="gemini-2.5-flash..."
                  className={inputClass}
                />
              </div>

              <div className="h-px bg-[var(--admin-border)]" />

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className={labelClass}>Custo max/run (R$)</Label>
                  <Input
                    name="maxCostPerRun"
                    type="number"
                    step="0.01"
                    defaultValue={agent.maxCostPerRun || ""}
                    placeholder="0.50"
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className={labelClass}>Limite diario</Label>
                  <Input
                    name="dailyRunLimit"
                    type="number"
                    defaultValue={agent.dailyRunLimit || ""}
                    placeholder="100"
                    className={inputClass}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full gap-2 border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.12)] text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.2)]"
              >
                <Save size={14} />
                Salvar alteracoes
              </Button>
            </form>
          </DashboardCard>

          {/* Info card */}
          <DashboardCard eyebrow="dados tecnicos">
            <dl className="space-y-2 text-xs">
              <InfoRow label="Agent key" value={agent.key} mono />
              <InfoRow label="Prompt" value={`${agent.promptName} ${agent.promptVersion}`} mono />
              <InfoRow label="Grupo" value={agent.group.key} mono />
              <InfoRow label="Provider" value={agent.preferredProvider || "—"} />
              <InfoRow label="Modelo" value={agent.preferredModel || "—"} />
              <InfoRow label="Runtime" value={agent.runtimeMode} />
              <InfoRow label="Runs hoje" value={String(agent.runsToday)} />
              <InfoRow label="Limite diario" value={agent.dailyRunLimit ? String(agent.dailyRunLimit) : "Sem limite"} />
              <InfoRow label="Custo max" value={agent.maxCostPerRun ? `R$ ${agent.maxCostPerRun.toFixed(2)}` : "—"} />
              <InfoRow label="Ultimo status" value={agent.lastRunStatus || "—"} />
              <InfoRow label="Fonte" value={profile.source} mono />
            </dl>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-[var(--admin-muted)]">{icon}</div>
      <span className="font-mono text-sm font-semibold text-white">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">
        {label}
      </span>
    </div>
  );
}

function TagList({ label, items, tone }: { label: string; items: string[]; tone: ResourceTone }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((item) => (
          <span
            key={item}
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              toneBg[tone],
              toneText[tone]
            )}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[var(--admin-muted)]">{label}</dt>
      <dd className={cn("text-right text-white", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function EditablePromptCard({ agent }: { agent: AgentProfileData }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [promptText, setPromptText] = useState(agent.systemPrompt);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; msg: string } | null>(null);

  const wordCount = promptText.trim() ? promptText.trim().split(/\s+/).length : 0;
  const charCount = promptText.length;

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    const result = await saveAgentPromptAction(agent.key, promptText);
    if (result.ok) {
      setFeedback({ type: "ok", msg: "Prompt salvo com sucesso." });
      setMode("view");
    } else {
      setFeedback({ type: "err", msg: result.error || "Erro ao salvar prompt." });
    }
    setSaving(false);
  }

  return (
    <DashboardCard
      title="Prompt do Agente"
      eyebrow={`${agent.promptName} ${agent.promptVersion}`}
      action={
        <div className="flex items-center gap-2">
          {agent.systemPrompt && (
            <span className="rounded border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] px-2 py-0.5 text-[10px] font-semibold text-[var(--admin-green)]">
              CONFIGURADO
            </span>
          )}
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
      }
    >
      {mode === "view" ? (
        promptText ? (
          <PromptViewer prompt={promptText} />
        ) : (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <FileText size={32} className="text-[var(--admin-muted)] opacity-30" />
            <p className="text-xs text-[var(--admin-muted)]">Nenhum prompt configurado.</p>
            <button
              type="button"
              onClick={() => setMode("edit")}
              className="flex items-center gap-1.5 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.1)] px-3 py-1.5 text-[10px] font-semibold text-[var(--admin-cyan)]"
            >
              <Pencil size={10} /> Criar Prompt
            </button>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-[var(--admin-muted)]">
              Edite o system prompt deste agente. Use ## para criar secoes (Objetivo, Formato de Entrada, etc).
            </p>
            <span className="font-mono text-[10px] text-[var(--admin-muted)]">
              {wordCount} palavras · {charCount} caracteres
            </span>
          </div>
          <textarea
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            rows={20}
            className="w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(0,0,0,0.3)] p-4 font-mono text-xs leading-relaxed text-white placeholder:text-[var(--admin-muted)] outline-none transition focus:border-[var(--admin-cyan)]"
            placeholder={`Voce e [Nome], agente [Funcao] da Betel AI. Seu departamento e [Departamento].

## Objetivo
Descreva o que este agente faz...

## Formato de Entrada
O que ele recebe como input...

## Formato de Saida
JSON com os campos esperados...

## Regras
1. Regra importante
2. Outra regra`}
          />
          <div className="flex items-center justify-between">
            <div>
              {feedback && (
                <span className={cn(
                  "flex items-center gap-1 text-[10px] font-semibold",
                  feedback.type === "ok" ? "text-[var(--admin-green)]" : "text-[var(--admin-red)]"
                )}>
                  {feedback.type === "ok" ? <CheckCircle2 size={11} /> : <XCircle size={11} />} {feedback.msg}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setPromptText(agent.systemPrompt); setMode("view"); }}
                className="rounded-lg border border-[var(--admin-border)] px-3 py-1.5 text-[10px] font-semibold text-[var(--admin-muted)] hover:text-white transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || promptText === agent.systemPrompt}
                className="flex items-center gap-1.5 rounded-lg border border-[rgba(0,243,255,0.3)] bg-[rgba(0,243,255,0.12)] px-3 py-1.5 text-[10px] font-semibold text-[var(--admin-cyan)] hover:bg-[rgba(0,243,255,0.2)] transition disabled:opacity-40"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                Salvar Prompt
              </button>
            </div>
          </div>
        </div>
      )}

      {agent.prompts.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className={labelClass}>Historico de versoes</p>
          {agent.prompts.map((p) => (
            <div
              key={p.key}
              className="flex items-center justify-between rounded border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <FileText size={12} className="text-[var(--admin-muted)]" />
                <span className="font-mono text-xs text-white">{p.promptName}</span>
                <span className="font-mono text-[10px] text-[var(--admin-muted)]">{p.promptVersion}</span>
              </div>
              <StatusBadge tone={p.tone}>{p.status}</StatusBadge>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

function PromptViewer({ prompt }: { prompt: string }) {
  const sections = prompt.split(/\n## /).map((section, i) => {
    if (i === 0) {
      const [identity, ...rest] = section.split("\n");
      return { title: null, content: identity, rest: rest.join("\n").trim() };
    }
    const [title, ...lines] = section.split("\n");
    return { title, content: lines.join("\n").trim(), rest: "" };
  });

  return (
    <div className="space-y-3">
      {sections.map((sec, i) => (
        <div key={i}>
          {i === 0 && sec.content && (
            <div className="rounded-lg border border-[rgba(0,243,255,0.2)] bg-[rgba(0,243,255,0.04)] p-3">
              <p className="text-xs font-semibold leading-relaxed text-white">{sec.content}</p>
            </div>
          )}
          {sec.title && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">
                {sec.title}
              </p>
              <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(0,0,0,0.25)] p-3">
                <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[var(--admin-muted)]">
                  {sec.content}
                </pre>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
