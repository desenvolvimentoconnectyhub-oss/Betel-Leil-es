import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { ingestAuctionOpportunityRecord, type SourceIntakeInput } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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

function makeFallbackCode(city: string, title: string, externalId: string) {
  const cityPrefix = normalizeCode(city).slice(0, 3) || "OPP";
  const titlePrefix = normalizeCode(title).slice(0, 3) || "SRC";
  const externalPrefix = normalizeCode(externalId).slice(-5) || Date.now().toString(36).slice(-5).toUpperCase();
  return `${cityPrefix}-${titlePrefix}-${externalPrefix}`;
}

function parsePayload(body: Record<string, unknown>): SourceIntakeInput {
  const title = asString(body.title);
  const city = asString(body.city);
  const state = asString(body.state).toUpperCase();
  const externalId = asString(body.externalId);
  const initialBid = asNumber(body.initialBid);
  const appraisalValue = asNumber(body.appraisalValue);
  const discountPct =
    appraisalValue > 0 && initialBid > 0
      ? Math.max(0, Math.round(((appraisalValue - initialBid) / appraisalValue) * 100))
      : asNumber(body.discountPct);

  return {
    code: normalizeCode(asString(body.code)) || makeFallbackCode(city, title, externalId),
    title,
    propertyType: asString(body.propertyType, "Imovel"),
    address: asString(body.address),
    city,
    state,
    sourceName: asString(body.sourceName, "Fonte externa"),
    sourceType: asString(body.sourceType, "API"),
    initialBid,
    appraisalValue,
    discountPct,
    opportunityScore: clampScore(asNumber(body.opportunityScore, 50)),
    riskScore: clampScore(asNumber(body.riskScore, 50)),
    complianceScore: clampScore(asNumber(body.complianceScore, 65)),
    aiStatus: asString(body.aiStatus, "Fila IA"),
    legalStatus: asString(body.legalStatus, "Pendente"),
    stage: asString(body.stage, "Entrada"),
    nextAction: asString(body.nextAction, "Curadoria IA deve extrair edital e reconciliar fonte."),
    owner: asString(body.owner, "Agente Buscador de Imoveis"),
    auctionDate: asString(body.auctionDate),
    occupancy: asString(body.occupancy, "Nao informado"),
    summary: asString(
      body.summary,
      "Oportunidade capturada por fonte externa para triagem, curadoria e revisao humana."
    ),
    sourceUrl: asString(body.sourceUrl),
    externalId,
    collectionMode: asString(body.collectionMode, "api_intake"),
    evidenceNotes: asString(body.evidenceNotes),
    rawPayload:
      body.rawPayload && typeof body.rawPayload === "object" && !Array.isArray(body.rawPayload)
        ? (body.rawPayload as Record<string, unknown>)
        : body,
  };
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const payload = parsePayload(body);

  if (!payload.title || !payload.city || !payload.state) {
    return NextResponse.json(
      { success: false, error: "Campos obrigatorios: title, city e state." },
      { status: 400 }
    );
  }

  const result = await ingestAuctionOpportunityRecord(payload);

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/oportunidades");
  revalidatePath("/api/admin/oportunidades/ingest");
  revalidatePath(`/admin/oportunidades/${result.data?.code}`);

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
