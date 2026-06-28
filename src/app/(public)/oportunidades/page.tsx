import { getPublicOpportunities } from "@/lib/subscribers";
import { OpportunitiesListPage } from "@/components/public/OpportunitiesListPage";
import type { SubscriberPlan } from "@/lib/subscribers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Oportunidades de Leilao | Betel Leiloes",
  description: "Oportunidades de imoveis em leilao com desconto, score de risco e analise IA.",
};

function normalizePlan(value: string | string[] | undefined): SubscriberPlan {
  if (value === "investor" || value === "professional" || value === "office") return value;
  return "explorer";
}

export default async function OpportunitiesRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const data = await getPublicOpportunities(normalizePlan(params.plan));
  return <OpportunitiesListPage data={data} />;
}
