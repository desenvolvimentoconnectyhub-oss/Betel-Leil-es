import { inngest } from "../client";
import { processWhatsAppCommunityCampaigns } from "@/lib/whatsapp/group-campaigns";

export const whatsappGroupCampaignsFunction = inngest.createFunction(
  {
    id: "whatsapp-group-campaigns",
    name: "WhatsApp - Campanhas em Grupos e Canais",
    triggers: [{ event: "whatsapp-group/campaign.process" }, { cron: "*/5 * * * *" }],
  },
  async ({ event, step }) => {
    const eventData = (event.data || {}) as Record<string, unknown>;
    const campaignId = event.name === "whatsapp-group/campaign.process" ? String(eventData.campaignId || "").trim() : "";
    const requestedLimit = Number(eventData.limit || 0);
    const limit = campaignId ? 1 : Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : 10;

    const processed = await step.run("process-whatsapp-group-campaigns", () =>
      processWhatsAppCommunityCampaigns({
        dryRun: false,
        limit,
        campaignId,
      })
    );

    return {
      ok: processed.ok,
      trigger: campaignId ? "event" : "cron",
      campaignId,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
