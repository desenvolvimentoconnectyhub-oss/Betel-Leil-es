import "server-only";

import {
  getScraperTargetByCode,
  createScraperRunRecord,
  updateScraperRunRecord,
  updateScraperTargetRunState,
} from "./scraper-repository";
import { ingestAuctionOpportunityRecord } from "@/lib/admin/repository/pipeline";
import { executeStrategy } from "./scraper-strategies";
import { isGeminiQuotaError } from "./scraper-llm";
import { screenScraperCandidatesByWillianPattern } from "./scraper-criteria";
import type { ScraperCandidate, ScraperResult, ScraperTarget } from "./types";

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function candidateCode(target: ScraperTarget, candidate: ScraperCandidate, index: number) {
  const sourceUrlKey = candidate.sourceUrl ? candidate.sourceUrl.split("/").filter(Boolean).pop() || "" : "";
  const base = [
    target.targetCode,
    candidate.sourceUrl ? sourceUrlKey : "",
    candidate.city,
    candidate.title,
    String(index + 1),
  ]
    .filter(Boolean)
    .join("-");

  return normalizeCode(base).slice(0, 72) || normalizeCode(`${target.targetCode}-${Date.now()}-${index + 1}`);
}

function normalizeScore(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.round(value), 0), 100);
}

async function ingestScraperCandidates(target: ScraperTarget, candidates: ScraperCandidate[]) {
  const ingested: string[] = [];
  const failed: { title: string; error: string }[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const initialBid = Number(candidate.minBid) || 0;
    const appraisalValue = Number(candidate.appraisalValue) || 0;
    const discountPct =
      Number(candidate.discount) ||
      (appraisalValue > 0 && initialBid > 0 ? Math.round(((appraisalValue - initialBid) / appraisalValue) * 100) : 0);

    const result = await ingestAuctionOpportunityRecord({
      code: candidateCode(target, candidate, index),
      title: candidate.title || `Oportunidade capturada em ${target.name}`,
      propertyType: candidate.propertyType || "Imovel",
      address: candidate.address || candidate.city || target.region || "Nao informado",
      city: candidate.city || target.region || "Nao informado",
      state: candidate.state || "",
      sourceName: candidate.auctioneer || target.name,
      sourceType: target.targetType,
      initialBid,
      appraisalValue,
      discountPct: normalizeScore(discountPct, 0),
      opportunityScore: normalizeScore(discountPct > 0 ? 45 + discountPct : 55, 55),
      riskScore: 45,
      complianceScore: 60,
      aiStatus: "Fila IA",
      legalStatus: "Pendente",
      stage: "Entrada",
      nextAction: "Curadoria IA deve revisar edital, matricula, riscos juridicos e comparaveis antes de liberar.",
      owner: "Renata - Buscadora de Imoveis",
      auctionDate: candidate.auctionDate || "",
      occupancy: "Nao informado",
      summary: `Candidato capturado automaticamente em ${target.name}. Validar dados antes de qualquer comunicacao comercial.`,
      sourceUrl: candidate.sourceUrl || target.url,
      externalId: candidate.sourceUrl || `${target.targetCode}-${index + 1}`,
      collectionMode: "scraper_target",
      evidenceNotes: "Captura automatica do scraper. Requer curadoria, risco oculto e revisao humana.",
      rawPayload: {
        targetCode: target.targetCode,
        targetName: target.name,
        targetUrl: target.url,
        scrapeStrategy: target.scrapeStrategy,
        candidate: candidate.rawData || candidate,
      },
    });

    if (result.ok && result.data) {
      ingested.push(result.data.code);
    } else {
      failed.push({
        title: candidate.title || candidate.sourceUrl || `candidato ${index + 1}`,
        error: result.error || "Falha desconhecida ao ingerir candidato.",
      });
    }
  }

  return { ingested, failed };
}

