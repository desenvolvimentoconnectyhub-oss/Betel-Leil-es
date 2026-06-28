import { NextResponse } from "next/server";
import { getGeminiApiKey, getGeminiModel, normalizeGeminiModel } from "@/lib/ai/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GeminiModelDescriptor = {
  name?: string;
  displayName?: string;
  description?: string;
  supportedGenerationMethods?: string[];
  inputTokenLimit?: number;
  outputTokenLimit?: number;
};

export async function GET() {
  try {
    const [apiKey, currentModel] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);

    if (!apiKey) {
      return NextResponse.json({
        success: false,
        message: "API key Gemini nao configurada.",
        models: [],
        current: currentModel,
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=100`
    );

    if (!res.ok) {
      return NextResponse.json({
        success: false,
        message: `Gemini API retornou ${res.status}.`,
        models: [],
        current: currentModel,
      });
    }

    const data = (await res.json().catch(() => ({}))) as { models?: GeminiModelDescriptor[] };
    const rawModels = Array.isArray(data?.models) ? data.models : [];

    const models = rawModels
      .filter(
        (m) =>
          Array.isArray(m?.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes("generateContent")
      )
      .map((m) => ({
        id: normalizeGeminiModel(m?.name),
        name: m?.displayName || normalizeGeminiModel(m?.name),
        description: m?.description || "",
        inputTokenLimit: m?.inputTokenLimit || 0,
        outputTokenLimit: m?.outputTokenLimit || 0,
      }))
      .filter((m) => m.id)
      .sort((a, b) => {
        const score = (id: string) => {
          if (id.includes("2.5") && id.includes("flash")) return 0;
          if (id.includes("2.5") && id.includes("pro")) return 1;
          if (id.includes("2.0") && id.includes("flash")) return 2;
          if (id.includes("flash")) return 3;
          if (id.includes("pro")) return 4;
          return 5;
        };
        return score(a.id) - score(b.id);
      });

    return NextResponse.json({
      success: true,
      models,
      current: currentModel,
      total: models.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao listar modelos.",
        models: [],
        current: "gemini-2.5-flash",
      },
      { status: 500 }
    );
  }
}
