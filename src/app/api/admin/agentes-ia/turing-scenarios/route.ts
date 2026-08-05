import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  evaluateTuringScenarioReply,
  listTuringScenarios,
  summarizeTuringScenarioCoverage,
  type TuringScenarioFilters,
  type TuringScenarioSeverity,
  type TuringScenarioSurface,
} from "@/lib/ai/turing-scenario-suite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asSurface(value: unknown): TuringScenarioFilters["surface"] {
  const text = cleanString(value).toLowerCase();
  if (["whatsapp", "user_panel", "admin_panel", "backoffice", "all"].includes(text)) {
    return text as TuringScenarioSurface | "all";
  }
  return "all";
}

function asSeverity(value: unknown): TuringScenarioFilters["severity"] {
  const text = cleanString(value).toLowerCase();
  if (["critical", "high", "medium", "low", "all"].includes(text)) {
    return text as TuringScenarioSeverity | "all";
  }
  return "all";
}

function filtersFromUrl(url: URL): TuringScenarioFilters {
  return {
    surface: asSurface(url.searchParams.get("surface")),
    severity: asSeverity(url.searchParams.get("severity")),
    agentKey: cleanString(url.searchParams.get("agentKey")),
    category: cleanString(url.searchParams.get("category")),
    tag: cleanString(url.searchParams.get("tag")),
  };
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const scenarios = listTuringScenarios(filtersFromUrl(url));

  return NextResponse.json({
    success: true,
    data: {
      summary: summarizeTuringScenarioCoverage(scenarios),
      scenarios,
    },
  });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const scenarioId = cleanString(body.scenarioId);
  const replyText = cleanString(body.replyText);

  if (!scenarioId || !replyText) {
    return NextResponse.json(
      { success: false, error: "scenarioId e replyText sao obrigatorios." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    data: evaluateTuringScenarioReply(scenarioId, replyText),
  });
}
