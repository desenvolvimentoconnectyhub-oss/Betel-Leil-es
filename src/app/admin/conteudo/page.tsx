import { getAdminModule } from "@/lib/admin/modules";
import { getIntelligenceCenterData } from "@/lib/admin/repository";
import { ContentManagementPage } from "@/components/admin/ContentManagementPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ConteudoRoute() {
  const section = getAdminModule("conteudo")!;
  const data = await getIntelligenceCenterData();

  return <ContentManagementPage module={section} data={data} />;
}
