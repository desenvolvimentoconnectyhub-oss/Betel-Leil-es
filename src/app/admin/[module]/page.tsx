import { notFound } from "next/navigation";
import { AgentOfficePage } from "@/components/admin/AgentOfficePage";
import AdminModulePage from "@/components/admin/AdminModulePage";
import { TrafficAiModulePage } from "@/components/admin/TrafficAiModulePage";
import { getAdminModule, getAdminStaticSlugs } from "@/lib/admin/modules";
import { getAgentOfficeData, getRuntimeAdminResource } from "@/lib/admin/repository";
import { getTrafficAiDashboardData, isTrafficAiModule } from "@/lib/traffic-ai/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateStaticParams() {
  return getAdminStaticSlugs().map((module) => ({ module }));
}

export default async function AdminDynamicModule({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { module: slug } = await params;
  const section = getAdminModule(slug);

  if (!section) notFound();

  if (section.slug === "agentes-ia") {
    const [officeData, paramsValue] = await Promise.all([
      getAgentOfficeData(),
      searchParams ? searchParams : Promise.resolve({}),
    ]);

    return <AgentOfficePage module={section} officeData={officeData} searchParams={paramsValue} />;
  }

  if (isTrafficAiModule(section.slug)) {
    const data = await getTrafficAiDashboardData(section.slug);
    return <TrafficAiModulePage module={section} data={data} />;
  }

  const resource = await getRuntimeAdminResource(section.slug);

  return <AdminModulePage module={section} resource={resource.data} />;
}
