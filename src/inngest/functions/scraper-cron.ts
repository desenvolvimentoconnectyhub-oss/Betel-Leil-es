import { inngest } from "../client";
import { runScraperCron } from "@/lib/scraper";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type ScheduleConfig = { days: number[]; hours: number[]; enabled: boolean };

const DEFAULT_SCHEDULE: ScheduleConfig = { days: [1, 2, 3, 4, 5], hours: [8, 12, 16, 20], enabled: true };

async function getSchedule(): Promise<ScheduleConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return DEFAULT_SCHEDULE;

  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "scraper_schedule")
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_SCHEDULE, ...parsed };
    }
  } catch {}

  return DEFAULT_SCHEDULE;
}

export const scraperCronFunction = inngest.createFunction(
  {
    id: "scraper-cron",
    name: "Renata — Coleta Automatizada",
    triggers: [{ cron: "0 * * * *" }],
  },
  async () => {
    const schedule = await getSchedule();

    if (!schedule.enabled) {
      return { ok: true, skipped: true, reason: "Coleta desabilitada pelo admin." };
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentHour = now.getHours();

    if (!schedule.days.includes(currentDay)) {
      return { ok: true, skipped: true, reason: `Dia ${currentDay} nao esta na agenda.` };
    }

    if (!schedule.hours.includes(currentHour)) {
      return { ok: true, skipped: true, reason: `Hora ${currentHour} nao esta na agenda.` };
    }

    const result = await runScraperCron();
    return { ok: true, ...result, timestamp: now.toISOString() };
  }
);
