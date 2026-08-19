import { notFound } from "next/navigation";
import { OpportunityDetailCenter } from "@/components/admin/opportunity-detail/OpportunityDetailCenter";
import {
  getAuctionOpportunityByCode,
  getPropertyMarketAnalysisByOpportunityCode,
  getPropertyQualificationDossierByOpportunityCode,
} from "@/lib/admin/repository";
import { getOpportunityWhatsAppPublicationOptions } from "@/lib/whatsapp/opportunity-publication";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type QueryValue = string | string[] | undefined;

function firstQueryValue(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, QueryValue>>;
}) {
  const emptyQuery: Record<string, QueryValue> = {};
  const [{ id }, query] = await Promise.all([
    params,
    searchParams || Promise.resolve(emptyQuery),
  ]);

  const [opportunityResult, marketAnalysisResult, whatsappPublicationOptions] = await Promise.all([
    getAuctionOpportunityByCode(id),
    getPropertyMarketAnalysisByOpportunityCode(id),
    getOpportunityWhatsAppPublicationOptions(),
  ]);

  const opportunity = opportunityResult.data;
  if (!opportunity) notFound();

  const qualificationResult = await getPropertyQualificationDossierByOpportunityCode(opportunity.id);

  return (
    <OpportunityDetailCenter
      opportunity={opportunity}
      analysis={marketAnalysisResult.data}
      reason={marketAnalysisResult.reason}
      qualificationDossier={qualificationResult.data}
      qualificationReason={qualificationResult.reason}
      activeTab={firstQueryValue(query.tab)}
      actionMessage={firstQueryValue(query.message)}
      actionStatus={firstQueryValue(query.status)}
      marketStatus={firstQueryValue(query.market)}
      marketFilter={firstQueryValue(query.marketFilter)}
      marketSort={firstQueryValue(query.marketSort)}
      selectedPhoto={firstQueryValue(query.photo)}
      syncedGroups={firstQueryValue(query.sincronizados)}
      remoteGroups={firstQueryValue(query.grupos)}
      publicationCampaign={firstQueryValue(query.campaign)}
      whatsappPublicationOptions={whatsappPublicationOptions}
    />
  );
}
