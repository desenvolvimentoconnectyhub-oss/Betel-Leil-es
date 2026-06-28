import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { processCommunicationOutboxBatchRecord } from "@/lib/admin/repository";

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

function isAuthorized(request: Request) {
  const expectedToken = process.env.BETEL_COMMUNICATION_WORKER_TOKEN;
  if (!expectedToken) return true;

  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${expectedToken}`;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Worker nao autorizado." }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await processCommunicationOutboxBatchRecord({
    processBatch: asBoolean(body.processBatch),
    batchSize: asNumber(body.batchSize, 5),
    adapterMode: asString(body.adapterMode, "mock"),
    provider: asString(body.provider, "sandbox"),
    operatorLabel: asString(body.operatorLabel, "Delivery Worker Betel"),
    allowExternal: asBoolean(body.allowExternal),
    providerReleaseConfirmed: asBoolean(body.providerReleaseConfirmed),
    forceFail: asBoolean(body.forceFail),
    maxAttempts: asNumber(body.maxAttempts, 3),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/admin/investidores");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/providers");
  revalidatePath("/api/admin/agentes-ia/communication/worker");
  revalidatePath("/api/admin/agentes-ia/runtime");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
