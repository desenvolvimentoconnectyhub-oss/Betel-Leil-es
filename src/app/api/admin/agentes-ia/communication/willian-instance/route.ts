import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  configureWillianWebhook,
  connectWillianConnectyHubInstance,
  createWillianConnectyHubInstance,
  fetchWillianRemoteStatus,
  getWillianInstanceState,
} from "@/lib/communication/connectyhub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function revalidateWillian() {
  revalidatePath("/admin");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/communication/providers");
  revalidatePath("/api/admin/agentes-ia/communication/willian-instance");
  revalidatePath("/api/admin/agentes-ia/communication/willian-config");
}

async function generateWillianQrCode(input: { browser?: string; instanceName?: string; phone?: string }) {
  const steps: Record<string, unknown> = {};
  const beforeState = await getWillianInstanceState();

  if (!beforeState.instanceTokenConfigured) {
    steps.create = await createWillianConnectyHubInstance({
      instanceName: cleanString(input.instanceName),
    });
  }

  const connect = await connectWillianConnectyHubInstance({
    phone: cleanString(input.phone),
    browser: cleanString(input.browser, "auto"),
  });
  steps.connect = connect;

  try {
    steps.configureWebhook = await configureWillianWebhook();
  } catch (error) {
    steps.configureWebhookWarning =
      error instanceof Error ? error.message : "Webhook nao configurado automaticamente.";
  }

  try {
    steps.status = await fetchWillianRemoteStatus();
  } catch (error) {
    steps.statusWarning = error instanceof Error ? error.message : "Status remoto ainda nao disponivel.";
  }

  return {
    ...steps,
    connection: connect.connection,
    createdInstance: !beforeState.instanceTokenConfigured,
    webhookConfigured: Boolean(steps.configureWebhook),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const checkRemote = ["1", "true", "sim"].includes((url.searchParams.get("remote") || "").toLowerCase());
  const state = await getWillianInstanceState({ checkRemote });

  return NextResponse.json({ success: true, data: { state } });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const action = cleanString(body.action);

  try {
    let result: Record<string, unknown> = {};

    if (action === "create") {
      result = await createWillianConnectyHubInstance({
        instanceName: cleanString(body.instanceName),
      });
    } else if (action === "generateQr") {
      result = await generateWillianQrCode({
        instanceName: cleanString(body.instanceName),
        phone: cleanString(body.phone),
        browser: cleanString(body.browser, "auto"),
      });
    } else if (action === "connect") {
      result = await connectWillianConnectyHubInstance({
        phone: cleanString(body.phone),
        browser: cleanString(body.browser, "auto"),
      });
    } else if (action === "status") {
      result = await fetchWillianRemoteStatus();
    } else if (action === "configureWebhook") {
      result = await configureWillianWebhook();
    } else {
      return NextResponse.json({ success: false, error: "Acao desconhecida para instancia do Willian." }, { status: 400 });
    }

    revalidateWillian();
    const state = await getWillianInstanceState({ checkRemote: true });

    return NextResponse.json({
      success: true,
      data: {
        action,
        state,
        result,
      },
    });
  } catch (error) {
    const state = await getWillianInstanceState();

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Falha ao operar instancia do Willian.",
        data: { state },
      },
      { status: 400 }
    );
  }
}
