import { inngest } from "../client";
import { syncTrafficAi } from "@/lib/traffic-ai/sync";

export const trafficAiSyncFunction = inngest.createFunction(
  {
    id: "traffic-ai-sync",
    name: "Trafego IA - Sincronizacao de contas e snapshots",
    triggers: [
      { event: "traffic-ai/sync.requested" },
      { cron: "0 * * * *" },
    ],
  },
  async ({ event, step }) => {
    const data = event.name === "traffic-ai/sync.requested" ? event.data as { scope?: string } : {};
    const scope = String(data.scope || "all");
    const source = event.name === "traffic-ai/sync.requested" ? "manual" : "inngest_cron";

    const result = await step.run("sync-traffic-ai", () =>
      syncTrafficAi({
        scope,
        source,
      })
    );

    return {
      ok: result.ok,
      scope,
      result,
      timestamp: new Date().toISOString(),
    };
  }
);
