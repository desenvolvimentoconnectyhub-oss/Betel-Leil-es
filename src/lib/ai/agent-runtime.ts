import "server-only";

import { getActiveAIProvider, getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getAgentSystemPrompt } from "@/lib/ai/agent-prompts";

export type AgentRuntimeExecutionInput = {
  runCode: string;
  agentKey: string;
  agentName: string;
  role: string;
  promptName: string;
  promptVersion: string;
  systemPrompt: string;
  guardrails: string[];
  inputSummary: string;
  runtimeMode: string;
  provider?: string;
  model?: string;
  operatorLabel: string;
};

export type AgentRuntimeProviderResult = {
  runtimeMode: string;
  provider: string;
  model: string;
  status: "deterministic" | "completed" | "missing_credentials" | "unsupported_provider" | "provider_error";
  usedProvider: boolean;
  summary?: string;
  nextAction?: string;
  confidence?: number;
  rawText?: string;
  error?: string;
};

type RuntimeTarget = {
  runtimeMode: string;
  provider: string;
  model: string;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampText(value: string, maxLength = 1800) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

function asNumber(value: unknown, fallback?: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;

  try {
    return JSON.parse(fenced) as Record<string, unknown>;
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;

    try {
      return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

async function resolveRuntimeTarget(input: AgentRuntimeExecutionInput): Promise<RuntimeTarget> {
  const runtimeMode = asString(input.runtimeMode, "mock").toLowerCase();

  if (runtimeMode === "mock" || runtimeMode === "manual") {
    return {
      runtimeMode,
      provider: asString(input.provider, runtimeMode),
      model: asString(input.model, "betel-deterministic-v0"),
    };
  }

  const provider = asString(input.provider, await getActiveAIProvider()).toLowerCase();
  const model =
    asString(input.model) ||
    (provider === "gemini" ? await getGeminiModel() : "provider-configurado");

  return {
    runtimeMode,
    provider,
    model,
  };
}

function buildRuntimePrompt(input: AgentRuntimeExecutionInput) {
  const specializedPrompt = getAgentSystemPrompt(input.agentKey);

  if (specializedPrompt) {
    return [
      specializedPrompt,
      "",
      "---",
      `Run: ${input.runCode}`,
      `Operador: ${input.operatorLabel}`,
      "",
      "Entrada operacional:",
      clampText(input.inputSummary, 5000),
    ].join("\n");
  }

  return [
    "Voce e um agente operacional da Betel AI, uma plataforma SaaS para leiloes imobiliarios com IA.",
    "Responda apenas em JSON valido com as chaves summary, nextAction e confidence.",
    "Nao prometa lucro, nao invente fatos ausentes e sempre preserve gates humanos para risco juridico, comunicacao externa e lance.",
    "",
    `Run: ${input.runCode}`,
    `Agente: ${input.agentName} (${input.agentKey})`,
    `Funcao: ${input.role}`,
    `Prompt: ${input.promptName} ${input.promptVersion}`,
    `Operador: ${input.operatorLabel}`,
    `Guardrails: ${input.guardrails.join("; ") || "sem guardrails cadastrados"}`,
    "",
    "Entrada operacional:",
    clampText(input.inputSummary, 5000),
  ].join("\n");
}

async function executeGeminiRuntime(
  input: AgentRuntimeExecutionInput,
  target: RuntimeTarget
): Promise<AgentRuntimeProviderResult> {
  const apiKey = await getGeminiApiKey();

  if (!apiKey) {
    return {
      ...target,
      status: "missing_credentials",
      usedProvider: false,
      error: "Chave Gemini nao configurada.",
    };
  }

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: target.model });
    const result = await model.generateContent(buildRuntimePrompt(input));
    const rawText = result.response.text();
    const parsed = extractJsonObject(rawText);

    return {
      ...target,
      status: "completed",
      usedProvider: true,
      summary: asString(parsed?.summary, clampText(rawText, 1200)),
      nextAction: asString(parsed?.nextAction),
      confidence: asNumber(parsed?.confidence),
      rawText: clampText(rawText, 3000),
    };
  } catch (error) {
    return {
      ...target,
      status: "provider_error",
      usedProvider: false,
      error: error instanceof Error ? error.message : "Erro desconhecido no provider.",
    };
  }
}

export async function executeAgentRuntime(
  input: AgentRuntimeExecutionInput
): Promise<AgentRuntimeProviderResult> {
  const target = await resolveRuntimeTarget(input);

  if (target.runtimeMode === "mock" || target.runtimeMode === "manual") {
    return {
      ...target,
      status: "deterministic",
      usedProvider: false,
    };
  }

  if (target.provider === "gemini") {
    return executeGeminiRuntime(input, target);
  }

  return {
    ...target,
    status: "unsupported_provider",
    usedProvider: false,
    error: `Provider ${target.provider} ainda nao possui adapter ativo.`,
  };
}
