import "server-only";

import {
  getScraperTargetByCode,
  createScraperRunRecord,
  updateScraperRunRecord,
  updateScraperTargetRunState,
} from "./scraper-repository";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestAuctionOpportunityRecord } from "@/lib/admin/repository/pipeline";
import { collectImageUrlsFromSourceUrl, executeStrategy } from "./scraper-strategies";
import { isGeminiQuotaError } from "./scraper-llm";
import { screenScraperCandidatesByWillianPattern } from "./scraper-criteria";
import { mirrorRemoteImagesToR2 } from "@/lib/storage/r2";
import { assessRealEstateAsset, isLikelyExactPropertySourceUrl, isLikelyPropertyImageUrl } from "./quality";
import type { ScraperCandidate, ScraperResult, ScraperTarget } from "./types";
import {
  sendScraperWhatsAppReport,
  type ScraperCronRunSummary,
  type ScraperTargetRunReport,
} from "./whatsapp-report";

const DEFAULT_SCRAPER_CRON_MAX_TARGETS = 20;
const MAX_SCRAPER_CRON_TARGETS = 25;

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

function hasInformedAuctionValue(initialBid: number, appraisalValue: number) {
  return initialBid > 0 || appraisalValue > 0;
}

function uniqueImageUrls(imageUrls: string[] | undefined) {
  const seen = new Set<string>();
  return (imageUrls || [])
    .map((url) => asString(url).trim())
    .filter(Boolean)
    .filter(isLikelyPropertyImageUrl)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
}

function hasUsableStoredImage(images: Awaited<ReturnType<typeof mirrorRemoteImagesToR2>>) {
  return images.some((image) => Boolean(image.url) && image.status !== "failed");
}

function hasExactSourceUrl(candidate: ScraperCandidate, target: ScraperTarget) {
  return isLikelyExactPropertySourceUrl(asString(candidate.sourceUrl), target.url);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value) || fallback;
}

function imageAssetsFromRawPayload(rawPayload: Record<string, unknown>) {
  const media = asRecord(rawPayload.media);
  return Array.isArray(media.images)
    ? media.images
        .map((image) => asString(asRecord(image).url))
        .filter(Boolean)
    : [];
}

function sourceUrlFromRawPayload(rawPayload: Record<string, unknown>) {
  const candidate = asRecord(rawPayload.candidate);
  return asString(
    rawPayload.sourceUrl,
    asString(candidate.sourceUrl, asString(rawPayload.targetUrl))
  );
}

