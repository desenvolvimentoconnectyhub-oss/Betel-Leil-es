import { inngest } from "../client";
import { runWhatsAppSdrAppointmentAutomation } from "@/lib/whatsapp/sdr-appointments";

export const whatsappSdrAppointmentsFunction = inngest.createFunction(
  {
    id: "whatsapp-sdr-appointments",
    name: "WhatsApp - Agenda SDR",
    triggers: [{ cron: "* * * * *" }],
  },
  async () => {
    const result = await runWhatsAppSdrAppointmentAutomation({
      limit: 30,
      source: "inngest-whatsapp-sdr-appointments",
    });

    return {
      ok: result.ok,
      result,
      timestamp: new Date().toISOString(),
    };
  },
);
