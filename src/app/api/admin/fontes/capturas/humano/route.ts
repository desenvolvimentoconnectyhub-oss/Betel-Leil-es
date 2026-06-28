import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { enqueueHumanReviewFromSnapshotRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["1", "true", "sim", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "nao", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function revalidateHumanReviewPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/revisao-juridica");
  revalidatePath("/admin/alertas");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/fontes/capturas/humano");
  revalidatePath("/api/admin/agentes-ia");
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await enqueueHumanReviewFromSnapshotRecord({
    snapshotId: asString(body.snapshotId),
    snapshotCode: asString(body.snapshotCode),
    hiddenRiskRunCode: asString(body.hiddenRiskRunCode),
    runtimeMode: asString(body.runtimeMode, "mock"),
    provider: asString(body.provider, "mock"),
    model: asString(body.model, "betel-deterministic-v0"),
    operatorLabel: asString(body.operatorLabel, "Handoff Humano Betel"),
    reviewerLabel: asString(body.reviewerLabel, "Juridico Betel"),
    processNow: asBoolean(body.processNow, true),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidateHumanReviewPaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
