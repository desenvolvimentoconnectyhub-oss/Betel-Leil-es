import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  fetchWhatsappAgentRemoteStatus,
  WILLIAN_AGENT_KEY,
} from "@/lib/communication/connectyhub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function disconnectedMessage(error = "") {
  const detail = cleanString(error);
  return [
    "Nao foi possivel prosseguir porque a instancia WhatsApp selecionada nao esta conectada.",
    "Reconecte o numero na ConnectyHub ou escolha outro remetente conectado e tente novamente.",
    detail ? `Detalhe tecnico: ${detail}` : "",
  ].filter(Boolean).join(" ");
}

export async function GET(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const url = new URL(request.url);
  const agentKey = cleanString(url.searchParams.get("agentKey"), WILLIAN_AGENT_KEY);

  try {
    const result = await fetchWhatsappAgentRemoteStatus({ agentKey });
    const connected = Boolean(result.status.connected || result.status.loggedIn);
    const state = cleanString(result.status.state, connected ? "connected" : "disconnected");
    const lastDisconnectReason = cleanString(result.lastDisconnectReason || result.connection.lastDisconnectReason);

    return NextResponse.json(
      {
        success: connected,
        data: {
          agentKey,
          connected,
          state,
          lastDisconnectReason,
        },
        error: connected ? "" : disconnectedMessage(lastDisconnectReason || state),
      },
      { status: connected ? 200 : 409 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao consultar status remoto da instancia WhatsApp.";
    return NextResponse.json(
      {
        success: false,
        data: {
          agentKey,
          connected: false,
          state: "unknown",
          lastDisconnectReason: "",
        },
        error: disconnectedMessage(message),
      },
      { status: 409 }
    );
  }
}
