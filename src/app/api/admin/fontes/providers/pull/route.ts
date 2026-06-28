import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  pullSourceProviderOpportunitiesRecord,
  type PullSourceProviderOpportunitiesInput,
} from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "nao", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function isAuthorized(request: Request) {
  const expectedTokens = [
    process.env.BETEL_SOURCE_PROVIDER_TOKEN,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map((token) => cleanString(token))
    .filter(Boolean);

  if (!expectedTokens.length) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") || "";
  const sourceToken = request.headers.get("x-source-token") || "";

  return expectedTokens.some((token) => authorization === `Bearer ${token}` || sourceToken === token);
}

function clampLimit(value: unknown) {
  return Math.max(1, Math.min(Math.trunc(asNumber(value, 3)), 20));
}

function parseInput(body: Record<string, unknown>): PullSourceProviderOpportunitiesInput {
  return {
    providerKey: cleanString(body.providerKey, "auction_sources"),
    runtimeMode: cleanString(body.runtimeMode, "mock"),
    query: cleanString(body.query),
    city: cleanString(body.city),
    state: cleanString(body.state).toUpperCase(),
    limit: clampLimit(body.limit),
    dryRun: asBoolean(body.dryRun, true),
    ingest: asBoolean(body.ingest),
    allowExternal: asBoolean(body.allowExternal),
    providerReleaseConfirmed: asBoolean(body.providerReleaseConfirmed),
    operatorLabel: cleanString(body.operatorLabel, "Agente Buscador de Imoveis"),
    processAfterIngest: asBoolean(body.processAfterIngest),
    curationRuntimeMode: cleanString(body.curationRuntimeMode, "mock"),
    curationProvider: cleanString(body.curationProvider, "mock"),
    curationModel: cleanString(body.curationModel, "betel-deterministic-v0"),
    curationProcessNow: asBoolean(body.curationProcessNow, true),
    openHumanReviewAfterIngest: asBoolean(body.openHumanReviewAfterIngest),
  };
}

function parseSearchParams(searchParams: URLSearchParams): PullSourceProviderOpportunitiesInput {
  return parseInput({
    providerKey: searchParams.get("providerKey"),
    runtimeMode: searchParams.get("runtimeMode") || "mock",
    query: searchParams.get("query"),
    city: searchParams.get("city"),
    state: searchParams.get("state"),
    limit: searchParams.get("limit"),
    dryRun: searchParams.get("dryRun") || "true",
    ingest: searchParams.get("ingest") || "false",
    allowExternal: searchParams.get("allowExternal") || "false",
    providerReleaseConfirmed: searchParams.get("providerReleaseConfirmed") || "false",
    operatorLabel: searchParams.get("operatorLabel"),
    processAfterIngest: searchParams.get("processAfterIngest") || "false",
    curationRuntimeMode: searchParams.get("curationRuntimeMode") || "mock",
    curationProvider: searchParams.get("curationProvider") || "mock",
    curationModel: searchParams.get("curationModel") || "betel-deterministic-v0",
    curationProcessNow: searchParams.get("curationProcessNow") || "true",
    openHumanReviewAfterIngest: searchParams.get("openHumanReviewAfterIngest") || "false",
  });
}

function revalidateSourceProviderPullPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/fontes/providers");
  revalidatePath("/api/admin/fontes/providers/pull");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Pull de fontes nao autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await pullSourceProviderOpportunitiesRecord(parseSearchParams(url.searchParams));

  return NextResponse.json(
    {
      success: result.ok,
      error: result.error,
      data: result.data,
    },
    { status: result.ok ? 200 : 400 }
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Pull de fontes nao autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await pullSourceProviderOpportunitiesRecord(parseInput(body));

  if (result.data && !result.data.dryRun) {
    revalidateSourceProviderPullPaths();
  }

  return NextResponse.json(
    {
      success: result.ok,
      error: result.error,
      data: result.data,
    },
    { status: result.ok ? 200 : 400 }
  );
}
