import { NextResponse } from "next/server";
import { getCommunicationProviderHealth } from "@/lib/communication/delivery-adapters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isAuthorized(request: Request) {
  const expectedTokens = [
    process.env.BETEL_COMMUNICATION_SCHEDULER_TOKEN,
    process.env.BETEL_COMMUNICATION_WORKER_TOKEN,
    process.env.CRON_SECRET,
  ]
    .map((token) => cleanString(token))
    .filter(Boolean);

  if (!expectedTokens.length) return process.env.NODE_ENV !== "production";

  const authorization = request.headers.get("authorization") || "";
  const schedulerToken = request.headers.get("x-scheduler-token") || "";

  return expectedTokens.some((token) => authorization === `Bearer ${token}` || schedulerToken === token);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Diagnostico de providers nao autorizado." }, { status: 401 });
  }

  const url = new URL(request.url);
  const provider = cleanString(url.searchParams.get("provider"));

  return NextResponse.json({
    success: true,
    data: {
      providerHealth: getCommunicationProviderHealth(provider),
    },
  });
}
