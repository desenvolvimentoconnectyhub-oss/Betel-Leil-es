import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { processCommunicationOutboxRecord } from "@/lib/admin/repository";

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

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const result = await processCommunicationOutboxRecord({
    messageCode: asString(body.messageCode),
    processNext: asBoolean(body.processNext),
    adapterMode: asString(body.adapterMode, "mock"),
    provider: asString(body.provider, "sandbox"),
    operatorLabel: asString(body.operatorLabel, "Delivery Betel"),
    allowExternal: asBoolean(body.allowExternal),
    providerReleaseConfirmed: asBoolean(body.providerReleaseConfirmed),
    forceFail: asBoolean(body.forceFail),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/providers");
  revalidatePath("/api/admin/agentes-ia/runtime");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
