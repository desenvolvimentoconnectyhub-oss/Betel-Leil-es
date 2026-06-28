import { notFound } from "next/navigation";
import { AgentProfilePage } from "@/components/admin/AgentProfilePage";
import { getAgentByKey } from "@/lib/admin/repository";
import { agentGroups } from "@/lib/admin/agent-workforce";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allAgentKeys = agentGroups.flatMap((g) => g.agents.map((a) => a.key));

export function generateStaticParams() {
  return allAgentKeys.map((agentKey) => ({ agentKey }));
}

export default async function AgentProfileRoute({
  params,
}: {
  params: Promise<{ agentKey: string }>;
}) {
  const { agentKey } = await params;

  if (!agentKey || agentKey.length > 80) notFound();

  const profileData = await getAgentByKey(agentKey);

  if (!profileData.data.name && !profileData.data.key) notFound();

  return <AgentProfilePage profile={profileData} />;
}
