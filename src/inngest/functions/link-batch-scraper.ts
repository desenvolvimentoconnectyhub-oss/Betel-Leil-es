import { inngest } from "../client";
import { startLinkScraperBatch } from "@/lib/scraper/link-batch-repository";

export const linkBatchScraperFunction = inngest.createFunction(
  {
    id: "link-batch-scraper",
    name: "Scraper - Lote de links importados",
    triggers: [{ event: "scraper/link_batch.requested" }],
  },
  async ({ event, step }) => {
    const data = event.data as {
      batchId?: string;
      analysisDepth?: string;
    };

    const result = await step.run("process-link-batch", () =>
      startLinkScraperBatch({
        batchId: String(data.batchId || ""),
        analysisDepth: String(data.analysisDepth || "deep"),
      })
    );

    return {
      ok: result.ok,
      batchId: data.batchId || "",
      result,
      timestamp: new Date().toISOString(),
    };
  }
);
