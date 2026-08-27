import { inngest } from "../client";
import { planWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-planner";
import { processWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-worker";
import { runWhatsAppSdrAppointmentAutomation } from "@/lib/whatsapp/sdr-appointments";

export const whatsappFollowUpsFunction = inngest.createFunction(
  {
    id: "whatsapp-followups",
    name: "WhatsApp - Follow-ups Automaticos",
    triggers: [{ cron: "*/10 * * * *" }],
  },
  async () => {
    const appointments = await runWhatsAppSdrAppointmentAutomation({
      limit: 30,
      source: "inngest-whatsapp-followups-backstop",
    });
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
      ok: appointments.ok && planned.ok && processed.ok,
      appointments,
      planned,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
