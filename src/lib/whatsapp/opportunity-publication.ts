import "server-only";

import { inngest } from "@/inngest/client";
import { getAuctionOpportunityByCode, getPropertyMarketAnalysisByOpportunityCode } from "@/lib/admin/repository";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";
import type { PropertyMarketAnalysis, PropertyMarketComparable } from "@/lib/admin/market-analysis";
import type { AuctionOpportunity, PropertyImageAsset } from "@/lib/admin/resources";
import { WILLIAN_AGENT_KEY, type WhatsAppActionButtonInput } from "@/lib/communication/connectyhub-client";
import type { AuctionLinkExtraction } from "@/lib/scraper/auction-link-extractor";
import { runDeepMarketResearch, type DeepMarketComparable, type DeepMarketResearchResult } from "@/lib/scraper/deep-market-research";
import { normalizeLocationName, normalizeStateUf } from "@/lib/scraper/location-normalization";
import { listSystemWhatsAppSenderOptions } from "@/lib/communication/system-whatsapp-sender";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWhatsAppCommunityCampaign, processWhatsAppCommunityCampaigns, type WhatsAppCommunityDestination } from "./group-campaigns";

type DbRow = Record<string, unknown>;
const WHATSAPP_TEASER_MAX_LENGTH = 1500;
const WHATSAPP_TEASER_WITH_LINKS_MAX_LENGTH = 2300;
const MIN_PUBLICATION_REFERENCE_LINKS = 3;

export type OpportunityWhatsAppPublicationMode =
  | "default_group"
  | "specific_group"
  | "channel"
  | "broadcast_list"
  | "test_number";

export type OpportunityWhatsAppLinkFormat = "source_buttons" | "source_links" | "betel_button";

export type OpportunityWhatsAppSourceLink = {
  label: string;
  url: string;
};

export type OpportunityWhatsAppAgentOption = {
  agentKey: string;
  label: string;
  instanceId: string;
  phone: string;
};

export type OpportunityWhatsAppDestinationOption = {
  id: string;
  agentKey: string;
  destinationType: WhatsAppCommunityDestination["destinationType"];
  jid: string;
  name: string;
  status: WhatsAppCommunityDestination["status"];
  participantCount: number;
};

export type OpportunityWhatsAppPublicationOptions = {
  agents: OpportunityWhatsAppAgentOption[];
  destinations: OpportunityWhatsAppDestinationOption[];
  defaultAgentKey: string;
  defaultGroupId: string;
};

export type OpportunityWhatsAppPost = {
  opportunityCode: string;
  title: string;
  caption: string;
  buttonText: string;
  buttonLabel: string;
  publicUrl: string;
  imageUrl: string;
  linkFormat: OpportunityWhatsAppLinkFormat;
  auctionUrl: string;
  sourceLinks: OpportunityWhatsAppSourceLink[];
  actionButton?: WhatsAppActionButtonInput;
};

