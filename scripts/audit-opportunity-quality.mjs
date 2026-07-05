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

const strongRealEstateSignals = [
  ["imovel", /\bimove?is?\b/],
  ["apartamento", /\b(?:apartamento|apto)\b/],
  ["casa", /\b(?:casa|sobrado|condominio)\b/],
  ["terreno", /\b(?:terreno|gleba)\b/],
  ["lote-terreno", /\blote(?:s)?\s+(?:de\s+)?(?:terreno|terra|urbano|residencial|comercial|industrial|rural)\b/],
  ["lote-quadra", /\blote(?:s)?\b.{0,48}\bquadra\b/],
  ["loteamento", /\bloteamento\b/],
  ["comercial", /\b(?:sala comercial|loja comercial|galp(?:ao|oes)|predio|edificio|barracao)\b/],
  ["complexo-industrial", /\bcomplexo industrial\b/],
  ["area-medida", /\barea\s+(?:de\s+)?\d+(?:[.,]\d+)?\s*(?:ha|hectare|hectares|m(?:2|\u00b2)|metros?)\b/],
  ["rural", /\b(?:fazenda|sitio|chacara|area rural)\b/],
  ["matricula", /\b(?:matricula|inscricao imobiliaria|unidade autonoma)\b/],
];

const weakRealEstateSignals = [
  ["lote", /\blote(?:s)?\b/],
  ["bem", /\bbem\b/],
  ["edital", /\bedital\b/],
];

const nonRealEstateSignals = [
  ["veiculo", /\b(?:veiculo|veiculos|automovel|automoveis|carro|carros|moto|motocicleta)\b/],
  ["pesado", /\b(?:caminhao|caminhoes|onibus|trator|tratores|empilhadeira)\b/],
  ["maquina", /\b(?:maquina|maquinas|maquinario)\b/],
  ["equipamento", /\b(?:equipamento|equipamentos|ferramenta|ferramentas)\b/],
  ["material", /\b(?:material|materiais|estoque|mercadoria|mercadorias|diversos)\b/],
  ["movel", /\b(?:movel|moveis|mobiliario|eletrodomestico|eletrodomesticos)\b/],
  ["eletronico", /\b(?:informatica|notebook|computador|celular|telefone)\b/],
  ["sucata", /\b(?:sucata|sucatas)\b/],
  ["joia", /\b(?:joia|joias|relogio|relogios)\b/],
  ["embarcacao", /\b(?:embarcacao|embarcacoes|barco|aeronave)\b/],
  ["semovente", /\b(?:gado|semovente|semoventes)\b/],
];

function compactUnknown(value, depth = 0) {
  if (depth > 2) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactUnknown(item, depth + 1)).join(" ");

  return Object.entries(value)
    .slice(0, 50)
    .map(([key, item]) => `${key} ${compactUnknown(item, depth + 1)}`)
    .join(" ");
}

function matchSignals(text, signals) {
  return signals.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function uniqueSignals(signals) {
  return Array.from(new Set(signals));
}

function assessRealEstateAsset(input) {
  const titleText = normalize(input.title);
  const typeText = normalize(input.propertyType);
  const locationText = normalize([input.address, input.city, input.state].map((item) => asString(item)).filter(Boolean).join(" "));
  const summaryText = normalize(input.summary);
  const sourceText = normalize(input.sourceUrl);
  const rawText = normalize(compactUnknown(input.rawData));
  const titleLocationSummaryText = [titleText, locationText, summaryText].filter(Boolean).join(" ");
  const primaryText = [titleLocationSummaryText, typeText].filter(Boolean).join(" ");
  const fullText = [primaryText, sourceText, rawText].filter(Boolean).join(" ");

  const strongTitleSignals = matchSignals(titleLocationSummaryText, strongRealEstateSignals);
  const strongSignals = uniqueSignals([
    ...strongTitleSignals,
    ...matchSignals(typeText, strongRealEstateSignals),
    ...matchSignals(rawText, strongRealEstateSignals),
  ]);
  const weakSignals = uniqueSignals(matchSignals(fullText, weakRealEstateSignals));
  const nonPrimarySignals = matchSignals(primaryText, nonRealEstateSignals);
  const nonTitleSignals = matchSignals(titleText, nonRealEstateSignals);
  const nonSignals = uniqueSignals([...nonPrimarySignals, ...matchSignals(rawText, nonRealEstateSignals)]);
  const rejected =
    (nonTitleSignals.length > 0 && strongTitleSignals.length === 0) ||
    (nonPrimarySignals.length > 0 && strongTitleSignals.length === 0);

  return {
    rejected,
    reason: rejected
      ? `bem nao imobiliario: ${uniqueSignals(nonPrimarySignals.length ? nonPrimarySignals : nonTitleSignals).join(", ")}`
      : "",
    strongRealEstateSignals: strongSignals,
    weakRealEstateSignals: weakSignals,
    nonRealEstateSignals: nonSignals,
  };
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
  const candidate = asRecord(rawPayload.candidate);
  const sourceUrl = opportunitySourceUrl(row);
  const sourceOk = isLikelyExactPropertySourceUrl(sourceUrl, asString(rawPayload.targetUrl));
  const images = opportunityImages(row.raw_payload);
  const hasValue = Number(row.initial_bid || 0) > 0 || Number(row.appraisal_value || 0) > 0;
  const alreadyDiscarded = visibleStatus(row).includes("descart");
  const assetAssessment = assessRealEstateAsset({
    title: row.title,
    propertyType: row.property_type,
    address: row.address,
    city: row.city,
    state: row.state,
    summary: row.summary,
    sourceUrl,
    rawData: candidate,
  });
  const shouldDiscard = !alreadyDiscarded && (!sourceOk || !hasValue || images.length === 0 || assetAssessment.rejected);
  const reasons = [];
  if (!sourceOk) reasons.push("fonte sem link individual do imovel");
  if (!hasValue) reasons.push("sem valor informado");
  if (!images.length) reasons.push("sem foto real do imovel");
  if (assetAssessment.rejected) reasons.push(assetAssessment.reason);

  return { sourceUrl, sourceOk, hasValue, imageCount: images.length, shouldDiscard, reasons, assetAssessment };
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
      realEstateAssetCheckedAt: new Date().toISOString(),
      realEstateAssetRejected: assessment.assetAssessment.rejected,
      realEstateSignals: assessment.assetAssessment.strongRealEstateSignals,
      nonRealEstateSignals: assessment.assetAssessment.nonRealEstateSignals,
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
    .select("id, code, title, property_type, address, city, state, source_name, stage, ai_status, legal_status, initial_bid, appraisal_value, summary, raw_payload, timeline, updated_at")
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
      assetSignals: {
        strong: item.assessment.assetAssessment.strongRealEstateSignals,
        weak: item.assessment.assetAssessment.weakRealEstateSignals,
        nonRealEstate: item.assessment.assetAssessment.nonRealEstateSignals,
      },
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
