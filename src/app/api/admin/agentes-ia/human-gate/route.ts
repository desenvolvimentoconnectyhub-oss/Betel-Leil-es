import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolveHumanGateRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await resolveHumanGateRecord({
    runCode: asString(body.runCode),
    decision: asString(body.decision, "approved"),
    reviewerLabel: asString(body.reviewerLabel, "Operador Betel"),
    notes: asString(body.notes),
    transitionKey: asString(body.transitionKey),
    targetAgentKey: asString(body.targetAgentKey),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/human-gate");
  revalidatePath("/api/admin/agentes-ia/handoff");
  revalidatePath("/api/admin/agentes-ia/runtime");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
