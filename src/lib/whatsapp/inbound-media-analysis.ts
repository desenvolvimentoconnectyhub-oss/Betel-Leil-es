import "server-only";

import { createHash } from "node:crypto";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  downloadWhatsAppAgentMessageMedia,
  type ConnectyHubMediaDownloadResult,
} from "@/lib/communication/connectyhub-client";
import type { WillianAgentConfig } from "@/lib/communication/willian-types";
import { putPublicR2Object, type StoredR2Object } from "@/lib/storage/r2";
import { detectOfficialAgentAvatarMatch, type OfficialAvatarMatchResult } from "./official-avatar-recognition";

export type InboundMediaKind = "image" | "video" | "document";

export type InboundMediaAnalysisResult = {
  kind: InboundMediaKind;
  enabled: boolean;
  caption: string;
  mediaUrl: string;
  mimeType: string;
  analysisText: string;
  runtimeText: string;
  source: "gemini" | "disabled" | "failed" | "limited" | "unavailable";
  storageUrl: string;
  storageKey: string;
  storageStatus: StoredR2Object["status"] | "skipped";
  temporary: boolean;
  expiresAt: string;
  retentionHours: number;
  officialAvatarMatch: OfficialAvatarMatchResult | null;
  sizeBytes: number | null;
  error: string;
  analyzedAt: string;
};

type DownloadedInboundMedia = {
  mediaUrl: string;
  mimeType: string;
  buffer: Buffer;
  source: "connectyhub_base64" | "connectyhub_url" | "direct_url";
};

type MediaDetectionInput = {
  messageType?: string;
  mediaMimeType?: string;
  mediaUrl?: string;
  payload?: unknown;
};

type AnalyzeInput = MediaDetectionInput & {
  agentKey: string;
  providerInstanceId: string;
  providerMessageId: string;
  chatId: string;
  caption?: string;
  config: WillianAgentConfig;
  leadId: string;
  conversationId: string;
  eventId: string;
  phone?: string;
};

const MAX_BYTES_BY_KIND: Record<InboundMediaKind, number> = {
  image: 12 * 1024 * 1024,
  video: 20 * 1024 * 1024,
  document: 12 * 1024 * 1024,
};
const DEFAULT_MEDIA_RETENTION_HOURS = 24;
const MAX_MEDIA_RETENTION_HOURS = 168;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clampText(value: string, limit = 2600) {
  const clean = value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(Math.trunc(numeric), max));
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function detectWhatsAppInboundMediaKind(input: MediaDetectionInput): InboundMediaKind | null {
  const signature = normalizeSearch(
    [
      input.messageType,
      input.mediaMimeType,
      input.mediaUrl,
    ].filter(Boolean).join(" ")
  );

  if (!signature) return null;

  if (
    signature.includes("audio") ||
    signature.includes("voice") ||
    signature.includes("ptt") ||
    signature.includes("opus") ||
    signature.includes("audiomessage")
  ) {
    return null;
  }

  if (
    signature.includes("image") ||
    signature.includes("photo") ||
    signature.includes("imagem") ||
    signature.includes("jpeg") ||
    signature.includes("jpg") ||
    signature.includes("png") ||
    signature.includes("webp")
  ) {
    return "image";
  }

  if (
    signature.includes("video") ||
    signature.includes("mp4") ||
    signature.includes("quicktime") ||
    signature.includes("ptv")
  ) {
    return "video";
  }

  if (
    signature.includes("document") ||
    signature.includes("documento") ||
    signature.includes("file") ||
    signature.includes("pdf") ||
    signature.includes("docx") ||
    signature.includes("xlsx") ||
    signature.includes("application/")
  ) {
    return "document";
  }

  return null;
}

function isMediaAnalysisEnabled(config: WillianAgentConfig, kind: InboundMediaKind) {
  if (kind === "image") return config.behavior.analyzeImages;
  if (kind === "video") return config.behavior.analyzeVideos;
  return config.behavior.analyzeDocuments;
}

function formatMediaKind(kind: InboundMediaKind) {
  if (kind === "image") return "Imagem";
  if (kind === "video") return "Video";
  return "Documento";
}

function defaultMimeType(kind: InboundMediaKind) {
  if (kind === "image") return "image/jpeg";
  if (kind === "video") return "video/mp4";
  return "application/pdf";
}

