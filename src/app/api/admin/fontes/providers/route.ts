import { NextResponse } from "next/server";
import { getSourceProviderHealth } from "@/lib/sources/provider-adapters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isAuthorized(request: Request) {
  const expectedTokens = [
    process.env.BETEL_SOURCE_PROVIDER_TOKEN,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map((token) => cleanString(token))
    .filter(Boolean);

  if (!expectedTokens.length) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") || "";
  const sourceToken = request.headers.get("x-source-token") || "";

  return expectedTokens.some((token) => authorization === `Bearer ${token}` || sourceToken === token);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Diagnostico de fontes nao autorizado." }, { status: 401 });
  }

  return NextResponse.json({
    success: true,
    data: {
      providerHealth: getSourceProviderHealth(),
    },
  });
}