function targetLastScrapedMs(target: ScraperTarget) {
  if (!target.lastScrapedAt) return 0;
  const ms = Date.parse(target.lastScrapedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function sortTargetsForCron(targets: ScraperTarget[]) {
  return [...targets].sort((a, b) => {
    const aBlocked = !a.enabled || a.consecutiveErrors >= a.maxRetries;
    const bBlocked = !b.enabled || b.consecutiveErrors >= b.maxRetries;
    if (aBlocked !== bBlocked) return aBlocked ? 1 : -1;

    const lastDiff = targetLastScrapedMs(a) - targetLastScrapedMs(b);
    if (lastDiff !== 0) return lastDiff;

    return b.priority - a.priority;
  });
}

export async function backfillOpportunityImages(options: {
  limit?: number;
  force?: boolean;
} = {}): Promise<{
  ok: boolean;
  scanned: number;
  updated: number;
  skipped: number;
  failed: Array<{ code: string; title: string; error: string }>;
}> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: [{ code: "", title: "", error: "Supabase admin nao configurado." }],
    };
  }

  const limit = Math.min(Math.max(options.limit || 80, 1), 200);
  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("id, code, title, raw_payload")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      ok: false,
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: [{ code: "", title: "", error: error.message }],
    };
  }

  let updated = 0;
  let skipped = 0;
  const failed: Array<{ code: string; title: string; error: string }> = [];

  for (const row of data || []) {
    const code = asString(row.code, asString(row.id));
    const title = asString(row.title, code);
    const rawPayload = asRecord(row.raw_payload);
    const existingImages = imageAssetsFromRawPayload(rawPayload);

    if (existingImages.length && !options.force) {
      skipped += 1;
      continue;
    }

    const sourceUrl = sourceUrlFromRawPayload(rawPayload);
    if (!sourceUrl) {
      skipped += 1;
      failed.push({ code, title, error: "URL de origem ausente." });
      continue;
    }

    const imageUrls = await collectImageUrlsFromSourceUrl(sourceUrl, asString(rawPayload.targetUrl));
    if (!imageUrls.length) {
      skipped += 1;
      failed.push({ code, title, error: "Nenhuma imagem util encontrada na origem." });
      continue;
    }

    const images = await mirrorRemoteImagesToR2({
      opportunityCode: code,
      imageUrls,
      alt: title,
      maxImages: 40,
    });

    if (!images.length) {
      skipped += 1;
      failed.push({ code, title, error: "Imagem encontrada, mas nao foi possivel salvar a galeria." });
      continue;
    }

    const media = asRecord(rawPayload.media);
    const nextRawPayload = {
      ...rawPayload,
      media: {
        ...media,
        images,
        sourceImageUrls: imageUrls,
        mirroredCount: images.filter((image) => image.status === "mirrored").length,
        externalCount: images.filter((image) => image.status === "external").length,
        failedCount: images.filter((image) => image.status === "failed").length,
        collectedAt: new Date().toISOString(),
      },
    };

    const updateResult = await supabase
      .from("auction_opportunities")
      .update({ raw_payload: nextRawPayload, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateResult.error) {
      failed.push({ code, title, error: updateResult.error.message });
      continue;
    }

    updated += 1;
  }

  return {
    ok: failed.length === 0 || updated > 0,
    scanned: (data || []).length,
    updated,
    skipped,
    failed,
  };
}

