import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { scraperCronFunction } from "@/inngest/functions/scraper-cron";
import { communicationSchedulerFunction } from "@/inngest/functions/communication-scheduler";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scraperCronFunction, communicationSchedulerFunction],
});
