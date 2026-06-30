import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  DatabaseZap,
  ExternalLink,
  FileSearch,
  PlayCircle,
  Plus,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listSourceSnapshots } from "@/lib/admin/repository";
import { cn } from "@/lib/utils";
import {
  enqueueHiddenRiskAction,
  enqueueHumanReviewAction,
  pullSourceProviderAction,
  processComplianceAction,
  processSourceSnapshotAction,
  releaseCommunicationAction,
  resolveHumanReviewAction,
} from "./actions";
import { getSourceProviderHealth, type SourceProviderHealth } from "@/lib/sources/provider-adapters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const inputClass =
  "border-[var(--admin-border)] bg-[#050505] text-sm text-white placeholder:text-[var(--admin-muted)]";
const selectClass =
  "h-8 w-full rounded-lg border border-[var(--admin-border)] bg-[#050505] px-2.5 text-sm text-white outline-none";
const labelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatDateTime(value: string) {
  if (!value) return "Sem data";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sem data";
  return dateTimeFormatter.format(date);
}

function shortHash(value: string) {
  if (!value) return "Sem hash";
  return value.slice(0, 12);
}

function textBucket(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isComplianceProcessed(status: string) {
  const text = textBucket(status);
  return text.includes("waiting") || text.includes("human") || text.includes("completed") || text.includes("concluido");
}

function isComplianceReleased(status: string) {
  const text = textBucket(status);
  return text.includes("aprov") || text.includes("approved") || text.includes("liber") || text.includes("ok");
}

function isBlockedStatus(...values: string[]) {
  const text = textBucket(values.join(" "));
  return text.includes("blocked") || text.includes("bloque") || text.includes("failed") || text.includes("erro");
}

function sourceProviderTone(provider: SourceProviderHealth) {
  if (provider.ready) return "green";
  if (provider.baseUrlConfigured || provider.tokenConfigured || provider.released) return "yellow";
  return "red";
}

function sourceProviderLabel(provider: SourceProviderHealth) {
  if (provider.ready) return "Pronto";
  if (provider.baseUrlConfigured || provider.tokenConfigured || provider.released) return "Homologar";
  return "Configurar";
}

export default async function SourceCapturesPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const sourceId = paramValue(params, "source");
  const status = paramValue(params, "status");
  const notice = paramValue(params, "notice");
  const message = paramValue(params, "message");
  const capturesResult = await listSourceSnapshots({ sourceId, status, limit: 80 });
  const captures = capturesResult.data;
  const sourceProviders = await getSourceProviderHealth();
  const distinctSources = new Set(captures.map((capture) => capture.sourceId).filter(Boolean)).size;
  const queuedRuns = captures.filter((capture) => capture.runStatus.toLowerCase().includes("queued")).length;
  const withOpportunity = captures.filter((capture) => capture.opportunityCode).length;
  const complianceReady = captures.filter((capture) => isComplianceReleased(capture.complianceReviewStatus)).length;
  const communicationDispatched = captures.filter((capture) => capture.communicationDispatchedAt).length;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-9 items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)]">
              <DatabaseZap size={15} />
              fontes / snapshots / auditoria
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Capturas de fonte</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">
              Mesa de verificacao das oportunidades capturadas por fonte antes da curadoria de edital e da revisao humana.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href="/admin/fontes">
                <ArrowLeft size={15} />
                Fontes
              </Link>
            </Button>
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href="/admin/oportunidades/nova">
                <Plus size={15} />
                Nova captura
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {notice && message && (
        <div
          className={cn(
            "mb-4 flex gap-3 rounded-lg border px-4 py-3 text-sm",
            notice === "success"
              ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-soft)]"
              : "border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-soft)]"
          )}
        >
          <ShieldAlert
            className={cn(
              "mt-0.5 shrink-0",
              notice === "success" ? "text-[var(--admin-green)]" : "text-[var(--admin-red)]"
            )}
            size={17}
          />
          <div>
            <div className="font-semibold text-white">
              {notice === "success" ? "Curadoria registrada" : "Curadoria nao concluida"}
            </div>
            <div className="mt-1 text-[var(--admin-muted)]">{message}</div>
          </div>
        </div>
      )}

      {capturesResult.reason && (
        <div className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--admin-muted)]">
          {capturesResult.reason}
        </div>
      )}

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        {[
          { label: "Capturas", value: captures.length, detail: "snapshots registrados", tone: "cyan" },
          { label: "Fontes", value: distinctSources, detail: "origens distintas", tone: "purple" },
          { label: "Compliance ok", value: complianceReady, detail: "liberados para comunicacao", tone: "green" },
          {
            label: "Comunicadas",
            value: communicationDispatched,
            detail: `${withOpportunity} ligadas ao pipeline`,
            tone: communicationDispatched ? "cyan" : queuedRuns ? "yellow" : "muted",
          },
        ].map((metric) => (
          <article
            key={metric.label}
            className={cn(
              "min-h-[118px] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-4",
              metric.tone === "cyan" && "shadow-[inset_0_1px_0_rgba(0,243,255,0.08)]"
            )}
          >
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className="mt-4 font-mono text-3xl font-bold tracking-tight text-white">{metric.value}</div>
            <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <DashboardCard
        title="Homologacao de fontes e Big Data"
        eyebrow="providers / APIs externas / guardrails"
        action={<StatusBadge tone={sourceProviders.some((provider) => provider.ready) ? "green" : "yellow"}>diagnostico</StatusBadge>}
        className="mb-4"
      >
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-5">
          {sourceProviders.map((provider) => {
            const tone = sourceProviderTone(provider);

            return (
              <article key={provider.key} className="rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{provider.label}</p>
                    <p className="mt-1 truncate font-mono text-[10px] text-[var(--admin-muted)]">{provider.provider}</p>
                  </div>
                  <StatusBadge tone={tone}>{sourceProviderLabel(provider)}</StatusBadge>
                </div>
                <p className="mt-3 min-h-12 text-xs leading-5 text-[var(--admin-soft)]">{provider.purpose}</p>
                <div className="mt-3 grid min-w-0 gap-1 font-mono text-[10px] text-[var(--admin-muted)]">
                  <span className="break-all">{provider.baseUrlConfigured ? "endpoint ok" : provider.envKeys.baseUrl}</span>
                  <span className="break-all">{provider.tokenConfigured ? "token ok" : provider.envKeys.token}</span>
                  <span className="break-all">{provider.released ? "flag liberada" : provider.envKeys.released}</span>
                </div>
                {!!provider.missing.length && (
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">Falta: {provider.missing.join(", ")}</p>
                )}
              </article>
            );
          })}
        </div>

        <form
          action={pullSourceProviderAction}
          className="mt-4 grid gap-4 rounded-lg border border-[rgba(0,243,255,0.18)] bg-[rgba(0,243,255,0.05)] p-3"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">
                <PlayCircle size={14} />
                pull de oportunidades
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--admin-soft)]">
                Captura candidatos de fonte, Big Data ou sandbox e abre snapshot somente quando o modo de execucao for ingestao.
              </p>
            </div>
            <StatusBadge tone="cyan">dry-run primeiro</StatusBadge>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="providerKey">
                Setor provider
              </Label>
              <select className={selectClass} defaultValue="auction_sources" id="providerKey" name="providerKey">
                {sourceProviders.map((provider) => (
                  <option key={provider.key} value={provider.key}>
                    {provider.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="runtimeMode">
                Modo
              </Label>
              <select className={selectClass} defaultValue="mock" id="runtimeMode" name="runtimeMode">
                <option value="mock">mock</option>
                <option value="sandbox">sandbox</option>
                <option value="provider">provider real</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="executionMode">
                Execucao
              </Label>
              <select className={selectClass} defaultValue="dry-run" id="executionMode" name="executionMode">
                <option value="dry-run">dry-run</option>
                <option value="ingest">gravar snapshots</option>
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="limit">
                Lote
              </Label>
              <Input className={inputClass} defaultValue="3" id="limit" max="20" min="1" name="limit" type="number" />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="query">
                Busca
              </Label>
              <Input className={inputClass} id="query" name="query" placeholder="apartamento, banco, judicial" />
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="city">
                Cidade
              </Label>
              <Input className={inputClass} defaultValue="Balneario Camboriu" id="city" name="city" />
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="state">
                UF
              </Label>
              <Input className={inputClass} defaultValue="SC" id="state" maxLength={2} name="state" />
            </div>

            <div className="grid gap-1.5">
              <Label className={labelClass} htmlFor="operatorLabel">
                Operador
              </Label>
              <Input
                className={inputClass}
                defaultValue="Agente Buscador de Imoveis"
                id="operatorLabel"
                name="operatorLabel"
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-lg border border-[var(--admin-border)] bg-[#050505] p-3 lg:flex-row lg:items-center lg:justify-between">
            <input name="curationRuntimeMode" type="hidden" value="mock" />
            <input name="curationProvider" type="hidden" value="mock" />
            <input name="curationModel" type="hidden" value="betel-deterministic-v0" />
            <input name="curationProcessNow" type="hidden" value="true" />

            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label className="flex items-center gap-2 text-xs text-[var(--admin-soft)]">
                <input
                  className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                  name="allowExternal"
                  type="checkbox"
                  value="true"
                />
                allowExternal
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--admin-soft)]">
                <input
                  className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                  name="providerReleaseConfirmed"
                  type="checkbox"
                  value="true"
                />
                provider homologado
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--admin-soft)]">
                <input
                  className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                  name="processAfterIngest"
                  type="checkbox"
                  value="true"
                />
                curadoria imediata
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--admin-soft)]">
                <input
                  className="size-4 rounded border-[var(--admin-border)] bg-[#050505]"
                  name="openHumanReviewAfterIngest"
                  type="checkbox"
                  value="true"
                />
                gate humano
              </label>
            </div>

            <Button className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white" type="submit">
              <PlayCircle size={15} />
              Executar pull
            </Button>
          </div>
        </form>
      </DashboardCard>

      <DashboardCard
        title="Snapshots recentes"
        eyebrow="raw payload / run / oportunidade"
        action={<StatusBadge tone={capturesResult.source === "supabase" ? "green" : "yellow"}>{capturesResult.source}</StatusBadge>}
        contentClassName="p-0"
      >
        {captures.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[1760px]">
              <TableHeader className="bg-[rgba(255,255,255,0.02)]">
                <TableRow className="border-[var(--admin-border)] hover:bg-transparent">
                  {[
                    "Snapshot",
                    "Oportunidade",
                    "Fonte",
                    "Modo",
                    "Status",
                    "Curadoria",
                    "Risco oculto",
                    "Humano/Juridico",
                    "Compliance",
                    "Comunicacao",
                    "Coletado",
                    "Hash",
                    "Payload",
                    "",
                  ].map((head) => (
                    <TableHead
                      key={head}
                      className="h-11 px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--admin-muted)]"
                    >
                      {head}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {captures.map((capture) => (
                  <TableRow
                    key={capture.id}
                    className="border-[var(--admin-border)] bg-[var(--admin-card)] hover:bg-[rgba(255,255,255,0.03)]"
                  >
                    <TableCell className="px-3 py-3">
                      <div className="font-mono text-xs font-semibold text-white">{capture.snapshotCode}</div>
                      {capture.externalId && (
                        <div className="mt-1 text-[10px] text-[var(--admin-muted)]">externo: {capture.externalId}</div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      {capture.opportunityCode ? (
                        <Link
                          href={`/admin/oportunidades/${capture.opportunityCode}`}
                          className="font-semibold text-white transition hover:text-[var(--admin-cyan)]"
                        >
                          {capture.opportunityCode}
                        </Link>
                      ) : (
                        <span className="font-semibold text-white">Sem codigo</span>
                      )}
                      <div className="mt-1 max-w-56 truncate text-xs text-[var(--admin-muted)]">
                        {capture.opportunityTitle}
                      </div>
                      <div className="mt-1 text-[10px] text-[var(--admin-muted)]">{capture.location}</div>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <div className="font-medium text-[var(--admin-soft)]">{capture.sourceName}</div>
                      <div className="mt-1 text-[10px] text-[var(--admin-muted)]">{capture.sourceType}</div>
                    </TableCell>
                    <TableCell className="px-3 text-[var(--admin-soft)]">{capture.snapshotType}</TableCell>
                    <TableCell className="px-3">
                      <StatusBadge tone={getStatusTone(capture.status)}>{capture.status}</StatusBadge>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <StatusBadge tone={getStatusTone(capture.curatorRunStatus || capture.runStatus)}>
                        {capture.curatorRunStatus || capture.curationStatus || capture.runStatus}
                      </StatusBadge>
                      <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">
                        {capture.curatorRunCode || capture.runCode || "Sem curador"}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <StatusBadge tone={getStatusTone(capture.hiddenRiskStatus || "Pendente")}>
                        {capture.hiddenRiskStatus || "Pendente"}
                      </StatusBadge>
                      {capture.hiddenRiskRunCode && (
                        <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">
                          {capture.hiddenRiskRunCode}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <StatusBadge tone={getStatusTone(capture.legalReviewDecision || capture.legalReviewStatus || capture.humanHandoffStatus || "Pendente")}>
                        {capture.legalReviewDecision || capture.legalReviewStatus || capture.humanHandoffStatus || "Pendente"}
                      </StatusBadge>
                      <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">
                        {capture.legalReviewCode || capture.humanHandoffRunCode || "Sem revisao"}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <StatusBadge
                        tone={getStatusTone(
                          capture.complianceReviewStatus || capture.complianceRunStatus || "Pendente"
                        )}
                      >
                        {capture.complianceReviewStatus || capture.complianceRunStatus || "Pendente"}
                      </StatusBadge>
                      <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">
                        {capture.complianceRunCode || "Sem compliance"}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3">
                      <StatusBadge tone={getStatusTone(capture.communicationStatus || "Travada")}>
                        {capture.communicationStatus || "Travada"}
                      </StatusBadge>
                      <div className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">
                        {capture.communicationDispatchedAt
                          ? formatDateTime(capture.communicationDispatchedAt)
                          : `${capture.communicationOutboxCount || 0} outbox`}
                      </div>
                    </TableCell>
                    <TableCell className="px-3 font-mono text-xs text-[var(--admin-soft)]">
                      {formatDateTime(capture.collectedAt)}
                    </TableCell>
                    <TableCell className="px-3 font-mono text-xs text-[var(--admin-muted)]">
                      {shortHash(capture.contentHash)}
                    </TableCell>
                    <TableCell className="max-w-[280px] px-3">
                      <div className="truncate font-mono text-[11px] text-[var(--admin-muted)]">
                        {capture.payloadPreview}
                      </div>
                    </TableCell>
                    <TableCell className="px-3">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {!capture.curatorRunCode && (
                          <form action={processSourceSnapshotAction}>
                            <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                            <input name="sourceId" type="hidden" value={sourceId || ""} />
                            <input name="filterStatus" type="hidden" value={status || ""} />
                            <input name="runtimeMode" type="hidden" value="mock" />
                            <input name="provider" type="hidden" value="mock" />
                            <input name="model" type="hidden" value="betel-deterministic-v0" />
                            <input name="operatorLabel" type="hidden" value="Curadoria Betel" />
                            <input name="processNow" type="hidden" value="true" />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="h-8 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                            >
                              <PlayCircle size={14} />
                              Curar
                            </Button>
                          </form>
                        )}
                        {capture.curatorRunCode && !capture.hiddenRiskRunCode && (
                          <form action={enqueueHiddenRiskAction}>
                            <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                            <input name="curatorRunCode" type="hidden" value={capture.curatorRunCode} />
                            <input name="sourceId" type="hidden" value={sourceId || ""} />
                            <input name="filterStatus" type="hidden" value={status || ""} />
                            <input name="runtimeMode" type="hidden" value="mock" />
                            <input name="provider" type="hidden" value="mock" />
                            <input name="model" type="hidden" value="betel-deterministic-v0" />
                            <input name="operatorLabel" type="hidden" value="Risco Oculto Betel" />
                            <input name="processNow" type="hidden" value="true" />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="h-8 border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
                            >
                              <ShieldAlert size={14} />
                              Risco
                            </Button>
                          </form>
                        )}
                        {capture.hiddenRiskRunCode && !capture.humanHandoffRunCode && (
                          <form action={enqueueHumanReviewAction}>
                            <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                            <input name="hiddenRiskRunCode" type="hidden" value={capture.hiddenRiskRunCode} />
                            <input name="sourceId" type="hidden" value={sourceId || ""} />
                            <input name="filterStatus" type="hidden" value={status || ""} />
                            <input name="runtimeMode" type="hidden" value="mock" />
                            <input name="provider" type="hidden" value="mock" />
                            <input name="model" type="hidden" value="betel-deterministic-v0" />
                            <input name="operatorLabel" type="hidden" value="Handoff Humano Betel" />
                            <input name="reviewerLabel" type="hidden" value="Juridico Betel" />
                            <input name="processNow" type="hidden" value="true" />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              className="h-8 border-[rgba(234,179,8,0.32)] bg-[rgba(234,179,8,0.08)] text-[var(--admin-yellow)]"
                            >
                              <Scale size={14} />
                              Humano
                            </Button>
                          </form>
                        )}
                        {capture.humanHandoffRunCode && !capture.legalReviewDecision && (
                          <>
                            <form action={resolveHumanReviewAction}>
                              <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                              <input name="humanHandoffRunCode" type="hidden" value={capture.humanHandoffRunCode} />
                              <input name="sourceId" type="hidden" value={sourceId || ""} />
                              <input name="filterStatus" type="hidden" value={status || ""} />
                              <input name="decision" type="hidden" value="approved" />
                              <input name="reviewerLabel" type="hidden" value="Juridico Betel" />
                              <input name="notes" type="hidden" value="Aprovado para compliance com base na revisao humana." />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[rgba(34,197,94,0.32)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
                              >
                                <CheckCircle2 size={14} />
                                Aprovar
                              </Button>
                            </form>
                            <form action={resolveHumanReviewAction}>
                              <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                              <input name="humanHandoffRunCode" type="hidden" value={capture.humanHandoffRunCode} />
                              <input name="sourceId" type="hidden" value={sourceId || ""} />
                              <input name="filterStatus" type="hidden" value={status || ""} />
                              <input name="decision" type="hidden" value="approved_with_notes" />
                              <input name="reviewerLabel" type="hidden" value="Juridico Betel" />
                              <input
                                name="notes"
                                type="hidden"
                                value="Aprovado com ressalva. Compliance deve preservar observacoes no dossie."
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[rgba(234,179,8,0.32)] bg-[rgba(234,179,8,0.08)] text-[var(--admin-yellow)]"
                              >
                                <ShieldAlert size={14} />
                                Ressalva
                              </Button>
                            </form>
                            <form action={resolveHumanReviewAction}>
                              <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                              <input name="humanHandoffRunCode" type="hidden" value={capture.humanHandoffRunCode} />
                              <input name="sourceId" type="hidden" value={sourceId || ""} />
                              <input name="filterStatus" type="hidden" value={status || ""} />
                              <input name="decision" type="hidden" value="blocked" />
                              <input name="reviewerLabel" type="hidden" value="Juridico Betel" />
                              <input
                                name="notes"
                                type="hidden"
                                value="Bloqueado pela revisao humana. Nao liberar comunicacao externa."
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]"
                              >
                                <Ban size={14} />
                                Bloquear
                              </Button>
                            </form>
                          </>
                        )}
                        {capture.complianceRunCode &&
                          !capture.communicationDispatchedAt &&
                          !isBlockedStatus(
                            capture.legalReviewDecision,
                            capture.complianceRunStatus,
                            capture.complianceReviewStatus
                          ) &&
                          !isComplianceProcessed(capture.complianceRunStatus) && (
                            <form action={processComplianceAction}>
                              <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                              <input name="complianceRunCode" type="hidden" value={capture.complianceRunCode} />
                              <input name="sourceId" type="hidden" value={sourceId || ""} />
                              <input name="filterStatus" type="hidden" value={status || ""} />
                              <input name="runtimeMode" type="hidden" value="mock" />
                              <input name="provider" type="hidden" value="mock" />
                              <input name="model" type="hidden" value="betel-deterministic-v0" />
                              <input name="operatorLabel" type="hidden" value="Compliance Betel" />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[rgba(139,92,246,0.32)] bg-[rgba(139,92,246,0.08)] text-[var(--admin-purple)]"
                              >
                                <ShieldCheck size={14} />
                                Compliance
                              </Button>
                            </form>
                          )}
                        {capture.complianceRunCode &&
                          !capture.communicationDispatchedAt &&
                          !isBlockedStatus(
                            capture.legalReviewDecision,
                            capture.complianceRunStatus,
                            capture.complianceReviewStatus
                          ) &&
                          isComplianceProcessed(capture.complianceRunStatus) && (
                            <form action={releaseCommunicationAction}>
                              <input name="snapshotCode" type="hidden" value={capture.snapshotCode} />
                              <input name="complianceRunCode" type="hidden" value={capture.complianceRunCode} />
                              <input name="sourceId" type="hidden" value={sourceId || ""} />
                              <input name="filterStatus" type="hidden" value={status || ""} />
                              <input name="audienceScope" type="hidden" value="all" />
                              <input name="channels" type="hidden" value="WhatsApp, Email, Push" />
                              <input name="operatorLabel" type="hidden" value="Growth Betel" />
                              <input name="reviewerLabel" type="hidden" value="Compliance Betel" />
                              <input
                                name="messageIntent"
                                type="hidden"
                                value="Preparar comunicacao supervisionada da oportunidade aprovada, separando mensagem completa para cliente pagante e teaser seguro para lead frio."
                              />
                              <input
                                name="notes"
                                type="hidden"
                                value="Compliance liberou comunicacao segmentada sem envio externo direto."
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                className="h-8 border-[rgba(34,197,94,0.32)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]"
                              >
                                <Send size={14} />
                                Comunicar
                              </Button>
                            </form>
                          )}
                        {capture.sourceUrl ? (
                          <Button
                            asChild
                            variant="ghost"
                            size="icon-sm"
                            className="text-[var(--admin-muted)] hover:text-white"
                          >
                            <Link href={capture.sourceUrl} target="_blank" rel="noreferrer">
                              <ExternalLink size={15} />
                              <span className="sr-only">Abrir fonte</span>
                            </Link>
                          </Button>
                        ) : (
                          <FileSearch size={15} className="text-[var(--admin-muted)]" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid min-h-[260px] place-items-center px-4 py-10 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid size-12 place-items-center rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] text-[var(--admin-cyan)]">
                <DatabaseZap size={22} />
              </div>
              <h2 className="mt-4 text-base font-semibold text-white">Nenhuma captura registrada</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--admin-muted)]">
                A proxima oportunidade cadastrada com URL, ID externo, evidencias ou payload aparecera aqui.
              </p>
              <Button asChild className="mt-5 h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
                <Link href="/admin/oportunidades/nova">
                  <Plus size={15} />
                  Criar primeira captura
                </Link>
              </Button>
            </div>
          </div>
        )}
      </DashboardCard>
    </div>
  );
}
