import "server-only";

import type { getSupabaseAdminClient } from "@/lib/supabase/admin";

type SupabaseAdminClient = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;
type DbRow = Record<string, unknown>;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asStringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean);
  }
  const text = cleanString(value);
  if (!text) return [];
  return text
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map((value) => cleanString(value)).filter(Boolean))];
}

function normalizeText(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function budgetFromText(text: string) {
  const lower = normalizeText(text);
  const millionMatch = lower.match(/(\d+(?:[.,]\d+)?)\s*(milhao|milhoes|mi)\b/);
  if (millionMatch) return Math.round(Number(millionMatch[1].replace(",", ".")) * 1_000_000);
  const thousandMatch = lower.match(/(\d{2,4}(?:[.,]\d+)?)\s*mil\b/);
  if (thousandMatch) return Math.round(Number(thousandMatch[1].replace(",", ".")) * 1_000);
  const currencyMatch = lower.match(/r\$\s*([\d.\s]+)(?:,\d{2})?/);
  if (currencyMatch) return parseCurrencyAmount(currencyMatch[1]);
  return 0;
}

function parseCurrencyAmount(value: string) {
  const clean = value.replace(/[^\d,.-]/g, "").trim();
  if (!clean) return 0;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(clean)) return Number(clean.replace(/\./g, ""));
  if (/^\d{1,3}(?:,\d{3})+$/.test(clean)) return Number(clean.replace(/,/g, ""));
  if (clean.includes(".") && clean.includes(",")) return Number(clean.replace(/\./g, "").replace(",", "."));
  const parsed = Number(clean.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractRegions(text: string) {
  const lower = normalizeText(text);
  return uniqueStrings(
    [
      ...(lower.match(/\b(sao paulo|sp|rio de janeiro|rj|curitiba|pr|santa catarina|sc|florianopolis|joinville|itajai|balneario camboriu|itapema|camboriu|porto alegre|rs)\b/g) || []),
      cleanString(lower.match(/\b(?:em|no|na|para|regiao de|cidade de)\s+([a-z\s]{3,28})/i)?.[1]),
    ].filter(Boolean)
  );
}

function extractPropertyTypes(text: string) {
  const lower = normalizeText(text);
  return uniqueStrings(
    [
      lower.includes("apartamento") || lower.includes("apto") ? "apartamento" : "",
      lower.includes("casa") ? "casa" : "",
      lower.includes("terreno") ? "terreno" : "",
      lower.includes("comercial") || lower.includes("loja") || lower.includes("sala") ? "comercial" : "",
      lower.includes("galp") ? "galpao" : "",
    ].filter(Boolean)
  );
}

function formatCurrency(value: number) {
  if (!value) return "";
  return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
}

function compactStatus(row: DbRow) {
  return [row.stage, row.ai_status, row.legal_status].map((item) => cleanString(item)).filter(Boolean).join(" / ");
}

function isUsableOpportunity(row: DbRow) {
  const title = cleanString(row.title);
  const status = normalizeText(compactStatus(row));
  const kind = normalizeText(`${row.title} ${row.property_type} ${row.summary}`);

  if (!title) return false;
  if (status.includes("descart")) return false;
  if (kind.includes("veiculo") || kind.includes("caminhao") || kind.includes("maquina")) return false;
  return asNumber(row.initial_bid) > 0 || asNumber(row.appraisal_value) > 0;
}

function opportunityRank(row: DbRow, profile: { regions: string[]; propertyTypes: string[]; budgetMax: number }) {
  const haystack = normalizeText(`${row.title} ${row.property_type} ${row.city} ${row.state} ${row.summary}`);
  const bid = asNumber(row.initial_bid);
  const opportunityScore = Math.max(0, Math.min(100, asNumber(row.opportunity_score)));
  const riskScore = Math.max(0, Math.min(100, asNumber(row.risk_score)));
  const regionMatch = !profile.regions.length || profile.regions.some((region) => haystack.includes(normalizeText(region)));
  const typeMatch = !profile.propertyTypes.length || profile.propertyTypes.some((type) => haystack.includes(normalizeText(type)));
  const budgetMatch = !profile.budgetMax || !bid || bid <= profile.budgetMax * 1.1;

  return (
    (regionMatch ? 35 : 0) +
    (typeMatch ? 25 : 0) +
    (budgetMatch ? 20 : -25) +
    opportunityScore / 5 -
    riskScore / 10
  );
}

function formatOpportunity(row: DbRow) {
  const code = cleanString(row.code, cleanString(row.id, "sem codigo"));
  const title = cleanString(row.title, "Imovel captado");
  const propertyType = cleanString(row.property_type, "imovel");
  const cityState = [cleanString(row.city), cleanString(row.state)].filter(Boolean).join("/");
  const initialBid = formatCurrency(asNumber(row.initial_bid));
  const appraisalValue = formatCurrency(asNumber(row.appraisal_value));
  const discountPct = asNumber(row.discount_pct);
  const auctionDate = cleanString(row.auction_date);
  const occupancy = cleanString(row.occupancy);
  const status = compactStatus(row);
  const parts = [
    `${code}: ${title}`,
    propertyType,
    cityState,
    initialBid ? `lance inicial ${initialBid}` : "",
    appraisalValue ? `avaliacao ${appraisalValue}` : "",
    discountPct ? `desconto aprox. ${Math.round(discountPct)}%` : "",
    auctionDate ? `data ${auctionDate}` : "",
    occupancy ? `ocupacao ${occupancy}` : "",
    status ? `status interno ${status}` : "",
  ].filter(Boolean);

  return `- ${parts.join("; ")}.`;
}

export function buildBetelAuctionAdvisoryContext() {
  return [
    "Metodo Betel para atendimento consultivo e etico:",
    "1. Acolher o medo do lead sem discutir: leilao parece arriscado por ocupacao, edital, matricula, lance alto, posse e documentacao.",
    "2. Explicar que a Betel reduz trabalho e risco operacional com tres etapas: busca diaria de oportunidades, participacao racional no leilao e pos-arrematacao juridico/documental.",
    "3. Busca: a equipe e a plataforma filtram fontes, cidades, faixa de capital e oportunidades. O lead nao precisa consultar leiloeiro por leiloeiro todos os dias.",
    "4. Curadoria: nao vender qualquer imovel. Comparar lance, avaliacao, mercado da regiao, liquidez, risco, edital, ocupacao e margem potencial antes de recomendar proximo passo.",
    "5. Dia do leilao: orientar o lead a definir teto antes. Leilao e razao, nao emocao. Se passar do teto combinado, parar e ir para a proxima oportunidade.",
    "6. Pos-arrematacao: explicar que a Betel acompanha boleto, carta de arrematacao, matricula, posse e suporte juridico. Nao prometer prazo fixo; acordos podem ser rapidos, acao de imissao de posse pode levar meses.",
    "7. Prova social so com cuidado: pode citar que existem cases de clientes e resultados fortes, mas nunca prometer que o lead tera o mesmo retorno.",
    "8. Fechamento correto: quando houver perfil, capital e interesse real, conduzir para reuniao, humano ou contrato da assessoria de 12 meses. A Betel cobra conforme contrato e regras comerciais vigentes.",
    "",
    "Funil de persuasao permitido:",
    "- Entrada: criar rapport, ouvir, validar a duvida e fazer o lead se sentir entendido.",
    "- Diagnostico: descobrir consciencia, capital, regiao, tipo de imovel, experiencia, prazo e objetivo.",
    "- Educacao: ensinar o processo Betel em linguagem simples, sem juridiquês e sem textao.",
    "- Direcao: mostrar caminho racional, limite de lance e criterios de seguranca.",
    "- Conversao: convidar para uma reuniao ou atendimento humano quando o lead estiver pronto.",
    "",
    "Limites eticos obrigatorios:",
    "- Nao manipular medo, urgencia ou autoridade. Nao usar pressao psicologica, falsa escassez, promessa de lucro ou garantia de posse.",
    "- Nao imitar advogado e nao dar parecer juridico. Para edital, matricula, ocupacao, risco e lance, dizer que a equipe valida.",
    "- Nao inventar oportunidade. So mencione imoveis que aparecerem no contexto de oportunidades reais captadas.",
  ].join("\n");
}

export async function loadWhatsAppOpportunityContext(
  supabase: SupabaseAdminClient,
  input: {
    profile?: DbRow;
    inboundText?: string;
    limit?: number;
  } = {}
) {
  const profile = asRecord(input.profile);
  const inboundText = cleanString(input.inboundText);
  const regions = uniqueStrings([...asStringList(profile.preferred_regions), ...extractRegions(inboundText)]);
  const propertyTypes = uniqueStrings([...asStringList(profile.property_types), ...extractPropertyTypes(inboundText)]);
  const budgetMax = asNumber(profile.budget_max) || budgetFromText(inboundText);
  const limit = Math.max(1, Math.min(input.limit || 6, 8));

  try {
    const { data, error } = await supabase
      .from("auction_opportunities")
      .select("id,code,title,property_type,city,state,initial_bid,appraisal_value,discount_pct,opportunity_score,risk_score,stage,ai_status,legal_status,auction_date,occupancy,summary,updated_at")
      .order("updated_at", { ascending: false })
      .limit(40);

    if (error) return `Nao foi possivel carregar imoveis captados agora: ${error.message}.`;

    const rows = ((data || []) as DbRow[])
      .filter(isUsableOpportunity)
      .map((row) => ({ row, rank: opportunityRank(row, { regions, propertyTypes, budgetMax }) }))
      .sort((left, right) => right.rank - left.rank)
      .slice(0, limit)
      .map((item) => item.row);

    if (!rows.length) {
      return "Nenhum imovel captado elegivel apareceu no contexto agora. Se o lead pedir oportunidade, qualifique perfil e diga que a equipe vai validar a base.";
    }

    const filterLine = [
      regions.length ? `regioes do lead: ${regions.join(", ")}` : "",
      propertyTypes.length ? `tipos do lead: ${propertyTypes.join(", ")}` : "",
      budgetMax ? `capital informado: ${formatCurrency(budgetMax)}` : "",
    ].filter(Boolean).join("; ") || "perfil ainda incompleto";

    return [
      `Perfil usado para filtrar oportunidades: ${filterLine}.`,
      "Oportunidades reais captadas no sistema para orientar a conversa. Use como contexto comercial, nao como recomendacao juridica final:",
      rows.map(formatOpportunity).join("\n"),
      "Regra: antes de orientar lance, prometer margem, falar de posse ou enviar como recomendacao final, confirme com a equipe humana/curadoria.",
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro inesperado";
    return `Nao foi possivel carregar imoveis captados agora: ${message}.`;
  }
}
