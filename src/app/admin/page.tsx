import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Filter,
  Globe2,
} from "lucide-react";
import {
  formatCurrency,
  listAuctionOpportunities,
  type AuctionOpportunity,
  type ResourceTone,
} from "@/lib/admin/repository";
import { getScraperDashboardData, type ScraperRun } from "@/lib/scraper";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";

type OverviewMetric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: ResourceTone;
  spark: number[];
};

type ChartSeries = {
  label: string;
  values: number[];
  color: string;
  width?: number;
};

type PriorityItem = {
  label: string;
  value: number;
  detail: string;
  tone: ResourceTone;
};

const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

const textTone: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const barTone: Record<ResourceTone, string> = {
  cyan: "bg-[var(--admin-cyan)]",
  green: "bg-[var(--admin-green)]",
  yellow: "bg-[var(--admin-yellow)]",
  red: "bg-[var(--admin-red)]",
  purple: "bg-[var(--admin-purple)]",
  muted: "bg-white/25",
};

const chartColors = ["#ff5a1f", "#dd4a12", "#b83a0d", "#8f2d0a"];

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminDashboard() {
  const [opportunitiesResult, scraperResult] = await Promise.all([
    listAuctionOpportunities(100),
    getScraperDashboardData(),
  ]);

  const opportunities = opportunitiesResult.data;
  const scraper = scraperResult.data;
  const window15 = opportunities.filter((item) => isWithinDays(item.auctionDate, 15));
  const urgent72h = opportunities.filter((item) => isWithinDays(item.auctionDate, 3));
  const todayItems = opportunities.filter((item) => daysUntil(item.auctionDate) === 0);
  const needsHuman = opportunities.filter(needsHumanReview);
  const highRisk = opportunities.filter((item) => item.riskScore >= 70);
  const readyCandidates = opportunities.filter(isReadyCandidate);
  const pipelineValue = opportunities.reduce((sum, item) => sum + item.initialBid, 0);
  const appraisalValue = opportunities.reduce((sum, item) => sum + item.appraisalValue, 0);
  const failedRuns = scraper.recentRuns.filter((run) => run.status === "failed").length;
  const latestRun = scraper.recentRuns[0];
  const avgDiscount = average(opportunities.map((item) => item.discountPct));
  const valueRatio = pipelineValue > 0 ? appraisalValue / pipelineValue : 0;
  const dataTone = opportunitiesResult.source === "supabase" || scraperResult.source === "supabase" ? "green" : "yellow";

  const metrics: OverviewMetric[] = [
    {
      label: "Fila ativa",
      value: String(opportunities.length),
      detail: `${window15.length} dentro da janela ideal`,
      trend: `${readyCandidates.length} prontos`,
      tone: "cyan",
      spark: makeSpark(opportunities.length, 0.18),
    },
    {
      label: "Valor em fila",
      value: formatCompactCurrency(pipelineValue),
      detail: `${formatCompactCurrency(appraisalValue)} em avaliacao`,
      trend: `${avgDiscount}% desconto medio`,
      tone: "cyan",
      spark: makeSpark(Math.max(Math.round(pipelineValue / 100000), 1), 0.34),
    },
    {
      label: "Acao imediata",
      value: String(urgent72h.length),
      detail: `${todayItems.length} com leilao hoje`,
      trend: urgent72h.length ? "urgente" : "estavel",
      tone: urgent72h.length ? "yellow" : "green",
      spark: makeSpark(Math.max(urgent72h.length, 1), urgent72h.length ? 0.48 : 0.08),
    },
    {
      label: "Revisao humana",
      value: String(needsHuman.length),
      detail: `${highRisk.length} com risco alto`,
      trend: highRisk.length ? "bloqueio" : "limpo",
      tone: highRisk.length ? "red" : "green",
      spark: makeSpark(Math.max(needsHuman.length, 1), highRisk.length ? 0.42 : 0.12),
    },
  ];

  const pipelineSeries: ChartSeries[] = [
    { label: "Captados", values: buildCurve(opportunities.length, 13, 0.95), color: chartColors[0], width: 2.5 },
    { label: "Janela 15d", values: buildCurve(window15.length, 13, 0.86), color: chartColors[1], width: 2 },
    { label: "Prontos", values: buildCurve(readyCandidates.length, 13, 0.78), color: chartColors[2], width: 1.8 },
    { label: "Revisao", values: buildCurve(needsHuman.length, 13, 0.7), color: chartColors[3], width: 1.6 },
  ];
  const deadlineSeries: ChartSeries[] = [
    { label: "Prazo", values: buildDeadlineCurve(opportunities), color: chartColors[0], width: 2.4 },
  ];
  const efficiencySeries: ChartSeries[] = [
    { label: "Eficiencia", values: buildScraperEfficiency(scraper.recentRuns), color: chartColors[0], width: 2.2 },
  ];
  const priority = buildPriorityItems(readyCandidates.length, needsHuman.length, highRisk.length, urgent72h.length);
  const actionQueue = buildActionQueue(opportunities);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 lg:px-6">
      <header className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Overview</h1>
          <p className="mt-1 text-xs text-[var(--admin-muted)]">Performance operacional da Betel</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-xs font-semibold text-[var(--admin-soft)]">
            <CalendarDays size={14} />
            15 dias
          </button>
          <button className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-xs font-semibold text-[var(--admin-soft)]">
            <Filter size={14} />
            Filtros
          </button>
        </div>
      </header>

      <section className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricPanel key={metric.label} metric={metric} />
        ))}
      </section>

      <section className="mb-3 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        <DashboardPanel
          title="Esteira de oportunidades"
          eyebrow="pipeline"
          subtitle="Volume acumulado por etapa operacional"
          contentClassName="p-3"
        >
          <LineChart series={pipelineSeries} labels={["0", "3", "6", "9", "12", "15"]} height={176} />
        </DashboardPanel>

        <DashboardPanel
          title="Pressao de prazo"
          eyebrow="leiloes"
          subtitle="Imoveis acumulados por janela de decisao"
          contentClassName="p-3"
        >
          <LineChart series={deadlineSeries} labels={["Hoje", "1d", "3d", "7d", "15d", "30d"]} height={176} />
        </DashboardPanel>

        <DashboardPanel
          title="Eficiencia Renata"
          eyebrow="scraper"
          subtitle="Percentual ingerido nas ultimas coletas"
          contentClassName="p-3"
        >
          <LineChart series={efficiencySeries} labels={["Run 1", "Run 3", "Run 5", "Run 7", "Run 9"]} height={176} suffix="%" />
        </DashboardPanel>
      </section>

      <section className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardPanel
          title="Ultimos imoveis"
          eyebrow="fila"
          action={
            <Link
              href="/admin/oportunidades"
              className="inline-flex h-8 items-center gap-2 rounded-md border border-[var(--admin-border)] px-3 text-xs font-semibold text-[var(--admin-soft)] transition hover:border-[var(--admin-cyan)] hover:text-white"
            >
              Ver todos
              <ArrowUpRight size={14} />
            </Link>
          }
          contentClassName="p-0"
        >
          <OpportunityQueue opportunities={opportunities.slice(0, 6)} />
        </DashboardPanel>

        <div className="grid gap-3">
          <DashboardPanel title="Resumo" eyebrow="operacao">
            <div className="grid gap-4">
              <SideStat label="Fontes ativas" value={`${scraper.metrics.enabledTargets}/${scraper.metrics.totalTargets}`} detail="Renata monitorando" tone="cyan" />
              <SideStat label="Valor relativo" value={`${valueRatio.toFixed(2)}x`} detail="avaliacao / lance inicial" tone="green" />
              <SideStat label="Dados" value={dataTone === "green" ? "live" : "fallback"} detail={opportunitiesResult.source} tone={dataTone} />
            </div>
          </DashboardPanel>

          <DashboardPanel title="Acao agora" eyebrow="prioridade" contentClassName="p-0">
            <ActionQueue items={actionQueue} />
          </DashboardPanel>
        </div>
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <DashboardPanel title="Renata" eyebrow="coleta">
          <ScraperSummary latestRun={latestRun} failedRuns={failedRuns} ingested={scraper.metrics.itemsIngested} />
        </DashboardPanel>

        <DashboardPanel title="Breakdown" eyebrow="status">
          <PrioritySummary items={priority} total={Math.max(opportunities.length, 1)} />
        </DashboardPanel>
      </section>
    </div>
  );
}

