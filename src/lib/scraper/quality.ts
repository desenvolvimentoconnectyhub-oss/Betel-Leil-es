const GENERIC_SOURCE_SIGNALS = [
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

const NON_PROPERTY_IMAGE_SIGNALS = [
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

export function normalizeQualityText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type RealEstateAssetInput = {
  title?: unknown;
  propertyType?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  summary?: unknown;
  sourceUrl?: unknown;
  rawData?: unknown;
};

export type RealEstateAssetAssessment = {
  rejected: boolean;
  reason: string;
  strongRealEstateSignals: string[];
  weakRealEstateSignals: string[];
  nonRealEstateSignals: string[];
};

const STRONG_REAL_ESTATE_SIGNALS: Array<[string, RegExp]> = [
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

const WEAK_REAL_ESTATE_SIGNALS: Array<[string, RegExp]> = [
  ["lote", /\blote(?:s)?\b/],
  ["bem", /\bbem\b/],
  ["edital", /\bedital\b/],
];

const NON_REAL_ESTATE_SIGNALS: Array<[string, RegExp]> = [
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

function asQualityString(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function compactUnknown(value: unknown, depth = 0): string {
  if (depth > 2) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => compactUnknown(item, depth + 1)).join(" ");

  return Object.entries(value as Record<string, unknown>)
    .slice(0, 50)
    .map(([key, item]) => `${key} ${compactUnknown(item, depth + 1)}`)
    .join(" ");
}

function matchSignals(text: string, signals: Array<[string, RegExp]>) {
  return signals.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function uniqueSignals(signals: string[]) {
  return Array.from(new Set(signals));
}

export function assessRealEstateAsset(input: RealEstateAssetInput): RealEstateAssetAssessment {
  const titleText = normalizeQualityText(asQualityString(input.title));
  const typeText = normalizeQualityText(asQualityString(input.propertyType));
  const locationText = normalizeQualityText(
    [input.address, input.city, input.state].map(asQualityString).filter(Boolean).join(" ")
  );
  const summaryText = normalizeQualityText(asQualityString(input.summary));
  const sourceText = normalizeQualityText(asQualityString(input.sourceUrl));
  const rawText = normalizeQualityText(compactUnknown(input.rawData));
  const titleLocationSummaryText = [titleText, locationText, summaryText].filter(Boolean).join(" ");
  const primaryText = [titleLocationSummaryText, typeText].filter(Boolean).join(" ");
  const fullText = [primaryText, sourceText, rawText].filter(Boolean).join(" ");

  const strongTitleSignals = matchSignals(titleLocationSummaryText, STRONG_REAL_ESTATE_SIGNALS);
  const strongSignals = uniqueSignals([
    ...strongTitleSignals,
    ...matchSignals(typeText, STRONG_REAL_ESTATE_SIGNALS),
    ...matchSignals(rawText, STRONG_REAL_ESTATE_SIGNALS),
  ]);
  const weakSignals = uniqueSignals(matchSignals(fullText, WEAK_REAL_ESTATE_SIGNALS));
  const nonPrimarySignals = matchSignals(primaryText, NON_REAL_ESTATE_SIGNALS);
  const nonTitleSignals = matchSignals(titleText, NON_REAL_ESTATE_SIGNALS);
  const nonSignals = uniqueSignals([...nonPrimarySignals, ...matchSignals(rawText, NON_REAL_ESTATE_SIGNALS)]);
  const titleRejectsAsset = nonTitleSignals.length > 0 && strongTitleSignals.length === 0;
  const primaryRejectsAsset = nonPrimarySignals.length > 0 && strongTitleSignals.length === 0;
  const rejected = titleRejectsAsset || primaryRejectsAsset;

  return {
    rejected,
    reason: rejected
      ? `Bem nao imobiliario detectado (${uniqueSignals(nonPrimarySignals.length ? nonPrimarySignals : nonTitleSignals).join(", ")}).`
      : "",
    strongRealEstateSignals: strongSignals,
    weakRealEstateSignals: weakSignals,
    nonRealEstateSignals: nonSignals,
  };
}

export function isLikelyNonRealEstateAsset(input: RealEstateAssetInput) {
  return assessRealEstateAsset(input).rejected;
}

export function isLikelyPropertyImageUrl(url: string) {
  const normalized = normalizeQualityText(url);
  if (!/^https?:\/\//i.test(url)) return false;
  if (NON_PROPERTY_IMAGE_SIGNALS.some((signal) => normalized.includes(signal))) return false;

  return (
    /\.(?:jpe?g|png|webp|avif)(?:[?#].*)?$/i.test(url) ||
    normalized.includes("imagem") ||
    normalized.includes("image") ||
    normalized.includes("foto") ||
    normalized.includes("photo") ||
    normalized.includes("cdn")
  );
}

function normalizeComparableUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}${url.search}`.toLowerCase();
  } catch {
    return "";
  }
}

export function looksLikeWeakPropertySourceUrl(sourceUrl: string) {
  const normalized = normalizeQualityText(sourceUrl);
  if (GENERIC_SOURCE_SIGNALS.some((signal) => normalized.includes(signal))) return true;

  try {
    const url = new URL(sourceUrl);
    const host = normalizeQualityText(url.hostname);
    const path = normalizeQualityText(url.pathname).replace(/\/+$/, "") || "/";
    const search = normalizeQualityText(url.search);
    const hasIdentifier = /\d/.test(`${path}${search}`);
    const hasDetailSignal =
      /\/sale\/detail\b/.test(path) ||
      /\/(?:detail|detalhe|lote|lotes|lot|lots|imovel|property|properties|bem|item|edital)\b/.test(path) ||
      /(?:^|[?&])(?:id|lot|lote|bem|item)=\d/i.test(url.search);

    if (!url.pathname || url.pathname === "/") return true;
    if (host.includes("biasileiloes.com.br") && /^\/leilao(?:\/|$)/.test(path)) return true;
    if (/^\/(?:imoveis|properties)$/.test(path)) return true;
    if (/^\/(?:leilao|leiloes)(?:\/|$)/.test(path) && !hasDetailSignal) return true;

    return !hasDetailSignal && !hasIdentifier;
  } catch {
    return true;
  }
}

export function isLikelyExactPropertySourceUrl(sourceUrl: string, targetUrl = "") {
  const source = String(sourceUrl || "").trim();
  const normalizedSource = normalizeComparableUrl(source);
  const normalizedTarget = normalizeComparableUrl(String(targetUrl || "").trim());

  if (!normalizedSource || !normalizedSource.startsWith("http")) return false;
  if (normalizedTarget && normalizedSource === normalizedTarget) return false;
  return !looksLikeWeakPropertySourceUrl(source);
}
