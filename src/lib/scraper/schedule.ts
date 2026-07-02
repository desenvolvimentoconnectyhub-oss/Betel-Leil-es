import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type ScraperScheduleConfig = {
  days: number[];
  times: string[];
  maxResults: number;
  enabled: boolean;
  timezone: string;
};

export const SCRAPER_SCHEDULE_KEY = "scraper_schedule";
export const SCRAPER_TIMEZONE = "America/Sao_Paulo";

export const DEFAULT_SCRAPER_SCHEDULE: ScraperScheduleConfig = {
  days: [1, 2, 3, 4, 5],
  times: ["08:00", "12:00", "16:00", "20:00"],
  maxResults: 50,
  enabled: true,
  timezone: SCRAPER_TIMEZONE,
};

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

function asNumberArray(value: unknown, fallback: number[], min: number, max: number) {
  if (!Array.isArray(value)) return fallback;
  const clean = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= min && item <= max);
  return Array.from(new Set(clean)).sort((a, b) => a - b);
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function normalizeTime(value: unknown) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return "";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "";
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return "";

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timesFromHours(value: unknown) {
  return asNumberArray(value, [], 0, 23).map((hour) => `${String(hour).padStart(2, "0")}:00`);
}

function asTimeArray(value: unknown, legacyHours: unknown, fallback: string[]) {
  const clean = Array.isArray(value)
    ? value.map(normalizeTime).filter(Boolean)
    : timesFromHours(legacyHours);
  const unique = Array.from(new Set(clean));

  return (unique.length ? unique : fallback).sort((a, b) => minutesFromTime(a) - minutesFromTime(b));
}

function asTimezone(value: unknown) {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : SCRAPER_TIMEZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return SCRAPER_TIMEZONE;
  }
}

export function normalizeScraperScheduleConfig(value: unknown): ScraperScheduleConfig {
  const input = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const maxResults = Number(input.maxResults);

  return {
    days: asNumberArray(input.days, DEFAULT_SCRAPER_SCHEDULE.days, 0, 6),
    times: asTimeArray(input.times, input.hours, DEFAULT_SCRAPER_SCHEDULE.times),
    maxResults: Number.isFinite(maxResults)
      ? Math.min(Math.max(Math.trunc(maxResults), 1), 500)
      : DEFAULT_SCRAPER_SCHEDULE.maxResults,
    enabled: input.enabled !== false,
    timezone: asTimezone(input.timezone),
  };
}

export async function getScraperScheduleConfig(): Promise<ScraperScheduleConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return DEFAULT_SCRAPER_SCHEDULE;

  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", SCRAPER_SCHEDULE_KEY)
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      return normalizeScraperScheduleConfig(parsed);
    }
  } catch {}

  return DEFAULT_SCRAPER_SCHEDULE;
}

export function getScraperScheduleClock(date = new Date(), timezone = SCRAPER_TIMEZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: asTimezone(timezone),
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const weekday = String(parts.find((part) => part.type === "weekday")?.value || "sun")
    .slice(0, 3)
    .toLowerCase();
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  const safeHour = Number.isFinite(hour) ? hour : 0;
  const safeMinute = Number.isFinite(minute) ? minute : 0;

  return {
    day: WEEKDAY_TO_INDEX[weekday] ?? 0,
    hour: safeHour,
    minute: safeMinute,
    time: `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`,
    timezone: asTimezone(timezone),
  };
}

export function getScraperScheduleDecision(schedule: ScraperScheduleConfig, date = new Date()) {
  const clock = getScraperScheduleClock(date, schedule.timezone);

  if (!schedule.enabled) {
    return { shouldRun: false, clock, reason: "Coleta desabilitada pelo admin." };
  }

  if (!schedule.days.includes(clock.day)) {
    return {
      shouldRun: false,
      clock,
      reason: `Dia ${clock.day} nao esta na agenda em ${clock.timezone}.`,
    };
  }

  if (!schedule.times.includes(clock.time)) {
    return {
      shouldRun: false,
      clock,
      reason: `Horario ${clock.time} nao esta na agenda em ${clock.timezone}.`,
    };
  }

  return { shouldRun: true, clock, reason: "Dentro da agenda." };
}