function fallbackMimeType(kind: InboundMediaKind, mimeType?: string) {
  const clean = cleanString(mimeType).split(";")[0]?.trim().toLowerCase();
  if (clean && clean !== "application/octet-stream") return clean;
  return defaultMimeType(kind);
}

function mediaAnalysisLimit(config: WillianAgentConfig, kind: InboundMediaKind) {
  if (kind === "image") return clampNumber(config.behavior.imageAnalysisLimit, 8, 0, 100);
  if (kind === "video") return clampNumber(config.behavior.videoAnalysisLimit, 2, 0, 100);
  return clampNumber(config.behavior.documentAnalysisLimit, 3, 0, 100);
}

async function countConversationMediaAnalyses(conversationId: string, kind: InboundMediaKind) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !conversationId) return 0;

  const { count, error } = await supabase
    .from("whatsapp_conversation_messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .eq("payload->betel_media_analysis->>kind", kind)
    .eq("payload->betel_media_analysis->>source", "gemini");

  if (error) return 0;
  return count || 0;
}

function mediaRetentionHours(config: WillianAgentConfig) {
  return clampNumber(
    config.behavior.mediaRetentionHours,
    DEFAULT_MEDIA_RETENTION_HOURS,
    1,
    MAX_MEDIA_RETENTION_HOURS
  );
}

function buildMediaExpiresAt(analyzedAt: string, retentionHours: number) {
  return new Date(new Date(analyzedAt).getTime() + retentionHours * 60 * 60 * 1000).toISOString();
}

function extensionForMime(mimeType: string, sourceUrl: string, kind: InboundMediaKind) {
  const clean = fallbackMimeType(kind, mimeType);
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/3gpp": "3gp",
    "video/quicktime": "mov",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
    "text/csv": "csv",
  };
  if (map[clean]) return map[clean];

  try {
    const ext = new URL(sourceUrl).pathname.split(".").pop()?.toLowerCase();
    if (ext && /^[a-z0-9]{2,6}$/.test(ext)) return ext;
  } catch {}

  if (kind === "image") return "jpg";
  if (kind === "video") return "mp4";
  return "bin";
}

