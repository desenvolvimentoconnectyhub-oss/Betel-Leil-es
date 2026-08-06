import { getAdminModule } from "@/lib/admin/modules";
import { getLinkScraperDashboardData } from "@/lib/scraper";
import { LinkScraperDashboardPage } from "@/components/admin/LinkScraperDashboardPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ScraperRoute() {
  const section = getAdminModule("scraper")!;
  const data = await getLinkScraperDashboardData();

  return <LinkScraperDashboardPage module={section} data={data} />;
}
