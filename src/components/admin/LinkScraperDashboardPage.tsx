"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import type { AdminModule } from "@/lib/admin/modules";
import type {
  LinkScraperBatch,
  LinkScraperDashboardData,
  LinkAnalysisDepth,
  MarketAnalysisResetSummary,
  ParsedLinkImportFile,
} from "@/lib/scraper";
import type { DataResult } from "@/lib/admin/repository";
import { DashboardCard } from "./DashboardCard";
import { cn } from "@/lib/utils";

type Props = {
  module: AdminModule;
  data: DataResult<LinkScraperDashboardData>;
};

const inputClass =
  "h-9 w-full rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-3 text-sm text-white placeholder:text-[var(--admin-muted)] outline-none transition focus:border-[var(--admin-cyan)]";

function statusTone(status: string) {
  if (["concluido", "pronto_para_revisao", "sent"].includes(status)) return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (["processando", "scraping", "aguardando_scraper"].includes(status)) return "border-cyan-300 bg-cyan-50 text-cyan-900";
  if (["falha", "url_invalida", "failed"].includes(status)) return "border-red-300 bg-red-50 text-red-900";
  return "border-yellow-300 bg-yellow-50 text-yellow-950";
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-semibold", className)}>
      {children}
    </span>
  );
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <DashboardCard>
      <div className="space-y-1">
        <p className="text-xs text-[var(--admin-muted)]">{label}</p>
        <p className="text-2xl font-semibold text-white">{value}</p>
        <p className="text-xs text-[var(--admin-muted)]">{detail}</p>
      </div>
    </DashboardCard>
  );
}

function rowNeedsRetry(status: string) {
  return status === "falha";
}

const activeRowStatuses = new Set(["aguardando_scraper", "scraping", "scraper_concluido", "extracao_concluida", "analise_mercado_pendente"]);
const terminalRowStatuses = new Set(["pronto_para_revisao", "falha", "url_invalida", "duplicado"]);
const analysisDepthLabels: Record<LinkAnalysisDepth, string> = {
  deep: "Analise profunda",
  standard: "Analise padrao",
};

function batchHasActiveWork(batch: LinkScraperBatch) {
  return batch.status === "processando" && batch.rows.some((row) => activeRowStatuses.has(row.status));
}

function findQualityGateBlockedRow(batch: LinkScraperBatch) {
  return batch.rows.find((row) =>
    row.status === "falha" && row.errorMessage.toLowerCase().includes("trava de qualidade")
  );
}

function qualityGateIssueText(errorMessage: string) {
  return errorMessage.split("Campos pendentes:").at(1)?.replace(/\.$/, "").trim() || errorMessage;
}

function rowStageLabel(status: string) {
  if (status === "aguardando_inicio") return "Aguardando inicio";
  if (status === "aguardando_scraper") return "Na fila para abrir o link";
  if (status === "scraping") return "Abrindo pagina e capturando dados";
  if (status === "scraper_concluido") return "Dados do leilao capturados";
  if (status === "extracao_concluida") return "Organizando informacoes do imovel";
  if (status === "analise_mercado_pendente") return "Preparando analise de mercado";
  if (status === "pronto_para_revisao") return "Pronto para revisao";
  if (status === "falha") return "Falha na coleta";
  if (status === "url_invalida") return "Link invalido";
  return status || "Em processamento";
}

function batchReadyToStart(batch: LinkScraperBatch) {
  return batch.status === "aguardando_inicio" || batch.status === "draft" || batch.status === "falha";
}

function fileAutoImportKey(file: File, analysisDepth: LinkAnalysisDepth) {
  return `${file.name}:${file.size}:${file.lastModified}:${analysisDepth}`;
}

function workflowNotificationLabel(status: string) {
  if (status === "sent") return "avisado";
  if (status === "partial") return "aviso parcial";
  if (status === "failed") return "falha no aviso";
  if (status === "skipped") return "sem usuario no setor";
  if (status === "workflow_queued" || status === "workflow_pending") return "workflow pendente";
  return "workflow setorial";
}

function formatResetSummary(summary?: MarketAnalysisResetSummary) {
  if (!summary) return "Analises de mercado limpas.";
  return [
    `Limpeza concluida: ${summary.opportunitiesDeleted} imovel(is), ${summary.rowsDeleted} linha(s) e ${summary.batchesDeleted} lote(s) removido(s).`,
    `${summary.r2ObjectsDeleted} imagem(ns) apagada(s) do R2; ${summary.externalAssetsSkipped} imagem(ns) externa(s) ignorada(s).`,
  ].join(" ");
}

