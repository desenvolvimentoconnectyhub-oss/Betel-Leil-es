import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scraperCronFunction } from "@/inngest/functions/scraper-cron";
import { linkBatchScraperFunction } from "@/inngest/functions/link-batch-scraper";
import { communicationSchedulerFunction } from "@/inngest/functions/communication-scheduler";
import { whatsappFollowUpsFunction } from "@/inngest/functions/whatsapp-followups";
import { whatsappManualHandoffResumeFunction } from "@/inngest/functions/whatsapp-manual-handoff-resume";
import { whatsappQualityFunction } from "@/inngest/functions/whatsapp-quality";
import { whatsappGroupCampaignsFunction } from "@/inngest/functions/whatsapp-group-campaigns";
import { metaWhatsAppCampaignsFunction } from "@/inngest/functions/meta-whatsapp-campaigns";
import { trafficAiSyncFunction } from "@/inngest/functions/traffic-ai-sync";
import { whatsappTempMediaCleanupFunction } from "@/inngest/functions/whatsapp-temp-media-cleanup";
import { whatsappSdrAppointmentsFunction } from "@/inngest/functions/whatsapp-sdr-appointments";
import { whatsappConversationHistorySyncFunction } from "@/inngest/functions/whatsapp-conversation-history-sync";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    scraperCronFunction,
    linkBatchScraperFunction,
    communicationSchedulerFunction,
    whatsappFollowUpsFunction,
    whatsappManualHandoffResumeFunction,
    whatsappGroupCampaignsFunction,
    whatsappQualityFunction,
    metaWhatsAppCampaignsFunction,
    trafficAiSyncFunction,
    whatsappTempMediaCleanupFunction,
    whatsappSdrAppointmentsFunction,
    whatsappConversationHistorySyncFunction,
  ],
});
