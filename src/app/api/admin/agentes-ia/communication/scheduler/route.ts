import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runCommunicationSchedulerRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return ["1", "true", "on", "yes", "sim"].includes(value.toLowerCase());
  return false;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function hasOwn(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isAuthorized(request: Request) {
  const expectedTokens = [
    process.env.BETEL_COMMUNICATION_SCHEDULER_TOKEN,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map((token) => asString(token))
    .filter(Boolean);

  if (!expectedTokens.length) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") || "";
  const schedulerToken = request.headers.get("x-scheduler-token") || "";

  return expectedTokens.some((token) => authorization === `Bearer ${token}` || schedulerToken === token);
}

function revalidateCommunicationPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/admin/investidores");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/audit");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/providers");
  revalidatePath("/api/admin/agentes-ia/communication/scheduler");
  revalidatePath("/api/admin/agentes-ia/communication/worker");
  revalidatePath("/api/admin/agentes-ia/runtime");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Scheduler de comunicacao nao autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRunParam = url.searchParams.get("dryRun");
  const dryRun = dryRunParam === null ? !asBoolean(url.searchParams.get("run")) : asBoolean(dryRunParam);
  const result = await runCommunicationSchedulerRecord({
    dryRun,
    batchSize: asNumber(url.searchParams.get("batchSize"), 5),
    adapterMode: asString(url.searchParams.get("adapterMode"), "mock"),
    provider: asString(url.searchParams.get("provider"), "sandbox"),
    operatorLabel: asString(url.searchParams.get("operatorLabel"), "Communication Scheduler Betel"),
    allowExternal: asBoolean(url.searchParams.get("allowExternal")),
    providerReleaseConfirmed: asBoolean(url.searchParams.get("providerReleaseConfirmed")),
    forceFail: asBoolean(url.searchParams.get("forceFail")),
    maxAttempts: asNumber(url.searchParams.get("maxAttempts"), 3),
    triggerSource: asString(url.searchParams.get("triggerSource"), "scheduler-get"),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  if (!result.data?.dryRun) revalidateCommunicationPaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Scheduler de comunicacao nao autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const dryRun = hasOwn(body, "dryRun") ? asBoolean(body.dryRun) : hasOwn(body, "run") ? !asBoolean(body.run) : false;
  const result = await runCommunicationSchedulerRecord({
    dryRun,
    batchSize: asNumber(body.batchSize, 5),
    adapterMode: asString(body.adapterMode, "mock"),
    provider: asString(body.provider, "sandbox"),
    operatorLabel: asString(body.operatorLabel, "Communication Scheduler Betel"),
    allowExternal: asBoolean(body.allowExternal),
    providerReleaseConfirmed: asBoolean(body.providerReleaseConfirmed),
    forceFail: asBoolean(body.forceFail),
    maxAttempts: asNumber(body.maxAttempts, 3),
    triggerSource: asString(body.triggerSource, "scheduler-post"),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  if (!result.data?.dryRun) revalidateCommunicationPaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