export function LinkScraperDashboardPage({ module, data }: Props) {
  const [dashboard, setDashboard] = useState(data.data);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err" | "info"; message: string } | null>(
    data.reason ? { type: "info", message: data.reason } : null
  );
  const [busy, setBusy] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<ParsedLinkImportFile | null>(null);
  const [analysisDepth, setAnalysisDepth] = useState<LinkAnalysisDepth>("deep");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const importFormRef = useRef<HTMLFormElement | null>(null);
  const autoImportKeyRef = useRef("");

  const hasActiveBatch = useMemo(() => dashboard.batches.some(batchHasActiveWork), [dashboard.batches]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/scraper", { cache: "no-store" });
    const json = await res.json();
    if (json.data) setDashboard(json.data as LinkScraperDashboardData);
  }, []);

  useEffect(() => {
    if (!hasActiveBatch) return;
    const intervalId = window.setInterval(() => {
      void refresh();
    }, 6000);
    return () => window.clearInterval(intervalId);
  }, [hasActiveBatch, refresh]);

  async function postJson(payload: Record<string, unknown>, success: string) {
    setBusy(String(payload.action || "acao"));
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Falha na acao.");
      setFeedback({ type: "ok", message: success });
      await refresh();
      return true;
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha inesperada." });
      return false;
    } finally {
      setBusy("");
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    autoImportKeyRef.current = "";
    setSelectedFile(file);
    setFilePreview(null);
    if (file) void previewFile(file);
  }

  async function previewFile(fileOverride?: File) {
    const fileToPreview = fileOverride || selectedFile;
    if (!fileToPreview) {
      setFeedback({ type: "err", message: "Selecione um arquivo para pre-visualizar." });
      return;
    }

    const formData = new FormData();
    formData.set("action", "preview_file");
    formData.set("file", fileToPreview);
    setBusy("preview_file");
    setFeedback({ type: "info", message: "Lendo arquivo e validando os links..." });

    try {
      const res = await fetch("/api/admin/scraper", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Falha ao ler arquivo.");
      const parsed = json.parsed as ParsedLinkImportFile;
      setFilePreview(parsed);
      setFeedback({
        type: parsed.validRowCount ? "ok" : "err",
        message: `${parsed.validRowCount} link(s) valido(s), ${parsed.invalidRowCount} invalido(s), ${parsed.ignoredRowCount} linha(s) ignorada(s).`,
      });
    } catch (error) {
      setFilePreview(null);
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao pre-visualizar arquivo." });
    } finally {
      setBusy("");
    }
  }

  const saveImportedFile = useCallback(
    async (file: File | null, preview: ParsedLinkImportFile | null, form?: HTMLFormElement | null) => {
      if (!file) {
        setFeedback({ type: "err", message: "Selecione um arquivo para salvar o lote." });
        return;
      }
      if (!preview) {
        setFeedback({ type: "err", message: "Aguarde a pre-visualizacao automatica antes de salvar o lote." });
        return;
      }
      if (preview.validRowCount === 0) {
        setFeedback({ type: "err", message: "O arquivo nao possui links validos para salvar." });
        return;
      }

      const formData = new FormData();
      formData.set("action", "import_file");
      formData.set("file", file);
      formData.set("analysisDepth", analysisDepth);
      setBusy("import_file");
      setFeedback({ type: "info", message: "Salvando lote automaticamente..." });

      try {
        const res = await fetch("/api/admin/scraper", { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok || json.ok === false || json.result?.ok === false) {
          throw new Error(json.error || json.result?.error || "Falha ao importar arquivo.");
        }
        form?.reset();
        setSelectedFile(null);
        setFilePreview(null);
        setFeedback({ type: "ok", message: `Lote criado com ${json.result?.data?.rowsCreated || 0} link(s).` });
        await refresh();
      } catch (error) {
        setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao importar arquivo." });
      } finally {
        setBusy("");
      }
    },
    [analysisDepth, refresh]
  );

  useEffect(() => {
    if (!selectedFile || !filePreview || filePreview.validRowCount === 0) return;
    if (busy === "preview_file" || busy === "import_file") return;

    const key = fileAutoImportKey(selectedFile, analysisDepth);
    if (autoImportKeyRef.current === key) return;

    autoImportKeyRef.current = key;
    void saveImportedFile(selectedFile, filePreview, importFormRef.current);
  }, [analysisDepth, busy, filePreview, saveImportedFile, selectedFile]);

  async function importFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    autoImportKeyRef.current = selectedFile ? fileAutoImportKey(selectedFile, analysisDepth) : "";
    await saveImportedFile(selectedFile, filePreview, event.currentTarget);
  }

  async function startBatch(batch: LinkScraperBatch) {
    await postJson(
      {
        action: "start_batch",
        batchId: batch.id,
        analysisDepth: batch.analysisDepth || analysisDepth,
      },
      "Processamento enfileirado. Ao terminar, o setor de Analise de mercado recebera o WhatsApp."
    );
  }

  async function retryRow(rowId: string) {
    await postJson({ action: "retry_row", rowId }, "Linha reprocessada.");
  }

  async function resetMarketAnalysis() {
    setBusy("market_analysis_reset");
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "market_analysis_reset", confirmation: resetConfirmation }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        const summary = json.data as MarketAnalysisResetSummary | undefined;
        const failureDetail = summary?.failures?.length ? ` Falhas: ${summary.failures.slice(0, 2).join(" | ")}` : "";
        throw new Error(`${json.error || "Falha ao limpar analises."}${failureDetail}`);
      }
      setResetConfirmation("");
      setFeedback({ type: "ok", message: formatResetSummary(json.data as MarketAnalysisResetSummary | undefined) });
      await refresh();
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao limpar analises." });
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--admin-muted)]">{module.label}</p>
          <h1 className="mt-1 text-2xl font-semibold text-white">Analise de mercado</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--admin-muted)]">
            Importe os links escolhidos pela equipe, capture dados e imagens dos imoveis e gere uma analise preliminar para revisao humana.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-3 text-sm text-white hover:border-[var(--admin-cyan)]"
        >
          <RefreshCw size={16} />
          Atualizar
        </button>
      </div>

      {feedback && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            feedback.type === "ok" && "border-emerald-300 bg-emerald-50 text-emerald-900",
            feedback.type === "err" && "border-red-300 bg-red-50 text-red-900",
            feedback.type === "info" && "border-cyan-300 bg-cyan-50 text-cyan-900"
          )}
        >
          {feedback.message}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric label="Lotes" value={dashboard.metrics.totalBatches} detail="Importacoes recentes" />
        <Metric label="Links" value={dashboard.metrics.totalRows} detail="Linhas nos lotes" />
        <Metric label="Prontos" value={dashboard.metrics.readyRows} detail="Para revisao humana" />
        <Metric label="Falhas" value={dashboard.metrics.failedRows} detail="Requerem nova tentativa" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.35fr)]">
        <DashboardCard title="Limpar imoveis analisados" eyebrow="testes / banco + r2" action={<Trash2 size={18} className="text-red-300" />}>
          <div className="grid gap-3">
            <p className="text-sm leading-5 text-[var(--admin-muted)]">
              Remove os lotes importados, linhas presas, imoveis criados pela analise e imagens espelhadas no R2.
            </p>
            <input
              className={inputClass}
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              placeholder="Digite LIMPAR ANALISE"
            />
            <button
              type="button"
              disabled={resetConfirmation.toUpperCase() !== "LIMPAR ANALISE" || busy === "market_analysis_reset"}
              onClick={resetMarketAnalysis}
              className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-lg bg-red-400 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "market_analysis_reset" ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Limpar testes
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="Importar novo lote" eyebrow="xlsx / csv / txt" action={<FileSpreadsheet size={18} className="text-[var(--admin-cyan)]" />}>
          <form ref={importFormRef} onSubmit={importFile} className="space-y-4">
            <fieldset className="rounded-lg border border-[var(--admin-border)] p-3">
              <legend className="px-1 text-xs text-[var(--admin-muted)]">Profundidade da analise</legend>
              <div className="grid gap-2 md:grid-cols-2">
                {(["deep", "standard"] as LinkAnalysisDepth[]).map((option) => (
                  <label
                    key={option}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition",
                      analysisDepth === option
                        ? "border-[var(--admin-cyan)] bg-cyan-50 text-cyan-950"
                        : "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                    )}
                  >
                    <input
                      type="radio"
                      name="analysisDepth"
                      value={option}
                      checked={analysisDepth === option}
                      onChange={() => setAnalysisDepth(option)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {analysisDepthLabels[option]}{option === "deep" ? " (recomendado)" : ""}
                      </span>
                      <span className={cn("mt-1 block text-xs leading-5", analysisDepth === option ? "text-cyan-800" : "text-[var(--admin-muted)]")}>
                        {option === "deep"
                          ? "Mais lenta e conservadora: exige mais evidencias, documentos, foto real e pendencias explicitas."
                          : "Mais enxuta para triagem, mantendo revisao humana antes da decisao."}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block rounded-lg border border-dashed border-[var(--admin-border)] p-4">
              <span className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                <Upload size={16} />
                Arquivo com links
              </span>
              <input
                name="file"
                type="file"
                accept=".xlsx,.csv,.txt"
                className="block w-full text-sm text-[var(--admin-muted)]"
                onChange={onFileChange}
                required
              />
            </label>
            {(busy === "preview_file" || busy === "import_file") && (
              <div className="flex flex-wrap gap-2">
                {busy === "preview_file" && (
                  <span className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] px-3 text-sm text-[var(--admin-muted)]">
                    <Loader2 size={16} className="animate-spin" />
                    Lendo arquivo
                  </span>
                )}
              {busy === "import_file" && (
                <span className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--admin-cyan)] px-3 text-sm font-semibold text-slate-950">
                  <Loader2 size={16} className="animate-spin" />
                  Salvando lote
                </span>
              )}
              </div>
            )}
            {filePreview && (
              <div className="space-y-3 rounded-lg border border-[var(--admin-border)] p-3">
                <div className="grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs text-[var(--admin-muted)]">Arquivo</p>
                    <p className="truncate font-semibold text-white">{filePreview.filename}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--admin-muted)]">Validos</p>
                    <p className="font-semibold text-emerald-200">{filePreview.validRowCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--admin-muted)]">Invalidos</p>
                    <p className="font-semibold text-red-700">{filePreview.invalidRowCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--admin-muted)]">Ignorados</p>
                    <p className="font-semibold text-yellow-700">{filePreview.ignoredRowCount}</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="text-[var(--admin-muted)]">
                      <tr>
                        <th className="py-2 pr-3">Linha</th>
                        <th className="py-2 pr-3">Codigo</th>
                        <th className="py-2 pr-3">Cidade</th>
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Dominio</th>
                        <th className="py-2 pr-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filePreview.rows.slice(0, 8).map((row) => (
                        <tr key={`${row.rowNumber}-${row.auctionUrl}`} className="border-t border-[var(--admin-border)]">
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.rowNumber}</td>
                          <td className="py-2 pr-3 text-white">{row.externalCode || "-"}</td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.cityHint || "-"}</td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.auctionDateHint || "-"}</td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.sourceDomain || "-"}</td>
                          <td className="py-2 pr-3">
                            <Pill className={statusTone(row.status)}>{row.status}</Pill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </form>
        </DashboardCard>
      </section>

      <section>
        <DashboardCard title="Lotes importados" eyebrow="iniciar processo" action={<Play size={18} className="text-emerald-300" />}>
          <div className="space-y-3">
            {dashboard.batches.length === 0 && (
              <p className="rounded-lg border border-[var(--admin-border)] p-4 text-sm text-[var(--admin-muted)]">
                Nenhum lote importado ainda.
              </p>
            )}
            {dashboard.batches.map((batch) => (
              <BatchArticle
                key={batch.id}
                batch={batch}
                busy={busy}
                startBatch={startBatch}
                retryRow={retryRow}
              />
            ))}
          </div>
        </DashboardCard>
      </section>

    </main>
  );
}

