import "server-only";

import { createHash } from "node:crypto";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WillianAgentConfig } from "@/lib/communication/willian-types";

type DbRow = Record<string, unknown>;

export type OfficialAvatarMatchResult = {
  enabled: boolean;
  match: boolean;
  confidence: number;
  threshold: number;
  source: "exact_hash" | "gemini_asset_compare" | "no_official_image" | "disabled" | "failed" | "unavailable";
  basis: "same_file" | "same_official_asset" | "not_official_asset" | "uncertain";
  officialImageUrl: string;
  reason: string;
  humorAllowed: boolean;
  checkedAt: string;
};

type OfficialImageAsset = {
  url: string;
  buffer: Buffer;
  mimeType: string;
  hash: string;
};

type OfficialAvatarComparison = Pick<OfficialAvatarMatchResult, "match" | "confidence" | "basis" | "reason">;

const OFFICIAL_IMAGE_CACHE_TTL_MS = 30 * 60_000;
const MAX_OFFICIAL_IMAGE_BYTES = 8 * 1024 * 1024;
const officialImageCache = new Map<string, { asset: OfficialImageAsset; loadedAt: number }>();

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function normalizeSearch(value: string) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeUrl(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  try {
    const url = new URL(clean);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function normalizeDataImage(value: unknown) {
  const clean = cleanString(value);
  const match = clean.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return "";
  const base64 = match[2].replace(/\s/g, "");
  const byteEstimate = Math.floor((base64.length * 3) / 4);
  if (byteEstimate > MAX_OFFICIAL_IMAGE_BYTES) return "";
  return `data:${match[1].toLowerCase()};base64,${base64}`;
}

function normalizeOfficialImageRef(value: unknown) {
  return normalizeUrl(value) || normalizeDataImage(value);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => cleanString(value)).filter(Boolean))];
}

function clampPercent(value: unknown, fallback = 88) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(50, Math.min(Math.trunc(numeric), 100));
}

function clampConfidence(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(Math.trunc(numeric), 100));
}

