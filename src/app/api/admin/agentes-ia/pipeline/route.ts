import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { runAgentPipelineRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
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

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await runAgentPipelineRecord({
    startRunCode: asString(body.startRunCode),
    opportunityCode: asString(body.opportunityCode, "BC-204"),
    inputSummary: asString(body.inputSummary),
    runtimeMode: asString(body.runtimeMode, "mock"),
    provider: asString(body.provider, "mock"),
    model: asString(body.model, "betel-deterministic-v0"),
    operatorLabel: asString(body.operatorLabel, "Pipeline Betel"),
    maxSteps: Math.max(1, Math.min(asNumber(body.maxSteps, 4), 6)),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/pipeline");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