export async function runScraperForTarget(
  targetCode: string
): Promise<{
  ok: boolean;
  runCode?: string;
  error?: string;
  result?: ScraperResult;
  ingested?: string[];
  ingestFailed?: { title: string; error: string }[];
  rateLimited?: boolean;
}> {
  const targetResult = await getScraperTargetByCode(targetCode);

  if (!targetResult.data) {
    return { ok: false, error: `Alvo ${targetCode} nao encontrado.` };
  }

  const target = targetResult.data;

  if (!target.enabled) {
    return { ok: false, error: `Alvo ${targetCode} esta desabilitado.` };
  }

  const runResult = await createScraperRunRecord(target.id, target.targetCode);
  if (!runResult.ok || !runResult.data) {
    return { ok: false, error: runResult.error || "Falha ao criar run." };
  }

  const { runCode } = runResult.data;

  await updateScraperRunRecord(runCode, { status: "running" });

  const result = await executeStrategy(target);
  const rateLimited = isGeminiQuotaError(result.errorMessage);
  const screening = screenScraperCandidatesByWillianPattern(result.candidates);
  const ingest = screening.accepted.length ? await ingestScraperCandidates(target, screening.accepted) : { ingested: [], failed: [] };
  const hasIngestFailure = ingest.failed.length > 0;
  const finalStatus =
    result.status === "failed" ? "failed" : result.errorMessage || hasIngestFailure ? "partial" : "completed";
  const errorMessage = [
    result.errorMessage,
    hasIngestFailure ? `${ingest.failed.length} candidato(s) nao foram gravados.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  await updateScraperRunRecord(runCode, {
    status: finalStatus,
    itemsFound: result.candidates.length,
    itemsIngested: ingest.ingested.length,
    itemsSkipped: screening.skipped.length + Math.max(screening.accepted.length - ingest.ingested.length - ingest.failed.length, 0),
    itemsDuplicate: 0,
    pagesScraped: result.pagesScraped,
    durationMs: result.durationMs,
    errorMessage: errorMessage || undefined,
  });

  await updateScraperTargetRunState(target.targetCode, {
    status: finalStatus,
    itemsFound: result.candidates.length,
    errorMessage: errorMessage || undefined,
    consecutiveErrors: target.consecutiveErrors,
    errorCount: target.errorCount,
  });

  return {
    ok: finalStatus !== "failed",
    runCode,
    result: { ...result, status: finalStatus, errorMessage: errorMessage || undefined },
    ingested: ingest.ingested,
    ingestFailed: ingest.failed,
    rateLimited,
  };
}

export async function runScraperCron(options: { maxTargets?: number } = {}): Promise<{
  processed: string[];
  failed: string[];
  skipped: string[];
}> {
  const { listScraperTargets } = await import("./scraper-repository");
  const targetsResult = await listScraperTargets();

  const processed: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const configuredMaxTargets = Number(process.env.SCRAPER_CRON_MAX_TARGETS);
  const maxTargets = Math.max(1, options.maxTargets || (Number.isFinite(configuredMaxTargets) && configuredMaxTargets > 0 ? configuredMaxTargets : 4));
  let quotaBlocked = false;

  for (const target of targetsResult.data) {
    if (quotaBlocked) {
      skipped.push(target.targetCode);
      continue;
    }

    if (processed.length + failed.length >= maxTargets) {
      skipped.push(target.targetCode);
      continue;
    }

    if (!target.enabled) {
      skipped.push(target.targetCode);
      continue;
    }

    if (target.consecutiveErrors >= target.maxRetries) {
      skipped.push(target.targetCode);
      continue;
    }

    const result = await runScraperForTarget(target.targetCode);

    if (result.rateLimited) {
      failed.push(target.targetCode);
      quotaBlocked = true;
      continue;
    }

    if (result.ok) {
      processed.push(target.targetCode);
    } else {
      failed.push(target.targetCode);
    }
  }

  return { processed, failed, skipped };
}
