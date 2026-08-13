"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import {
  adminCanApproveWorkflowStage,
  advanceOpportunityAfterLegalApprovalRecord,
  advanceOpportunityAfterMarketApprovalRecord,
  advanceOpportunityAfterWorkflowStageApprovalRecord,
  createAuctionOpportunityRecord,
  getOpenOpportunityWorkflowTaskForAdminRecord,
  ingestAuctionOpportunityRecord,
  refreshOpportunityValidationPipelinesRecord,
  savePropertyMarketAnalysisRecord,
  savePropertyQualificationFeedbackRecord,
  updateAuctionOpportunityRecord,
  type CreateAuctionOpportunityInput,
  type SavePropertyMarketAnalysisInput,
  type SourceIntakeInput,
} from "@/lib/admin/repository";
import type { MarketAnalysisDecision, MarketAnalysisStatus, MarketComparableQuality, MarketCostItem } from "@/lib/admin/market-analysis";
import { backfillOpportunityImages } from "@/lib/scraper";
import {
  scheduleOpportunityWhatsAppPublication,
  type OpportunityWhatsAppPublicationMode,
} from "@/lib/whatsapp/opportunity-publication";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(formData: FormData, name: string, fallback = 0) {
  const raw = field(formData, name);
  if (!raw) return fallback;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "true" || value === "1";
}

