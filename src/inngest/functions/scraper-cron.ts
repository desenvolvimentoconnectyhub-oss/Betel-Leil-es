import { inngest } from "../client";

export const scraperCronFunction = inngest.createFunction(
  {
    id: "scraper-cron",
    name: "Scraper legado congelado",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => ({
    ok: true,
    skipped: true,
    paused: true,
    reason: "Scraper antigo por fontes congelado. A nova fase processa apenas lotes de links iniciados manualmente.",
    timestamp: new Date().toISOString(),
  })
);
