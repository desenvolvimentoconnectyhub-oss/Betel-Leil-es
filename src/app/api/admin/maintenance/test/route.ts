import { NextRequest, NextResponse } from "next/server";
import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { testElevenLabsConnection } from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TestResult = {
  success: boolean;
  integration: string;
  message: string;
  latencyMs: number;
};

async function testSupabase(): Promise<TestResult> {
  const start = Date.now();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { success: false, integration: "supabase", message: "Cliente admin indisponivel. Verifique URL e Service Role Key no .env.", latencyMs: Date.now() - start };
  }

  const { error } = await supabase.from("app_config").select("key").limit(1);
  const latencyMs = Date.now() - start;

  if (error) {
    return { success: false, integration: "supabase", message: `Erro: ${error.message}`, latencyMs };
  }

  return { success: true, integration: "supabase", message: `Conexao ativa. Resposta em ${latencyMs}ms.`, latencyMs };
}

async function testR2(): Promise<TestResult> {
  const start = Date.now();
  const endpoint = process.env.R2_ENDPOINT;
  const accessKey = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const publicBucket = process.env.R2_PUBLIC_BUCKET_NAME;

  if (!endpoint || !accessKey || !secretKey || !publicBucket) {
    return { success: false, integration: "r2", message: "Credenciais R2 incompletas.", latencyMs: Date.now() - start };
  }

  try {
    const client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    });

    await client.send(new HeadBucketCommand({ Bucket: publicBucket }));
    const latencyMs = Date.now() - start;
    return { success: true, integration: "r2", message: `Bucket "${publicBucket}" acessivel. Resposta em ${latencyMs}ms.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "r2", message: error instanceof Error ? error.message : "Falha ao conectar R2.", latencyMs: Date.now() - start };
  }
}

async function testInngest(): Promise<TestResult> {
  const start = Date.now();
  const appId = process.env.INNGEST_APP_ID;
  const eventKey = process.env.INNGEST_EVENT_KEY;

  if (!appId || !eventKey) {
    return { success: false, integration: "inngest", message: "INNGEST_APP_ID ou INNGEST_EVENT_KEY ausente.", latencyMs: Date.now() - start };
  }

  return { success: true, integration: "inngest", message: `App "${appId}" configurado. Chaves presentes.`, latencyMs: Date.now() - start };
}

async function testConnectyHub(): Promise<TestResult> {
  const start = Date.now();
  const baseUrl = process.env.CONNECTYHUB_API_URL;
  const token = process.env.CONNECTYHUB_API_TOKEN;

  if (!baseUrl || !token) {
    return { success: false, integration: "connectyhub", message: "CONNECTYHUB_API_URL ou CONNECTYHUB_API_TOKEN ausente.", latencyMs: Date.now() - start };
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/instances`, {
      headers: {
        authorization: `Bearer ${token}`,
        "x-connectyhub-api-key": token,
      },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, integration: "connectyhub", message: `ConnectyHub respondeu. Resposta em ${latencyMs}ms.`, latencyMs };
    }

    return { success: false, integration: "connectyhub", message: `ConnectyHub retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "connectyhub", message: error instanceof Error ? error.message : "Falha ao conectar ConnectyHub.", latencyMs: Date.now() - start };
  }
}

async function testGemini(): Promise<TestResult> {
  const start = Date.now();
  const [apiKey, model] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);

  if (!apiKey) {
    return { success: false, integration: "gemini", message: "API key Gemini nao configurada.", latencyMs: Date.now() - start };
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Responda apenas OK" }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 5 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    const latencyMs = Date.now() - start;

    if (res.ok) {
      return { success: true, integration: "gemini", message: `Gemini "${model}" respondeu OK. Resposta em ${latencyMs}ms.`, latencyMs };
    }

    const data = await res.json().catch(() => ({})) as { error?: { message?: string } };
    return { success: false, integration: "gemini", message: data?.error?.message || `Gemini retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "gemini", message: error instanceof Error ? error.message : "Falha ao conectar Gemini.", latencyMs: Date.now() - start };
  }
}