function clampScore(value: number) {
  return Math.min(Math.max(Math.round(value), 0), 100);
}

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function makeFallbackCode(city: string, title: string) {
  const cityPrefix = normalizeCode(city).slice(0, 3) || "OPP";
  const titlePrefix = normalizeCode(title).slice(0, 3) || "NEW";
  const suffix = Date.now().toString(36).slice(-5).toUpperCase();
  return `${cityPrefix}-${titlePrefix}-${suffix}`;
}

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?status=error&message=${encodeURIComponent(message)}`);
}

const workflowApprovalStages = ["validation", "creative", "communication"] as const;

function workflowApprovalParam(stageKey: string) {
  if (stageKey === "market_review") return "divulgacao";
  if (stageKey === "legal_review") return "validacao";
  if (stageKey === "validation") return "criativos";
  if (stageKey === "creative") return "comunicacao";
  if (stageKey === "communication") return "concluido";
  return "aprovado";
}

function publicationModeFromSubmitStatus(value: string): OpportunityWhatsAppPublicationMode | "" {
  if (value === "approve_send_default_group") return "default_group";
  if (value === "approve_send_specific_group") return "specific_group";
  if (value === "approve_send_channel") return "channel";
  if (value === "approve_send_broadcast") return "broadcast_list";
  return "";
}

function parseBroadcastTargets(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOpportunityForm(formData: FormData, errorPath: string): CreateAuctionOpportunityInput {
  const title = field(formData, "title");
  const city = field(formData, "city");
  const state = field(formData, "state").toUpperCase();

  if (!title) errorRedirect(errorPath, "Informe o nome do imóvel.");
  if (!city || !state) errorRedirect(errorPath, "Informe cidade e UF.");

  const initialBid = numberField(formData, "initialBid");
  const appraisalValue = numberField(formData, "appraisalValue");
  const discountPct =
    appraisalValue > 0 && initialBid > 0
      ? Math.max(0, Math.round(((appraisalValue - initialBid) / appraisalValue) * 100))
      : numberField(formData, "discountPct");

  const codeInput = normalizeCode(field(formData, "code"));

  return {
    code: codeInput || makeFallbackCode(city, title),
    title,
    propertyType: field(formData, "propertyType", "Imóvel"),
    address: field(formData, "address"),
    city,
    state,
    sourceName: field(formData, "sourceName", "Cadastro manual"),
    sourceType: field(formData, "sourceType", "Manual"),
    initialBid,
    appraisalValue,
    discountPct,
    opportunityScore: clampScore(numberField(formData, "opportunityScore", 50)),
    riskScore: clampScore(numberField(formData, "riskScore", 50)),
    complianceScore: clampScore(numberField(formData, "complianceScore", 70)),
    aiStatus: field(formData, "aiStatus", "Fila IA"),
    legalStatus: field(formData, "legalStatus", "Pendente"),
    stage: field(formData, "stage", "Entrada"),
    nextAction: field(formData, "nextAction", "Triar imóvel"),
    owner: field(formData, "owner", "Operação"),
    auctionDate: field(formData, "auctionDate"),
    occupancy: field(formData, "occupancy", "Não informado"),
    summary: field(
      formData,
      "summary",
      "Imóvel captado manualmente para curadoria inicial, score, compliance e revisão humana."
    ),
  };
}

function parseRawPayload(formData: FormData, errorPath: string): Record<string, unknown> {
  const rawPayload = field(formData, "rawPayload");
  if (!rawPayload) return {};

  try {
    const parsed = JSON.parse(rawPayload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    errorRedirect(errorPath, "Payload bruto da fonte precisa ser um JSON valido.");
  }
}

function parseDecision(value: string): MarketAnalysisDecision {
  if (["excellent", "good", "caution", "review", "reject"].includes(value)) {
    return value as MarketAnalysisDecision;
  }

  return "review";
}

function parseComparableQuality(value: string): MarketComparableQuality {
  if (["strong", "medium", "weak", "discarded"].includes(value)) {
    return value as MarketComparableQuality;
  }

  return "medium";
}

function parseMarketStatus(value: string): MarketAnalysisStatus {
  if (publicationModeFromSubmitStatus(value)) return "approved";

  if (["pending", "in_analysis", "human_review", "approved", "approved_with_notes", "rejected", "insufficient_data"].includes(value)) {
    return value as MarketAnalysisStatus;
  }

  return "human_review";
}

function costItem(formData: FormData, label: string, name: string, detail = ""): MarketCostItem {
  return {
    label,
    value: numberField(formData, name),
    detail,
  };
}

function parseEstimatedCosts(formData: FormData): MarketCostItem[] {
  return [
    costItem(formData, "ITBI", "costItbi"),
    costItem(formData, "Registro", "costRegistry"),
    costItem(formData, "Comissao leiloeiro", "costCommission"),
    costItem(formData, "Juridico", "costLegal"),
    costItem(formData, "Condominio/IPTU", "costCondoIptu"),
    costItem(formData, "Reforma", "costReform"),
    costItem(formData, "Desocupacao", "costVacancy"),
    costItem(formData, "Reserva", "costReserve"),
  ].filter((item) => item.value > 0);
}

function parseMarketAnalysisForm(formData: FormData, errorPath: string): SavePropertyMarketAnalysisInput {
  const opportunityCode = normalizeCode(field(formData, "opportunityCode"));
  if (!opportunityCode) errorRedirect(errorPath, "Codigo da oportunidade ausente.");

  const marketValueBase = numberField(formData, "marketValueBase");
  if (!marketValueBase) errorRedirect(errorPath, "Informe o valor de mercado base.");

  return {
    opportunityCode,
    status: parseMarketStatus(field(formData, "submitStatus", field(formData, "status", "human_review"))),
    analystName: field(formData, "analystName", "Analise Betel"),
    paymentCondition: field(formData, "paymentCondition", "A vista"),
    paymentSimulation: {
      paymentMode: field(formData, "paymentMode", "a_vista"),
      downPaymentPct: numberField(formData, "downPaymentPct"),
      downPaymentAmount: numberField(formData, "downPaymentAmount"),
      installmentBalance: numberField(formData, "installmentBalance"),
      installmentCount: numberField(formData, "installmentCount"),
      installmentAmount: numberField(formData, "installmentAmount"),
      correctionRule: field(formData, "installmentCorrectionRule"),
      correctionWarning: field(formData, "installmentCorrectionWarning"),
    },
    landAreaM2: numberField(formData, "landAreaM2"),
    builtAreaM2: numberField(formData, "builtAreaM2"),
    privateAreaM2: numberField(formData, "privateAreaM2"),
    bedrooms: numberField(formData, "bedrooms"),
    parkingSpaces: numberField(formData, "parkingSpaces"),
    marketValueLow: numberField(formData, "marketValueLow"),
    marketValueBase,
    marketValueHigh: numberField(formData, "marketValueHigh"),
    rentalEstimate: {
      monthlyRent: numberField(formData, "monthlyRent"),
      referenceUrl: field(formData, "rentReferenceUrl"),
      referenceFound: booleanField(formData, "rentReferenceFound"),
      valueKnown: booleanField(formData, "rentValueKnown"),
      notes: field(formData, "rentNotes"),
    },
    estimatedCosts: parseEstimatedCosts(formData),
    liquidityScore: clampScore(numberField(formData, "liquidityScore", 60)),
    confidenceScore: clampScore(numberField(formData, "confidenceScore", 50)),
    legalSignal: field(formData, "legalSignal", "Validar juridico antes de liberar comunicacao ou lance."),
    decision: parseDecision(field(formData, "decision", "review")),
    decisionReason: field(formData, "decisionReason"),
    summary: field(formData, "summary"),
    cautionNotes: field(formData, "cautionNotes"),
    auctionUrl: field(formData, "auctionUrl"),
    referenceUrl: field(formData, "referenceUrl"),
    comparable: {
      sourceLabel: field(formData, "comparableSourceLabel", "Comparavel manual"),
      sourceUrl: field(formData, "comparableSourceUrl"),
      listingType: field(formData, "comparableListingType", "Oferta"),
      propertyType: field(formData, "comparablePropertyType", "Imovel"),
      address: field(formData, "comparableAddress"),
      neighborhood: field(formData, "comparableNeighborhood"),
      city: field(formData, "comparableCity"),
      state: field(formData, "comparableState").toUpperCase(),
      areaM2: numberField(formData, "comparableAreaM2"),
      askingPrice: numberField(formData, "comparableAskingPrice"),
      soldPrice: numberField(formData, "comparableSoldPrice"),
      distanceKm: numberField(formData, "comparableDistanceKm"),
      similarityScore: clampScore(numberField(formData, "comparableSimilarityScore", 60)),
      quality: parseComparableQuality(field(formData, "comparableQuality", "medium")),
      notes: field(formData, "comparableNotes"),
    },
  };
}

function hasSourceIntakeFields(formData: FormData) {
  return ["sourceUrl", "externalId", "evidenceNotes", "rawPayload"].some((name) => Boolean(field(formData, name)));
}

function parseSourceIntakeForm(formData: FormData, errorPath: string): SourceIntakeInput {
  return {
    ...parseOpportunityForm(formData, errorPath),
    sourceUrl: field(formData, "sourceUrl"),
    externalId: field(formData, "externalId"),
    collectionMode: field(formData, "collectionMode", "manual_intake"),
    evidenceNotes: field(formData, "evidenceNotes"),
    rawPayload: parseRawPayload(formData, errorPath),
  };
}

export async function createOpportunityAction(formData: FormData) {
  const shouldUseSourceIntake = hasSourceIntakeFields(formData);
  const payload = shouldUseSourceIntake
    ? parseSourceIntakeForm(formData, "/admin/oportunidades/nova")
    : parseOpportunityForm(formData, "/admin/oportunidades/nova");
  const result = shouldUseSourceIntake
    ? await ingestAuctionOpportunityRecord(payload as SourceIntakeInput)
    : await createAuctionOpportunityRecord(payload);

  if (!result.ok || !result.data?.code) {
    errorRedirect("/admin/oportunidades/nova", result.error || "Nao foi possivel cadastrar a oportunidade.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/oportunidades");
  revalidatePath(`/admin/oportunidades/${result.data.code}`);

  redirect(`/admin/oportunidades/${result.data.code}`);
}

export async function updateOpportunityAction(formData: FormData) {
  const currentCode = normalizeCode(field(formData, "currentCode") || field(formData, "code"));

  if (!currentCode) {
    errorRedirect("/admin/oportunidades", "Codigo da oportunidade ausente.");
  }

  const editPath = `/admin/oportunidades/${currentCode}/editar`;
  const payload = parseOpportunityForm(formData, editPath);
  const result = await updateAuctionOpportunityRecord(currentCode, payload);

  if (!result.ok || !result.data?.code) {
    errorRedirect(editPath, result.error || "Nao foi possivel atualizar a oportunidade.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath(`/admin/oportunidades/${result.data.code}`);
  revalidatePath(editPath);

  redirect(`/admin/oportunidades/${result.data.code}`);
}

export async function backfillOpportunityImagesAction() {
  const result = await backfillOpportunityImages({ limit: 120 });

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/scraper");

  const status = result.updated > 0 ? `fotos-${result.updated}` : "sem-fotos";
  redirect(`/admin/oportunidades?sync=${status}`);
}

export async function refreshOpportunityValidationPipelineAction() {
  const result = await refreshOpportunityValidationPipelinesRecord({ limit: 150 });

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/fontes/capturas");

  if (!result.ok || !result.data) {
    redirect(`/admin/oportunidades?validation=erro&message=${encodeURIComponent(result.error || "Nao foi possivel atualizar a validacao.")}`);
  }

  const params = new URLSearchParams({
    validation: result.data.persisted ? "salva" : "calculada",
    total: String(result.data.processed),
    concluidos: String(result.data.completed),
    bloqueados: String(result.data.blocked + result.data.discarded),
  });

  redirect(`/admin/oportunidades?${params.toString()}`);
}

export async function savePropertyMarketAnalysisAction(formData: FormData) {
  const admin = await requireCurrentAdmin();
  const currentCode = normalizeCode(field(formData, "opportunityCode"));
  const detailPath = currentCode ? `/admin/oportunidades/${currentCode}` : "/admin/oportunidades";
  const previousMarketStatus = field(formData, "status");
  const submitStatus = field(formData, "submitStatus", previousMarketStatus);
  const publicationMode = publicationModeFromSubmitStatus(submitStatus);
  const payload = parseMarketAnalysisForm(formData, detailPath);
  const approvalStatus = payload.status === "approved" || payload.status === "approved_with_notes";
  let approvalStageKey = "";
  let publicationStatusParam = "";
  let publicationCampaignId = "";

  if (approvalStatus) {
    const openTaskResult = await getOpenOpportunityWorkflowTaskForAdminRecord({
      opportunityCode: currentCode,
      admin,
    });
    approvalStageKey = openTaskResult.data?.stageKey || "";

    if (!approvalStageKey) {
      const canApproveLegacyMarket = await adminCanApproveWorkflowStage(admin, "market_review");
      const wasAlreadyApproved = previousMarketStatus === "approved" || previousMarketStatus === "approved_with_notes";
      if (!canApproveLegacyMarket || wasAlreadyApproved) {
        errorRedirect(detailPath, openTaskResult.reason || "Nao existe tarefa aberta para seu setor nesta oportunidade.");
      }
      approvalStageKey = "market_review";
    }

    const canApprove = await adminCanApproveWorkflowStage(admin, approvalStageKey);
    if (!canApprove) {
      errorRedirect(detailPath, "Seu usuario nao pode aprovar a etapa atual desta oportunidade.");
    }

    if (publicationMode && approvalStageKey !== "market_review") {
      errorRedirect(detailPath, "Envio WhatsApp so pode ser solicitado na aprovacao da analise de mercado.");
    }
  }

  const result = await savePropertyMarketAnalysisRecord(payload);

  if (!result.data) {
    errorRedirect(detailPath, result.reason || "Nao foi possivel salvar a analise de mercado.");
  }

  if (approvalStatus) {
    const workflowDecision = payload.status === "approved_with_notes" ? "approved_with_notes" : "approved";
    const workflowNotes = payload.cautionNotes || payload.decisionReason;

    if (approvalStageKey === "market_review") {
      const workflowResult = await advanceOpportunityAfterMarketApprovalRecord({
        opportunityCode: currentCode,
        decision: workflowDecision,
        approvedByAdminUserId: admin.id,
        approvedByName: admin.name,
        notes: workflowNotes,
      });

      if (!workflowResult.ok) {
        errorRedirect(
          detailPath,
          workflowResult.error || "Analise aprovada, mas nao foi possivel liberar a oportunidade para divulgacao."
        );
      }

      if (publicationMode) {
        const destinationId =
          publicationMode === "default_group"
            ? field(formData, "whatsappDefaultGroupId")
            : publicationMode === "specific_group"
              ? field(formData, "whatsappSpecificGroupId")
              : publicationMode === "channel"
                ? field(formData, "whatsappChannelId")
                : "";

        const publicationResult = await scheduleOpportunityWhatsAppPublication({
          opportunityCode: currentCode,
          mode: publicationMode,
          agentKey: field(formData, "whatsappAgentKey"),
          destinationId,
          broadcastSourceDestinationId: field(formData, "whatsappBroadcastSourceGroupId"),
          broadcastTargets: parseBroadcastTargets(field(formData, "whatsappBroadcastNumbers")),
          approvedByAdminUserId: admin.id,
          approvedByName: admin.name,
        });

        if (!publicationResult.ok || !publicationResult.data) {
          errorRedirect(
            detailPath,
            publicationResult.error || "Analise aprovada, mas nao foi possivel agendar a publicacao WhatsApp."
          );
        }

        publicationStatusParam = publicationResult.data.skipped ? "whatsapp-ja-agendado" : "whatsapp-agendado";
        publicationCampaignId = publicationResult.data.campaignId;
      }
    } else if (approvalStageKey === "legal_review") {
      const workflowResult = await advanceOpportunityAfterLegalApprovalRecord({
        opportunityCode: currentCode,
        decision: workflowDecision,
        approvedByAdminUserId: admin.id,
        approvedByName: admin.name,
        notes: workflowNotes,
      });

      if (!workflowResult.ok) {
        errorRedirect(
          detailPath,
          workflowResult.error || "Juridico aprovado, mas nao foi possivel enviar a oportunidade para Validacao."
        );
      }
    } else if (workflowApprovalStages.includes(approvalStageKey as (typeof workflowApprovalStages)[number])) {
      const workflowResult = await advanceOpportunityAfterWorkflowStageApprovalRecord({
        opportunityCode: currentCode,
        stageKey: approvalStageKey as (typeof workflowApprovalStages)[number],
        decision: workflowDecision,
        approvedByAdminUserId: admin.id,
        approvedByName: admin.name,
        notes: workflowNotes,
      });

      if (!workflowResult.ok) {
        errorRedirect(
          detailPath,
          workflowResult.error || "Etapa aprovada, mas nao foi possivel enviar a oportunidade para o proximo setor."
        );
      }
    } else {
      errorRedirect(detailPath, "Etapa atual nao reconhecida para avancar o workflow.");
    }
  }

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/meta-whatsapp");
  revalidatePath("/admin/whatsapp");
  revalidatePath(detailPath);
  if (currentCode) revalidatePath(`/oportunidades/${currentCode}`);

  const params = new URLSearchParams({
    market: approvalStatus ? publicationStatusParam || workflowApprovalParam(approvalStageKey) : "salva",
  });
  if (publicationCampaignId) params.set("campaign", publicationCampaignId);

  redirect(`${detailPath}?${params.toString()}`);
}

export async function savePropertyQualificationFeedbackAction(formData: FormData) {
  const admin = await requireCurrentAdmin();
  const currentCode = normalizeCode(field(formData, "qualificationOpportunityCode") || field(formData, "opportunityCode"));
  const detailPath = currentCode ? `/admin/oportunidades/${currentCode}` : "/admin/oportunidades";

  const result = await savePropertyQualificationFeedbackRecord({
    dossierId: field(formData, "qualificationDossierId"),
    opportunityId: field(formData, "qualificationOpportunityId"),
    adminUserId: admin.id,
    reviewerName: admin.name,
    decision: field(formData, "qualificationDecision", "confirmado"),
    fieldKey: field(formData, "qualificationFieldKey", "geral"),
    notes: field(formData, "qualificationNotes"),
    rawPayload: {
      source: "opportunity_detail",
      opportunityCode: currentCode,
      recordedAt: new Date().toISOString(),
    },
  });

  if (!result.ok) {
    errorRedirect(detailPath, result.error || "Nao foi possivel registrar o feedback do dossie.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath(detailPath);

  redirect(`${detailPath}?tab=revisao&qualification=feedback`);
}
