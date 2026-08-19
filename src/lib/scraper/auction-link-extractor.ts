import "server-only";

import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { normalizeLocationName, normalizeStateUf } from "./location-normalization";

export type AuctionLinkExtraction = {
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  neighborhood: string;
  landAreaM2: number;
  builtAreaM2: number;
  privateAreaM2: number;
  bedrooms: number;
  parkingSpaces: number;
  initialBid: number;
  appraisalValue: number;
  auctionDate: string;
  paymentCondition: string;
  occupancy: string;
  legalSignal: string;
  summary: string;
  cautionNotes: string;
  confidenceScore: number;
  missingFields: string[];
};

export type AuctionLinkExtractionResult = {
  extraction: AuctionLinkExtraction;
  rawText: string;
  error?: string;
  model?: string;
};

const emptyExtraction: AuctionLinkExtraction = {
  title: "",
  propertyType: "",
  address: "",
  city: "",
  state: "",
  neighborhood: "",
  landAreaM2: 0,
  builtAreaM2: 0,
  privateAreaM2: 0,
  bedrooms: 0,
  parkingSpaces: 0,
  initialBid: 0,
  appraisalValue: 0,
  auctionDate: "",
  paymentCondition: "",
  occupancy: "",
  legalSignal: "",
  summary: "",
  cautionNotes: "",
  confidenceScore: 0,
  missingFields: [],
};

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = cleanString(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter(Boolean)
    : [];
}

function normalizeScore(value: unknown) {
  const parsed = asNumber(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function pickJson(raw: string) {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(fenced.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function normalizeExtraction(value: unknown): AuctionLinkExtraction {
  const row = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

  return {
    title: cleanString(row.title),
    propertyType: cleanString(row.propertyType || row.property_type),
    address: cleanString(row.address || row.endereco),
    city: normalizeLocationName(row.city || row.cidade),
    state: normalizeStateUf(row.state || row.uf),
    neighborhood: normalizeLocationName(row.neighborhood || row.bairro),
    landAreaM2: asNumber(row.landAreaM2 || row.land_area_m2 || row.terreno_m2),
    builtAreaM2: asNumber(row.builtAreaM2 || row.built_area_m2 || row.area_construida_m2),
    privateAreaM2: asNumber(row.privateAreaM2 || row.private_area_m2 || row.area_privativa_m2 || row.area_m2),
    bedrooms: asNumber(row.bedrooms || row.dormitorios),
    parkingSpaces: asNumber(row.parkingSpaces || row.parking_spaces || row.vagas),
    initialBid: asNumber(row.initialBid || row.initial_bid || row.lance || row.lanceInicial),
    appraisalValue: asNumber(row.appraisalValue || row.appraisal_value || row.avaliacao || row.valorAvaliacao),
    auctionDate: cleanString(row.auctionDate || row.auction_date || row.dataLeilao),
    paymentCondition: cleanString(row.paymentCondition || row.payment_condition || row.pagamento),
    occupancy: cleanString(row.occupancy || row.ocupacao),
    legalSignal: cleanString(row.legalSignal || row.legal_signal || row.juridico),
    summary: cleanString(row.summary || row.resumo),
    cautionNotes: cleanString(row.cautionNotes || row.caution_notes || row.ressalvas),
    confidenceScore: normalizeScore(row.confidenceScore || row.confidence_score),
    missingFields: asStringArray(row.missingFields || row.missing_fields),
  };
}

export async function extractAuctionLinkWithGemini(input: {
  sourceUrl: string;
  sourceDomain: string;
  htmlText: string;
  analysisDepth?: "standard" | "deep" | string;
  maxInputChars?: number;
  hints?: {
    city?: string;
    state?: string;
    auctionDate?: string;
    propertyType?: string;
  };
}): Promise<AuctionLinkExtractionResult> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return { extraction: emptyExtraction, rawText: "", error: "Gemini nao configurado." };
  }

  const model = await getGeminiModel();
  const deepMode = input.analysisDepth === "deep";
  const htmlText = input.htmlText.slice(0, input.maxInputChars || (deepMode ? 60_000 : 30_000));

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    const genModel = client.getGenerativeModel({
      model,
      generationConfig: {
        responseMimeType: "application/json",
      },
      systemInstruction: [
        "Voce extrai dados de uma pagina de lote de leilao imobiliario para o sistema Betel.",
        "Retorne apenas JSON valido.",
        "Nunca invente valores. Se um dado nao aparecer no texto, use string vazia, numero 0 ou liste em missingFields.",
        "Separe fato de inferencia: use cautionNotes para ressalvas e confidenceScore baixo quando faltar informacao.",
        "Valores monetarios devem ser numeros em BRL, sem R$ e sem separador de milhar.",
        "Areas devem ser numeros em m2.",
        deepMode
          ? "Modo profundo: privilegie precisao acima de velocidade, seja conservador e marque pendencias quando faltarem foto real, lance, avaliacao/mercado, area, endereco, ocupacao, juridico, edital ou matricula."
          : "",
        deepMode
          ? "Nao use lance inicial, proximo lance, incremento ou valor de 2 leilao como avaliacao de mercado. appraisalValue so deve ser preenchido quando o texto trouxer avaliacao, valor avaliado, valor de mercado ou equivalente."
          : "",
      ].join("\n"),
    });

    const result = await genModel.generateContent([
      [
        "Extraia os campos abaixo da pagina de leilao.",
        "Schema JSON:",
        JSON.stringify(emptyExtraction),
        "",
        `URL: ${input.sourceUrl}`,
        `Dominio: ${input.sourceDomain}`,
        `Modo de analise: ${deepMode ? "profunda e conservadora" : "padrao"}`,
        `Dicas manuais: ${JSON.stringify(input.hints || {})}`,
        "",
        `Texto da pagina:\n${htmlText}`,
      ].join("\n"),
    ]);

    const rawText = result.response.text();
    const parsed = pickJson(rawText);
    if (!parsed) {
      return { extraction: emptyExtraction, rawText, model, error: "Gemini retornou JSON invalido." };
    }

    return { extraction: normalizeExtraction(parsed), rawText, model };
  } catch (error) {
    return {
      extraction: emptyExtraction,
      rawText: "",
      model,
      error: error instanceof Error ? error.message : "Falha ao extrair dados com Gemini.",
    };
  }
}
