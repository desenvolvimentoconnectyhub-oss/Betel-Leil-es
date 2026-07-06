import { OpportunityWorkspacePage } from "@/components/admin/OpportunityWorkspacePage";
import { getAdminModule } from "@/lib/admin/modules";
import { listAuctionOpportunities, listOpportunityValidationPipelines, listSourceSnapshots } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpportunitiesPage() {
  const adminModule = getAdminModule("oportunidades")!;
  const [opportunities, snapshots] = await Promise.all([
    listAuctionOpportunities(100),
    listSourceSnapshots({ limit: 100 }),
  ]);
  const validations = await listOpportunityValidationPipelines(150);

  return (
    <OpportunityWorkspacePage
      module={adminModule}
      opportunities={opportunities.data}
      snapshots={snapshots.data}
      validations={validations.data}
      source={opportunities.source}
      reason={opportunities.reason || snapshots.reason || validations.reason}
    />
  );
}
