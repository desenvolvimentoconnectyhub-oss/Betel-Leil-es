import { inngest } from "../client";
import { planWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-planner";
import { processWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-worker";

export const whatsappFollowUpsFunction = inngest.createFunction(
  {
    id: "whatsapp-followups",
    name: "WhatsApp - Follow-ups Automaticos",
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async () => {
    const planned = await planWhatsAppFollowUps({
      dryRun: false,
      limit: 80,
    });
    const processed = await processWhatsAppFollowUps({
      dryRun: false,
      limit: 10,
      allowQuietHours: false,
    });

    return {
      ok: planned.ok && processed.ok,
      planned,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
