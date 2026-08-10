import { redirect } from "next/navigation";
import { adminCanUploadMarketAnalysisBatches } from "@/lib/admin/access";
import { getAdminModule } from "@/lib/admin/modules";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import { getLinkScraperDashboardData } from "@/lib/scraper";
import { LinkScraperDashboardPage } from "@/components/admin/LinkScraperDashboardPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ScraperRoute() {
  const admin = await requireCurrentAdmin();
  if (!adminCanUploadMarketAnalysisBatches(admin)) redirect("/admin/oportunidades");

  const section = getAdminModule("scraper")!;
  const data = await getLinkScraperDashboardData();

  return <LinkScraperDashboardPage module={section} data={data} />;
}
