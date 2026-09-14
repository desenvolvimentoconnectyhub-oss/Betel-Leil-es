import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { createConnectyHubVoiceClone } from "@/lib/voice/clones";
import { getConnectyHubVoiceConfig, saveConnectyHubVoiceSelection } from "@/lib/voice/config";
import { listConnectyHubVoices, listConnectyHubVoiceModels, synthesizeConnectyHubVoice, previewConnectyHubClone } from "@/lib/voice/connectyhub";
import { ConnectyHubVoiceError } from "@/lib/voice/transport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_VOICE_CLONE_UPLOAD_BYTES = 3 * 1024 * 1024;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado na ConnectyHub Voz.";
}

function isAudioFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    "name" in value &&
    "size" in value &&
    typeof (value as File).arrayBuffer === "function"
  );
}

function formBoolean(form: FormData, key: string) {
  return cleanString(form.get(key)).toLowerCase() === "true";
}

export async function GET() {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  try {
    const [config, voices, models] = await Promise.all([getConnectyHubVoiceConfig(), listConnectyHubVoices(), listConnectyHubVoiceModels()]);

    return NextResponse.json({
      success: true,
      voices,
      models,
      config: {
        defaultModelId: config.defaultModelId.value,
        defaultVoiceId: config.defaultVoiceId.value,
        willianVoiceId: config.willianVoiceId.value,
        apiKeyConfigured: Boolean(config.apiKey.value),
      },
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error),
        voices: [],
      },
      { status: error instanceof ConnectyHubVoiceError ? error.status : 500 }
    );
  }
}

async function handleMultipart(request: NextRequest) {
  const form = await request.formData();
  const action = cleanString(form.get("action"));
  const operationId = cleanString(form.get("operationId"));
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(operationId)) return NextResponse.json({ success: false, message: "Identificador da clonagem obrigatorio." }, { status: 400 });

  if (action !== "clone_willian") {
    return NextResponse.json(
      { success: false, message: `Acao "${action}" invalida para upload.` },
      { status: 400 }
    );
  }

  const authorized = formBoolean(form, "authorized");
  const consentType = cleanString(form.get("consentType"), "authorized_voice");
  const consentAccepted = authorized && ["own_voice", "authorized_voice", "company_authorization"].includes(consentType);

  if (!consentAccepted) {
    return NextResponse.json(
      {
        success: false,
        message:
          "Antes de clonar, confirme que voce tem direito e consentimento para usar esta voz.",
      },
      { status: 400 }
    );
  }

  const files = [...form.getAll("files"), ...form.getAll("files[]")].filter(isAudioFile);
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  if (files.length === 0) {
    return NextResponse.json(
      { success: false, message: "Envie ao menos uma amostra de audio." },
      { status: 400 }
    );
  }

  if (totalBytes > MAX_VOICE_CLONE_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        success: false,
        message: `Amostras acima de ${formatFileSize(MAX_VOICE_CLONE_UPLOAD_BYTES)}. Envie um audio menor ou compacte o arquivo.`,
      },
      { status: 400 }
    );
  }

  const voiceName = cleanString(form.get("name"), "Agente Betel");
  const result = await createConnectyHubVoiceClone({ operationId, name: voiceName, authorized: consentAccepted, files });

  return NextResponse.json({
    success: true,
    message: "Voz do agente criada na ConnectyHub Voz.",
    fileCount: files.length,
    voiceName,
    voiceId: result.voiceId,
    requiresVerification: result.requiresVerification,
    chargedCredits: result.chargedCredits,
    generationId: result.generationId,
  });
}

async function handleJson(request: NextRequest) {
  const body = (await request.json()) as {
    operationId?: string;
    action?: string;
    voiceId?: string;
    text?: string;
    modelId?: string;
  };
  const action = cleanString(body.action);

  if (action === "select_willian_voice") {
    const voiceId = cleanString(body.voiceId);
    if (!voiceId) {
      return NextResponse.json(
        { success: false, message: "voiceId obrigatorio." },
        { status: 400 }
      );
    }

    const voices = await listConnectyHubVoices();
    if (!voices.some(voice => voice.voiceId === voiceId)) return NextResponse.json({ success: false, message: "Voz indisponivel no projeto Betel." }, { status: 404 });
    await saveConnectyHubVoiceSelection(voiceId);

    return NextResponse.json({
      success: true,
      message: "Voz do agente vinculada.",
      voiceId,
    });
  }

  if (action === "included_clone_preview") {
    const audio = await previewConnectyHubClone(cleanString(body.voiceId));
    return NextResponse.json({ success: true, message: "Previa incluida do clone.", audio });
  }

  if (action === "synthesize_preview") {
    if (!/^[a-zA-Z0-9_-]{8,120}$/.test(cleanString(body.operationId))) return NextResponse.json({ success: false, message: "Identificador do teste de voz obrigatorio." }, { status: 400 });
    const audio = await synthesizeConnectyHubVoice({
      operationId: cleanString(body.operationId),
      voiceId: body.voiceId,
      text: cleanString(body.text),
      modelId: body.modelId,
    });

    return NextResponse.json({
      success: true,
      message: "Audio gerado.",
      audio,
    });
  }

  return NextResponse.json(
    { success: false, message: `Acao "${action}" desconhecida.` },
    { status: 400 }
  );
}

export async function POST(request: NextRequest) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      return await handleMultipart(request);
    }

    return await handleJson(request);
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: getErrorMessage(error),
      },
      { status: error instanceof ConnectyHubVoiceError ? error.status : 500 }
    );
  }
}
