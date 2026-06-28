import { OpportunityWorkspacePage } from "@/components/admin/OpportunityWorkspacePage";
import { getAdminModule } from "@/lib/admin/modules";
import { listAuctionOpportunities, listSourceSnapshots } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpportunitiesPage() {
  const adminModule = getAdminModule("oportunidades")!;
  const [opportunities, snapshots] = await Promise.all([
    listAuctionOpportunities(100),
    listSourceSnapshots({ limit: 100 }),
  ]);

  return (
    <OpportunityWorkspacePage
      module={adminModule}
      opportunities={opportunities.data}
      snapshots={snapshots.data}
      source={opportunities.source}
      reason={opportunities.reason || snapshots.reason}
    />
  );
}
