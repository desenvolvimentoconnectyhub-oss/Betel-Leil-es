import { getAdminModule } from "@/lib/admin/modules";
import { getScraperDashboardData } from "@/lib/scraper";
import { ScraperDashboardPage } from "@/components/admin/ScraperDashboardPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ScraperRoute() {
  const section = getAdminModule("scraper")!;
  const data = await getScraperDashboardData();

  return <ScraperDashboardPage module={section} data={data} />;
}