function DashboardPanel({
  title,
  eyebrow,
  subtitle,
  action,
  children,
  contentClassName,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-foreground)] shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[var(--admin-border)] px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h2 className="truncate text-sm font-semibold text-white">{title}</h2>
            {eyebrow && <span className="text-[10px] font-medium text-[var(--admin-muted)]">{eyebrow}</span>}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-[11px] text-[var(--admin-muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

function MetricPanel({ metric }: { metric: OverviewMetric }) {
  return (
    <article className="min-h-[132px] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--admin-soft)]">{metric.label}</p>
        <span className={cn("inline-flex items-center gap-1 font-mono text-[10px] font-semibold", textTone[metric.tone])}>
          <ArrowUpRight size={12} />
          {metric.trend}
        </span>
      </div>
      <div className="mt-4 font-mono text-2xl font-bold tracking-tight text-white">{metric.value}</div>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">{metric.detail}</p>
      <Sparkline values={metric.spark} tone={metric.tone} />
    </article>
  );
}

function Sparkline({ values, tone }: { values: number[]; tone: ResourceTone }) {
  const path = pointsToPath(values, 142, 42, 4);

  return (
    <svg className="mt-3 h-11 w-full" viewBox="0 0 142 42" role="img" aria-label="Tendencia">
      <path d="M4 34 C22 32 28 26 42 29 S68 38 82 26 S109 16 138 18" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <path d={path} fill="none" stroke="var(--admin-cyan)" strokeWidth={tone === "red" ? 1.7 : 1.9} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LineChart({
  series,
  labels,
  height,
  suffix = "",
}: {
  series: ChartSeries[];
  labels: string[];
  height: number;
  suffix?: string;
}) {
  const width = 840;
  const pad = 34;
  const allValues = series.flatMap((item) => item.values);
  const maxValue = Math.max(...allValues, 1);
  const grid = [0.25, 0.5, 0.75, 1];

  return (
    <div className="min-w-0">
      <svg className="h-auto w-full" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Grafico operacional">
        {grid.map((tick) => {
          const y = pad + (height - pad * 2) * (1 - tick);

          return (
            <g key={tick}>
              <line x1={pad} x2={width - pad} y1={y} y2={y} stroke="rgba(255,255,255,0.055)" strokeWidth="1" />
              <text x={pad - 8} y={y + 4} textAnchor="end" className="fill-[var(--admin-muted)] font-mono text-[10px]">
                {Math.round(maxValue * tick)}
                {suffix}
              </text>
            </g>
          );
        })}

        {labels.map((label, index) => {
          const step = (width - pad * 2) / Math.max(labels.length - 1, 1);
          const x = pad + step * index;

          return (
            <text key={label} x={x} y={height - 8} textAnchor="middle" className="fill-[var(--admin-muted)] font-mono text-[10px]">
              {label}
            </text>
          );
        })}

        {series.map((item) => (
          <path
            key={item.label}
            d={pointsToPath(item.values, width, height - 18, pad, maxValue)}
            fill="none"
            stroke={item.color}
            strokeWidth={item.width || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-2 text-[10px] text-[var(--admin-muted)]">
            <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SideStat({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: ResourceTone }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-1 font-mono text-2xl font-bold", textTone[tone])}>{value}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>
    </div>
  );
}

function ActionQueue({ items }: { items: AuctionOpportunity[] }) {
  if (!items.length) {
    return (
      <div className="flex min-h-40 items-center justify-center px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
        Nenhuma acao critica agora.
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--admin-border)]">
      {items.map((item) => {
        const days = daysUntil(item.auctionDate);
        const isBlocked = item.riskScore >= 70 || needsHumanReview(item);

        return (
          <Link
            key={item.id}
            href={`/admin/oportunidades/${item.id}`}
            className="block px-4 py-4 transition hover:bg-white/[0.025]"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {isBlocked ? (
                  <AlertTriangle size={15} className="shrink-0 text-[var(--admin-red)]" />
                ) : (
                  <Clock3 size={15} className="shrink-0 text-[var(--admin-cyan)]" />
                )}
                <p className="truncate text-sm font-semibold text-white">{item.title}</p>
              </div>
              <StatusBadge tone={dateTone(days)}>{formatAuctionDate(item.auctionDate, days)}</StatusBadge>
            </div>
            <p className="truncate text-xs text-[var(--admin-muted)]">
              {item.city}-{item.state} / {item.nextAction}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

function PrioritySummary({ items, total }: { items: PriorityItem[]; total: number }) {
  return (
    <div className="grid gap-4">
      {items.map((item) => {
        const width = item.value ? Math.max(6, Math.round((item.value / total) * 100)) : 0;

        return (
          <div key={item.label}>
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-white">{item.label}</span>
              <span className={cn("font-mono font-bold", textTone[item.tone])}>{item.value}</span>
            </div>
            <div className="h-2 rounded-full bg-white/[0.06]">
              <div className={cn("h-full rounded-full", barTone[item.tone])} style={{ width: `${width}%` }} />
            </div>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">{item.detail}</p>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityQueue({ opportunities }: { opportunities: AuctionOpportunity[] }) {
  if (!opportunities.length) {
    return (
      <div className="flex min-h-40 items-center justify-center px-4 py-8 text-center text-sm text-[var(--admin-muted)]">
        Nenhum imovel na fila ainda.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead className="bg-white/[0.015] text-left text-[10px] uppercase tracking-[0.16em] text-[var(--admin-muted)]">
          <tr>
            <th className="px-4 py-3 font-semibold">Imovel</th>
            <th className="px-3 py-3 font-semibold">Leilao</th>
            <th className="px-3 py-3 text-center font-semibold">Score</th>
            <th className="px-3 py-3 text-center font-semibold">Risco</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.map((item) => {
            const days = daysUntil(item.auctionDate);

            return (
              <tr key={item.id} className="border-t border-[var(--admin-border)] align-top hover:bg-white/[0.025]">
                <td className="px-4 py-4">
                  <Link href={`/admin/oportunidades/${item.id}`} className="group block min-w-0">
                    <span className="flex items-center gap-2 font-semibold text-white group-hover:text-[var(--admin-cyan)]">
                      {item.title}
                      <ArrowUpRight size={13} />
                    </span>
                    <span className="mt-1 block text-xs text-[var(--admin-muted)]">
                      {item.id} / {item.propertyType} / {item.city}-{item.state}
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-4">
                  <StatusBadge tone={dateTone(days)}>{formatAuctionDate(item.auctionDate, days)}</StatusBadge>
                </td>
                <td className="px-3 py-4 text-center">
                  <ScoreBadge score={item.opportunityScore} />
                </td>
                <td className="px-3 py-4 text-center">
                  <RiskBadge score={item.riskScore} />
                </td>
                <td className="px-4 py-4">
                  <StatusBadge tone={getStatusTone(`${item.stage} ${item.aiStatus}`)}>{item.stage}</StatusBadge>
                  <p className="mt-1 max-w-56 truncate text-xs text-[var(--admin-muted)]">{item.nextAction}</p>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ScraperSummary({
  latestRun,
  failedRuns,
  ingested,
}: {
  latestRun?: ScraperRun;
  failedRuns: number;
  ingested: number;
}) {
  return (
    <div className="grid gap-4">
      <SideStat label="Imoveis ingeridos" value={String(ingested)} detail="total coletado pela Renata" tone="cyan" />
      <SideStat label="Falhas recentes" value={String(failedRuns)} detail={failedRuns ? "precisa revisar fonte" : "coletas estaveis"} tone={failedRuns ? "red" : "green"} />

      <div className="rounded-lg border border-[var(--admin-border)] bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Globe2 size={15} className="shrink-0 text-[var(--admin-cyan)]" />
            <p className="truncate text-xs font-semibold text-white">{latestRun?.targetName || "Sem coleta recente"}</p>
          </div>
          <StatusBadge tone={runTone(latestRun?.status)}>{latestRun?.status || "aguardando"}</StatusBadge>
        </div>
        <p className="text-xs leading-5 text-[var(--admin-muted)]">
          {latestRun
            ? `${latestRun.itemsFound} encontrados, ${latestRun.itemsIngested} ingeridos.`
            : "Quando Renata coletar uma fonte, o resumo aparece aqui."}
        </p>
      </div>

      <Link
        href="/admin/scraper"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-[var(--admin-border)] text-xs font-semibold text-[var(--admin-soft)] transition hover:border-[var(--admin-cyan)] hover:text-white"
      >
        Abrir scraper
        <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}

function buildPriorityItems(ready: number, review: number, risk: number, urgent: number): PriorityItem[] {
  return [
    { label: "Prontos", value: ready, detail: "podem seguir para avaliacao comercial", tone: "green" },
    { label: "Revisao", value: review, detail: "precisam de decisao humana", tone: "yellow" },
    { label: "Bloqueio", value: risk, detail: "risco alto antes de publicar", tone: "red" },
    { label: "Urgentes", value: urgent, detail: "leilao em ate 72h", tone: "cyan" },
  ];
}

function buildActionQueue(opportunities: AuctionOpportunity[]) {
  return opportunities
    .filter((item) => isWithinDays(item.auctionDate, 3) || needsHumanReview(item) || item.riskScore >= 70)
    .sort((a, b) => {
      const urgency = (daysUntil(a.auctionDate) ?? 99) - (daysUntil(b.auctionDate) ?? 99);
      if (urgency !== 0) return urgency;
      return b.riskScore - a.riskScore;
    })
    .slice(0, 4);
}

function buildCurve(end: number, length: number, speed: number) {
  const target = Math.max(end, 1);

  return Array.from({ length }, (_, index) => {
    const progress = (index + 1) / length;
    return Math.max(0, Math.round(target * (1 - Math.exp(-progress * 3.2 * speed))));
  });
}

function buildDeadlineCurve(opportunities: AuctionOpportunity[]) {
  const horizons = [0, 1, 3, 7, 15, 30];

  return horizons.map((horizon) => opportunities.filter((item) => isWithinDays(item.auctionDate, horizon)).length);
}

function buildScraperEfficiency(runs: ScraperRun[]) {
  const ordered = [...runs].slice(0, 10).reverse();

  if (!ordered.length) return [0, 12, 26, 38, 44, 55, 62, 70, 78, 84];

  return ordered.map((run) => {
    if (run.itemsFound <= 0) return run.status === "completed" ? 100 : 0;
    return Math.round((run.itemsIngested / run.itemsFound) * 100);
  });
}

function makeSpark(value: number, lift: number) {
  const base = Math.max(value, 1);
  const pattern = [0.42, 0.36, 0.51, 0.47, 0.62, 0.56, 0.72, 0.66, 0.79, 0.74, 0.88, 0.83];

  return pattern.map((point, index) => Math.round(base * (point + index * lift * 0.025)));
}

function pointsToPath(values: number[], width: number, height: number, pad: number, fixedMax?: number) {
  if (!values.length) return "";
  if (values.length === 1) return `M ${pad} ${height / 2} L ${width - pad} ${height / 2}`;

  const maxValue = fixedMax ?? Math.max(...values, 1);
  const minValue = fixedMax ? 0 : Math.min(...values);
  const range = Math.max(maxValue - minValue, 1);
  const step = (width - pad * 2) / Math.max(values.length - 1, 1);

  return values
    .map((value, index) => {
      const x = pad + step * index;
      const y = pad + (height - pad * 2) * (1 - (value - minValue) / range);
      return `${index === 0 ? "M" : "L"} ${round(x)} ${round(y)}`;
    })
    .join(" ");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function formatCompactCurrency(value: number) {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)} mi`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1)} mil`;
  return formatCurrency(value);
}

function isReadyCandidate(item: AuctionOpportunity) {
  const normalized = normalizeText(`${item.stage} ${item.aiStatus} ${item.legalStatus}`);
  return item.opportunityScore >= 75 && item.riskScore < 70 && !normalized.includes("bloq");
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function safeDate(value?: string) {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value?: string) {
  const date = safeDate(value);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

function isWithinDays(value: string, days: number) {
  const left = daysUntil(value);
  return left !== null && left >= 0 && left <= days;
}

function needsHumanReview(item: AuctionOpportunity) {
  const text = normalizeText(`${item.stage} ${item.aiStatus} ${item.legalStatus} ${item.nextAction}`);
  return (
    item.riskScore >= 70 ||
    text.includes("humano") ||
    text.includes("jurid") ||
    text.includes("compliance") ||
    text.includes("pendente") ||
    text.includes("aguard") ||
    text.includes("bloq") ||
    text.includes("critico")
  );
}

function formatAuctionDate(value: string, days: number | null) {
  const date = safeDate(value);
  if (!date) return "sem data";
  if (days === 0) return "hoje";
  if (days !== null && days > 0 && days <= 15) return `${days}d`;
  if (days !== null && days < 0) return "passou";
  return shortDateFormatter.format(date);
}

function dateTone(days: number | null): ResourceTone {
  if (days === null) return "muted";
  if (days < 0) return "red";
  if (days <= 3) return "yellow";
  return "green";
}

function runTone(status = ""): ResourceTone {
  const text = normalizeText(status);
  if (!text || text.includes("sem run") || text.includes("pendente")) return "muted";
  if (text.includes("completed") || text.includes("concluido") || text.includes("success")) return "green";
  if (text.includes("failed") || text.includes("erro") || text.includes("bloq")) return "red";
  if (text.includes("running") || text.includes("anal")) return "purple";
  if (text.includes("queued") || text.includes("fila") || text.includes("aguard") || text.includes("partial")) {
    return "yellow";
  }
  return "cyan";
}
