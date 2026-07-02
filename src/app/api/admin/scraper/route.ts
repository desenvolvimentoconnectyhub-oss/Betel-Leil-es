import { NextResponse } from "next/server";
import {
  getScraperDashboardData,
  createScraperTargetRecord,
  toggleScraperTargetRecord,
  updateScraperTargetRecord,
  clearScraperTargetErrors,
  deleteScraperTargetRecord,
  runScraperForTarget,
  backfillOpportunityImages,
} from "@/lib/scraper";
import {
  DEFAULT_SCRAPER_SCHEDULE,
  SCRAPER_SCHEDULE_KEY,
  getScraperScheduleConfig,
  normalizeScraperScheduleConfig,
} from "@/lib/scraper/schedule";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const [data, schedule] = await Promise.all([
    getScraperDashboardData(),
    getScraperScheduleConfig(),
  ]);
  return NextResponse.json({ ...data, schedule });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { action } = body;

  if (action === "create") {
    const result = await createScraperTargetRecord({
      targetCode: body.targetCode,
      name: body.name,
      url: body.url,
      targetType: body.targetType || "auctioneer",
      region: body.region,
      coverage: body.coverage,
      scrapeStrategy: body.scrapeStrategy || "fetch",
      selectors: body.selectors,
      scheduleCron: body.scheduleCron,
      priority: body.priority,
      maxPages: body.maxPages,
      rateLimitMs: body.rateLimitMs,
      notes: body.notes,
    });
    return NextResponse.json(result);
  }

  if (action === "toggle") {
    const result = await toggleScraperTargetRecord(body.targetCode, body.enabled);
    return NextResponse.json(result);
  }

  if (action === "update") {
    const result = await updateScraperTargetRecord(body.targetCode, {
      name: body.name,
      url: body.url,
      targetType: body.targetType,
      region: body.region,
      coverage: body.coverage,
      scrapeStrategy: body.scrapeStrategy,
      priority: body.priority,
      maxPages: body.maxPages,
      rateLimitMs: body.rateLimitMs,
      notes: body.notes,
    });
    return NextResponse.json(result);
  }

  if (action === "delete") {
    const result = await deleteScraperTargetRecord(body.targetCode);
    return NextResponse.json(result);
  }

  if (action === "run") {
    const result = await runScraperForTarget(body.targetCode);
    return NextResponse.json(result);
  }

  if (action === "clear_errors") {
    const result = await clearScraperTargetErrors(body.targetCode);
    return NextResponse.json(result);
  }

  if (action === "backfill_images") {
    const result = await backfillOpportunityImages({
      limit: typeof body.limit === "number" ? body.limit : 120,
      force: body.force === true,
    });
    return NextResponse.json(result);
  }

  if (action === "schedule_save") {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase nao configurado." }, { status: 500 });
    }

    const schedule = normalizeScraperScheduleConfig({
      ...DEFAULT_SCRAPER_SCHEDULE,
      days: body.days,
      hours: body.hours,
      maxResults: body.maxResults,
      enabled: body.enabled,
      timezone: body.timezone,
    });

    const { error } = await supabase
      .from("app_config")
      .upsert(
        { key: SCRAPER_SCHEDULE_KEY, value: JSON.stringify(schedule), is_secret: false, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedule });
  }

  return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
}
