"use client";

import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import type { AgentOfficeData } from "@/lib/admin/repository";
import type {
  AgentWorkflowStage,
  AgentWorkflowEdge,
  AgentGroup,
  AgentStatus,
} from "@/lib/admin/agent-workforce";
import type { ResourceTone } from "@/lib/admin/resources";
import Link from "next/link";
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

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.35)]",
  green: "border-[rgba(34,197,94,0.35)]",
  yellow: "border-[rgba(234,179,8,0.35)]",
  red: "border-[rgba(239,68,68,0.35)]",
  purple: "border-[rgba(139,92,246,0.35)]",
  muted: "border-[var(--admin-border)]",
};

const statusDot: Record<AgentStatus, string> = {
  active: "bg-[var(--admin-green)]",
  supervised: "bg-[var(--admin-cyan)]",
  paused: "bg-[var(--admin-yellow)]",
  planned: "bg-[var(--admin-muted)]",
};

type StageWithAgents = AgentWorkflowStage & {
  group: AgentGroup | undefined;
  agentCount: number;
  activeCount: number;
};

export function PipelineVisualization({
  stages,
  edges,
  groups,
  directory,
}: {
  stages: AgentWorkflowStage[];
  edges: AgentOfficeData["workflowEdges"];
  groups: AgentGroup[];
  directory: AgentOfficeData["directory"];
}) {
  const stageGroupMap: Record<string, AgentGroup | undefined> = {};
  const stageNames = stages.map((s) => s.label);

  for (const stage of stages) {
    stageGroupMap[stage.label] = groups.find((g) =>
      g.name.toLowerCase().includes(stage.owner.toLowerCase().split("/")[0].split(" ").pop() || "")
    );
  }

  const stagesWithAgents: StageWithAgents[] = stages.map((stage) => {
    const group = stageGroupMap[stage.label];
    const agents = group?.agents || [];
    return {
      ...stage,
      group,
      agentCount: agents.length,
      activeCount: agents.filter((a) => a.status === "active" || a.status === "supervised").length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Pipeline flow — horizontal on desktop */}
      <div className="flex items-stretch gap-0 overflow-x-auto pb-2">
        {stagesWithAgents.map((stage, idx) => (
          <div key={stage.label} className="flex items-stretch">
            {/* Stage card */}
            <div
              className={cn(
                "flex min-w-[200px] max-w-[240px] flex-col rounded-lg border p-4",
                toneBorder[stage.tone],
                toneBg[stage.tone]
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("text-sm font-bold", toneText[stage.tone])}>
                  {stage.label}
                </span>
                <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {stage.agentCount}
                </span>
              </div>

              <p className="mt-1 text-[10px] leading-relaxed text-[var(--admin-muted)]">
                {stage.description.length > 80
                  ? stage.description.slice(0, 80) + "..."
                  : stage.description}
              </p>

              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                {stage.owner}
              </p>

              {/* Agent dots */}
              {stage.group && (
                <div className="mt-3 space-y-1.5">
                  {stage.group.agents.map((agent) => (
                    <Link
                      key={agent.key}
                      href={`/admin/agentes-ia/${agent.key}`}
                      className="flex items-center gap-2 rounded px-1.5 py-1 transition hover:bg-[rgba(255,255,255,0.06)]"
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", statusDot[agent.status])} />
                      <span className="truncate text-[10px] text-white">{agent.name.replace("Agente ", "")}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Arrow between stages */}
            {idx < stagesWithAgents.length - 1 && (
              <div className="flex flex-col items-center justify-center px-2">
                <div className="flex items-center">
                  <div className="h-px w-6 bg-[var(--admin-border)]" />
                  <ChevronRight size={16} className="text-[var(--admin-muted)]" />
                </div>
                {/* Edge labels */}
                <EdgeLabels
                  edges={edges}
                  fromGroup={stagesWithAgents[idx].group}
                  toGroup={stagesWithAgents[idx + 1].group}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edge details */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {edges.map((edge) => (
          <div
            key={edge.key}
            className={cn(
              "rounded-lg border px-3 py-2.5",
              toneBg[edge.tone]
            )}
          >
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className={cn("font-semibold", toneText[edge.tone])}>
                {edge.fromAgent.replace("Agente ", "")}
              </span>
              <ArrowRight size={10} className="text-[var(--admin-muted)]" />
              <span className={cn("font-semibold", toneText[edge.tone])}>
                {edge.toAgent.replace("Agente ", "")}
              </span>
              {edge.requiresHumanApproval && (
                <UserCheck size={10} className="text-[var(--admin-yellow)]" />
              )}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-[var(--admin-muted)]">
              {edge.condition}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function EdgeLabels({
  edges,
  fromGroup,
  toGroup,
}: {
  edges: AgentOfficeData["workflowEdges"];
  fromGroup: AgentGroup | undefined;
  toGroup: AgentGroup | undefined;
}) {
  if (!fromGroup || !toGroup) return null;

  const fromKeys = new Set(fromGroup.agents.map((a) => a.key));
  const toKeys = new Set(toGroup.agents.map((a) => a.key));

  const relevant = edges.filter(
    (e) => fromKeys.has(e.fromAgentKey) && toKeys.has(e.toAgentKey)
  );

  if (relevant.length === 0) return null;

  return (
    <div className="mt-1 flex flex-col items-center gap-0.5">
      {relevant.slice(0, 2).map((e) => (
        <span
          key={e.key}
          className="max-w-[60px] truncate text-center text-[8px] leading-none text-[var(--admin-muted)]"
          title={e.condition}
        >
          {e.requiresHumanApproval ? "👤" : "→"}
        </span>
      ))}
    </div>
  );
}
