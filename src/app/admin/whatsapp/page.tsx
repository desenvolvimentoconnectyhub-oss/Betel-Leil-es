import { WhatsAppCrmPage } from "@/components/admin/WhatsAppCrmPage";
import { getWhatsAppCrmData } from "@/lib/admin/repository";
import { getWillianInstanceState } from "@/lib/communication/connectyhub-client";
import { getWillianAgentConfig } from "@/lib/communication/willian-agent-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function WhatsAppAdminPage() {
  const [crmData, willianInstance, willianAgentConfig] = await Promise.all([
    getWhatsAppCrmData(),
    getWillianInstanceState({ checkRemote: false }),
    getWillianAgentConfig(),
  ]);

  return (
    <WhatsAppCrmPage
      crmData={crmData}
      willianAgentConfig={willianAgentConfig}
      willianInstance={willianInstance}
    />
  );
}
