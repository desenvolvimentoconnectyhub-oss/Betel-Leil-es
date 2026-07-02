import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = "") {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return fallback;
  return String(value) || fallback;
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const nonPropertyImageSignals = [
  "logo",
  "sprite",
  "icon",
  "favicon",
  "placeholder",
  "loading",
  "captcha",
  "whatsapp",
  "facebook",
  "instagram",
  "vendedor",
  "seller",
  "modal-home",
  "layout",
  "banner",
  "brand",
  "marca",
  "santander",
];

function isLikelyPropertyImageUrl(url) {
  const normalized = normalize(url);
  if (!/^https?:\/\//i.test(url)) return false;
  if (nonPropertyImageSignals.some((signal) => normalized.includes(signal))) return false;
  return (
    /\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url) ||
    normalized.includes("imagem") ||
    normalized.includes("image") ||
    normalized.includes("foto") ||
    normalized.includes("photo") ||
    normalized.includes("cdn")
  );
}

const genericSourceSignals = [
  "duvidas",
  "legislacao",
  "como-funciona",
  "o-que-e",
  "quem-somos",
  "sobre",
  "contato",
  "blog",
  "noticia",
  "artigo",
  "faq",
  "termos",
  "politica",
];

function normalizeComparableUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return "";
  }
}

function looksLikeWeakPropertySourceUrl(sourceUrl) {
  const normalized = normalize(sourceUrl);
  if (genericSourceSignals.some((signal) => normalized.includes(signal))) return true;

  try {
    const url = new URL(sourceUrl);
    const host = normalize(url.hostname);
    const pathName = normalize(url.pathname).replace(/\/+$/, "") || "/";
    const search = normalize(url.search);
    const hasIdentifier = /\d/.test(`${pathName}${search}`);
    const hasDetailSignal =
      /\/sale\/detail\b/.test(pathName) ||
      /\/(?:detail|detalhe|lote|lotes|lot|lots|imovel|property|properties|bem|item|edital)\b/.test(pathName) ||
      /(?:^|[?&])(?:id|lot|lote|bem|item)=\d/i.test(url.search);

    if (!url.pathname || url.pathname === "/") return true;
    if (host.includes("biasileiloes.com.br") && /^\/leilao(?:\/|$)/.test(pathName)) return true;
    if (/^\/(?:imoveis|properties)$/.test(pathName)) return true;
    if (/^\/(?:leilao|leiloes)(?:\/|$)/.test(pathName) && !hasDetailSignal) return true;

    return !hasDetailSignal && !hasIdentifier;
  } catch {
    return true;
  }
}

function isLikelyExactPropertySourceUrl(sourceUrl, targetUrl = "") {
  const source = String(sourceUrl || "").trim();
  const normalizedSource = normalizeComparableUrl(source);
  const normalizedTarget = normalizeComparableUrl(String(targetUrl || "").trim());

  if (!normalizedSource || !normalizedSource.startsWith("http")) return false;
  if (normalizedTarget && normalizedSource === normalizedTarget) return false;
  return !looksLikeWeakPropertySourceUrl(source);
}

function opportunitySourceUrl(row) {
  const rawPayload = asRecord(row.raw_payload);
  const candidate = asRecord(rawPayload.candidate);
  return asString(rawPayload.sourceUrl, asString(candidate.sourceUrl, asString(rawPayload.targetUrl))).trim();
}

