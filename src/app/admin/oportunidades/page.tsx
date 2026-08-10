import { OpportunityWorkspacePage } from "@/components/admin/OpportunityWorkspacePage";
import { getAdminModule } from "@/lib/admin/modules";
import { listAuctionOpportunitiesForAdmin, listOpportunityValidationPipelines, listSourceSnapshots } from "@/lib/admin/repository";
import { requireCurrentAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpportunitiesPage() {
  const adminModule = getAdminModule("oportunidades")!;
  const admin = await requireCurrentAdmin();
  const [opportunities, snapshots] = await Promise.all([
    listAuctionOpportunitiesForAdmin(admin, 100),
    listSourceSnapshots({ limit: 100 }),
  ]);
  const validations = await listOpportunityValidationPipelines(150);
  const visibleOpportunityCodes = new Set(opportunities.data.map((opportunity) => opportunity.id));
  const visibleSnapshots = snapshots.data.filter((snapshot) => visibleOpportunityCodes.has(snapshot.opportunityCode));
  const visibleValidations = validations.data.filter((validation) => visibleOpportunityCodes.has(validation.opportunityCode));

  return (
    <OpportunityWorkspacePage
      module={adminModule}
      opportunities={opportunities.data}
      snapshots={visibleSnapshots}
      validations={visibleValidations}
      source={opportunities.source}
      reason={opportunities.reason || snapshots.reason || validations.reason}
    />
  );
}
