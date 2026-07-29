import { MetaWhatsAppTemplatesClient } from "@/components/admin/MetaWhatsAppTemplatesClient";
import { getMetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function MetaTemplatesPage() {
  const data = await getMetaWhatsAppDashboardData();
  return <MetaWhatsAppTemplatesClient initialData={data} />;
}
