import "server-only";

import { sendGlobalWhatsAppText, type WhatsAppActionButtonInput } from "@/lib/communication/connectyhub-client";

export type CommunicationDeliveryAdapterMode = "mock" | "manual" | "sandbox" | "provider";

export type CommunicationDeliveryAdapterInput = {
  messageCode: string;
  runCode: string;
  agentKey: string;
  channel: string;
  audience: string;
  recipientLabel: string;
  subject: string;
  messagePreview: string;
  guardrailSummary: string;
  actionButton?: WhatsAppActionButtonInput;
  payload: Record<string, unknown>;
  adapterMode: string;
  provider: string;
  operatorLabel: string;
  attempt: number;
  allowExternal?: boolean;
  providerReleaseConfirmed?: boolean;
  forceFail?: boolean;
};

export type CommunicationDeliveryAdapterResult = {
  status: "sent" | "failed";
  adapterMode: CommunicationDeliveryAdapterMode;
  provider: string;
  providerStatus: string;
  adapterLabel: string;
  channelKey: string;
  endpointConfigured: boolean;
  providerReleased: boolean;
  processedAt: string;
  latencyMs: number;
  requestPayload: Record<string, unknown>;
  errorMessage?: string;
  externalDeliveryId?: string;
  responsePreview?: string;
};

type ChannelAdapterConfig = {
  channelKey: string;
  adapterLabel: string;
  provider: string;
  endpointUrl: string;
  token: string;
  missing?: string[];
};

