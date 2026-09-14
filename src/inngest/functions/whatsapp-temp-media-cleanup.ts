import { inngest } from "../client";
import { cleanupExpiredWhatsAppLeadMedia } from "@/lib/whatsapp/temp-media-cleanup";
import { reconcileWhatsAppInstanceLifecycle } from "@/lib/communication/connectyhub-client";

export const whatsappTempMediaCleanupFunction = inngest.createFunction(
  {
    id: "whatsapp-temp-media-cleanup",
    name: "WhatsApp - Limpeza de Midia Temporaria",
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    const instances = await step.run("reconcile-instance-lifecycle", () => reconcileWhatsAppInstanceLifecycle({ scheduled: true }));
    const result = await step.run("cleanup-expired-media", () => cleanupExpiredWhatsAppLeadMedia({
      dryRun: false,
      limit: 100,
    }));

    return {
      ok: result.ok,
      data: result,
      instances,
      timestamp: new Date().toISOString(),
    };
  }
);