function BatchArticle({
  batch,
  busy,
  startBatch,
  retryRow,
}: {
  batch: LinkScraperBatch;
  busy: string;
  startBatch: (batch: LinkScraperBatch) => void;
  retryRow: (rowId: string) => void;
}) {
  return (
    <article className="rounded-lg border border-[var(--admin-border)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-white">{batch.originalFilename || batch.id}</p>
                      <Pill className={statusTone(batch.status)}>{batch.status}</Pill>
                      <Pill className={batch.analysisDepth === "deep" ? "border-cyan-300 bg-cyan-50 text-cyan-900" : "border-slate-300 bg-slate-50 text-slate-800"}>
                        {analysisDepthLabels[batch.analysisDepth || "deep"]}
                      </Pill>
                    </div>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {batch.validRowCount} link(s) validos | {batch.invalidRowCount} invalido(s) | criado em {batch.createdAt ? new Date(batch.createdAt).toLocaleString("pt-BR") : "-"}
                    </p>
                    <p className="mt-2 text-xs text-[var(--admin-muted)]">
                      Aviso: workflow envia para usuarios do setor{" "}
                      <span className="font-semibold text-white">Analise de mercado</span>
                      {batch.notificationStatus ? ` | ${workflowNotificationLabel(batch.notificationStatus)}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!batchReadyToStart(batch) || busy === "start_batch"}
                    onClick={() => startBatch(batch)}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-300 px-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy === "start_batch" ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                    Iniciar processo
                  </button>
                </div>
                {batchHasActiveWork(batch) ? <BatchProcessingActivity batch={batch} /> : null}
                {!batchHasActiveWork(batch) && findQualityGateBlockedRow(batch) ? <BatchPausedActivity batch={batch} /> : null}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[920px] text-left text-xs">
                    <thead className="text-[var(--admin-muted)]">
                      <tr>
                        <th className="py-2 pr-3">Linha</th>
                        <th className="py-2 pr-3">Codigo</th>
                        <th className="py-2 pr-3">Cidade</th>
                        <th className="py-2 pr-3">Dominio</th>
                        <th className="py-2 pr-3">Extracao</th>
                        <th className="py-2 pr-3">Midia</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Erro</th>
                        <th className="py-2 pr-3">Acao</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batch.rows.slice(0, 8).map((row) => (
                        <tr key={row.id} className="border-t border-[var(--admin-border)]">
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.rowNumber}</td>
                          <td className="py-2 pr-3 text-white">{row.externalCode || "-"}</td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.cityHint || "-"}</td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">{row.sourceDomain || "-"}</td>
                          <td className="max-w-[240px] py-2 pr-3">
                            <p className="truncate text-white" title={row.extractionTitle || ""}>{row.extractionTitle || "-"}</p>
                            {(row.extractionConfidence || row.missingFields?.length) ? (
                              <p className="mt-1 truncate text-[11px] text-[var(--admin-muted)]">
                                {row.extractionConfidence ? `${row.extractionConfidence}% confianca` : "sem score"}
                                {row.missingFields?.length ? ` | pendente: ${row.missingFields.slice(0, 3).join(", ")}` : ""}
                              </p>
                            ) : null}
                            {row.adapterName ? (
                              <p className="mt-1 truncate text-[11px] text-cyan-700">{row.adapterName}</p>
                            ) : null}
                            {row.qualityFlags?.length ? (
                              <p className="mt-1 truncate text-[11px] text-yellow-700">
                                Flags: {row.qualityFlags.slice(0, 3).join(", ")}
                              </p>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-[var(--admin-muted)]">
                            {(row.imageCount ?? 0)} img | {(row.documentCount ?? 0)} doc
                          </td>
                          <td className="py-2 pr-3"><Pill className={statusTone(row.status)}>{row.status}</Pill></td>
                          <td className="max-w-[220px] truncate py-2 pr-3 text-red-700">{row.errorMessage || "-"}</td>
                          <td className="py-2 pr-3">
                            {rowNeedsRetry(row.status) ? (
                              <button
                                type="button"
                                onClick={() => retryRow(row.id)}
                                disabled={busy === "retry_row"}
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-[var(--admin-border)] px-2 text-[11px] text-white disabled:opacity-50"
                              >
                                {busy === "retry_row" ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                Retry
                              </button>
                            ) : (
                              <span className="text-[var(--admin-muted)]">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
  );
}

function BatchProcessingActivity({ batch }: { batch: LinkScraperBatch }) {
  const rows = batch.rows;
  const completedRows = rows.filter((row) => terminalRowStatuses.has(row.status)).length;
  const totalRows = Math.max(batch.validRowCount || 0, rows.length, 1);
  const workingRow =
    rows.find((row) => row.status === "scraping") ||
    rows.find((row) => activeRowStatuses.has(row.status)) ||
    rows.find((row) => !terminalRowStatuses.has(row.status));
  const currentIndex = workingRow ? rows.findIndex((row) => row.id === workingRow.id) : Math.min(completedRows, Math.max(rows.length - 1, 0));
  const visibleStart = Math.min(Math.max(currentIndex - 3, 0), Math.max(rows.length - 10, 0));
  const visibleRows = rows.slice(visibleStart, visibleStart + 10);
  const progress = Math.min(100, Math.round((completedRows / totalRows) * 100));
  const scannerPosition = `calc(${Math.min(96, Math.max(4, progress))}% - 8px)`;
  const activeCount = rows.filter((row) => activeRowStatuses.has(row.status)).length;
  const stage = workingRow ? rowStageLabel(workingRow.status) : "Conferindo fila do lote";
  const currentLabel = workingRow
    ? `Linha ${workingRow.rowNumber}${workingRow.sourceDomain ? ` - ${workingRow.sourceDomain}` : ""}`
    : "Aguardando proximo link";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-cyan-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Sistema trabalhando
          </p>
          <h3 className="mt-1 text-sm font-semibold text-cyan-950">Indo link por link para montar a analise</h3>
          <p className="mt-1 text-xs leading-5 text-cyan-800">
            {stage}: <span className="font-semibold">{currentLabel}</span>
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200 bg-white px-3 py-1 text-[11px] font-semibold text-cyan-800">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-cyan-600" />
          </span>
          Atualiza a cada 6s
        </div>
      </div>

      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-white">
          <div className="h-2 rounded-full bg-cyan-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          <span
            className="absolute top-1/2 grid size-4 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-cyan-600 shadow-lg shadow-cyan-600/25 transition-all duration-500 motion-safe:animate-pulse"
            style={{ left: scannerPosition }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-cyan-800">
          <span>{completedRows} de {totalRows} link(s) finalizados</span>
          <span>{activeCount} em andamento ou na fila</span>
        </div>
      </div>

      {visibleRows.length ? (
        <div className="mt-4 overflow-x-auto pb-1">
          <div className="flex min-w-max items-start gap-2">
            {visibleStart > 0 ? <ProcessingGap label={`+${visibleStart} antes`} /> : null}
            {visibleRows.map((row, index) => {
              const rowIndex = visibleStart + index;
              const isCurrent = workingRow ? workingRow.id === row.id : rowIndex === currentIndex;
              const isDone = terminalRowStatuses.has(row.status);
              return (
                <div key={row.id} className="flex w-24 flex-col items-center gap-1 text-center">
                  <div
                    className={cn(
                      "grid size-9 place-items-center rounded-full border text-xs font-semibold transition",
                      isDone && "border-emerald-300 bg-emerald-50 text-emerald-800",
                      isCurrent && "border-cyan-600 bg-cyan-600 text-white shadow-lg shadow-cyan-600/25 motion-safe:animate-pulse",
                      !isDone && !isCurrent && "border-cyan-200 bg-white text-cyan-800"
                    )}
                  >
                    {isDone ? <CheckCircle2 size={15} /> : row.rowNumber}
                  </div>
                  <span className="line-clamp-1 text-[10px] font-semibold text-cyan-900">
                    {row.externalCode || `Linha ${row.rowNumber}`}
                  </span>
                  <span className="line-clamp-1 text-[10px] text-cyan-700">{rowStageLabel(row.status)}</span>
                </div>
              );
            })}
            {visibleStart + visibleRows.length < rows.length ? <ProcessingGap label={`+${rows.length - visibleStart - visibleRows.length} depois`} /> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BatchPausedActivity({ batch }: { batch: LinkScraperBatch }) {
  const blockedRow = findQualityGateBlockedRow(batch);
  if (!blockedRow) return null;

  const pendingRows = batch.rows.filter((row) => !terminalRowStatuses.has(row.status)).length;
  const issues = qualityGateIssueText(blockedRow.errorMessage)
    .split(",")
    .map((issue) => issue.trim())
    .filter(Boolean)
    .slice(0, 10);

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-950">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            Analise pausada
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-sm font-semibold text-amber-950">
            <AlertTriangle size={16} />
            Trava de qualidade acionada
          </h3>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            O lote parou na linha <span className="font-semibold">{blockedRow.rowNumber}</span>
            {blockedRow.sourceDomain ? <> - <span className="font-semibold">{blockedRow.sourceDomain}</span></> : null}
            . Complete os dados pendentes antes de continuar a sequencia.
          </p>
        </div>
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800">
          {pendingRows} link(s) aguardando
        </div>
      </div>

      {issues.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {issues.map((issue) => (
            <span
              key={issue}
              className="rounded-full border border-amber-200 bg-white px-2 py-1 text-[11px] font-semibold text-amber-800"
            >
              {issue}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProcessingGap({ label }: { label: string }) {
  return (
    <div className="flex w-20 flex-col items-center gap-1 text-center">
      <div className="grid size-9 place-items-center rounded-full border border-dashed border-cyan-200 bg-white text-[10px] font-semibold text-cyan-700">
        ...
      </div>
      <span className="text-[10px] text-cyan-700">{label}</span>
    </div>
  );
}
