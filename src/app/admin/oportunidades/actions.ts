"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAuctionOpportunityRecord,
  ingestAuctionOpportunityRecord,
  refreshOpportunityValidationPipelinesRecord,
  updateAuctionOpportunityRecord,
  type CreateAuctionOpportunityInput,
  type SourceIntakeInput,
} from "@/lib/admin/repository";
import { backfillOpportunityImages } from "@/lib/scraper";

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
