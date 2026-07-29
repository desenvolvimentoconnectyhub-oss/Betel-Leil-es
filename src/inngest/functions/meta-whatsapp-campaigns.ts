import { inngest } from "../client";
import { getMetaWhatsAppCampaignSchedule, processMetaWhatsAppCampaign } from "@/lib/meta-whatsapp/official";

export const metaWhatsAppCampaignsFunction = inngest.createFunction(
  {
    id: "meta-whatsapp-campaigns",
    name: "Meta WhatsApp - Campanhas Oficiais",
    triggers: [{ event: "meta-whatsapp/campaign.process" }],
  },
  async ({ event, step }) => {
    const campaignId = String(event.data?.campaignId || "");
    const schedule = await step.run("load-campaign-schedule", () => getMetaWhatsAppCampaignSchedule(campaignId));

    if (schedule.scheduledFor) {
      const scheduledAt = new Date(schedule.scheduledFor);
      if (scheduledAt.getTime() > Date.now()) {
        await step.sleepUntil("wait-for-scheduled-time", scheduledAt);
      }
    }

    const processed = await step.run("send-campaign-batch", () =>
      processMetaWhatsAppCampaign({
        campaignId,
        limit: Number(event.data?.limit || 60),
      })
    );

    if (processed.ok && processed.remaining > 0) {
      await step.sleep("wait-rate-limit-window", "60s");
      await step.sendEvent("continue-campaign", {
        name: "meta-whatsapp/campaign.process",
        data: { campaignId, limit: Number(event.data?.limit || 60) },
      });
    }

    return {
      ok: processed.ok,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