function safeKeySegment(value: string, fallback: string) {
  return (value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 80) || fallback;
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isEncryptedWhatsAppMediaUrl(value: string) {
  const clean = cleanString(value).toLowerCase();
  return clean.includes(".enc?") || clean.endsWith(".enc") || clean.includes("mmg.whatsapp.net");
}

function base64ToBuffer(value: string) {
  const clean = cleanString(value)
    .replace(/^data:[^;]+;base64,/i, "")
    .replace(/\s/g, "");
  if (!clean) return null;

  try {
    const buffer = Buffer.from(clean, "base64");
    return buffer.length ? buffer : null;
  } catch {
    return null;
  }
}

function ensureReasonableSize(buffer: Buffer, kind: InboundMediaKind) {
  const maxBytes = MAX_BYTES_BY_KIND[kind];
  if (buffer.length > maxBytes) {
    throw new Error(`${formatMediaKind(kind)} maior que ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
  if (buffer.length < 64) {
    throw new Error(`${formatMediaKind(kind)} sem bytes suficientes para analise.`);
  }
}

async function fetchMediaUrl(input: {
  mediaUrl: string;
  mimeType: string;
  kind: InboundMediaKind;
  source: DownloadedInboundMedia["source"];
}): Promise<DownloadedInboundMedia> {
  if (!isHttpUrl(input.mediaUrl) || isEncryptedWhatsAppMediaUrl(input.mediaUrl)) {
    throw new Error("Link de midia nao pode ser baixado diretamente.");
  }

  const response = await fetch(input.mediaUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Nao foi possivel baixar midia. HTTP ${response.status}.`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_BYTES_BY_KIND[input.kind]) {
    throw new Error(`${formatMediaKind(input.kind)} maior que o limite de analise.`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  ensureReasonableSize(buffer, input.kind);

  return {
    mediaUrl: input.mediaUrl,
    mimeType: fallbackMimeType(input.kind, response.headers.get("content-type") || input.mimeType),
    buffer,
    source: input.source,
  };
}

async function loadInboundMedia(input: AnalyzeInput, kind: InboundMediaKind): Promise<DownloadedInboundMedia> {
  const fallbackMime = fallbackMimeType(kind, input.mediaMimeType);
  let lastError = "";

  if (input.providerMessageId && input.providerInstanceId) {
    try {
      const downloaded: ConnectyHubMediaDownloadResult = await downloadWhatsAppAgentMessageMedia({
        agentKey: input.agentKey,
        instanceId: input.providerInstanceId,
        messageId: input.providerMessageId,
        chatId: input.chatId,
        transcribe: false,
        returnLink: true,
        returnBase64: true,
        generateMp3: false,
        timeoutMs: 35_000,
      });
      const mimeType = fallbackMimeType(kind, downloaded.mimeType || fallbackMime);
      const base64Buffer = base64ToBuffer(downloaded.base64Data);

      if (base64Buffer) {
        ensureReasonableSize(base64Buffer, kind);
        return {
          mediaUrl: downloaded.fileUrl || input.mediaUrl || "",
          mimeType,
          buffer: base64Buffer,
          source: "connectyhub_base64",
        };
      }

      if (downloaded.fileUrl) {
        return fetchMediaUrl({
          mediaUrl: downloaded.fileUrl,
          mimeType,
          kind,
          source: "connectyhub_url",
        });
      }

      lastError = "ConnectyHub nao retornou base64 nem link publico.";
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Falha ao baixar midia pela ConnectyHub.";
    }
  }

  if (input.mediaUrl) {
    try {
      return await fetchMediaUrl({
        mediaUrl: input.mediaUrl,
        mimeType: fallbackMime,
        kind,
        source: "direct_url",
      });
    } catch (error) {
      lastError = lastError || (error instanceof Error ? error.message : "Falha ao baixar link direto da midia.");
    }
  }

  throw new Error(lastError || "Midia sem arquivo baixavel para analise.");
}

function buildMediaAnalysisPrompt(kind: InboundMediaKind, caption: string) {
  const lines = [
    `Analise esta ${formatMediaKind(kind).toLowerCase()} enviada por um lead no WhatsApp da Betel Leiloes.`,
    "Contexto: a Betel atende pessoas interessadas em leilao de imoveis, investimento, moradia, receio juridico, capital disponivel e reuniao com consultor.",
    "Retorne apenas uma analise objetiva em portugues do Brasil, sem markdown pesado.",
    "Extraia textos visiveis, valores, datas, enderecos, nomes, numeros de edital/processo, intencao do lead e pontos de risco ou duvida.",
    "Nao invente informacao que nao aparece no arquivo. Se estiver ilegivel, diga isso claramente.",
    caption ? `Legenda/mensagem do lead: ${caption}` : "",
  ].filter(Boolean);

  if (kind === "image") {
    lines.push("Se for print de imovel, edital, site, conversa, comprovante ou documento, identifique o tipo e os dados mais importantes.");
    lines.push("Se for foto/print de imovel, descreva o padrao do imovel: tipo, aparencia, acabamento, tamanho aparente, localizacao visivel, faixa de valor se aparecer e sinais de leilao.");
  } else if (kind === "video") {
    lines.push("Se for video, descreva o que aparece, telas, movimentos, textos e sinais uteis para responder o lead. Nao tente vender se o conteudo for incerto.");
    lines.push("Se for video de imovel, extraia padrao, ambiente, conservacao, tipo, localizacao visivel, valor se aparecer e qualquer pista para comparar com oportunidades da Betel.");
  } else {
    lines.push("Se for documento, resuma o tipo do documento e pontos comerciais/juridicos legiveis, sem dar parecer juridico definitivo.");
  }

  return lines.join("\n");
}

async function analyzeWithGemini(input: {
  kind: InboundMediaKind;
  buffer: Buffer;
  mimeType: string;
  caption: string;
}) {
  const apiKey = await getGeminiApiKey();
  const modelName = await getGeminiModel();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ausente para analisar midia.");
  }

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.15,
      topP: 0.8,
      maxOutputTokens: input.kind === "video" ? 1400 : 900,
    },
  });
  const result = await model.generateContent([
    {
      text: buildMediaAnalysisPrompt(input.kind, input.caption),
    },
    {
      inlineData: {
        data: input.buffer.toString("base64"),
        mimeType: input.mimeType,
      },
    },
  ]);

  return clampText(result.response.text(), 1800);
}

