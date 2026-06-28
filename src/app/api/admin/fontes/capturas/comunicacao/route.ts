import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { releaseCommunicationFromSnapshotRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringList(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return items.length ? items : fallback;
  }

  if (typeof value === "string" && value.trim()) {
    const items = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items : fallback;
  }

  return fallback;
}

function revalidateCommunicationPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/compliance");
  revalidatePath("/admin/alertas");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/fontes/capturas/comunicacao");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/worker");
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await releaseCommunicationFromSnapshotRecord({
    snapshotId: asString(body.snapshotId),
    snapshotCode: asString(body.snapshotCode),
    complianceRunCode: asString(body.complianceRunCode),
    audienceScope: asString(body.audienceScope, "all"),
    channels: asStringList(body.channels, ["WhatsApp", "Email", "Push"]),
    messageIntent: asString(body.messageIntent),
    operatorLabel: asString(body.operatorLabel, "Growth Betel"),
    reviewerLabel: asString(body.reviewerLabel, "Compliance Betel"),
    notes: asString(body.notes),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidateCommunicationPaths();

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
