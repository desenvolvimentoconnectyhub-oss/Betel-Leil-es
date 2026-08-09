import { inngest } from "../client";

export const scraperCronFunction = inngest.createFunction(
  {
    id: "scraper-cron",
    name: "Scraper por fontes congelado",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => ({
    ok: true,
    skipped: true,
    paused: true,
    reason: "Scraper por fontes congelado. A analise de mercado processa apenas lotes de links importados.",
    timestamp: new Date().toISOString(),
  })
);
