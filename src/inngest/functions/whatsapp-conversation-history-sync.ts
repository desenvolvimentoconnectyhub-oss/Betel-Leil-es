import { inngest } from "../client";
import { reconcileWhatsAppConversationHistoryFromConnectyHub } from "@/lib/whatsapp/conversation-history-sync";

export const whatsappConversationHistorySyncFunction = inngest.createFunction(
  {
    id: "whatsapp-conversation-history-sync",
    name: "WhatsApp - Auditoria do historico",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => {
    const result = await reconcileWhatsAppConversationHistoryFromConnectyHub({
      limit: 300,
      intervalMs: 45_000,
    });

    return {
      ok: result.ok,
      result,
      timestamp: new Date().toISOString(),
    };
  }
);
