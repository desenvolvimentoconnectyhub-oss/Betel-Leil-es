import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { processComplianceFromSnapshotRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function revalidateCompliancePaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/compliance");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/fontes/capturas/compliance");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/runtime");
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await processComplianceFromSnapshotRecord({
    snapshotId: asString(body.snapshotId),
    snapshotCode: asString(body.snapshotCode),
    complianceRunCode: asString(body.complianceRunCode),
    runtimeMode: asString(body.runtimeMode, "mock"),
    provider: asString(body.provider, "mock"),
    model: asString(body.model, "betel-deterministic-v0"),
    operatorLabel: asString(body.operatorLabel, "Compliance Betel"),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidateCompliancePaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
