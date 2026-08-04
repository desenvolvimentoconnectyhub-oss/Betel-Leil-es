import { inngest } from "../client";
import { cleanupExpiredWhatsAppLeadMedia } from "@/lib/whatsapp/temp-media-cleanup";

export const whatsappTempMediaCleanupFunction = inngest.createFunction(
  {
    id: "whatsapp-temp-media-cleanup",
    name: "WhatsApp - Limpeza de Midia Temporaria",
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async () => {
    const result = await cleanupExpiredWhatsAppLeadMedia({
      dryRun: false,
      limit: 100,
    });

    return {
      ok: result.ok,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
);
