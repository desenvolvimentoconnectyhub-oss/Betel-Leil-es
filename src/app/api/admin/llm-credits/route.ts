import { NextResponse } from "next/server";
import {
  getActiveAIProvider,
  getGeminiApiKey,
  getGeminiModel,
  normalizeGeminiModel,
} from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ProviderStatus = "ok" | "no_credits" | "invalid_key" | "missing_key" | "error";

type GeminiErrorPayload = {
  error?: {
    status?: string;
    message?: string;
  };
};

type GeminiModelDescriptor = {
  name?: string;
  supportedGenerationMethods?: string[];
};

const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-1.5-flash"];

function classifyGeminiError(status: number, payload: GeminiErrorPayload): ProviderStatus {
  const code = String(payload?.error?.status || "").toLowerCase();
  const msg = String(payload?.error?.message || "").toLowerCase();

  if (!status) return "error";
  if (status === 401 || status === 403 || msg.includes("api key not valid")) return "invalid_key";
  if (
    status === 429 ||
    code.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("billing") ||
    msg.includes("credit")
  ) {
    return "no_credits";
  }
  return "error";
}

async function testGeminiModel(apiKey: string, model: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: "Responda apenas OK" }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 5 },
      }),
    }
  );

  if (res.ok) return { ok: true, model, status: res.status, payload: {} };

  const payload = (await res.json().catch(() => ({}))) as GeminiErrorPayload;
  return { ok: false, model, status: res.status, payload };
}

async function listGeminiGenerationModels(apiKey: string): Promise<string[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
  );
  if (!res.ok) return [];

  const data = (await res.json().catch(() => ({}))) as { models?: GeminiModelDescriptor[] };
  const models = Array.isArray(data?.models) ? data.models : [];

  return models
    .filter(
      (model: GeminiModelDescriptor) =>
        Array.isArray(model?.supportedGenerationMethods) &&
        model.supportedGenerationMethods.includes("generateContent")
    )
    .map((model: GeminiModelDescriptor) => normalizeGeminiModel(model?.name))
    .filter(Boolean)
    .sort((a: string, b: string) => {
      const score = (model: string) => {
        if (model.includes("2.5") && model.includes("flash")) return 0;
        if (model.includes("flash")) return 1;
        if (model.includes("pro")) return 2;
        return 3;
      };
      return score(a) - score(b);
    });
}

export async function GET() {
  try {
    const [geminiKey, activeProvider, configuredGeminiModel] = await Promise.all([
      getGeminiApiKey(),
      getActiveAIProvider(),
      getGeminiModel(),
    ]);

    const result = {
      success: true,
      checked_at: new Date().toISOString(),
      active_provider: activeProvider,
      gemini: {
        configured: Boolean(geminiKey),
        model: configuredGeminiModel,
        status: "missing_key" as ProviderStatus,
        message: "Gemini API Key nao configurada.",
      },
    };

    if (!geminiKey) return NextResponse.json(result);

    const preferredModels = Array.from(
      new Set([configuredGeminiModel, ...GEMINI_FALLBACK_MODELS].filter(Boolean))
    );

    let lastTest: Awaited<ReturnType<typeof testGeminiModel>> | null = null;

    for (const model of preferredModels) {
      lastTest = await testGeminiModel(geminiKey, model);
      if (lastTest.ok) {
        result.gemini.status = "ok";
        result.gemini.message = `Gemini disponivel. Modelo testado: ${model}.`;
        result.gemini.model = model;
        break;
      }
    }

    if (result.gemini.status !== "ok") {
      const listedModels = await listGeminiGenerationModels(geminiKey);
      const remainingModels = listedModels
        .filter((model) => !preferredModels.includes(model))
        .slice(0, 5);

      for (const model of remainingModels) {
        lastTest = await testGeminiModel(geminiKey, model);
        if (lastTest.ok) {
          result.gemini.status = "ok";
          result.gemini.message = `Gemini disponivel. Modelo testado: ${model}.`;
          result.gemini.model = model;
          break;
        }
      }
    }

    if (result.gemini.status !== "ok" && lastTest) {
      result.gemini.status = classifyGeminiError(lastTest.status, lastTest.payload);
      result.gemini.message =
        lastTest.payload?.error?.message || `Gemini erro ${lastTest.status}`;
    }

    return NextResponse.json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro ao verificar status de creditos/quota.";
      return NextResponse.json(
        {
          success: false,
          message,
        },
        { status: 500 }
      );
  }
}
