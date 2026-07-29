import { inngest } from "../client";
import { processWhatsAppCommunityCampaigns } from "@/lib/whatsapp/group-campaigns";

export const whatsappGroupCampaignsFunction = inngest.createFunction(
  {
    id: "whatsapp-group-campaigns",
    name: "WhatsApp - Campanhas em Grupos e Canais",
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async () => {
    const processed = await processWhatsAppCommunityCampaigns({
      dryRun: false,
      limit: 10,
    });

    return {
      ok: processed.ok,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
