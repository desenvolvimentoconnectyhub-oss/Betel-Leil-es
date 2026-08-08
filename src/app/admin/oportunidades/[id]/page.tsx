import { notFound } from "next/navigation";
import { OpportunityDetailCenter } from "@/components/admin/opportunity-detail/OpportunityDetailCenter";
import { getAuctionOpportunityByCode, getPropertyMarketAnalysisByOpportunityCode } from "@/lib/admin/repository";

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

  const [opportunityResult, marketAnalysisResult] = await Promise.all([
    getAuctionOpportunityByCode(id),
    getPropertyMarketAnalysisByOpportunityCode(id),
  ]);

  const opportunity = opportunityResult.data;
  if (!opportunity) notFound();

  return (
    <OpportunityDetailCenter
      opportunity={opportunity}
      analysis={marketAnalysisResult.data}
      reason={marketAnalysisResult.reason}
      activeTab={firstQueryValue(query.tab)}
      marketFilter={firstQueryValue(query.marketFilter)}
      marketSort={firstQueryValue(query.marketSort)}
    />
  );
}