async function testResend(): Promise<TestResult> {
  const start = Date.now();
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.BETEL_EMAIL_FROM;
  if (!apiKey || !emailFrom) {
    return { success: false, integration: "resend", message: "RESEND_API_KEY ou BETEL_EMAIL_FROM ausente.", latencyMs: Date.now() - start };
  }
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, integration: "resend", message: `Resend API respondeu OK. Resposta em ${latencyMs}ms.`, latencyMs };
    }
    return { success: false, integration: "resend", message: `Resend retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "resend", message: error instanceof Error ? error.message : "Falha ao conectar Resend.", latencyMs: Date.now() - start };
  }
}

async function testElevenLabs(): Promise<TestResult> {
  const start = Date.now();
  try {
    const subscription = await testElevenLabsConnection();
    const latencyMs = Date.now() - start;
    const usage =
      subscription.characterLimit === null
        ? `${subscription.characterCount} caracteres usados`
        : `${subscription.characterCount}/${subscription.characterLimit} caracteres`;

    return {
      success: true,
      integration: "elevenlabs",
      message: `ElevenLabs respondeu. Plano ${subscription.tier}; ${usage}.`,
      latencyMs,
    };
  } catch (error: unknown) {
    return {
      success: false,
      integration: "elevenlabs",
      message: error instanceof Error ? error.message : "Falha ao conectar ElevenLabs.",
      latencyMs: Date.now() - start,
    };
  }
}

async function testIbge(): Promise<TestResult> {
  const start = Date.now();
  const baseUrl = process.env.BETEL_IBGE_API_BASE_URL || "https://servicodados.ibge.gov.br/api/v1/localidades";
  try {
    const res = await fetch(`${baseUrl}/estados?orderBy=nome`, { signal: AbortSignal.timeout(10000) });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { success: true, integration: "ibge", message: `IBGE API respondeu OK (${latencyMs}ms). API publica, sem chave necessaria.`, latencyMs };
    }
    return { success: false, integration: "ibge", message: `IBGE retornou ${res.status}.`, latencyMs };
  } catch (error: unknown) {
    return { success: false, integration: "ibge", message: error instanceof Error ? error.message : "Falha ao conectar IBGE.", latencyMs: Date.now() - start };
  }
}

function testEnvOnly(id: string, label: string, vars: string[]): () => Promise<TestResult> {
  return async () => {
    const start = Date.now();
    const missing = vars.filter((v) => !process.env[v]?.trim());
    if (missing.length > 0) {
      return { success: false, integration: id, message: `Variavel(is) ausente(s): ${missing.join(", ")}`, latencyMs: Date.now() - start };
    }
    return { success: true, integration: id, message: `${label} — chaves configuradas.`, latencyMs: Date.now() - start };
  };
}

const testMap: Record<string, () => Promise<TestResult>> = {
  supabase: testSupabase,
  r2: testR2,
  inngest: testInngest,
  connectyhub: testConnectyHub,
  gemini: testGemini,
  resend: testResend,
  elevenlabs: testElevenLabs,
  ibge: testIbge,
  datazap: testEnvOnly("datazap", "DataZAP+", ["BETEL_DATAZAP_API_BASE_URL", "BETEL_DATAZAP_API_KEY"]),
  fipezap: testEnvOnly("fipezap", "FipeZAP", ["BETEL_FIPEZAP_API_BASE_URL", "BETEL_FIPEZAP_API_KEY"]),
  datajud: testEnvOnly("datajud", "CNJ DataJud", ["BETEL_DATAJUD_API_BASE_URL", "BETEL_DATAJUD_API_KEY"]),
  receitaws: testEnvOnly("receitaws", "ReceitaWS", ["BETEL_RECEITAWS_API_BASE_URL", "BETEL_RECEITAWS_API_KEY"]),
  bigdata: testEnvOnly("bigdata", "BigData Corp", ["BETEL_BIG_DATA_API_BASE_URL", "BETEL_BIG_DATA_API_KEY"]),
  registry: testEnvOnly("registry", "ONR Registradores", ["BETEL_REGISTRY_API_BASE_URL", "BETEL_REGISTRY_API_KEY"]),
  infosimples: testEnvOnly("infosimples", "InfoSimples", ["BETEL_INFOSIMPLES_API_BASE_URL", "BETEL_INFOSIMPLES_API_KEY"]),
  serpro: testEnvOnly("serpro", "SerPro", ["BETEL_SERPRO_API_BASE_URL", "BETEL_SERPRO_API_KEY"]),
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { integration: string };
    const integrationId = String(body.integration || "").trim();

    const testFn = testMap[integrationId];
    if (!testFn) {
      return NextResponse.json(
        { success: false, message: `Integracao "${integrationId}" desconhecida.` },
        { status: 400 }
      );
    }

    const result = await testFn();
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao testar conexao.",
      },
      { status: 500 }
    );
  }
}
