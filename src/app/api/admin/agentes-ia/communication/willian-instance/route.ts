import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  configureWillianWebhook,
  connectWillianConnectyHubInstance,
  createWillianConnectyHubInstance,
  deleteWillianConnectyHubInstance,
  disconnectWillianConnectyHubInstance,
  fetchWillianConnectyHubDataOverview,
  fetchWillianRemoteStatus,
  fetchWillianWebhookDeliveries,
  getWillianInstanceState,
  resetWillianConnectyHubInstance,
  testWillianWebhookDelivery,
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

function isRecoverableInstanceError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("invalid token") ||
    message.includes("provider_connect_failed") ||
    message.includes("missing_instance_token") ||
    message.includes("instancia sem token") ||
    message.includes("instancia nao encontrada") ||
    message.includes("adote ou recrie") ||
    message.includes("recrie ou vincule")
  );
}

async function generateWillianQrCode(input: { browser?: string; instanceName?: string; phone?: string }) {
  const steps: Record<string, unknown> = {};
  const beforeState = await getWillianInstanceState();
  const instanceName = cleanString(input.instanceName, beforeState.instanceName);
  const phone = cleanString(input.phone);
  const browser = cleanString(input.browser, "auto");

  try {
    steps.configureWebhookBeforeConnect = await configureWillianWebhook();
  } catch (error) {
    steps.configureWebhookWarning =
      error instanceof Error ? error.message : "Webhook nao configurado automaticamente.";
  }

  if (!beforeState.instanceTokenConfigured) {
    steps.create = await createWillianConnectyHubInstance({ instanceName });
  }

  let connect: Awaited<ReturnType<typeof connectWillianConnectyHubInstance>>;
  try {
    connect = await connectWillianConnectyHubInstance({ phone, browser });
  } catch (error) {
    if (!isRecoverableInstanceError(error)) throw error;

    steps.recoveryReason = error instanceof Error ? error.message : "Instancia antiga recusada pelo provedor.";
    const deleteResult = await deleteWillianConnectyHubInstance().catch((deleteError) => ({
      warning: deleteError instanceof Error ? deleteError.message : "Nao foi possivel arquivar a instancia antiga.",
    }));
    steps.recreate = deleteResult;

    const recoveryName =
      "warning" in deleteResult
        ? `${instanceName || "willian-betel"}-${Date.now().toString(36)}`
        : instanceName;
    steps.createAfterRecovery = await createWillianConnectyHubInstance({ instanceName: recoveryName });
    connect = await connectWillianConnectyHubInstance({ phone, browser });
  }
  steps.connect = connect;

  try {
    steps.configureWebhookAfterConnect = await configureWillianWebhook();
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
    createdInstance: !beforeState.instanceTokenConfigured || Boolean(steps.createAfterRecovery),
    webhookConfigured: Boolean(steps.configureWebhookBeforeConnect || steps.configureWebhookAfterConnect),
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
    } else if (action === "testWebhook") {
      result = await testWillianWebhookDelivery();
    } else if (action === "webhookDeliveries") {
      result = await fetchWillianWebhookDeliveries();
    } else if (action === "syncOverview") {
      result = await fetchWillianConnectyHubDataOverview();
    } else if (action === "disconnect") {
      result = await disconnectWillianConnectyHubInstance();
    } else if (action === "reset") {
      result = await resetWillianConnectyHubInstance();
    } else if (action === "deleteInstance") {
      result = await deleteWillianConnectyHubInstance();
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