type ImmediateWhatsAppProcessingResult = {
  ok: boolean;
  processed: number;
  sent: number;
  failed: number;
  timestamp?: string;
  error?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeText(value: unknown) {
  return cleanString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appUrl() {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const fallbackVercel = vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//i, "")}` : "";
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackVercel ||
    "http://localhost:3000"
  ).replace(/\/+$/g, "");
}

function publicOpportunityUrl(code: string) {
  return `${appUrl()}/oportunidades/${encodeURIComponent(code)}`;
}

async function requestImmediateWhatsAppCampaignProcessing(campaignId: string) {
  const cleanId = cleanString(campaignId);
  if (!cleanId) return false;

  try {
    await inngest.send({
      name: "whatsapp-group/campaign.process",
      data: { campaignId: cleanId },
    });
    return true;
  } catch {
    return false;
  }
}

async function processOpportunityWhatsAppCampaignNow(campaignId: string): Promise<ImmediateWhatsAppProcessingResult> {
  const cleanId = cleanString(campaignId);
  if (!cleanId) return { ok: false, processed: 0, sent: 0, failed: 1, error: "Campanha WhatsApp ausente." };

  try {
    return await processWhatsAppCommunityCampaigns({
      campaignId: cleanId,
      dryRun: false,
      limit: 1,
    });
  } catch (error) {
    return {
      ok: false,
      processed: 0,
      sent: 0,
      failed: 1,
      error: error instanceof Error ? error.message : "Nao foi possivel processar a campanha WhatsApp agora.",
    };
  }
}

function shouldProcessImmediately(mode: OpportunityWhatsAppPublicationMode) {
  return mode !== "broadcast_list";
}

function formatCurrency(value: number) {
  if (!value) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatArea(value: number) {
  if (!value) return "";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`;
}

function formatDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function compactTitle(opportunity: AuctionOpportunity) {
  const prefix = cleanString(opportunity.propertyType, "Imovel");
  const title = cleanString(opportunity.title, prefix);
  return title.toLowerCase().includes(prefix.toLowerCase()) ? title : `${prefix} - ${title}`;
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function creativeTitle(opportunity: AuctionOpportunity, title: string) {
  const location = [opportunity.city, opportunity.state].map((item) => cleanString(item)).filter(Boolean).join("/");
  if (!location) return title;

  const normalizedTitle = normalizeSearchValue(title);
  const city = normalizeSearchValue(opportunity.city);
  const state = normalizeSearchValue(opportunity.state);
  if ((city && normalizedTitle.includes(city)) || (state && normalizedTitle.includes(`/${state}`))) return title;
  return `${title} - ${location}`;
}

function propertyEmoji(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  const text = normalizeSearchValue(`${opportunity.propertyType} ${analysis?.subject.propertyType || ""} ${opportunity.title}`);
  if (text.includes("apart")) return "🏢";
  if (text.includes("terreno") || text.includes("galpao") || text.includes("galpão")) return "🏗️";
  if (text.includes("casa")) return "🏡";
  if (text.includes("sala") || text.includes("comercial")) return "🏬";
  return "🏠";
}

function truncateSingleLine(value: string, maxLength: number) {
  const cleaned = cleanString(value).replace(/\s+/g, " ");
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function publicDecisionLabel(analysis: PropertyMarketAnalysis | null) {
  const labels: Record<PropertyMarketAnalysis["decision"], string> = {
    excellent: "🟢 *Oportunidade forte*",
    good: "🟢 *Boa oportunidade*",
    caution: "🟡 *Exige cautela*",
    review: "🟡 *Em validação*",
    reject: "🟡 *Requer análise cuidadosa*",
  };

  return analysis?.decision ? labels[analysis.decision] : "🔎 *Análise disponível*";
}

function normalizeAreaForPublication(value: unknown, propertyType: string) {
  const area = asNumber(value);
  if (!area) return 0;
  const group = propertyGroup(propertyType);
  if (group === "apartment" || group === "house" || group === "commercial") {
    if (area > 1_000_000) return Math.round((area / 10_000) * 100) / 100;
    if (area > 10_000) return Math.round((area / 100) * 100) / 100;
  }
  return area;
}

function analysisArea(analysis?: PropertyMarketAnalysis | null) {
  const subject = analysis?.subject;
  const propertyType = cleanString(subject?.propertyType);
  return (
    normalizeAreaForPublication(subject?.privateAreaM2, propertyType) ||
    normalizeAreaForPublication(subject?.builtAreaM2, propertyType) ||
    normalizeAreaForPublication(subject?.landAreaM2, propertyType) ||
    0
  );
}

function primaryImageUrl(images?: PropertyImageAsset[]) {
  const usable = (images || []).filter((image) => image.url && image.status !== "failed");
  return (
    usable.find((image) => image.status === "mirrored")?.url ||
    usable.find((image) => /^https?:\/\//i.test(image.url))?.url ||
    ""
  );
}

function line(label: string, value: string) {
  return value ? `${label}: ${value}` : "";
}

function formatPaymentMode(value: string, installmentCount: number) {
  const normalized = normalizeSearchValue(value);
  if (normalized.includes("parcel") || installmentCount > 1) return "parcelado";
  if (normalized.includes("vista")) return "à vista";
  return cleanString(value, installmentCount > 1 ? "parcelado" : "pagamento");
}

function paymentSimulationLines(analysis: PropertyMarketAnalysis | null) {
  const payment = analysis?.paymentSimulation;
  if (!payment) return [];

  const downPayment = formatCurrency(payment.downPaymentAmount);
  const balance = formatCurrency(payment.installmentBalance);
  const installment = formatCurrency(payment.installmentAmount);
  const installmentCount = Math.trunc(payment.installmentCount || 0);
  const hasPaymentData = Boolean(downPayment || balance || (installment && installmentCount));
  if (!hasPaymentData) return [];

  const downPaymentPct = payment.downPaymentPct ? `${payment.downPaymentPct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "";
  const balancePct = payment.downPaymentPct ? `${Math.max(0, 100 - payment.downPaymentPct).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "";
  const correctionRule = cleanString(payment.correctionRule, "sem correção");
  const correctionWarning = cleanString(
    payment.correctionWarning,
    installmentCount ? "Parcelas sujeitas à correção conforme edital." : ""
  );
  const correctionDetail = `(${correctionRule.replace(/[()]/g, "")})`;

  return [
    `💳Simulação de pagamento (${formatPaymentMode(payment.paymentMode, installmentCount)})`,
    "",
    downPayment ? `🔻 Entrada${downPaymentPct ? ` (${downPaymentPct})` : ""}: ${downPayment}` : "",
    balance ? `🔸 Saldo${balancePct ? ` (${balancePct})` : ""}: ${balance}` : "",
    installment && installmentCount ? `👉 Parcelamento em ${installmentCount}x: ${installment}/mês ${correctionDetail}` : "",
    correctionWarning ? "" : "",
    correctionWarning ? `⚠️ ${correctionWarning.replace(/^⚠️\s*/u, "")}` : "",
  ];
}

function ceilingTargetLines(targets: PropertyMarketAnalysis["ceilingTargets"]) {
  const lines = (targets || [])
    .slice(0, 2)
    .map((target) => {
      const value = formatCurrency(target.value);
      return value ? `➡️ ${target.label} -> ${value}` : "";
    })
    .filter(Boolean);
  return lines.length ? ["📊 Teto Betel:", ...lines] : [];
}

function legalSignalLine(analysis: PropertyMarketAnalysis | null) {
  const signal = cleanString(analysis?.legalSignal);
  if (!signal) return "";
  return `👨🏻‍⚖️${signal.replace(/\.$/, "")}.`;
}

function marketSummaryLine(analysis: PropertyMarketAnalysis | null, marketValue: string) {
  const summary = cleanString(analysis?.summary);
  if (!summary) return "";
  const prefix = /^valor de mercado/i.test(summary) ? "" : marketValue ? `Valor de mercado calculado: ${marketValue}. ` : "";
  return `📝 *${prefix}${summary}*`;
}

function compactCaption(lines: string[]) {
  const caption = lines
    .filter((item, index, items) => item || (index > 0 && items[index - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (caption.length <= WHATSAPP_TEASER_MAX_LENGTH) return caption;

  const suffix = "\n\n🔎 Analise resumida para envio no WhatsApp.";
  const available = Math.max(0, WHATSAPP_TEASER_MAX_LENGTH - suffix.length);
  return `${caption.slice(0, available).replace(/\s+\S*$/g, "").trim()}${suffix}`;
}

function isHttpUrl(value: unknown) {
  return /^https?:\/\//i.test(cleanString(value));
}

function isLikelyListingDetailUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = normalizeText(decodeURIComponent(parsed.pathname || ""));
    const query = normalizeText(decodeURIComponent(parsed.search || ""));
    if (!path || path === "/") return false;
    if (/(busca|buscar|search|pesquisa|resultado|resultados|mapa|favoritos|categoria)/.test(path)) return false;
    const compact = `${path} ${query}`;
    const hasListingToken = /(imovel|apartamento|casa|sobrado|terreno|lote|sala|galpao|comercial|chacara|condominio)/.test(compact);
    const hasIdentifier = /\d{4,}/.test(compact) || /(?:id|codigo|cod|ref)[=/_-]?\d{2,}/.test(compact);
    const pathDepth = path.split("/").filter(Boolean).length;
    return hasIdentifier || (hasListingToken && pathDepth >= 2);
  } catch {
    return false;
  }
}

function isBlockedReferenceUrl(url: string) {
  return /(leilao|leiloes|auction|superbid|hasta|hastapublica|judicial|portalzuk|fbleiloes|lancenoleilao)/i.test(url);
}

function normalizePublicationLinkFormat(value: unknown): OpportunityWhatsAppLinkFormat {
  if (value === "source_links" || value === "betel_button") return value;
  return "source_buttons";
}

function linkFormatRequiresReferences(value: OpportunityWhatsAppLinkFormat) {
  return value === "source_buttons" || value === "source_links";
}

function sourceLinkLabel(rawLabel: string, fallback: string) {
  const normalized = rawLabel.toLowerCase();
  if (normalized.includes("alug")) return "Ref aluguel";
  if (normalized.includes("venda")) return "Ref venda";
  if (normalized.includes("compar")) return "Comparavel";
  if (normalized.includes("refer")) return fallback;
  return fallback;
}

function includesToken(text: string, token: string) {
  const normalizedToken = normalizeText(token);
  return normalizedToken.length >= 3 && normalizeText(text).includes(normalizedToken);
}

function propertyGroup(value: string) {
  const text = normalizeText(value);
  if (text.includes("apart")) return "apartment";
  if (text.includes("terreno") || text.includes("lote")) return "land";
  if (text.includes("sala") || text.includes("comercial") || text.includes("galpao")) return "commercial";
  if (text.includes("casa") || text.includes("sobrado") || text.includes("residencia")) return "house";
  return "unknown";
}

function publicationComparableLooksRelevant(analysis: PropertyMarketAnalysis | null, comparable: PropertyMarketComparable) {
  if (!analysis || !isHttpUrl(comparable.sourceUrl)) return false;
  if (isBlockedReferenceUrl(comparable.sourceUrl) || !isLikelyListingDetailUrl(comparable.sourceUrl)) return false;
  if (comparable.quality === "discarded" || comparable.similarityScore < 58) return false;

  const subject = analysis.subject;
  const subjectType = propertyGroup(subject.propertyType);
  const comparableType = propertyGroup(`${comparable.propertyType} ${comparable.listingType} ${comparable.address} ${comparable.sourceUrl}`);
  if (subjectType !== "unknown" && comparableType !== "unknown" && subjectType !== comparableType) return false;

  const subjectCity = normalizeLocationName(subject.city);
  const subjectNeighborhood = normalizeLocationName((subject as { neighborhood?: unknown }).neighborhood);
  const locationText = `${comparable.sourceUrl} ${comparable.address} ${comparable.neighborhood}`;
  const cityMatches = subjectCity && includesToken(locationText, subjectCity);
  const neighborhoodMatches = subjectNeighborhood && includesToken(locationText, subjectNeighborhood);
  const explicitNeighborhoodMatches =
    comparable.neighborhood && includesToken(`${subject.address} ${subjectNeighborhood}`, comparable.neighborhood);
  if (!cityMatches && !neighborhoodMatches && !explicitNeighborhoodMatches) return false;

  const subjectArea = subject.privateAreaM2 || subject.builtAreaM2 || subject.landAreaM2;
  if (subjectArea && comparable.areaM2) {
    const ratio = comparable.areaM2 / subjectArea;
    if (ratio < 0.35 || ratio > 2.2) return false;
  }

  return true;
}

function appendUniqueSourceLink(
  links: OpportunityWhatsAppSourceLink[],
  seen: Set<string>,
  label: string,
  url: string
) {
  const cleanUrl = cleanString(url);
  if (!isHttpUrl(cleanUrl) || seen.has(cleanUrl)) return;
  seen.add(cleanUrl);
  links.push({ label, url: cleanUrl });
}

function buildAuctionUrl(analysis: PropertyMarketAnalysis | null) {
  const auctionSource = (analysis?.sourceLinks || []).find((source) => /leil|auction|fonte/i.test(source.label));
  if (isHttpUrl(auctionSource?.url)) return cleanString(auctionSource?.url);

  const rawPayload = asRecord(analysis?.rawPayload);
  const candidate = asRecord(rawPayload.candidate);
  const fallbackUrls = [
    rawPayload.auctionUrl,
    rawPayload.auction_url,
    rawPayload.sourceUrl,
    rawPayload.source_url,
    candidate.sourceUrl,
    candidate.source_url,
    rawPayload.targetUrl,
    rawPayload.target_url,
  ];
  const fallback = fallbackUrls.find(isHttpUrl);
  return cleanString(fallback);
}

function firstHttpUrl(...values: unknown[]) {
  return values.map((value) => cleanString(value)).find((value) => /^https?:\/\//i.test(value)) || "";
}

function firstPositiveNumber(...values: unknown[]) {
  return values.map((value) => asNumber(value)).find((value) => Number.isFinite(value) && value > 0) || 0;
}

function researchSourceLinks(analysis: PropertyMarketAnalysis | null, auctionUrl: string, research: DeepMarketResearchResult) {
  const links = [
    ...(analysis?.sourceLinks || []),
    { label: "Link leilao", url: auctionUrl },
    ...research.saleComparables.map((item) => ({ label: `Comparavel venda: ${item.sourceLabel}`, url: item.sourceUrl })),
    ...research.rentalComparables.map((item) => ({ label: `Comparavel aluguel: ${item.sourceLabel}`, url: item.sourceUrl })),
  ];
  const seen = new Set<string>();
  return links
    .map((link) => ({ label: cleanString(link.label, "Fonte"), url: cleanString(link.url) }))
    .filter((link) => link.url)
    .filter((link) => {
      if (seen.has(link.url)) return false;
      seen.add(link.url);
      return true;
    })
    .slice(0, 30);
}

function subjectForReferenceRefresh(
  opportunity: AuctionOpportunity,
  analysis: PropertyMarketAnalysis | null,
  runSubject: DbRow
) {
  const analysisSubject = analysis?.subject;
  const propertyType = cleanString(runSubject.propertyType, cleanString(analysisSubject?.propertyType, opportunity.propertyType));
  return {
    propertyType,
    address: cleanString(runSubject.address, cleanString(analysisSubject?.address, opportunity.address)),
    city: normalizeLocationName(cleanString(runSubject.city, cleanString(analysisSubject?.city, opportunity.city))),
    state: normalizeStateUf(cleanString(runSubject.state, cleanString(analysisSubject?.state, opportunity.state))),
    neighborhood: normalizeLocationName(cleanString(runSubject.neighborhood, cleanString((analysisSubject as { neighborhood?: unknown } | undefined)?.neighborhood))),
    landAreaM2: normalizeAreaForPublication(firstPositiveNumber(runSubject.landAreaM2, analysisSubject?.landAreaM2), propertyType),
    builtAreaM2: normalizeAreaForPublication(firstPositiveNumber(runSubject.builtAreaM2, analysisSubject?.builtAreaM2), propertyType),
    privateAreaM2: normalizeAreaForPublication(firstPositiveNumber(runSubject.privateAreaM2, analysisSubject?.privateAreaM2), propertyType),
    bedrooms: firstPositiveNumber(runSubject.bedrooms, analysisSubject?.bedrooms),
    parkingSpaces: firstPositiveNumber(runSubject.parkingSpaces, analysisSubject?.parkingSpaces),
  };
}

function comparableRowsForRefresh(input: {
  analysisId: string;
  opportunityId: string;
  comparables: DeepMarketComparable[];
}) {
  return input.comparables
    .filter((comparable) => comparable.quality !== "discarded")
    .slice(0, 12)
    .map((comparable) => {
      const referenceValue = firstPositiveNumber(comparable.askingPrice, comparable.monthlyRent);
      return {
        analysis_id: input.analysisId,
        opportunity_id: input.opportunityId,
        source_label: comparable.sourceLabel,
        source_url: comparable.sourceUrl,
        listing_type: comparable.listingType === "rent" ? "Aluguel" : "Venda",
        property_type: comparable.propertyType,
        address: comparable.address || null,
        neighborhood: comparable.neighborhood || null,
        city: comparable.city || null,
        state: comparable.state || null,
        area_m2: comparable.areaM2,
        asking_price: referenceValue,
        sold_price: 0,
        price_per_m2: comparable.pricePerM2,
        distance_km: 0,
        similarity_score: comparable.similarityScore,
        quality: comparable.quality,
        notes: comparable.notes,
        collected_at: comparable.collectedAt,
        raw_payload: {
          source: "publication_reference_refresh",
          listingType: comparable.listingType,
          askingPrice: comparable.askingPrice,
          monthlyRent: comparable.monthlyRent,
        },
      };
    });
}

async function refreshPublicationReferences(input: {
  opportunityCode: string;
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  auctionUrl: string;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase || !input.analysis?.id) return { refreshed: false, reason: "Analise de mercado ainda nao foi salva." };

  const { data: opportunityRow, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("id, raw_payload")
    .eq("code", input.opportunityCode)
    .maybeSingle();
  const opportunityUuid = cleanString((opportunityRow as DbRow | null)?.id);
  if (opportunityError || !opportunityUuid) {
    return { refreshed: false, reason: opportunityError?.message || "Oportunidade real nao encontrada para atualizar referencias." };
  }

  const { data: runRow } = await supabase
    .from("auction_scrape_runs")
    .select("source_url, extracted_payload, completed_at, updated_at")
    .eq("opportunity_id", opportunityUuid)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const runPayload = asRecord((runRow as DbRow | null)?.extracted_payload);
  const runSubject = asRecord(runPayload.subject);
  const subject = subjectForReferenceRefresh(input.opportunity, input.analysis, runSubject);
  const auctionUrl = firstHttpUrl(input.auctionUrl, (runRow as DbRow | null)?.source_url, asRecord((opportunityRow as DbRow | null)?.raw_payload).sourceUrl);

  if (!subject.city || !subject.state) {
    return { refreshed: false, reason: "Cidade/UF ainda nao estao confirmadas para buscar referencias." };
  }

  const extraction: AuctionLinkExtraction = {
    title: input.opportunity.title,
    propertyType: subject.propertyType,
    address: subject.address,
    city: subject.city,
    state: subject.state,
    neighborhood: subject.neighborhood,
    landAreaM2: subject.landAreaM2,
    builtAreaM2: subject.builtAreaM2,
    privateAreaM2: subject.privateAreaM2,
    bedrooms: subject.bedrooms,
    parkingSpaces: subject.parkingSpaces,
    initialBid: input.analysis.initialBid || input.opportunity.initialBid,
    appraisalValue: input.analysis.marketValueBase || input.opportunity.appraisalValue,
    auctionDate: input.opportunity.auctionDate,
    paymentCondition: input.analysis.paymentCondition,
    occupancy: input.opportunity.occupancy,
    legalSignal: input.analysis.legalSignal,
    summary: input.analysis.summary || input.opportunity.summary,
    cautionNotes: input.analysis.cautionNotes,
    confidenceScore: input.analysis.confidenceScore,
    missingFields: [],
  };

  const research = await runDeepMarketResearch({
    extraction,
    title: input.opportunity.title,
    initialBid: extraction.initialBid,
  });
  const comparables = [...research.saleComparables, ...research.rentalComparables].filter((item) => item.quality !== "discarded");
  if (comparables.length < MIN_PUBLICATION_REFERENCE_LINKS) {
    return {
      refreshed: false,
      reason: `Pesquisa automatica encontrou ${comparables.length} referencia(s) validas.`,
    };
  }

  await supabase
    .from("property_market_comparables")
    .delete()
    .eq("analysis_id", input.analysis.id)
    .eq("raw_payload->>source", "publication_reference_refresh");

  const comparableRows = comparableRowsForRefresh({
    analysisId: input.analysis.id,
    opportunityId: opportunityUuid,
    comparables,
  });
  if (comparableRows.length) await supabase.from("property_market_comparables").insert(comparableRows);

  const sourceLinks = researchSourceLinks(input.analysis, auctionUrl, research);
  await supabase
    .from("property_market_analyses")
    .update({
      source_links: sourceLinks,
      subject_property_snapshot: {
        ...input.analysis.subject,
        ...subject,
      },
      market_value_low: research.marketValueLow || input.analysis.marketValueLow,
      market_value_base: research.marketValueBase || input.analysis.marketValueBase,
      market_value_high: research.marketValueHigh || input.analysis.marketValueHigh,
      confidence_score: Math.max(input.analysis.confidenceScore || 0, research.confidenceScore || 0),
      liquidity_score: Math.max(input.analysis.liquidityScore || 0, research.liquidityScore || 0),
      caution_notes: [
        input.analysis.cautionNotes,
        `Referencias atualizadas automaticamente no envio WhatsApp: ${research.saleComparables.length} venda, ${research.rentalComparables.length} aluguel.`,
        ...research.cautionNotes,
      ].filter(Boolean).join("\n"),
      raw_payload: {
        ...asRecord(input.analysis.rawPayload),
        publicationReferenceRefresh: {
          refreshedAt: new Date().toISOString(),
          saleComparables: research.saleComparables.length,
          rentalComparables: research.rentalComparables.length,
        },
        marketResearch: research,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.analysis.id);

  return { refreshed: true, reason: "" };
}

function buildPublicationReferenceLinks(analysis: PropertyMarketAnalysis | null, publicUrl: string, auctionUrl: string) {
  const links: OpportunityWhatsAppSourceLink[] = [];
  const seen = new Set<string>([publicUrl, auctionUrl].filter(Boolean));
  const sourceLinks = (analysis?.sourceLinks || []).filter((source) => !/leil|auction|fonte/i.test(source.label));
  const directReferenceSources = sourceLinks.filter((source) =>
    !/^busca:/i.test(source.label) &&
    !/alug|rent/i.test(source.label) &&
    !/comparavel|comparável/i.test(source.label) &&
    /refer/i.test(source.label) &&
    isHttpUrl(source.url) &&
    !isBlockedReferenceUrl(source.url) &&
    isLikelyListingDetailUrl(source.url)
  );

  const comparableLinks = (analysis?.comparables || [])
    .filter((comparable) => publicationComparableLooksRelevant(analysis, comparable))
    .sort((left, right) => right.similarityScore - left.similarityScore);

  for (const comparable of comparableLinks.filter((item) => !/alug|rent/i.test(item.listingType))) {
    appendUniqueSourceLink(
      links,
      seen,
      sourceLinkLabel(`${comparable.listingType} ${comparable.sourceLabel}`, `Referencia ${links.length + 1}`),
      comparable.sourceUrl
    );
    if (links.length >= 3) return links.slice(0, 3);
  }

  for (const source of directReferenceSources) {
    appendUniqueSourceLink(
      links,
      seen,
      sourceLinkLabel(source.label, "Ref venda"),
      source.url
    );
    if (links.length >= 3) return links.slice(0, 3);
  }

  for (const comparable of comparableLinks.filter((item) => /alug|rent/i.test(item.listingType))) {
    appendUniqueSourceLink(
      links,
      seen,
      "Ref aluguel",
      comparable.sourceUrl
    );
    if (links.length >= 3) return links.slice(0, 3);
  }

  return links.slice(0, 3);
}

function appendSourceLinksToCaption(caption: string, auctionUrl: string, links: OpportunityWhatsAppSourceLink[]) {
  if (!auctionUrl && !links.length) return caption;

  const suffixLines = [
    ...(auctionUrl ? [`Link leilao: ${auctionUrl}`] : []),
    ...(auctionUrl && links.length ? [""] : []),
    ...(links.length ? ["Referencias:", ...links.map((link, index) => `${index + 1}. ${link.label}: ${link.url}`)] : []),
  ];
  const suffix = `\n\n${suffixLines.join("\n")}`;
  const fullCaption = `${caption}${suffix}`;
  if (fullCaption.length <= WHATSAPP_TEASER_WITH_LINKS_MAX_LENGTH) return fullCaption;

  const available = Math.max(0, WHATSAPP_TEASER_WITH_LINKS_MAX_LENGTH - suffix.length);
  const trimmedCaption = caption.slice(0, available).replace(/\s+\S*$/g, "").trim();
  return `${trimmedCaption}${suffix}`;
}

function actionButtonForPost(input: {
  linkFormat: OpportunityWhatsAppLinkFormat;
  publicUrl: string;
  sourceLinks: OpportunityWhatsAppSourceLink[];
}) {
  if (input.linkFormat === "source_links") return undefined;

  if (input.linkFormat === "source_buttons" && input.sourceLinks.length) {
    return {
      label: input.sourceLinks[0]?.label || "Abrir fonte",
      url: input.sourceLinks[0]?.url || "",
      footerText: "Betel Leiloes",
      choices: input.sourceLinks.map((link) => ({
        label: link.label,
        url: link.url,
      })),
    } satisfies WhatsAppActionButtonInput;
  }

  if (input.linkFormat === "betel_button") {
    return {
      label: "Ver imovel",
      url: input.publicUrl,
      footerText: "Betel Leiloes",
    } satisfies WhatsAppActionButtonInput;
  }

  return undefined;
}

function buttonTextForPost(linkFormat: OpportunityWhatsAppLinkFormat, hasSourceLinks: boolean) {
  if (linkFormat === "source_buttons" && hasSourceLinks) {
    return "👇 Abra abaixo as referencias de venda e aluguel usadas na analise.";
  }
  if (linkFormat === "source_buttons") return "";
  if (linkFormat === "source_links") return "";
  return "👇 Veja fotos, riscos e analise completa na ficha Betel.";
}

export async function buildOpportunityWhatsAppPost(
  opportunityCode: string,
  options: { linkFormat?: OpportunityWhatsAppLinkFormat; refreshReferences?: boolean } = {}
): Promise<DataResult<OpportunityWhatsAppPost | null>> {
  const code = cleanString(opportunityCode);
  if (!code) return { data: null, source: "supabase", reason: "Oportunidade nao informada." };

  const [opportunityResult, analysisResult] = await Promise.all([
    getAuctionOpportunityByCode(code),
    getPropertyMarketAnalysisByOpportunityCode(code),
  ]);

  const opportunity = opportunityResult.data;
  if (opportunityResult.source !== "supabase") {
    return {
      data: null,
      source: opportunityResult.source,
      reason: opportunityResult.reason || "Publicacao WhatsApp exige oportunidade real salva no Supabase.",
    };
  }
  if (!opportunity) {
    return { data: null, source: opportunityResult.source, reason: opportunityResult.reason || "Oportunidade nao encontrada." };
  }

  let analysis = analysisResult.data;
  const title = compactTitle(opportunity);
  const publicUrl = publicOpportunityUrl(opportunity.id || code);
  const linkFormat = normalizePublicationLinkFormat(options.linkFormat);
  let auctionUrl = buildAuctionUrl(analysis);
  let sourceLinks = buildPublicationReferenceLinks(analysis, publicUrl, auctionUrl);
  let refreshReason = "";
  if (options.refreshReferences && linkFormatRequiresReferences(linkFormat) && sourceLinks.length < MIN_PUBLICATION_REFERENCE_LINKS) {
    const refresh = await refreshPublicationReferences({
      opportunityCode: code,
      opportunity,
      analysis,
      auctionUrl,
    });
    refreshReason = refresh.reason || "";
    if (refresh.refreshed) {
      const refreshedAnalysisResult = await getPropertyMarketAnalysisByOpportunityCode(code);
      analysis = refreshedAnalysisResult.data;
      auctionUrl = buildAuctionUrl(analysis);
      sourceLinks = buildPublicationReferenceLinks(analysis, publicUrl, auctionUrl);
    }
  }
  if (linkFormatRequiresReferences(linkFormat) && sourceLinks.length < MIN_PUBLICATION_REFERENCE_LINKS) {
    return {
      data: null,
      source: analysisResult.source,
      reason: [
        `A analise ainda nao possui ${MIN_PUBLICATION_REFERENCE_LINKS} referencias validas de mercado.`,
        refreshReason || "Reprocesse ou complete os comparaveis antes de enviar no WhatsApp.",
      ].filter(Boolean).join(" "),
    };
  }
  const actionButton = actionButtonForPost({ linkFormat, publicUrl, sourceLinks });
  const titleWithLocation = creativeTitle(opportunity, title);
  const area = formatArea(analysisArea(analysis));
  const marketValue = formatCurrency(analysis?.marketValueBase || opportunity.appraisalValue);
  const bid = formatCurrency(analysis?.initialBid || opportunity.initialBid);
  const discount = formatPct(analysis?.realDiscountPct || opportunity.discountPct);
  const rent = formatCurrency(analysis?.rentalEstimate.monthlyRent || 0);
  const publicSignal = publicDecisionLabel(analysis);

  const baseCaption = compactCaption([
    `${propertyEmoji(opportunity, analysis)} *${truncateSingleLine(titleWithLocation, 140)}*`,
    "",
    formatDate(opportunity.auctionDate) ? `📆${formatDate(opportunity.auctionDate)}` : "",
    "",
    area ? `📐 ${area}` : "",
    "",
    line("💰 Mercado ajustado", marketValue),
    line("🔨 Lance", bid),
    line("📉 Desconto", discount),
    "",
    ...paymentSimulationLines(analysis),
    "",
    ...ceilingTargetLines(analysis?.ceilingTargets || []),
    "",
    legalSignalLine(analysis),
    "",
    rent ? `💵 Aluguel: ${rent}/mês` : "",
    "",
    marketSummaryLine(analysis, marketValue),
    "",
    `👉 ${publicSignal}`,
  ]);
  const shouldAppendLinksToCaption = linkFormat === "source_links" || (linkFormat === "source_buttons" && Boolean(auctionUrl));
  const caption = shouldAppendLinksToCaption ? appendSourceLinksToCaption(baseCaption, auctionUrl, linkFormat === "source_links" ? sourceLinks : []) : baseCaption;

  return {
    data: {
      opportunityCode: opportunity.id || code,
      title,
      caption,
      buttonText: buttonTextForPost(linkFormat, sourceLinks.length > 0),
      buttonLabel: actionButton?.label || "",
      publicUrl,
      imageUrl: primaryImageUrl(opportunity.images),
      linkFormat,
      auctionUrl,
      sourceLinks,
      actionButton,
    },
    source: opportunityResult.source === "supabase" || analysisResult.source === "supabase" ? "supabase" : "mock",
    reason: analysisResult.reason,
  };
}

function normalizeAgentOption(row: Awaited<ReturnType<typeof listSystemWhatsAppSenderOptions>>[number]): OpportunityWhatsAppAgentOption {
  const label = [row.instanceName || row.agentKey, row.phone].filter(Boolean).join(" - ");
  return {
    agentKey: cleanString(row.agentKey, WILLIAN_AGENT_KEY),
    label: cleanString(label, row.agentKey || "Agente WhatsApp"),
    instanceId: row.id,
    phone: row.phone,
  };
}

function normalizeDestinationOption(row: DbRow): OpportunityWhatsAppDestinationOption {
  return {
    id: cleanString(row.id),
    agentKey: cleanString(row.agent_key, WILLIAN_AGENT_KEY),
    destinationType: cleanString(row.destination_type, "group") as OpportunityWhatsAppDestinationOption["destinationType"],
    jid: cleanString(row.jid),
    name: cleanString(row.name, "Destino WhatsApp"),
    status: cleanString(row.status, "paused") as OpportunityWhatsAppDestinationOption["status"],
    participantCount: asNumber(row.participant_count),
  };
}

function canUseDestinationForManualPublication(destination: OpportunityWhatsAppDestinationOption) {
  return destination.status === "active" || destination.status === "paused";
}

export async function getOpportunityWhatsAppPublicationOptions(): Promise<OpportunityWhatsAppPublicationOptions> {
  const supabase = getSupabaseAdminClient();
  const agents = (await listSystemWhatsAppSenderOptions()).map(normalizeAgentOption);
  const agentKeys = [...new Set(agents.map((agent) => agent.agentKey).filter(Boolean))];

  if (!supabase) {
    return {
      agents,
      destinations: [],
      defaultAgentKey: agents[0]?.agentKey || WILLIAN_AGENT_KEY,
      defaultGroupId: "",
    };
  }

  let query = supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count,updated_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (agentKeys.length) query = query.in("agent_key", agentKeys);

  const { data, error } = await query;
  const destinations = error ? [] : ((data || []) as DbRow[]).map(normalizeDestinationOption).filter((item) => item.id && item.jid);
  const activeGroup = destinations.find(
    (destination) => canUseDestinationForManualPublication(destination) && destination.destinationType === "group"
  );

  return {
    agents,
    destinations,
    defaultAgentKey: activeGroup?.agentKey || agents[0]?.agentKey || WILLIAN_AGENT_KEY,
    defaultGroupId: activeGroup?.id || "",
  };
}

function normalizeBroadcastTarget(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (clean.includes("@") && !clean.includes("@g.us") && !clean.includes("@newsletter")) return clean;
  const digits = clean.replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

async function loadDestinationById(id: string): Promise<OpportunityWhatsAppDestinationOption | null> {
  const supabase = getSupabaseAdminClient();
  const destinationId = cleanString(id);
  if (!supabase || !destinationId) return null;

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count")
    .eq("id", destinationId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeDestinationOption(data as DbRow);
}

async function defaultGroupForAgent(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count")
    .eq("agent_key", cleanString(agentKey, WILLIAN_AGENT_KEY))
    .eq("destination_type", "group")
    .in("status", ["active", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeDestinationOption(data as DbRow);
}

async function broadcastTargetsFromGroup(destinationId: string) {
  const supabase = getSupabaseAdminClient();
  const cleanId = cleanString(destinationId);
  if (!supabase || !cleanId) return [];

  const { data, error } = await supabase
    .from("whatsapp_group_participants")
    .select("participant_jid,phone")
    .eq("destination_id", cleanId)
    .limit(1000);

  if (error) return [];
  return ((data || []) as DbRow[])
    .map((row) => normalizeBroadcastTarget(row.phone || row.participant_jid))
    .filter(Boolean);
}

async function rawOpportunityId(code: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return "";
  const { data } = await supabase
    .from("auction_opportunities")
    .select("id")
    .eq("code", cleanString(code))
    .maybeSingle();
  return cleanString((data as DbRow | null)?.id);
}

export async function scheduleOpportunityWhatsAppPublication(input: {
  opportunityCode: string;
  mode: OpportunityWhatsAppPublicationMode;
  linkFormat?: OpportunityWhatsAppLinkFormat;
  agentKey?: string;
  destinationId?: string;
  broadcastSourceDestinationId?: string;
  broadcastTargets?: string[];
  approvedByAdminUserId?: string;
  approvedByName?: string;
}): Promise<
  MutationResult<{
    campaignId: string;
    targets: number;
    publicUrl: string;
    skipped?: boolean;
    immediateDispatchRequested?: boolean;
    immediateProcessing?: ImmediateWhatsAppProcessingResult;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const linkFormat = normalizePublicationLinkFormat(input.linkFormat);
  const postResult = await buildOpportunityWhatsAppPost(input.opportunityCode, { linkFormat, refreshReferences: true });
  const post = postResult.data;
  if (!post) return { ok: false, error: postResult.reason || "Nao foi possivel gerar a publicacao WhatsApp." };

  let agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  let destinationIds: string[] = [];
  let destinationJids: string[] = [];
  let destinationType: OpportunityWhatsAppDestinationOption["destinationType"] | undefined;
  let targetKey: string = input.mode;

  if (input.mode === "default_group") {
    const explicitDestination = await loadDestinationById(cleanString(input.destinationId));
    const destination = explicitDestination || (await defaultGroupForAgent(agentKey));
    if (!destination || destination.destinationType !== "group") {
      return { ok: false, error: "Nenhum grupo padrao ativo encontrado para este agente." };
    }
    if (!canUseDestinationForManualPublication(destination)) return { ok: false, error: "O grupo selecionado nao esta disponivel para envio." };
    agentKey = cleanString(destination.agentKey, agentKey);
    destinationIds = [destination.id];
    targetKey = destination.id;
  }

  if (input.mode === "specific_group" || input.mode === "channel") {
    const destination = await loadDestinationById(cleanString(input.destinationId));
    const expectedType = input.mode === "channel" ? "channel" : "group";
    if (!destination || destination.destinationType !== expectedType) {
      return { ok: false, error: input.mode === "channel" ? "Canal WhatsApp invalido." : "Grupo WhatsApp invalido." };
    }
    if (!canUseDestinationForManualPublication(destination)) return { ok: false, error: "O destino selecionado nao esta disponivel para envio." };
    if (agentKey && destination.agentKey !== agentKey) {
      return { ok: false, error: "O destino selecionado pertence a outro agente WhatsApp." };
    }
    agentKey = cleanString(destination.agentKey, agentKey);
    destinationIds = [destination.id];
    targetKey = destination.id;
  }

  if (input.mode === "broadcast_list" || input.mode === "test_number") {
    const sourceDestination = await loadDestinationById(cleanString(input.broadcastSourceDestinationId));
    if (input.mode === "broadcast_list" && sourceDestination) {
      if (sourceDestination.destinationType !== "group") return { ok: false, error: "A lista so pode ser montada a partir de um grupo." };
      if (!canUseDestinationForManualPublication(sourceDestination)) return { ok: false, error: "O grupo de origem da lista nao esta disponivel para envio." };
      if (agentKey && sourceDestination.agentKey !== agentKey) {
        return { ok: false, error: "O grupo de origem pertence a outro agente WhatsApp." };
      }
      agentKey = cleanString(sourceDestination.agentKey, agentKey);
      destinationJids.push(...(await broadcastTargetsFromGroup(sourceDestination.id)));
      targetKey = sourceDestination.id;
    }

    destinationJids.push(...(input.broadcastTargets || []).map(normalizeBroadcastTarget).filter(Boolean));
    destinationJids = [...new Set(destinationJids)].slice(0, input.mode === "test_number" ? 1 : 500);
    destinationType = "contact_list";

    if (!destinationJids.length) {
      return {
        ok: false,
        error:
          input.mode === "test_number"
            ? "Informe um numero de teste para envio WhatsApp."
            : "Informe uma lista de contatos ou escolha um grupo sincronizado como origem.",
      };
    }

    if (input.mode === "test_number") targetKey = destinationJids[0] || "test_number";
  }

  const publicationKey = [
    post.opportunityCode,
    agentKey,
    input.mode,
    post.linkFormat,
    targetKey,
    ...destinationIds,
    ...destinationJids.slice(0, 20),
  ].join(":");

  if (input.mode !== "test_number") {
    const existing = await supabase
      .from("whatsapp_group_campaigns")
      .select("id")
      .eq("agent_key", agentKey)
      .eq("product_ref", post.opportunityCode)
      .in("status", ["draft", "scheduled", "running", "paused"])
      .contains("metadata", { publicationKey })
      .maybeSingle();

    if (existing.data) {
      const campaignId = cleanString((existing.data as DbRow).id);
      const immediateProcessing = shouldProcessImmediately(input.mode)
        ? await processOpportunityWhatsAppCampaignNow(campaignId)
        : undefined;
      if (shouldProcessImmediately(input.mode) && immediateProcessing && immediateProcessing.failed > 0 && !immediateProcessing.sent) {
        return {
          ok: false,
          error:
            immediateProcessing.error ||
            "A campanha existente foi localizada, mas a ConnectyHub nao confirmou o envio para o destino selecionado. Confira o agente e tente novamente.",
        };
      }
      return {
        ok: true,
        data: {
          campaignId,
          targets: 0,
          publicUrl: post.publicUrl,
          skipped: true,
          immediateProcessing,
          immediateDispatchRequested: immediateProcessing?.sent ? false : await requestImmediateWhatsAppCampaignProcessing(campaignId),
        },
      };
    }
  }

  const campaign = await createWhatsAppCommunityCampaign({
    agentKey,
    name: `Divulgacao ${post.opportunityCode}`,
    subject: post.title,
    bodyText: post.caption,
    mediaUrl: post.imageUrl,
    mediaType: post.imageUrl ? "image" : "",
    actionButton: post.actionButton,
    buttonText: post.buttonText,
    destinationIds,
    destinationJids,
    destinationType,
    campaignType: "product",
    approvalMode: "manual",
    scheduledFor: new Date().toISOString(),
    dailyLimit: input.mode === "broadcast_list" ? 80 : 20,
    productRef: post.opportunityCode,
    metadata: {
      createdFrom: "market_approval",
      publicationKey,
      publicationMode: input.mode,
      opportunityCode: post.opportunityCode,
      publicUrl: post.publicUrl,
      imageUrl: post.imageUrl,
      linkFormat: post.linkFormat,
      auctionUrl: post.auctionUrl,
      sourceLinks: post.sourceLinks,
      approvedByAdminUserId: cleanString(input.approvedByAdminUserId),
      approvedByName: cleanString(input.approvedByName),
    },
  });

  const campaignId = cleanString(campaign.campaignId);
  const immediateProcessing = shouldProcessImmediately(input.mode)
    ? await processOpportunityWhatsAppCampaignNow(campaignId)
    : undefined;
  const immediateDispatchRequested = immediateProcessing?.sent ? false : await requestImmediateWhatsAppCampaignProcessing(campaignId);
  if (shouldProcessImmediately(input.mode) && immediateProcessing && immediateProcessing.failed > 0 && !immediateProcessing.sent) {
    return {
      ok: false,
      error:
        immediateProcessing.error ||
        "Campanha criada, mas a ConnectyHub nao confirmou o envio para o destino selecionado. Confira o agente e tente novamente.",
    };
  }

  const opportunityId = await rawOpportunityId(post.opportunityCode);
  if (opportunityId) {
    await supabase.from("audit_logs").insert({
      opportunity_id: opportunityId,
      actor_name: cleanString(input.approvedByName, "Analise de mercado"),
      event_type: "opportunity_whatsapp_publication_scheduled",
      status: "scheduled",
      payload: {
        campaignId,
        opportunityCode: post.opportunityCode,
        publicationMode: input.mode,
        agentKey,
        destinationIds,
        destinationJids: destinationJids.slice(0, 50),
        publicUrl: post.publicUrl,
        linkFormat: post.linkFormat,
        auctionUrl: post.auctionUrl,
        sourceLinks: post.sourceLinks,
        immediateDispatchRequested,
        immediateProcessing,
      },
    });
  }

  return {
    ok: true,
    data: {
      campaignId,
      targets: campaign.targets,
      publicUrl: post.publicUrl,
      immediateDispatchRequested,
      immediateProcessing,
    },
  };
}
