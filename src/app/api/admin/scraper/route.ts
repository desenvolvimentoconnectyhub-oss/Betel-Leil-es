import { NextResponse } from "next/server";
import {
  getScraperDashboardData,
  createScraperTargetRecord,
  toggleScraperTargetRecord,
  updateScraperTargetRecord,
  deleteScraperTargetRecord,
} from "@/lib/scraper";
import { runScraperForTarget } from "@/lib/scraper";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SCHEDULE_KEY = "scraper_schedule";

export type ScraperScheduleConfig = {
  days: number[];
  hours: number[];
  maxResults: number;
  enabled: boolean;
};

const DEFAULT_SCHEDULE: ScraperScheduleConfig = {
  days: [1, 2, 3, 4, 5],
  hours: [8, 12, 16, 20],
  maxResults: 50,
  enabled: true,
};

async function getScheduleConfig(): Promise<ScraperScheduleConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return DEFAULT_SCHEDULE;

  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", SCHEDULE_KEY)
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      return { ...DEFAULT_SCHEDULE, ...parsed };
    }
  } catch {}

  return DEFAULT_SCHEDULE;
}

export async function GET() {
  const [data, schedule] = await Promise.all([
    getScraperDashboardData(),
    getScheduleConfig(),
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
      scrapeStrategy: body.scrapeStrategy || "playwright",
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

  if (action === "schedule_save") {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase nao configurado." }, { status: 500 });
    }

    const maxResults = typeof body.maxResults === "number" && body.maxResults > 0 ? Math.min(body.maxResults, 500) : DEFAULT_SCHEDULE.maxResults;
    const schedule: ScraperScheduleConfig = {
      days: Array.isArray(body.days) ? body.days.filter((d: unknown) => typeof d === "number" && d >= 0 && d <= 6) : DEFAULT_SCHEDULE.days,
      hours: Array.isArray(body.hours) ? body.hours.filter((h: unknown) => typeof h === "number" && h >= 0 && h <= 23) : DEFAULT_SCHEDULE.hours,
      maxResults,
      enabled: body.enabled !== false,
    };

    const { error } = await supabase
      .from("app_config")
      .upsert(
        { key: SCHEDULE_KEY, value: JSON.stringify(schedule), is_secret: false, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, schedule });
  }

  return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
}
