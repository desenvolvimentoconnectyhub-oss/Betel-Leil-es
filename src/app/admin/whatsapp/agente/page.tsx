import { WillianAgentPanel } from "@/components/admin/WillianAgentPanel";
import { getWillianInstanceState } from "@/lib/communication/connectyhub-client";
import { getWillianAgentConfig } from "@/lib/communication/willian-agent-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WhatsAppAgentSettingsPage() {
  const [initialState, initialConfig] = await Promise.all([
    getWillianInstanceState({ checkRemote: false }).catch(() => undefined),
    getWillianAgentConfig().catch(() => undefined),
  ]);

  return <WillianAgentPanel initialState={initialState} initialConfig={initialConfig} />;
}