function sha256(buffer: Buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeAgentKeySegment(agentKey: string) {
  return cleanString(agentKey, "MULTICHANNEL_DISPATCH").toUpperCase().replace(/[^A-Z0-9]+/g, "_");
}

function readNestedOfficialImageUrls(...records: DbRow[]) {
  const urls: string[] = [];
  for (const record of records) {
    const metadata = asRecord(record.metadata);
    const whatsappProfile = asRecord(metadata.whatsappProfile || metadata.whatsapp_profile);
    const officialAvatar = asRecord(metadata.officialAvatar || metadata.official_avatar);
    urls.push(
      normalizeUrl(record.profileImageUrl),
      normalizeUrl(record.profile_image_url),
      normalizeOfficialImageRef(record.avatarIcon),
      normalizeOfficialImageRef(record.avatar_icon),
      normalizeUrl(metadata.profileImageUrl),
      normalizeUrl(metadata.profile_image_url),
      normalizeOfficialImageRef(metadata.avatarIcon),
      normalizeOfficialImageRef(metadata.avatar_icon),
      normalizeUrl(whatsappProfile.profileImageUrl),
      normalizeUrl(whatsappProfile.profile_image_url),
      normalizeUrl(officialAvatar.profileImageUrl),
      normalizeUrl(officialAvatar.profile_image_url),
      normalizeUrl(officialAvatar.url)
    );
  }
  return urls.filter(Boolean);
}

async function loadOfficialImageUrls(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  const keySegment = safeAgentKeySegment(agentKey);
  const urls: string[] = [];

  if (!supabase) return urls;

  const appConfigKeys = [
    `BETEL_WHATSAPP_AGENT_PROFILE_IMAGE_URL_${keySegment}`,
    `BETEL_WHATSAPP_AGENT_OFFICIAL_AVATAR_URL_${keySegment}`,
    "BETEL_GLOBAL_WHATSAPP_PROFILE_IMAGE_URL",
    "BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL",
  ];

  const [configResult, agentResult, instanceResult] = await Promise.all([
    supabase.from("app_config").select("key,value").in("key", appConfigKeys),
    supabase.from("ai_agents").select("metadata,avatar_icon").eq("agent_key", agentKey).maybeSingle(),
    supabase
      .from("whatsapp_instances")
      .select("agent_key,ai_agents(metadata,avatar_icon)")
      .eq("provider", "connectyhub")
      .eq("agent_key", agentKey)
      .limit(3),
  ]);

  for (const row of configResult.data || []) {
    urls.push(normalizeOfficialImageRef((row as DbRow).value));
  }

  urls.push(...readNestedOfficialImageUrls(asRecord(agentResult.data)));

  for (const row of instanceResult.data || []) {
    const agentRows = (row as DbRow).ai_agents;
    if (Array.isArray(agentRows)) {
      urls.push(...agentRows.flatMap((agentRow) => readNestedOfficialImageUrls(asRecord(agentRow))));
    } else {
      urls.push(...readNestedOfficialImageUrls(asRecord(agentRows)));
    }
  }

  return uniqueStrings(urls);
}

async function fetchOfficialImage(url: string): Promise<OfficialImageAsset | null> {
  const cached = officialImageCache.get(url);
  if (cached && Date.now() - cached.loadedAt <= OFFICIAL_IMAGE_CACHE_TTL_MS) return cached.asset;

  const dataImage = normalizeDataImage(url);
  if (dataImage) {
    const match = dataImage.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
    if (!match) return null;
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length) throw new Error("Avatar oficial inline sem bytes.");
    if (buffer.length > MAX_OFFICIAL_IMAGE_BYTES) throw new Error("Avatar oficial inline maior que 8MB.");
    const asset = {
      url,
      buffer,
      mimeType: match[1].toLowerCase(),
      hash: sha256(buffer),
    };
    officialImageCache.set(url, { asset, loadedAt: Date.now() });
    return asset;
  }

  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Nao foi possivel baixar foto oficial. HTTP ${response.status}.`);

  const contentType = cleanString(response.headers.get("content-type"), "image/jpeg").split(";")[0].toLowerCase();
  if (!contentType.startsWith("image/")) throw new Error(`Foto oficial nao e imagem: ${contentType}.`);

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > MAX_OFFICIAL_IMAGE_BYTES) throw new Error("Foto oficial maior que 8MB.");

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Foto oficial sem bytes.");
  if (buffer.length > MAX_OFFICIAL_IMAGE_BYTES) throw new Error("Foto oficial maior que 8MB.");

  const asset = {
    url,
    buffer,
    mimeType: contentType,
    hash: sha256(buffer),
  };
  officialImageCache.set(url, { asset, loadedAt: Date.now() });
  return asset;
}

function parseJsonObject(text: string) {
  const clean = cleanString(text);
  const match = clean.match(/\{[\s\S]*\}/);
  const json = match ? match[0] : clean;
  try {
    return JSON.parse(json) as DbRow;
  } catch {
    return {};
  }
}

async function compareOfficialAssetWithGemini(input: {
  official: OfficialImageAsset;
  inboundBuffer: Buffer;
  inboundMimeType: string;
}): Promise<OfficialAvatarComparison> {
  const apiKey = await getGeminiApiKey();
  const modelName = await getGeminiModel();
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente para comparar avatar oficial.");

  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0,
      topP: 0.8,
      maxOutputTokens: 220,
    },
  });

  const prompt = [
    "Compare a imagem A com a imagem B para decidir se B e o mesmo ATIVO OFICIAL da Betel ou uma captura/corte/repostagem dele.",
    "Imagem A e a foto/avatar oficial autorizado do agente no WhatsApp.",
    "Imagem B foi enviada por um lead.",
    "Regra de seguranca: nao identifique pessoa real, nao diga nome civil, nao use reconhecimento facial aberto e nao marque como positivo apenas por parecer a mesma pessoa em outra foto.",
    "Marque match=true somente se B parecer o mesmo arquivo, a mesma composicao, print, corte, repostagem ou variacao muito proxima da imagem oficial A.",
    "Retorne somente JSON: {\"match\":boolean,\"confidence\":number,\"basis\":\"same_official_asset|not_official_asset|uncertain\",\"reason\":\"frase curta\"}.",
  ].join("\n");

  const result = await model.generateContent([
    { text: prompt },
    {
      inlineData: {
        data: input.official.buffer.toString("base64"),
        mimeType: input.official.mimeType,
      },
    },
    {
      inlineData: {
        data: input.inboundBuffer.toString("base64"),
        mimeType: input.inboundMimeType,
      },
    },
  ]);

  const parsed = parseJsonObject(result.response.text());
  const basis = cleanString(parsed.basis);
  return {
    match: parsed.match === true,
    confidence: clampConfidence(parsed.confidence, 0),
    basis:
      basis === "same_official_asset" || basis === "not_official_asset" || basis === "uncertain"
        ? basis
        : "uncertain",
    reason: cleanString(parsed.reason, "comparacao visual concluida"),
  };
}

export async function detectOfficialAgentAvatarMatch(input: {
  agentKey: string;
  config: WillianAgentConfig;
  inboundBuffer: Buffer;
  inboundMimeType: string;
}): Promise<OfficialAvatarMatchResult | null> {
  const checkedAt = new Date().toISOString();
  const threshold = clampPercent(input.config.behavior.officialAvatarConfidence, 88);
  const humorAllowed = input.config.behavior.officialAvatarHumor !== false;

  if (input.config.behavior.recognizeOfficialAvatar !== true) {
    return {
      enabled: false,
      match: false,
      confidence: 0,
      threshold,
      source: "disabled",
      basis: "uncertain",
      officialImageUrl: "",
      reason: "Reconhecimento de avatar oficial desativado.",
      humorAllowed,
      checkedAt,
    };
  }

  try {
    const urls = await loadOfficialImageUrls(input.agentKey);
    if (!urls.length) {
      return {
        enabled: true,
        match: false,
        confidence: 0,
        threshold,
        source: "no_official_image",
        basis: "uncertain",
        officialImageUrl: "",
        reason: "Nenhuma foto/avatar oficial configurado para comparar.",
        humorAllowed,
        checkedAt,
      };
    }

    const inboundHash = sha256(input.inboundBuffer);
    let bestResult: OfficialAvatarMatchResult | null = null;
    for (const url of urls.slice(0, 3)) {
      let official: OfficialImageAsset | null = null;
      try {
        official = await fetchOfficialImage(url);
      } catch {
        continue;
      }
      if (!official) continue;

      if (official.hash === inboundHash) {
        return {
          enabled: true,
          match: true,
          confidence: 100,
          threshold,
          source: "exact_hash",
          basis: "same_file",
          officialImageUrl: url,
          reason: "Arquivo recebido tem o mesmo hash da foto oficial autorizada.",
          humorAllowed,
          checkedAt,
        };
      }

      let comparison: Awaited<ReturnType<typeof compareOfficialAssetWithGemini>>;
      try {
        comparison = await compareOfficialAssetWithGemini({
          official,
          inboundBuffer: input.inboundBuffer,
          inboundMimeType: input.inboundMimeType || "image/jpeg",
        });
      } catch {
        continue;
      }
      const confidence = comparison.confidence;
      const match = comparison.match && confidence >= threshold;
      const result: OfficialAvatarMatchResult = {
        enabled: true,
        match,
        confidence,
        threshold,
        source: "gemini_asset_compare",
        basis: comparison.basis,
        officialImageUrl: url,
        reason: comparison.reason,
        humorAllowed,
        checkedAt,
      };
      if (match) return result;
      if (!bestResult || result.confidence > bestResult.confidence) bestResult = result;
    }

    if (bestResult) return bestResult;

    return {
      enabled: true,
      match: false,
      confidence: 0,
      threshold,
      source: "unavailable",
      basis: "uncertain",
      officialImageUrl: "",
      reason: "Foto oficial nao ficou disponivel para comparacao.",
      humorAllowed,
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao comparar avatar oficial.";
    return {
      enabled: true,
      match: false,
      confidence: 0,
      threshold,
      source: "failed",
      basis: normalizeSearch(message).includes("gemini") ? "uncertain" : "not_official_asset",
      officialImageUrl: "",
      reason: message,
      humorAllowed,
      checkedAt,
    };
  }
}
