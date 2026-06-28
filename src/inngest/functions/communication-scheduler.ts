import { inngest } from "../client";
import { runCommunicationSchedulerRecord } from "@/lib/admin/repository";

export const communicationSchedulerFunction = inngest.createFunction(
  {
    id: "communication-scheduler",
    name: "Willian - Comunicacao Agendada",
    triggers: [{ cron: "0 11 * * *" }],
  },
  async () => {
    const result = await runCommunicationSchedulerRecord({
      dryRun: false,
      batchSize: 5,
      adapterMode: "mock",
      provider: "sandbox",
      operatorLabel: "Inngest Cron Betel",
      allowExternal: false,
      providerReleaseConfirmed: false,
      forceFail: false,
      maxAttempts: 3,
      triggerSource: "inngest-cron",
    });

    return {
      ok: result.ok,
      data: result.data,
      error: result.error,
      timestamp: new Date().toISOString(),
    };
  }
);
