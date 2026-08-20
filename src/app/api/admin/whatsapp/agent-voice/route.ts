import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  createElevenLabsVoiceClone,
  getElevenLabsConfig,
  listElevenLabsVoices,
  synthesizeElevenLabsPreview,
  upsertElevenLabsConfigValue,
} from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_VOICE_CLONE_UPLOAD_BYTES = 4 * 1024 * 1024;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro inesperado na ElevenLabs.";
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
    const [config, voices] = await Promise.all([getElevenLabsConfig(), listElevenLabsVoices()]);

    return NextResponse.json({
      success: true,
      voices,
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
      { status: 500 }
    );
  }
}

async function handleMultipart(request: NextRequest) {
  const form = await request.formData();
  const action = cleanString(form.get("action"));

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
  const result = await (async () => {
    try {
      return await createElevenLabsVoiceClone({
        name: voiceName,
        description: cleanString(form.get("description")),
        consentType,
        files,
      });
    } catch (error: unknown) {
      const samples = files
        .map((file) => `${cleanString(file.name, "audio")} (${formatFileSize(file.size)})`)
        .join(", ");
      throw new Error(`${getErrorMessage(error)} Amostra recebida pelo servidor: ${samples}.`);
    }
  })();

  return NextResponse.json({
    success: true,
    message: "Voz do agente criada na ElevenLabs.",
    fileCount: files.length,
    voiceName,
    voiceId: result.voiceId,
    requiresVerification: result.requiresVerification,
  });
}

async function handleJson(request: NextRequest) {
  const body = (await request.json()) as {
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

    await upsertElevenLabsConfigValue("elevenlabs_willian_voice_id", voiceId);

    return NextResponse.json({
      success: true,
      message: "Voz do agente vinculada.",
      voiceId,
    });
  }

  if (action === "synthesize_preview") {
    const audio = await synthesizeElevenLabsPreview({
      voiceId: body.voiceId,
      text: body.text,
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
      { status: 500 }
    );
  }
}
