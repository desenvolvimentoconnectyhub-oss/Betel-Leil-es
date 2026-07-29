import { MetaWhatsAppCampaignsClient } from "@/components/admin/MetaWhatsAppCampaignsClient";
import { getMetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MetaWhatsAppCampaignsPage() {
  const data = await getMetaWhatsAppDashboardData();
  return <MetaWhatsAppCampaignsClient initialData={data} />;
}
