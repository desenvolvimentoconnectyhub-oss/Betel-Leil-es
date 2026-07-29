export type FollowUpWindowInput = {
  start?: unknown;
  end?: unknown;
  timezone?: unknown;
};

const DEFAULT_START = "09:00";
const DEFAULT_END = "20:00";
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function safeTimezone(value: unknown) {
  const timezone = cleanString(value, DEFAULT_TIMEZONE);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function parseClock(value: unknown, fallback: string) {
  const text = cleanString(value, fallback);
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return parseClock(fallback, DEFAULT_START);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return parseClock(fallback, DEFAULT_START);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return parseClock(fallback, DEFAULT_START);

  return hour * 60 + minute;
}

function formatClock(minutes: number) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function currentMinutesInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: timezone,
  }).formatToParts(date);

  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  return hour * 60 + minute;
}

export function describeFollowUpWindow(input: FollowUpWindowInput = {}) {
  const timezone = safeTimezone(input.timezone);
  const start = parseClock(input.start, DEFAULT_START);
  const end = parseClock(input.end, DEFAULT_END);
  return {
    start: formatClock(start),
    end: formatClock(end),
    timezone,
  };
}

export function isInsideFollowUpWindow(date: Date, input: FollowUpWindowInput = {}) {
  const { start, end, timezone } = describeFollowUpWindow(input);
  const startMinutes = parseClock(start, DEFAULT_START);
  const endMinutes = parseClock(end, DEFAULT_END);
  const current = currentMinutesInTimezone(date, timezone);

  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

export function nextFollowUpWindowDate(date: Date, input: FollowUpWindowInput = {}) {
  if (isInsideFollowUpWindow(date, input)) return date;

  const probe = new Date(date.getTime());
  probe.setSeconds(0, 0);
  if (probe.getTime() < date.getTime()) probe.setMinutes(probe.getMinutes() + 1);

  for (let minute = 0; minute <= 48 * 60; minute += 1) {
    if (minute > 0) probe.setMinutes(probe.getMinutes() + 1);
    if (isInsideFollowUpWindow(probe, input)) return probe;
  }

  return new Date(date.getTime() + 24 * 60 * 60_000);
}