function buildMediaRuntimeText(input: {
  kind: InboundMediaKind;
  caption: string;
  analysisText: string;
  officialAvatarMatch: OfficialAvatarMatchResult | null;
  disabled: boolean;
  error: string;
}) {
  const base = input.caption
    ? `Mensagem/legenda do lead: ${input.caption}`
    : `O lead enviou ${formatMediaKind(input.kind).toLowerCase()} no WhatsApp.`;

  if (input.analysisText) {
    const officialAvatarGuidance = input.officialAvatarMatch?.match
      ? [
          "",
          "[IMAGEM OFICIAL DO AGENTE RECONHECIDA]",
          "A imagem enviada parece ser a foto/avatar oficial autorizado deste atendimento.",
          "Nao identifique pessoa real, nao diga nome civil e nao diga que reconheceu um terceiro.",
          "Se o contexto estiver leve, responda como 'essa parece minha foto de perfil' e pergunte o que o lead quer fazer com ela.",
          input.officialAvatarMatch.humorAllowed
            ? "Pode usar humor discreto, curto e natural."
            : "Mantenha resposta formal e objetiva, sem piada.",
        ].join("\n")
      : "";
    return [
      base,
      "",
      `[ANALISE AUTOMATICA DE ${formatMediaKind(input.kind).toUpperCase()}]`,
      input.analysisText,
      officialAvatarGuidance,
      "",
      "[ORIENTACAO INTERNA]",
      "Use a analise da midia como contexto real da conversa.",
      "Responda uma unica vez, de forma curta e natural, com no maximo uma pergunta.",
      "Se o lead perguntar se temos algo nesse nivel, compare a midia com os imoveis reais analisados no contexto. Nao invente estoque; diga que vai validar se nao houver oportunidade clara.",
      "Se algum dado estiver incerto, peca confirmacao em vez de chutar.",
    ].join("\n");
  }

  if (input.error.toLowerCase().includes("limite de analise")) {
    return [
      base,
      "",
      `[MIDIA RECEBIDA - LIMITE DE ANALISE DE ${formatMediaKind(input.kind).toUpperCase()} ATINGIDO]`,
      input.error,
      "Nao chute o conteudo. Se precisar, peca uma descricao curta do ponto principal.",
    ].join("\n");
  }

  if (input.disabled) {
    return [
      base,
      "",
      `[MIDIA RECEBIDA - ANALISE DE ${formatMediaKind(input.kind).toUpperCase()} DESATIVADA]`,
      "Nao finja que viu o conteudo. Se precisar entender a midia, peca uma descricao curta de forma natural.",
    ].join("\n");
  }

  return [
    base,
    "",
    "[MIDIA RECEBIDA - SEM ANALISE CONFIAVEL]",
    input.error || "A midia nao ficou disponivel para analise automatica nesta execucao.",
    "Nao chute o conteudo. Peca uma descricao curta ou reenvio legivel.",
  ].join("\n");
}

async function storeLeadMedia(input: {
  media: DownloadedInboundMedia;
  kind: InboundMediaKind;
  leadId: string;
  conversationId: string;
  eventId: string;
  providerMessageId: string;
  phone?: string;
  temporary: boolean;
  expiresAt: string;
  retentionHours: number;
}) {
  const leadSegment = safeKeySegment(input.leadId || input.phone || "lead", "lead");
  const conversationSegment = safeKeySegment(input.conversationId || "conversation", "conversation");
  const seed = [
    input.eventId,
    input.providerMessageId,
    input.media.mediaUrl,
    String(input.media.buffer.length),
    Date.now().toString(36),
  ].filter(Boolean).join(":");
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 12);
  const extension = extensionForMime(input.media.mimeType, input.media.mediaUrl, input.kind);
  const storageKey = input.temporary
    ? `whatsapp-temp/${leadSegment}/${conversationSegment}/${hash}.${extension}`
    : `whatsapp-leads/${leadSegment}/${conversationSegment}/${hash}.${extension}`;

  return putPublicR2Object({
    storageKey,
    body: input.media.buffer,
    contentType: input.media.mimeType,
    cacheControl: input.temporary ? "public, max-age=300, must-revalidate" : undefined,
    metadata: input.temporary
      ? {
          temporary: "true",
          expiresAt: input.expiresAt,
          retentionHours: String(input.retentionHours),
          source: "whatsapp_lead_media",
        }
      : undefined,
    expiresAt: input.temporary ? input.expiresAt : undefined,
  });
}

