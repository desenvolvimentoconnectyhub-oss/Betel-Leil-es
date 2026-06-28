import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { processAgentRunRecord } from "@/lib/admin/repository";

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

  const result = await processAgentRunRecord({
    runCode: asString(body.runCode),
    runtimeMode: asString(body.runtimeMode, "mock"),
    operatorLabel: asString(body.operatorLabel, "Runtime Betel"),
    provider: asString(body.provider),
    model: asString(body.model),
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/runtime");

  return NextResponse.json({
    success: true,
    data: result.data,
  });
}
