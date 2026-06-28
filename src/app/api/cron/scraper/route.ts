import { NextResponse } from "next/server";
import { runScraperCron } from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function parseLimit(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || process.env.SCRAPER_CRON_MAX_TARGETS || 4);
  if (!Number.isFinite(rawLimit)) return 4;
  return Math.max(1, Math.min(Math.trunc(rawLimit), 14));
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxTargets = parseLimit(request);
  const result = await runScraperCron({ maxTargets });

  return NextResponse.json({
    ok: true,
    maxTargets,
    ...result,
    timestamp: new Date().toISOString(),
  });
}