export async function maybeAnalyzeInboundMedia(input: AnalyzeInput): Promise<InboundMediaAnalysisResult | null> {
  const kind = detectWhatsAppInboundMediaKind(input);
  if (!kind) return null;

  const analyzedAt = new Date().toISOString();
  const caption = clampText(cleanString(input.caption), 900);
  const enabled = isMediaAnalysisEnabled(input.config, kind);
  const analysisLimit = mediaAnalysisLimit(input.config, kind);
  const previousAnalyses = enabled ? await countConversationMediaAnalyses(input.conversationId, kind) : 0;
  const limitReached = enabled && previousAnalyses >= analysisLimit;
  const saveLeadFiles = input.config.behavior.saveLeadFiles;
  const temporary = input.config.behavior.temporaryMediaStorage !== false;
  const retentionHours = temporary ? mediaRetentionHours(input.config) : 0;
  const expiresAt = temporary ? buildMediaExpiresAt(analyzedAt, retentionHours) : "";
  const fallbackUrl = cleanString(input.mediaUrl);
  const fallbackMime = fallbackMimeType(kind, input.mediaMimeType);

  let media: DownloadedInboundMedia | null = null;
  let storage: StoredR2Object | null = null;
  let officialAvatarMatch: OfficialAvatarMatchResult | null = null;
  let analysisText = "";
  let error = "";
  let source: InboundMediaAnalysisResult["source"] = enabled ? "unavailable" : "disabled";

  if (limitReached) {
    error = `Limite de analise de ${formatMediaKind(kind).toLowerCase()} atingido nesta conversa (${analysisLimit}).`;
    source = "limited";
  }

  if (!limitReached) {
    try {
      media = await loadInboundMedia(input, kind);
    } catch (downloadError) {
      error = downloadError instanceof Error ? downloadError.message : "Falha ao baixar midia.";
    }
  }

  if (media && saveLeadFiles) {
    storage = await storeLeadMedia({
      media,
      kind,
      leadId: input.leadId,
      conversationId: input.conversationId,
      eventId: input.eventId,
      providerMessageId: input.providerMessageId,
      phone: input.phone,
      temporary,
      expiresAt,
      retentionHours,
    });
    if (storage.status !== "stored" && storage.error) {
      error = error || storage.error;
    }
  }

  if (enabled && !limitReached && media) {
    try {
      analysisText = await analyzeWithGemini({
        kind,
        buffer: media.buffer,
        mimeType: media.mimeType,
        caption,
      });
      source = analysisText ? "gemini" : "unavailable";
    } catch (analysisError) {
      error = analysisError instanceof Error ? analysisError.message : "Falha ao analisar midia com Gemini.";
      source = "failed";
    }
  }

  if (kind === "image" && media && input.config.behavior.recognizeOfficialAvatar) {
    officialAvatarMatch = await detectOfficialAgentAvatarMatch({
      agentKey: input.agentKey,
      config: input.config,
      inboundBuffer: media.buffer,
      inboundMimeType: media.mimeType,
    });
  }

  const runtimeText = buildMediaRuntimeText({
    kind,
    caption,
    analysisText,
    officialAvatarMatch,
    disabled: !enabled,
    error,
  });

  return {
    kind,
    enabled,
    caption,
    mediaUrl: storage?.url || media?.mediaUrl || fallbackUrl,
    mimeType: media?.mimeType || fallbackMime,
    analysisText,
    runtimeText: clampText(runtimeText, 3600),
    source,
    storageUrl: storage?.url || "",
    storageKey: storage?.storageKey || "",
    storageStatus: storage?.status || (saveLeadFiles ? "unavailable" : "skipped"),
    temporary,
    expiresAt,
    retentionHours,
    officialAvatarMatch,
    sizeBytes: media?.buffer.length ?? null,
    error,
    analyzedAt,
  };
}
