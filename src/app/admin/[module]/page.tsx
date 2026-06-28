import { notFound } from "next/navigation";
import { AgentOfficePage } from "@/components/admin/AgentOfficePage";
import AdminModulePage from "@/components/admin/AdminModulePage";
import { getAdminModule, getAdminStaticSlugs } from "@/lib/admin/modules";
import { getAgentOfficeData, getRuntimeAdminResource } from "@/lib/admin/repository";

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

  const resource = await getRuntimeAdminResource(section.slug);

  return <AdminModulePage module={section} resource={resource.data} />;
}
