import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { enqueueAgentHandoffRecord } from "@/lib/admin/repository";

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

  const result = await enqueueAgentHandoffRecord({
    currentRunCode: asString(body.currentRunCode),
    targetAgentKey: asString(body.targetAgentKey),
    transitionKey: asString(body.transitionKey),
    inputSummary: asString(body.inputSummary),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