async function ingestScraperCandidates(target: ScraperTarget, candidates: ScraperCandidate[]) {
  const ingested: string[] = [];
  const failed: { title: string; error: string }[] = [];
  const skipped: { title: string; reason: string }[] = [];

  for (const [index, candidate] of candidates.entries()) {
    const initialBid = Number(candidate.minBid) || 0;
    const appraisalValue = Number(candidate.appraisalValue) || 0;
    const sourceImageUrls = uniqueImageUrls(candidate.imageUrls);
    const hasValue = hasInformedAuctionValue(initialBid, appraisalValue);
    const exactSourceUrl = asString(candidate.sourceUrl).trim();
    const assetAssessment = assessRealEstateAsset({
      title: candidate.title,
      propertyType: candidate.propertyType,
      address: candidate.address,
      city: candidate.city,
      state: candidate.state,
      sourceUrl: candidate.sourceUrl,
      rawData: candidate.rawData,
    });

    if (assetAssessment.rejected) {
      skipped.push({
        title: candidate.title || candidate.sourceUrl || `candidato ${index + 1}`,
        reason: `Descartado: ${assetAssessment.reason}`,
      });
      continue;
    }

    if (!hasExactSourceUrl(candidate, target)) {
      skipped.push({
        title: candidate.title || candidate.sourceUrl || `candidato ${index + 1}`,
        reason: "Descartado: sem link exato da fonte do imovel.",
      });
      continue;
    }

    if (!hasValue || sourceImageUrls.length === 0) {
      skipped.push({
        title: candidate.title || candidate.sourceUrl || `candidato ${index + 1}`,
        reason: !hasValue
          ? "Descartado: sem valor informado."
          : "Descartado: sem foto util do imovel.",
      });
      continue;
    }

    const discountPct =
      Number(candidate.discount) ||
      (appraisalValue > 0 && initialBid > 0 ? Math.round(((appraisalValue - initialBid) / appraisalValue) * 100) : 0);
    const code = candidateCode(target, candidate, index);
    const images = await mirrorRemoteImagesToR2({
      opportunityCode: code,
      imageUrls: sourceImageUrls,
      alt: candidate.title || `Imovel capturado em ${target.name}`,
      maxImages: 40,
    });

    if (!hasUsableStoredImage(images)) {
      skipped.push({
        title: candidate.title || candidate.sourceUrl || `candidato ${index + 1}`,
        reason: "Descartado: as fotos da origem nao puderam ser usadas como foto do imovel.",
      });
      continue;
    }

    const result = await ingestAuctionOpportunityRecord({
      code,
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
      sourceUrl: exactSourceUrl,
      externalId: exactSourceUrl,
      collectionMode: "scraper_target",
      evidenceNotes: "Captura automatica do scraper. Requer curadoria, risco oculto e revisao humana.",
      rawPayload: {
        targetCode: target.targetCode,
        targetName: target.name,
        targetUrl: target.url,
        scrapeStrategy: target.scrapeStrategy,
        candidate: candidate.rawData || candidate,
        qualityGate: {
          hasValue,
          sourceImageCount: sourceImageUrls.length,
          usableImageCount: images.filter((image) => image.status !== "failed").length,
          blockedIfNoPhotoAndNoValue: true,
          exactSourceUrlRequired: true,
          exactSourceUrl,
          realEstateAssetRejected: assetAssessment.rejected,
          realEstateSignals: assetAssessment.strongRealEstateSignals,
          nonRealEstateSignals: assetAssessment.nonRealEstateSignals,
        },
        media: {
          images,
          sourceImageUrls,
          mirroredCount: images.filter((image) => image.status === "mirrored").length,
          externalCount: images.filter((image) => image.status === "external").length,
          failedCount: images.filter((image) => image.status === "failed").length,
        },
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

  return { ingested, failed, skipped };
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
  ingestSkipped?: { title: string; reason: string }[];
  criteriaSkipped?: { title: string; reason: string }[];
  itemsFound?: number;
  itemsIngested?: number;
  itemsSkipped?: number;
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

  const runResult = await createScraperRunRecord(target.id);
  if (!runResult.ok || !runResult.data) {
    return { ok: false, error: runResult.error || "Falha ao criar run." };
  }

  const { runCode } = runResult.data;

  await updateScraperRunRecord(runCode, { status: "running" });

  const result = await executeStrategy(target);
  const rateLimited = isGeminiQuotaError(result.errorMessage);
  const screening = screenScraperCandidatesByWillianPattern(result.candidates);
  const ingest = screening.accepted.length ? await ingestScraperCandidates(target, screening.accepted) : { ingested: [], failed: [], skipped: [] };
  const hasIngestFailure = ingest.failed.length > 0;
  const criteriaSkipped = screening.skipped.map((item) => ({
    title: item.candidate.title || item.candidate.sourceUrl || item.reason,
    reason: item.detail || item.reason,
  }));
  const sourceUrlSkippedCount = ingest.skipped.filter((item) => item.reason.toLowerCase().includes("link exato")).length;
  const noPhotoValueSkippedCount = ingest.skipped.filter((item) => item.reason.toLowerCase().includes("sem foto")).length;
  const itemsFound = result.candidates.length;
  const itemsIngested = ingest.ingested.length;
  const itemsSkipped =
    criteriaSkipped.length +
    ingest.skipped.length +
    Math.max(screening.accepted.length - ingest.ingested.length - ingest.failed.length - ingest.skipped.length, 0);
  const finalStatus =
    result.status === "failed" ? "failed" : result.errorMessage || hasIngestFailure ? "partial" : "completed";
  const errorMessage = [
    result.errorMessage,
    hasIngestFailure ? `${ingest.failed.length} candidato(s) nao foram gravados.` : "",
    sourceUrlSkippedCount ? `${sourceUrlSkippedCount} candidato(s) descartados por falta de link exato da fonte.` : "",
    noPhotoValueSkippedCount ? `${noPhotoValueSkippedCount} candidato(s) descartados por falta de foto e valor.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  await updateScraperRunRecord(runCode, {
    status: finalStatus,
    itemsFound,
    itemsIngested,
    itemsSkipped,
    itemsDuplicate: 0,
    pagesScraped: result.pagesScraped,
    durationMs: result.durationMs,
    errorMessage: errorMessage || undefined,
  });

  await updateScraperTargetRunState(target.targetCode, {
    status: finalStatus,
    itemsFound,
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
    ingestSkipped: ingest.skipped,
    criteriaSkipped,
    itemsFound,
    itemsIngested,
    itemsSkipped,
    rateLimited,
  };
}

function makeSkippedTargetReport(target: ScraperTarget, skipReason: string): ScraperTargetRunReport {
  return {
    targetCode: target.targetCode,
    targetName: target.name,
    status: "skipped",
    skipReason,
    itemsFound: 0,
    itemsIngested: 0,
    itemsSkipped: 0,
    itemsFailed: 0,
    pagesScraped: 0,
    durationMs: 0,
  };
}

export async function runScraperCron(
  options: { maxTargets?: number; notify?: boolean; notificationDryRun?: boolean } = {}
): Promise<ScraperCronRunSummary> {
  const { listScraperTargets } = await import("./scraper-repository");
  const targetsResult = await listScraperTargets();

  const startedAt = new Date().toISOString();
  const processed: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];
  const targets: ScraperTargetRunReport[] = [];
  const configuredMaxTargets = Number(process.env.SCRAPER_CRON_MAX_TARGETS);
  const maxTargets = Math.min(
    MAX_SCRAPER_CRON_TARGETS,
    Math.max(
      1,
      options.maxTargets ||
        (Number.isFinite(configuredMaxTargets) && configuredMaxTargets > 0
          ? configuredMaxTargets
          : DEFAULT_SCRAPER_CRON_MAX_TARGETS)
    )
  );
  let quotaBlocked = false;

  for (const target of sortTargetsForCron(targetsResult.data)) {
    if (quotaBlocked) {
      skipped.push(target.targetCode);
      targets.push(makeSkippedTargetReport(target, "quota_blocked"));
      continue;
    }

    if (processed.length + failed.length >= maxTargets) {
      skipped.push(target.targetCode);
      targets.push(makeSkippedTargetReport(target, "max_targets_reached"));
      continue;
    }

    if (!target.enabled) {
      skipped.push(target.targetCode);
      targets.push(makeSkippedTargetReport(target, "target_disabled"));
      continue;
    }

    if (target.consecutiveErrors >= target.maxRetries) {
      skipped.push(target.targetCode);
      targets.push(makeSkippedTargetReport(target, "max_retries_reached"));
      continue;
    }

    const result = await runScraperForTarget(target.targetCode);
    targets.push({
      targetCode: target.targetCode,
      targetName: target.name,
      runCode: result.runCode,
      status: result.result?.status || (result.ok ? "completed" : "failed"),
      rateLimited: Boolean(result.rateLimited),
      itemsFound: result.itemsFound || result.result?.candidates.length || 0,
      itemsIngested: result.itemsIngested || result.ingested?.length || 0,
      itemsSkipped: result.itemsSkipped || 0,
      itemsFailed: result.ingestFailed?.length || 0,
      pagesScraped: result.result?.pagesScraped || 0,
      durationMs: result.result?.durationMs || 0,
      errorMessage: result.error || result.result?.errorMessage,
      skippedDetails: [...(result.criteriaSkipped || []), ...(result.ingestSkipped || [])],
      failedDetails: result.ingestFailed || [],
    });

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

  const cronResult: ScraperCronRunSummary = {
    processed,
    failed,
    skipped,
    targets,
    startedAt,
    finishedAt: new Date().toISOString(),
    quotaBlocked,
  };

  if (options.notify !== false) {
    try {
      cronResult.notification = await sendScraperWhatsAppReport(cronResult, {
        dryRun: Boolean(options.notificationDryRun),
      });
    } catch (error) {
      cronResult.notification = {
        enabled: true,
        skipped: true,
        reason: error instanceof Error ? error.message : "Falha desconhecida ao enviar relatorio WhatsApp.",
        messageCode: `SCR-RPT-ERROR-${Date.now().toString(36).toUpperCase()}`,
        recipients: [],
        attempted: 0,
        sent: 0,
        failed: 1,
        messagePreview: "",
        providerStatuses: [],
      };
    }
  }

  return cronResult;
}
