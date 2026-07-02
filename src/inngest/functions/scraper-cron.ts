import { inngest } from "../client";
import { runScraperCron } from "@/lib/scraper";
import { getScraperScheduleConfig, getScraperScheduleDecision } from "@/lib/scraper/schedule";

export const scraperCronFunction = inngest.createFunction(
  {
    id: "scraper-cron",
    name: "Renata — Coleta Automatizada",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => {
    const schedule = await getScraperScheduleConfig();
    const decision = getScraperScheduleDecision(schedule);

    if (!decision.shouldRun) {
      return { ok: true, skipped: true, reason: decision.reason, clock: decision.clock };
    }

    const result = await runScraperCron();
    return { ok: true, ...result, clock: decision.clock, timestamp: new Date().toISOString() };
  }
);
