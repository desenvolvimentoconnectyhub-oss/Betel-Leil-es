import { NextRequest, NextResponse } from "next/server";
import {
  createElevenLabsVoiceClone,
  getElevenLabsConfig,
  listElevenLabsVoices,
  synthesizeElevenLabsPreview,
  upsertElevenLabsConfigValue,
} from "@/lib/voice/elevenlabs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

export async function GET() {
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

  const authorized = cleanString(form.get("authorized")).toLowerCase() === "true";
  if (!authorized) {
    return NextResponse.json(
      { success: false, message: "Confirme a autorizacao do titular da voz antes de clonar." },
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

  if (totalBytes > 25 * 1024 * 1024) {
    return NextResponse.json(
      { success: false, message: "Amostras acima de 25MB. Reduza os arquivos e tente novamente." },
      { status: 400 }
    );
  }

  const result = await createElevenLabsVoiceClone({
    name: cleanString(form.get("name"), "Willian - Betel"),
    description: cleanString(form.get("description")),
    files,
  });

  return NextResponse.json({
    success: true,
    message: "Voz do Willian criada na ElevenLabs.",
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
      message: "Voz do Willian vinculada.",
      voiceId,
    });
  }

  if (action === "select_default_voice") {
    const voiceId = cleanString(body.voiceId);
    if (!voiceId) {
      return NextResponse.json(
        { success: false, message: "voiceId obrigatorio." },
        { status: 400 }
      );
    }

    await upsertElevenLabsConfigValue("elevenlabs_default_voice_id", voiceId);

    return NextResponse.json({
      success: true,
      message: "Voz padrao vinculada.",
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
