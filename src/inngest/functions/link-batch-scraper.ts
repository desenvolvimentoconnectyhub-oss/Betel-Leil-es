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
      whatsappAgentKey?: string;
      whatsappInstanceId?: string;
      notificationRecipientId?: string;
    };

    const result = await step.run("process-link-batch", () =>
      startLinkScraperBatch({
        batchId: String(data.batchId || ""),
        whatsappAgentKey: String(data.whatsappAgentKey || ""),
        whatsappInstanceId: String(data.whatsappInstanceId || ""),
        notificationRecipientId: String(data.notificationRecipientId || ""),
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
