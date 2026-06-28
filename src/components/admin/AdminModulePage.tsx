import Link from "next/link";
import { ArrowUpRight, Plus, RadioTower, ShieldCheck } from "lucide-react";
import type { AdminAccent, AdminModule } from "@/lib/admin/modules";
import {
  getAdminResource,
  type KanbanCard,
  type ModuleResource,
  type ResourceCell,
  type ResourceTone,
} from "@/lib/admin/resources";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminIcon } from "./AdminIcons";
import { DashboardCard } from "./DashboardCard";
import { RiskBadge } from "./RiskBadge";
import { ScoreBadge } from "./ScoreBadge";
import { StatusBadge, getStatusTone } from "./StatusBadge";
import { cn } from "@/lib/utils";

const accentText: Record<AdminAccent, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const accentBg: Record<AdminAccent, string> = {
  cyan: "bg-[rgba(0,243,255,0.08)] border-[rgba(0,243,255,0.24)]",
  green: "bg-[rgba(34,197,94,0.08)] border-[rgba(34,197,94,0.24)]",
  yellow: "bg-[rgba(234,179,8,0.08)] border-[rgba(234,179,8,0.24)]",
  red: "bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.24)]",
  purple: "bg-[rgba(139,92,246,0.09)] border-[rgba(139,92,246,0.26)]",
  muted: "bg-[rgba(255,255,255,0.03)] border-[var(--admin-border)]",
};

const resourceText: Record<ResourceTone, string> = accentText;
const resourceBg: Record<ResourceTone, string> = accentBg;

