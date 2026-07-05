import { NextResponse } from "next/server";
import { runScraperCron } from "@/lib/scraper";
import { getScraperScheduleConfig, getScraperScheduleDecision } from "@/lib/scraper/schedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const DEFAULT_CRON_TARGET_LIMIT = 20;
const MAX_CRON_TARGET_LIMIT = 25;

function parseLimit(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || process.env.SCRAPER_CRON_MAX_TARGETS || DEFAULT_CRON_TARGET_LIMIT);
  if (!Number.isFinite(rawLimit)) return DEFAULT_CRON_TARGET_LIMIT;
  return Math.max(1, Math.min(Math.trunc(rawLimit), MAX_CRON_TARGET_LIMIT));
}

function shouldForceRun(request: Request) {
  const url = new URL(request.url);
  return url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxTargets = parseLimit(request);
  const schedule = await getScraperScheduleConfig();
  const decision = getScraperScheduleDecision(schedule);

  if (!decision.shouldRun && !shouldForceRun(request)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: decision.reason,
      clock: decision.clock,
      timestamp: new Date().toISOString(),
    });
  }

  const result = await runScraperCron({ maxTargets });

  return NextResponse.json({
    ok: true,
    maxTargets,
    clock: decision.clock,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
