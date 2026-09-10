import { inngest } from "../client";
import { reconcileWhatsAppConversationHistoryFromConnectyHub } from "@/lib/whatsapp/conversation-history-sync";

export const whatsappConversationHistorySyncFunction = inngest.createFunction(
  {
    id: "whatsapp-conversation-history-sync",
    name: "WhatsApp - Auditoria do historico",
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async () => {
    const result = await reconcileWhatsAppConversationHistoryFromConnectyHub({
      limit: 50,
      intervalMs: 14 * 60_000,
    });

    return {
      ok: result.ok,
      result,
      timestamp: new Date().toISOString(),
    };
  }
);
