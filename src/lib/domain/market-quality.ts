/** Rules shared by research, human review and publication. No network or storage. */
export function normalizedText(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() : "";
}

export function marketPropertyGroup(value: unknown) {
  const text = normalizedText(value);
  if (/\b(apartamento|apto|apartment|cobertura|flat)\b/.test(text)) return "apartment";
  if (/\b(casa|sobrado|house|residencia)\b/.test(text)) return "house";
  if (/\b(terreno|lote|land|gleba)\b/.test(text)) return "land";
  if (/\b(sala|comercial|galpao|predio|office|warehouse)\b/.test(text)) return "commercial";
  if (/\b(rural|fazenda|sitio|chacara)\b/.test(text)) return "rural";
  return "unknown";
}

export function compatibleMarketTypes(subject: string, type: string, title = "") {
  const expected = marketPropertyGroup(subject);
  const explicit = marketPropertyGroup(type);
  const described = marketPropertyGroup(title);
  if (expected === "unknown") return false;
  if (explicit !== "unknown" && explicit !== expected) return false;
  if (described !== "unknown" && described !== expected) return false;
  return explicit === expected || described === expected;
}

export function canonicalReferenceUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host.includes(":")) return "";
    if (/(leilao|leiloes|auction|superbid|portalzuk)/.test(host)) return "";
    const path = decodeURIComponent(url.pathname).toLowerCase();
    if (/(^|\/)(busca|buscar|search|pesquisa|resultados?|mapa|lancamentos)(\/|$)/.test(path)) return "";
    // An actual listing identifier is required; city/type directories are not references.
    if (!/(?:id[-_/]?|\/imovel\/|\/imoveis\/|\/propriedades\/|\/anuncio\/|[-/])\d{4,}/.test(path) &&
        !["id", "codigo", "cod", "ref"].some(key => /^\d{4,}$/.test(url.searchParams.get(key) || ""))) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (!['id', 'codigo', 'cod', 'ref'].includes(key)) url.searchParams.delete(key);
    }
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch { return ""; }
}

export function hasTechnicalMarketText(value: string) {
  return /<script|<html|\\\/|[{}]|%3d|%2f|assinatura=|marca_dagua|encontre imoveis|tipo de imovel residenciais|vendedores instituicoes|attention required|access denied|just a moment/i.test(normalizedText(value));
}

export function cleanMarketText(value: string, limit = 1200) {
  const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return hasTechnicalMarketText(text) ? "" : text.slice(0, limit);
}

export function plausibleMonthlyRent(rent: number, marketValue: number, areaM2: number) {
  if (!Number.isFinite(rent) || rent < 0) return false;
  if (rent === 0) return true;
  if (!(areaM2 > 0) || !(marketValue > 0)) return false;
  // A guard for review, not a valuation/yield estimate. No fabricated replacement rent.
  return rent / marketValue <= 0.025 && rent / areaM2 <= 250;
}

export function readMonthlyRent(prices: Record<string, unknown>, business: unknown): number {
  const period = normalizedText(prices.period);
  if (!['monthly', 'month', 'mensal'].includes(period)) return 0;
  const rent = Number(prices.rent);
  if (Number.isFinite(rent) && rent > 0) return rent;
  // mainValue may be the sale price even on a rental listing; never infer rent from it.
  void business;
  return 0;
}
