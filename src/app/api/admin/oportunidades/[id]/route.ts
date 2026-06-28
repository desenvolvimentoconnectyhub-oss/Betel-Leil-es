import { NextResponse } from "next/server";
import {
  getAuctionOpportunityByCode,
  updateAuctionOpportunityRecord,
  type CreateAuctionOpportunityInput,
} from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const opportunity = await getAuctionOpportunityByCode(id);

  if (!opportunity.data) {
    return NextResponse.json(
      {
        success: false,
        source: opportunity.source,
        reason: opportunity.reason,
        message: "Oportunidade nao encontrada.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    source: opportunity.source,
    reason: opportunity.reason,
    data: opportunity.data,
  });
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const current = await getAuctionOpportunityByCode(id);

  if (!current.data) {
    return NextResponse.json(
      {
        success: false,
        source: current.source,
        reason: current.reason,
        message: "Oportunidade nao encontrada.",
      },
      { status: 404 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const payload: CreateAuctionOpportunityInput = {
    code: current.data.id,
    title: asString(body.title, current.data.title),
    propertyType: asString(body.propertyType, current.data.propertyType),
    address: asString(body.address, current.data.address),
    city: asString(body.city, current.data.city),
    state: asString(body.state, current.data.state),
    sourceName: asString(body.sourceName, current.data.sourceName),
    sourceType: asString(body.sourceType, current.data.sourceType),
    initialBid: asNumber(body.initialBid, current.data.initialBid),
    appraisalValue: asNumber(body.appraisalValue, current.data.appraisalValue),
    discountPct: asNumber(body.discountPct, current.data.discountPct),
    opportunityScore: asNumber(body.opportunityScore, current.data.opportunityScore),
    riskScore: asNumber(body.riskScore, current.data.riskScore),
    complianceScore: asNumber(body.complianceScore, current.data.complianceScore),
    aiStatus: asString(body.aiStatus, current.data.aiStatus),
    legalStatus: asString(body.legalStatus, current.data.legalStatus),
    stage: asString(body.stage, current.data.stage),
    nextAction: asString(body.nextAction, current.data.nextAction),
    owner: asString(body.owner, current.data.owner),
    auctionDate: asString(body.auctionDate, current.data.auctionDate),
    occupancy: asString(body.occupancy, current.data.occupancy),
    summary: asString(body.summary, current.data.summary),
  };

  const updated = await updateAuctionOpportunityRecord(current.data.id, payload);

  if (!updated.ok) {
    return NextResponse.json(
      {
        success: false,
        source: "supabase",
        message: updated.error || "Nao foi possivel atualizar a oportunidade.",
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    success: true,
    source: "supabase",
    data: updated.data,
  });
}
