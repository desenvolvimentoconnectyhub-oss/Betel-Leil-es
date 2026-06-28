import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { listSourceSnapshots, processSourceSnapshotRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function paramValue(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value && value.trim() ? value.trim() : undefined;
}

function paramLimit(searchParams: URLSearchParams) {
  const raw = searchParams.get("limit");
  if (!raw) return 50;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(Math.trunc(parsed), 1), 100);
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "true", "sim", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "nao", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function revalidateSourceCapturePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/agentes-ia");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = await listSourceSnapshots({
    sourceId: paramValue(url.searchParams, "source"),
    status: paramValue(url.searchParams, "status"),
    limit: paramLimit(url.searchParams),
  });

  return NextResponse.json({
    success: result.source === "supabase",
    source: result.source,
    reason: result.reason,
    count: result.data.length,
    data: result.data,
  });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await processSourceSnapshotRecord({
    snapshotId: asString(body.snapshotId),
    snapshotCode: asString(body.snapshotCode),
    runtimeMode: asString(body.runtimeMode, "mock"),
    provider: asString(body.provider, "mock"),
    model: asString(body.model, "betel-deterministic-v0"),
    operatorLabel: asString(body.operatorLabel, "Curadoria Betel"),
    processNow: asBoolean(body.processNow, true),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidateSourceCapturePaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
