import { WhatsAppCrmPage } from "@/components/admin/WhatsAppCrmPage";
import { getWhatsAppCrmData } from "@/lib/admin/repository";
import { WILLIAN_AGENT_KEY, WILLIAN_DEFAULT_INSTANCE_NAME } from "@/lib/communication/connectyhub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function loadWhatsAppCrmData() {
  try {
    return await getWhatsAppCrmData();
  } catch (error) {
    return {
      data: {
        generatedAt: new Date().toISOString(),
        metrics: [
          { label: "Conversas abertas", value: "0", detail: "fallback seguro", tone: "cyan" as const },
          { label: "Handoff humano", value: "0", detail: "fallback seguro", tone: "yellow" as const },
          { label: "Leads quentes", value: "0", detail: "fallback seguro", tone: "green" as const },
          { label: "Sem resposta", value: "0", detail: "fallback seguro", tone: "red" as const },
          { label: "SLA vencido", value: "0", detail: "fallback seguro", tone: "purple" as const },
          { label: "Qualidade IA", value: "-", detail: "fallback seguro", tone: "muted" as const },
        ],
        agents: [
          {
            agentKey: WILLIAN_AGENT_KEY,
            name: "Agente de WhatsApp",
            status: "planned",
            phone: "",
            instanceName: WILLIAN_DEFAULT_INSTANCE_NAME,
            connected: false,
            conversations: 0,
            openConversations: 0,
            handoffs: 0,
            averageScore: 0,
          },
        ],
        leads: [],
        followUps: [],
        reviews: [],
      },
      source: "mock" as const,
      reason: `Falha ao carregar CRM WhatsApp: ${errorMessage(error, "erro inesperado")}`,
    };
  }
}

export default async function WhatsAppAdminPage() {
  const crmData = await loadWhatsAppCrmData();

  return <WhatsAppCrmPage crmData={crmData} />;
}