export type CommunicationProviderHealth = {
  channelKey: string;
  channel: string;
  adapterLabel: string;
  provider: string;
  endpointConfigured: boolean;
  tokenConfigured: boolean;
  providerReleased: boolean;
  readyForProvider: boolean;
  releaseEnvKeys: string[];
  status: "ready" | "blocked" | "missing_configuration";
  missing: string[];
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeAdapterMode(value: string): CommunicationDeliveryAdapterMode {
  const mode = value.toLowerCase();
  if (mode === "manual" || mode === "sandbox" || mode === "provider") return mode;
  return "mock";
}

function normalizeChannelKey(channel: string) {
  const text = channel
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (text.includes("whatsapp") || text.includes("wpp")) return "whatsapp";
  if (text.includes("email") || text.includes("mail")) return "email";
  if (text.includes("push")) return "push";
  if (text.includes("comunidade") || text.includes("community") || text.includes("grupo")) return "community";
  return "generic";
}

function deterministicLatency(seed: string) {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return 20 + (total % 110);
}

function preview(text: string, limit = 500) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function getHeaderToken(token: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBooleanEnv(value: string | undefined) {
  return ["1", "true", "yes", "sim", "on"].includes((value || "").trim().toLowerCase());
}

function providerReleaseEnvKeys(channelKey: string) {
  const channelEnv = `BETEL_${channelKey.toUpperCase()}_PROVIDER_RELEASED`;
  return [channelEnv, "BETEL_COMMUNICATION_PROVIDER_RELEASED"];
}

function isProviderReleasedByEnv(channelKey: string) {
  return providerReleaseEnvKeys(channelKey).some((key) => readBooleanEnv(process.env[key]));
}

function isProviderReleased(channelKey: string, confirmed?: boolean) {
  return Boolean(confirmed) || isProviderReleasedByEnv(channelKey);
}

function getChannelAdapterConfig(channel: string, provider: string): ChannelAdapterConfig {
  const channelKey = normalizeChannelKey(channel);
  const fallbackEndpoint = process.env.BETEL_COMMUNICATION_DELIVERY_WEBHOOK_URL || "";
  const fallbackToken = process.env.BETEL_COMMUNICATION_DELIVERY_TOKEN || "";

  if (channelKey === "whatsapp") {
    const baseUrl = (process.env.CONNECTYHUB_API_URL || "https://www.connectyhub.com.br/api/v1").replace(/\/+$/, "");
    const connectyhubEndpoint = baseUrl ? `${baseUrl}/messages/text` : "";

    return {
      channelKey,
      adapterLabel: "WhatsApp Global / ConnectyHub",
      provider: cleanString(provider, process.env.BETEL_WHATSAPP_PROVIDER || "connectyhub"),
      endpointUrl: process.env.BETEL_WHATSAPP_DELIVERY_WEBHOOK_URL || connectyhubEndpoint || fallbackEndpoint,
      token:
        process.env.BETEL_WHATSAPP_DELIVERY_TOKEN ||
        process.env.CONNECTYHUB_API_TOKEN ||
        fallbackToken,
    };
  }

  if (channelKey === "email") {
    const resolvedProvider = cleanString(provider, process.env.BETEL_EMAIL_PROVIDER || "email-webhook");
    const isResend = resolvedProvider.toLowerCase().includes("resend");
    const resendKey = process.env.RESEND_API_KEY || "";
    const resendFrom = process.env.BETEL_EMAIL_FROM || "";

    return {
      channelKey,
      adapterLabel: "Email",
      provider: resolvedProvider,
      endpointUrl: isResend ? "https://api.resend.com/emails" : process.env.BETEL_EMAIL_DELIVERY_WEBHOOK_URL || fallbackEndpoint,
      token: isResend ? resendKey : process.env.BETEL_EMAIL_DELIVERY_TOKEN || fallbackToken,
      missing: isResend && !resendFrom ? ["BETEL_EMAIL_FROM"] : [],
    };
  }

  if (channelKey === "push") {
    return {
      channelKey,
      adapterLabel: "Push",
      provider: cleanString(provider, process.env.BETEL_PUSH_PROVIDER || "push-webhook"),
      endpointUrl: process.env.BETEL_PUSH_DELIVERY_WEBHOOK_URL || fallbackEndpoint,
      token: process.env.BETEL_PUSH_DELIVERY_TOKEN || fallbackToken,
    };
  }

  if (channelKey === "community") {
    return {
      channelKey,
      adapterLabel: "Comunidade",
      provider: cleanString(provider, process.env.BETEL_COMMUNITY_PROVIDER || "community-webhook"),
      endpointUrl: process.env.BETEL_COMMUNITY_DELIVERY_WEBHOOK_URL || fallbackEndpoint,
      token: process.env.BETEL_COMMUNITY_DELIVERY_TOKEN || fallbackToken,
    };
  }

  return {
    channelKey,
    adapterLabel: "Canal generico",
    provider: cleanString(provider, process.env.BETEL_COMMUNICATION_PROVIDER || "generic-webhook"),
    endpointUrl: fallbackEndpoint,
    token: fallbackToken,
  };
}

export function getCommunicationProviderHealth(provider = ""): CommunicationProviderHealth[] {
  return [
    { channel: "WhatsApp", channelKey: "whatsapp" },
    { channel: "Email", channelKey: "email" },
    { channel: "Push", channelKey: "push" },
    { channel: "Comunidade", channelKey: "community" },
  ].map((item) => {
    const config = getChannelAdapterConfig(item.channel, provider);
    const endpointConfigured = Boolean(config.endpointUrl);
    const tokenConfigured = Boolean(config.token);
    const providerReleased = isProviderReleasedByEnv(config.channelKey);
    const missing = [
      !endpointConfigured ? "endpoint do provider" : "",
      !providerReleased ? "homologacao liberada" : "",
      !tokenConfigured ? "token de assinatura recomendado" : "",
      ...(config.missing || []),
    ].filter(Boolean);
    const readyForProvider = endpointConfigured && providerReleased && !(config.missing || []).length;
    const status = readyForProvider
      ? "ready"
      : endpointConfigured
        ? "blocked"
        : "missing_configuration";

    return {
      channelKey: config.channelKey,
      channel: item.channel,
      adapterLabel: config.adapterLabel,
      provider: config.provider,
      endpointConfigured,
      tokenConfigured,
      providerReleased,
      readyForProvider,
      releaseEnvKeys: providerReleaseEnvKeys(config.channelKey),
      status,
      missing,
    };
  });
}

function extractDeliveryId(text: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return cleanString(
      parsed.deliveryId || parsed.messageId || parsed.id || parsed.requestId || parsed.eventId,
      ""
    );
  } catch {
    return "";
  }
}

function recipientEmail(payload: Record<string, unknown>) {
  return cleanString(asRecord(payload.recipient).email);
}

async function sendResendEmail(input: CommunicationDeliveryAdapterInput) {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const apiKey = cleanString(process.env.RESEND_API_KEY);
  const from = cleanString(process.env.BETEL_EMAIL_FROM);
  const to = recipientEmail(input.payload);

  if (!apiKey || !from) {
    return {
      ok: false,
      endpointConfigured: false,
      providerStatus: "missing_configuration",
      latencyMs: Date.now() - startedMs,
      processedAt,
      errorMessage: "RESEND_API_KEY ou BETEL_EMAIL_FROM nao configurado.",
    };
  }

  if (!to) {
    return {
      ok: false,
      endpointConfigured: true,
      providerStatus: "missing_recipient_email",
      latencyMs: Date.now() - startedMs,
      processedAt,
      errorMessage: "Destinatario sem email para envio.",
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      body: JSON.stringify({
        from,
        to: [to],
        subject: input.subject || "Betel Leiloes",
        text: [
          input.messagePreview,
          input.guardrailSummary ? `\nObservacao: ${input.guardrailSummary}` : "",
        ].filter(Boolean).join("\n"),
      }),
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
    const responseText = preview(await response.text().catch(() => ""));
    const latencyMs = Math.max(Date.now() - startedMs, 1);

    if (!response.ok) {
      return {
        ok: false,
        endpointConfigured: true,
        providerStatus: `resend_http_${response.status}`,
        latencyMs,
        processedAt,
        responsePreview: responseText,
        errorMessage: `Resend retornou HTTP ${response.status}.`,
      };
    }

    return {
      ok: true,
      endpointConfigured: true,
      providerStatus: "resend_accepted",
      latencyMs,
      processedAt,
      externalDeliveryId: extractDeliveryId(responseText),
      responsePreview: responseText,
    };
  } catch (error) {
    return {
      ok: false,
      endpointConfigured: true,
      providerStatus: "resend_error",
      latencyMs: Math.max(Date.now() - startedMs, 1),
      processedAt,
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido no Resend.",
    };
  }
}

export async function executeCommunicationDeliveryAdapter(
  input: CommunicationDeliveryAdapterInput
): Promise<CommunicationDeliveryAdapterResult> {
  const startedMs = Date.now();
  const processedAt = new Date().toISOString();
  const adapterMode = normalizeAdapterMode(input.adapterMode);
  const config = getChannelAdapterConfig(input.channel, input.provider);
  const provider = cleanString(input.provider, config.provider);
  const providerReleased = isProviderReleased(config.channelKey, input.providerReleaseConfirmed);
  const requestPayload = {
    messageCode: input.messageCode,
    runCode: input.runCode,
    agentKey: input.agentKey,
    channel: input.channel,
    channelKey: config.channelKey,
    audience: input.audience,
    recipientLabel: input.recipientLabel,
    subject: input.subject,
    messagePreview: input.messagePreview,
    guardrailSummary: input.guardrailSummary,
    actionButton: input.actionButton,
    provider,
    providerReleased,
    operatorLabel: input.operatorLabel,
    attempt: input.attempt,
    payload: input.payload,
  };
  const base = {
    adapterMode,
    provider,
    adapterLabel: config.adapterLabel,
    channelKey: config.channelKey,
    endpointConfigured: Boolean(config.endpointUrl),
    providerReleased,
    processedAt,
    requestPayload,
  };

  if (input.forceFail) {
    return {
      ...base,
      status: "failed",
      providerStatus: "forced_failure",
      latencyMs: deterministicLatency(input.messageCode),
      errorMessage: "Falha forcada pelo operador para validar retry e auditoria.",
    };
  }

  if (adapterMode !== "provider") {
    return {
      ...base,
      status: "sent",
      providerStatus: adapterMode === "manual" ? "manual_confirmed" : `${adapterMode}_delivered`,
      latencyMs: deterministicLatency(input.messageCode),
    };
  }

  if (!input.allowExternal) {
    return {
      ...base,
      status: "failed",
      providerStatus: "external_not_authorized",
      latencyMs: deterministicLatency(input.messageCode),
      errorMessage: "Envio externo bloqueado: marque allowExternal apenas quando o provedor real estiver homologado.",
    };
  }

  if (!providerReleased) {
    return {
      ...base,
      status: "failed",
      providerStatus: "provider_not_released",
      latencyMs: deterministicLatency(input.messageCode),
      errorMessage:
        "Envio externo bloqueado: confirme a homologacao do provider no formulario ou libere a flag de ambiente do canal.",
    };
  }

  if (config.channelKey === "whatsapp") {
    const providerResult = await sendGlobalWhatsAppText({
      messageCode: input.messageCode,
      runCode: input.runCode,
      subject: input.subject,
      messagePreview: input.messagePreview,
      guardrailSummary: input.guardrailSummary,
      actionButton: input.actionButton,
      payload: input.payload,
    });

    return {
      ...base,
      endpointConfigured: providerResult.endpointConfigured,
      status: providerResult.ok ? "sent" : "failed",
      providerStatus: providerResult.providerStatus,
      processedAt: providerResult.processedAt,
      latencyMs: providerResult.latencyMs,
      externalDeliveryId: providerResult.externalDeliveryId,
      responsePreview: providerResult.responsePreview,
      errorMessage: providerResult.errorMessage,
    };
  }

  if (config.channelKey === "email" && provider.toLowerCase().includes("resend")) {
    const providerResult = await sendResendEmail(input);

    return {
      ...base,
      endpointConfigured: providerResult.endpointConfigured,
      status: providerResult.ok ? "sent" : "failed",
      providerStatus: providerResult.providerStatus,
      processedAt: providerResult.processedAt,
      latencyMs: providerResult.latencyMs,
      externalDeliveryId: providerResult.externalDeliveryId,
      responsePreview: providerResult.responsePreview,
      errorMessage: providerResult.errorMessage,
    };
  }

  if (!config.endpointUrl) {
    return {
      ...base,
      status: "failed",
      providerStatus: "missing_configuration",
      latencyMs: deterministicLatency(input.messageCode),
      errorMessage: `Webhook de entrega nao configurado para ${config.adapterLabel}.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(config.endpointUrl, {
      body: JSON.stringify(requestPayload),
      headers: {
        "content-type": "application/json",
        ...getHeaderToken(config.token),
      },
      method: "POST",
      signal: controller.signal,
    });
    const responseText = preview(await response.text().catch(() => ""));
    const externalDeliveryId = response.headers.get("x-delivery-id") || extractDeliveryId(responseText);
    const latencyMs = Math.max(Date.now() - startedMs, deterministicLatency(input.messageCode));

    if (!response.ok) {
      return {
        ...base,
        status: "failed",
        providerStatus: `provider_http_${response.status}`,
        latencyMs,
        responsePreview: responseText,
        errorMessage: `Provider ${provider} retornou HTTP ${response.status}.`,
      };
    }

    return {
      ...base,
      status: "sent",
      providerStatus: "provider_accepted",
      latencyMs,
      externalDeliveryId,
      responsePreview: responseText,
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      providerStatus: "provider_error",
      latencyMs: Math.max(Date.now() - startedMs, deterministicLatency(input.messageCode)),
      errorMessage: error instanceof Error ? error.message : "Erro desconhecido no adaptador externo.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