function LegacyRecords({ module }: { module: AdminModule }) {
  return (
    <div className="overflow-hidden">
      {module.records.map((record) => (
        <div
          key={`${record.title}-${record.owner}`}
          className="grid gap-3 border-b border-[var(--admin-border)] px-4 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_9rem_9rem]"
        >
          <div className="min-w-0">
            <div className="font-semibold text-white">{record.title}</div>
            <div className="mt-1 text-sm leading-5 text-[var(--admin-muted)]">{record.meta}</div>
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
              Status
            </div>
            <StatusBadge tone={getStatusTone(record.status)}>{record.status}</StatusBadge>
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
              Responsavel
            </div>
            <div className="text-sm text-[var(--admin-soft)]">{record.owner}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResourceCellValue({ cell }: { cell: ResourceCell }) {
  const content =
    cell.kind === "score" && typeof cell.label === "number" ? (
      <ScoreBadge score={cell.label} />
    ) : cell.kind === "risk" && typeof cell.label === "number" ? (
      <RiskBadge score={cell.label} />
    ) : cell.kind === "status" ? (
      <StatusBadge tone={cell.tone || getStatusTone(String(cell.label))}>{cell.label}</StatusBadge>
    ) : (
      <span
        className={cn(
          cell.kind === "money" && "font-mono font-semibold text-white",
          cell.kind === "date" && "font-mono text-[var(--admin-soft)]",
          cell.muted ? "text-[var(--admin-muted)]" : "text-[var(--admin-soft)]"
        )}
      >
        {cell.label}
      </span>
    );

  if (!cell.href) return content;

  return (
    <Link className="font-semibold text-white transition hover:text-[var(--admin-cyan)]" href={cell.href}>
      {content}
    </Link>
  );
}

function ResourceTable({ resource }: { resource: ModuleResource }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[1080px]">
        <TableHeader className="bg-[rgba(255,255,255,0.02)]">
          <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
            {resource.columns?.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "h-11 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--admin-muted)]",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center"
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resource.rows?.map((row) => (
            <TableRow
              key={row.id}
              className="border-[var(--admin-border)] bg-[var(--admin-card)] hover:bg-[rgba(255,255,255,0.03)]"
            >
              {row.cells.map((cell, index) => {
                const align = resource.columns?.[index]?.align;
                return (
                  <TableCell
                    key={`${row.id}-${index}`}
                    className={cn(
                      "px-3 py-3 text-sm",
                      align === "right" && "text-right",
                      align === "center" && "text-center"
                    )}
                  >
                    <ResourceCellValue cell={cell} />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function KanbanItem({ card }: { card: KanbanCard }) {
  const body = (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3 transition hover:border-[rgba(255,255,255,0.22)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-white">{card.title}</div>
          <div className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{card.meta}</div>
        </div>
        <span className="font-mono text-[10px] text-[var(--admin-muted)]">{card.id}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ScoreBadge score={card.opportunityScore} />
        <RiskBadge score={card.riskScore} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs">
        <span className="text-[var(--admin-soft)]">{card.owner}</span>
        <span className="font-mono text-[var(--admin-muted)]">{card.due}</span>
      </div>
    </div>
  );

  if (!card.href) return body;
  return <Link href={card.href}>{body}</Link>;
}

function ResourceKanban({ resource }: { resource: ModuleResource }) {
  return (
    <div className="grid gap-3 overflow-x-auto p-4 xl:grid-cols-4">
      {resource.kanbanColumns?.map((column) => (
        <div
          key={column.title}
          className="min-w-[240px] rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]"
        >
          <div className="flex min-h-12 items-center justify-between border-b border-[var(--admin-border)] px-3">
            <div className={cn("font-mono text-[11px] font-semibold uppercase", resourceText[column.tone])}>
              {column.title}
            </div>
            <span className={cn("rounded-md border px-2 py-1 font-mono text-[10px]", resourceBg[column.tone])}>
              {column.cards.length}
            </span>
          </div>
          <div className="grid gap-3 p-3">
            {column.cards.map((card) => (
              <KanbanItem key={card.id} card={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResourceWorkbench({ resource, module }: { resource?: ModuleResource; module: AdminModule }) {
  if (!resource) return <LegacyRecords module={module} />;
  if (resource.kind === "kanban") return <ResourceKanban resource={resource} />;
  return <ResourceTable resource={resource} />;
}

function ResourceSummary({ resource }: { resource?: ModuleResource }) {
  if (!resource) return null;

  return (
    <DashboardCard title="Sinais do recurso" eyebrow="estado atual">
      <div className="grid gap-3">
        {resource.summary.map((item) => (
          <div
            key={item.label}
            className={cn("rounded-lg border px-3 py-3", resourceBg[item.tone])}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-medium text-[var(--admin-muted)]">{item.label}</div>
              <div className={cn("font-mono text-lg font-bold", resourceText[item.tone])}>{item.value}</div>
            </div>
            <div className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{item.detail}</div>
          </div>
        ))}
      </div>
    </DashboardCard>
  );
}

export default function AdminModulePage({
  module,
  resource: resourceOverride,
}: {
  module: AdminModule;
  resource?: ModuleResource;
}) {
  const resource = resourceOverride || getAdminResource(module.slug);
  const createHrefBySlug: Record<string, string> = {
    oportunidades: "/admin/oportunidades/nova",
    investidores: "/admin/investidores/novo",
  };
  const createHref = createHrefBySlug[module.slug] || null;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div
              className={cn(
                "mb-3 inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold",
                accentBg[module.accent],
                accentText[module.accent]
              )}
            >
              <AdminIcon icon={module.icon} size={15} />
              {module.eyebrow}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{module.title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">{module.description}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getStatusTone(module.statusLabel)}>{module.statusLabel}</StatusBadge>
            {createHref ? (
              <Button
                asChild
                variant="outline"
                className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
              >
                <Link href={createHref}>
                  <Plus size={15} />
                  Novo registro
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
              >
                <Plus size={15} />
                Novo registro
              </Button>
            )}
            {module.slug === "fontes" && (
              <Button
                asChild
                variant="outline"
                className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
              >
                <Link href="/admin/fontes/capturas">
                  <RadioTower size={15} />
                  Capturas
                </Link>
              </Button>
            )}
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href="/admin/maintenance">
                Ver integracoes
                <ArrowUpRight size={15} />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        {module.metrics.map((metric) => (
          <article
            key={metric.label}
            className="min-h-[132px] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-4"
          >
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className={cn("mt-5 font-mono text-3xl font-bold tracking-tight", accentText[module.accent])}>
              {metric.value}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <DashboardCard
          title={resource?.title || "Mesa de trabalho"}
          eyebrow={resource?.eyebrow || "registros / fila"}
          action={
            <StatusBadge tone={module.status === "attention" ? "red" : module.status === "ready" ? "green" : "yellow"}>
              {resource?.kind === "kanban" ? "kanban" : "operacional"}
            </StatusBadge>
          }
          contentClassName="p-0"
        >
          <ResourceWorkbench resource={resource} module={module} />
        </DashboardCard>

        <div className="grid gap-4">
          <ResourceSummary resource={resource} />

          <DashboardCard title="Fluxo operacional" eyebrow="processo">
            <div className="grid gap-3">
              {module.workflow.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-md border font-mono text-[11px] font-bold",
                      accentBg[module.accent],
                      accentText[module.accent]
                    )}
                  >
                    {index + 1}
                  </div>
                  <div className="min-h-8 text-sm leading-6 text-[var(--admin-soft)]">{step}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Pontos de controle"
            eyebrow="risco / compliance"
            action={<ShieldCheck size={17} className={accentText[module.accent]} />}
          >
            <div className="grid gap-2">
              {module.focus.map((item) => (
                <div
                  key={item}
                  className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--admin-soft)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
