import { inngest } from "../client";
import { reviewWhatsAppConversations } from "@/lib/whatsapp/quality-reviewer";

export const whatsappQualityFunction = inngest.createFunction(
  {
    id: "whatsapp-quality-review",
    name: "WhatsApp - Auditoria IA",
    triggers: [{ cron: "17 * * * *" }],
  },
  async () => {
    const result = await reviewWhatsAppConversations({
      dryRun: false,
      limit: 12,
      autoHandoff: false,
    });

    return {
      ok: result.ok,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
);