function opportunityImages(rawPayloadValue) {
  const rawPayload = asRecord(rawPayloadValue);
  const media = asRecord(rawPayload.media);
  const candidate = asRecord(rawPayload.candidate);
  const images = Array.isArray(media.images) ? media.images : [];
  const normalizedImages = images
    .map((image) => {
      const record = asRecord(image);
      return {
        url: asString(record.url),
        sourceUrl: asString(record.sourceUrl, asString(record.url)),
        status: asString(record.status),
      };
    })
    .filter((image) => Boolean(image.url) && image.status !== "failed" && isLikelyPropertyImageUrl(image.sourceUrl || image.url));

  if (normalizedImages.length) return normalizedImages;

  const fallbackUrls = [
    ...(Array.isArray(media.sourceImageUrls) ? media.sourceImageUrls : []),
    ...(Array.isArray(candidate.imageUrls) ? candidate.imageUrls : []),
    ...(Array.isArray(rawPayload.imageUrls) ? rawPayload.imageUrls : []),
  ];
  const seen = new Set();
  return fallbackUrls
    .map((url) => String(url || "").trim())
    .filter(Boolean)
    .filter(isLikelyPropertyImageUrl)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .map((url) => ({ url, sourceUrl: url, status: "external" }));
}

function visibleStatus(row) {
  return `${asString(row.stage)} ${asString(row.ai_status)} ${asString(row.legal_status)}`.toLowerCase();
}

function assessOpportunity(row) {
  const rawPayload = asRecord(row.raw_payload);
  const sourceUrl = opportunitySourceUrl(row);
  const sourceOk = isLikelyExactPropertySourceUrl(sourceUrl, asString(rawPayload.targetUrl));
  const images = opportunityImages(row.raw_payload);
  const hasValue = Number(row.initial_bid || 0) > 0 || Number(row.appraisal_value || 0) > 0;
  const alreadyDiscarded = visibleStatus(row).includes("descart");
  const shouldDiscard = !alreadyDiscarded && (!sourceOk || !hasValue || images.length === 0);
  const reasons = [];
  if (!sourceOk) reasons.push("fonte sem link individual do imovel");
  if (!hasValue) reasons.push("sem valor informado");
  if (!images.length) reasons.push("sem foto real do imovel");

  return { sourceUrl, sourceOk, hasValue, imageCount: images.length, shouldDiscard, reasons };
}

function nextRawPayload(row, assessment) {
  const rawPayload = asRecord(row.raw_payload);
  return {
    ...rawPayload,
    qualityGate: {
      ...asRecord(rawPayload.qualityGate),
      exactSourceUrlRequired: true,
      sourceUrlQualityCheckedAt: new Date().toISOString(),
      portfolioRejected: true,
      portfolioRejectedReasons: assessment.reasons,
    },
  };
}

async function main() {
  const mode = process.argv.includes("--apply") ? "apply" : "audit";
  loadEnv(path.join(process.cwd(), ".env.local"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("Supabase admin env ausente.");

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("id, code, title, source_name, stage, ai_status, legal_status, initial_bid, appraisal_value, raw_payload, timeline, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) throw error;

  const bad = (data || [])
    .map((row) => ({ row, assessment: assessOpportunity(row) }))
    .filter((item) => item.assessment.shouldDiscard);

  if (mode === "apply") {
    for (const item of bad) {
      const currentTimeline = Array.isArray(item.row.timeline) ? item.row.timeline : [];
      const now = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("auction_opportunities")
        .update({
          stage: "Descartado",
          ai_status: "Fora do portfolio",
          legal_status: "Descartado",
          next_action: `Removido do portfolio: ${item.assessment.reasons.join(", ")}.`,
          raw_payload: nextRawPayload(item.row, item.assessment),
          timeline: [
            ...currentTimeline,
            {
              time: now,
              actor: "Renata - Buscadora de Imoveis",
              action: `Registro descartado automaticamente: ${item.assessment.reasons.join(", ")}.`,
              tone: "red",
            },
          ],
          updated_at: now,
        })
        .eq("id", item.row.id);

      if (updateError) throw updateError;
    }
  }

  console.log(JSON.stringify({
    mode,
    scanned: data?.length || 0,
    rejected: bad.length,
    items: bad.map((item) => ({
      code: item.row.code,
      title: item.row.title,
      sourceName: item.row.source_name,
      sourceUrl: item.assessment.sourceUrl,
      sourceOk: item.assessment.sourceOk,
      hasValue: item.assessment.hasValue,
      imageCount: item.assessment.imageCount,
      reasons: item.assessment.reasons,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
