import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { resolveHumanReviewFromSnapshotRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function revalidateDecisionPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/revisao-juridica");
  revalidatePath("/admin/alertas");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/fontes/capturas/decisao");
  revalidatePath("/api/admin/agentes-ia");
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await resolveHumanReviewFromSnapshotRecord({
    snapshotId: asString(body.snapshotId),
    snapshotCode: asString(body.snapshotCode),
    humanHandoffRunCode: asString(body.humanHandoffRunCode),
    decision: asString(body.decision, "approved"),
    reviewerLabel: asString(body.reviewerLabel, "Juridico Betel"),
    notes: asString(body.notes),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidateDecisionPaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
