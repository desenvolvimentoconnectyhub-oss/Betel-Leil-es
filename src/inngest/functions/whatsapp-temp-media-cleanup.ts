import { inngest } from "../client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { cleanupExpiredWhatsAppLeadMedia } from "@/lib/whatsapp/temp-media-cleanup";
import { reconcileWhatsAppInstanceLifecycle } from "@/lib/communication/connectyhub-client";

export const whatsappTempMediaCleanupFunction = inngest.createFunction(
  {
    id: "whatsapp-temp-media-cleanup",
    name: "WhatsApp - Limpeza de Midia Temporaria",
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }) => {
    await step.run("prune-betel-journey", async () => {
      const db = getSupabaseAdminClient();
      if (!db) throw new Error("Betel journey database unavailable");
      const result = await db.rpc("prune_betel_journey");
      if (result.error) throw new Error("Betel journey retention failed");
    });
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
