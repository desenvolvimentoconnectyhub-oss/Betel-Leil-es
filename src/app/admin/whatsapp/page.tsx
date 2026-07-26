import { WhatsAppCrmPage } from "@/components/admin/WhatsAppCrmPage";
import { getWhatsAppCrmData } from "@/lib/admin/repository";
import { getWillianInstanceState, WILLIAN_AGENT_KEY, WILLIAN_AGENT_NAME, WILLIAN_DEFAULT_INSTANCE_NAME } from "@/lib/communication/connectyhub-client";
import { getWillianAgentConfig } from "@/lib/communication/willian-agent-config";
import {
  DEFAULT_WILLIAN_AGENT_CONFIG,
  type WillianAgentConfig,
  type WillianInstanceState,
} from "@/lib/communication/willian-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fallbackWillianInstance: WillianInstanceState = {
  agentKey: WILLIAN_AGENT_KEY,
  agentName: WILLIAN_AGENT_NAME,
  baseUrl: "https://www.connectyhub.com.br/api/v1",
  baseUrlSource: "default",
  adminTokenConfigured: false,
  adminTokenSource: "missing",
  adminTokenPreview: "",
  adminTokenLooksValid: false,
  instanceName: WILLIAN_DEFAULT_INSTANCE_NAME,
  instanceTokenConfigured: false,
  instanceTokenPreview: "",
  webhookUrl: "",
  webhookConfiguredUrl: "",
  webhookSecretConfigured: false,
  whatsappProviderReleased: false,
  whatsappReady: false,
  emailProvider: "resend",
  emailTokenConfigured: false,
  emailFromConfigured: false,
  emailReady: false,
  missing: [
    "CONNECTYHUB_API_TOKEN",
    "CONNECTYHUB_WEBHOOK_URL",
    "CONNECTYHUB_WEBHOOK_SECRET",
    "BETEL_WHATSAPP_PROVIDER_RELEASED=true",
  ],
};

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

async function loadWillianInstanceState(): Promise<WillianInstanceState> {
  try {
    return await getWillianInstanceState({ checkRemote: false });
  } catch (error) {
    return {
      ...fallbackWillianInstance,
      lastError: `Falha ao carregar instancia WhatsApp: ${errorMessage(error, "erro inesperado")}`,
    };
  }
}

async function loadWillianAgentConfig(): Promise<WillianAgentConfig> {
  try {
    return await getWillianAgentConfig();
  } catch {
    return {
      ...DEFAULT_WILLIAN_AGENT_CONFIG,
      status: "needs_review",
      updatedAt: new Date().toISOString(),
    };
  }
}

export default async function WhatsAppAdminPage() {
  const [crmData, willianInstance, willianAgentConfig] = await Promise.all([
    loadWhatsAppCrmData(),
    loadWillianInstanceState(),
    loadWillianAgentConfig(),
  ]);

  return (
    <WhatsAppCrmPage
      crmData={crmData}
      willianAgentConfig={willianAgentConfig}
      willianInstance={willianInstance}
    />
  );
}
