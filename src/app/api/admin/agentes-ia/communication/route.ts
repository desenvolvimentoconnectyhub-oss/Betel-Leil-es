import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { dispatchCommunicationRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await dispatchCommunicationRecord({
    sourceRunCode: asString(body.sourceRunCode),
    opportunityCode: asString(body.opportunityCode),
    investorId: asString(body.investorId),
    audienceScope: asString(body.audienceScope, "all"),
    channels: asStringList(body.channels),
    messageIntent: asString(body.messageIntent),
    operatorLabel: asString(body.operatorLabel, "Growth Betel"),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/runtime");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
