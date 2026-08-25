import { inngest } from "../client";
import { processWhatsAppFollowUps } from "@/lib/whatsapp/follow-up-worker";
import { MANUAL_HANDOFF_AUTO_RESUME_EVENT } from "@/lib/whatsapp/manual-handoff";

export const whatsappManualHandoffResumeFunction = inngest.createFunction(
  {
    id: "whatsapp-manual-handoff-resume",
    name: "WhatsApp - Retomada apos atendimento humano",
    triggers: [{ event: MANUAL_HANDOFF_AUTO_RESUME_EVENT }],
  },
  async ({ event, step }) => {
    const followUpId = String(event.data?.followUpId || "");
    if (!followUpId) {
      return {
        ok: false,
        reason: "missing_follow_up_id",
        timestamp: new Date().toISOString(),
      };
    }

    const scheduledFor = String(event.data?.scheduledFor || "");
    const scheduledAt = new Date(scheduledFor);

    if (Number.isFinite(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now()) {
      await step.sleepUntil("wait-for-manual-handoff-window", scheduledAt);
    }

    const processed = await step.run("process-manual-handoff-resume", () =>
      processWhatsAppFollowUps({
        dryRun: false,
        limit: 1,
        allowQuietHours: true,
        followUpId,
      })
    );

    return {
      ok: processed.ok,
      processed,
      timestamp: new Date().toISOString(),
    };
  }
);
