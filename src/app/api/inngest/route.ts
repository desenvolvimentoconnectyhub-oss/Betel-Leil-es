import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scraperCronFunction } from "@/inngest/functions/scraper-cron";
import { communicationSchedulerFunction } from "@/inngest/functions/communication-scheduler";
import { whatsappFollowUpsFunction } from "@/inngest/functions/whatsapp-followups";
import { whatsappQualityFunction } from "@/inngest/functions/whatsapp-quality";
import { whatsappGroupCampaignsFunction } from "@/inngest/functions/whatsapp-group-campaigns";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scraperCronFunction,
    communicationSchedulerFunction,
    whatsappFollowUpsFunction,
    whatsappGroupCampaignsFunction,
    whatsappQualityFunction,
  ],
});
