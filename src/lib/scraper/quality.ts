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
