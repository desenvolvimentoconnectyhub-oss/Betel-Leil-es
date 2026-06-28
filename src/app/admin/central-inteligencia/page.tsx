import { getAdminModule } from "@/lib/admin/modules";
import { getIntelligenceCenterData } from "@/lib/admin/repository";
import { IntelligenceCenterPage } from "@/components/admin/IntelligenceCenterPage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function CentralInteligenciaRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const section = getAdminModule("central-inteligencia")!;
  const params = searchParams ? await searchParams : {};

  const agentKey = typeof params.agentKey === "string" ? params.agentKey : undefined;
  const reportType = typeof params.reportType === "string" ? params.reportType : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const tag = typeof params.tag === "string" ? params.tag : undefined;

  const data = await getIntelligenceCenterData({ agentKey, reportType, status, tag });

  return <IntelligenceCenterPage module={section} data={data} searchParams={params} />;
}
