import { notFound, redirect } from "next/navigation";
import { AgentProfilePage } from "@/components/admin/AgentProfilePage";
import { getAgentByKey } from "@/lib/admin/repository";
import { agentGroups, whatsappAgentKeys } from "@/lib/admin/agent-workforce";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allAgentKeys = agentGroups.flatMap((g) => g.agents.map((a) => a.key));

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function hasObjectValues(value: unknown) {
  return Object.keys(asRecord(value)).length > 0;
}

async function isWhatsAppAgentRoute(agentKey: string) {
  if (whatsappAgentKeys.has(agentKey)) return true;

  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const { data } = await supabase
    .from("ai_agents")
    .select("agent_kind,metadata,whatsapp_behavior_config")
    .eq("agent_key", agentKey)
    .maybeSingle();
  const row = asRecord(data);
  const metadata = asRecord(row.metadata);
  const kind = cleanString(row.agent_kind, cleanString(metadata.agent_kind, cleanString(metadata.agentKind))).toLowerCase();
  const channel = cleanString(metadata.channel, cleanString(metadata.channelFamily)).toLowerCase();
  const provider = cleanString(metadata.provider).toLowerCase();

  return (
    kind === "whatsapp" ||
    channel === "whatsapp" ||
    provider.includes("connectyhub") ||
    hasObjectValues(row.whatsapp_behavior_config) ||
    hasObjectValues(metadata.whatsapp_agent_config) ||
    hasObjectValues(metadata.whatsappAgentConfig)
  );
}

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
  if (await isWhatsAppAgentRoute(agentKey)) redirect("/admin/whatsapp/agente");

  const profileData = await getAgentByKey(agentKey);

  if (!profileData.data.name && !profileData.data.key) notFound();

  return <AgentProfilePage profile={profileData} />;
}
