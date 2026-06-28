import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runCommunicationSchedulerRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: string | null | undefined, fallback = "") {
  return value && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: string | null) {
  return value ? ["1", "true", "on", "yes", "sim"].includes(value.toLowerCase()) : false;
}

function asNumber(value: string | null, fallback = 0) {
  const parsed = Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isAuthorized(request: Request) {
  const expectedTokens = [
    process.env.BETEL_COMMUNICATION_SCHEDULER_TOKEN,
    process.env.CRON_SECRET,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
  ]
    .map((token) => asString(token, ""))
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
  revalidatePath("/api/admin/agentes-ia/communication/providers");
  revalidatePath("/api/admin/agentes-ia/communication/scheduler");
  revalidatePath("/api/admin/agentes-ia/communication/scheduler/cron");
  revalidatePath("/api/admin/agentes-ia/communication/worker");
  revalidatePath("/api/admin/agentes-ia/runtime");
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Cron de comunicacao nao autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = asBoolean(url.searchParams.get("dryRun"));
  const result = await runCommunicationSchedulerRecord({
    dryRun,
    batchSize: asNumber(url.searchParams.get("batchSize"), 5),
    adapterMode: asString(url.searchParams.get("adapterMode"), "mock"),
    provider: asString(url.searchParams.get("provider"), "sandbox"),
    operatorLabel: asString(url.searchParams.get("operatorLabel"), "Vercel Cron Betel"),
    allowExternal: asBoolean(url.searchParams.get("allowExternal")),
    providerReleaseConfirmed: asBoolean(url.searchParams.get("providerReleaseConfirmed")),
    forceFail: asBoolean(url.searchParams.get("forceFail")),
    maxAttempts: asNumber(url.searchParams.get("maxAttempts"), 3),
    triggerSource: asString(url.searchParams.get("triggerSource"), "vercel-cron"),
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
