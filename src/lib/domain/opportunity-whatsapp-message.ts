import { canonicalReferenceUrl, marketPropertyGroup as propertyGroup } from './market-quality';
import type { PropertyMarketAnalysis } from '../admin/market-analysis';
import type { AuctionOpportunity, PropertyImageAsset } from '../admin/resources';
import type { WhatsAppActionButtonInput } from '../communication/connectyhub-client';
import type { OpportunityWhatsAppPost, OpportunityWhatsAppLinkFormat, OpportunityWhatsAppSourceLink } from '../whatsapp/opportunity-publication';
type DbRow = Record<string, unknown>;
const WHATSAPP_TEASER_MAX_LENGTH = 1500;
const WHATSAPP_TEASER_WITH_LINKS_MAX_LENGTH = 2300;
function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
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

function marketSummaryLine(analysis: PropertyMarketAnalysis | null, marketValue: string, references: Array<{ url: string }>) {
  if (!analysis) return "";
  // Free-form summaries can describe the original provider sample even after a
  // human revises the estimate. Render only the approved snapshot's current data.
  const urls = new Set(references.map(ref => canonicalReferenceUrl(ref.url)));
  const rents = analysis.comparables.filter(c => urls.has(canonicalReferenceUrl(c.sourceUrl)) && /rent|alug/i.test(c.listingType) && c.askingPrice > 0).map(c => c.askingPrice);
  const lines = [marketValue ? `Valor de mercado adotado na revisao: ${marketValue}.` : ""];
  if (rents.length === 3 && urls.size === 3) {
    lines.push(`Base do aluguel: tres anuncios vinculados a esta versao, entre ${formatCurrency(Math.min(...rents))} e ${formatCurrency(Math.max(...rents))}/mes. Valores anunciados, sem garantia de renda; condominio e IPTU devem ser conferidos separadamente.`);
  }
  return `📝 *${lines.filter(Boolean).join(" ")}*`;
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

function normalizePublicationLinkFormat(value: unknown): OpportunityWhatsAppLinkFormat {
  if (value === "source_links") return value;
  return "source_buttons";
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

function appendSourceLinksToCaption(caption: string, auctionUrl: string, links: OpportunityWhatsAppSourceLink[]) {
  if (!auctionUrl && !links.length) return caption;

  const suffixLines = [
    ...(auctionUrl ? [`Link do leilão: ${auctionUrl}`] : []),
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

  return undefined;
}

function buttonTextForPost(linkFormat: OpportunityWhatsAppLinkFormat, hasSourceLinks: boolean) {
  if (linkFormat === "source_buttons" && hasSourceLinks) {
    return "🏠 Quanto este imóvel pode render em aluguel? Estes três anúncios de imóveis comparáveis ajudam a estimar essa renda e avaliar a oportunidade.";
  }
  if (linkFormat === "source_buttons") return "";
  if (linkFormat === "source_links") return "";
  return "👇 Veja fotos, riscos e analise completa na ficha Betel.";
}
/** Pure content contract used by both the approved sender and the review preview. */
export function formatOpportunityWhatsAppMessage(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null, sourceLinks: OpportunityWhatsAppSourceLink[], publicUrlInput: string, format: OpportunityWhatsAppLinkFormat = 'source_buttons', fallbackCode = ''): OpportunityWhatsAppPost {
  const title = compactTitle(opportunity);
  const publicUrl = publicUrlInput;
  const linkFormat = normalizePublicationLinkFormat(format);
  const auctionUrl = buildAuctionUrl(analysis);
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
    rent ? `💵 Aluguel estimado: ${rent}/mês, por anuncios. Renda nao garantida.` : "",
    "",
    marketSummaryLine(analysis, marketValue, sourceLinks),
    "",
    `👉 ${publicSignal}`,
  ]);
  const auctionActionButton = linkFormat === "source_buttons" && auctionUrl
    ? { footerText: "Betel Leiloes", choices: [{ label: "Ver leilão", url: auctionUrl }] } satisfies WhatsAppActionButtonInput
    : undefined;
  const caption = appendSourceLinksToCaption(baseCaption, auctionActionButton ? "" : auctionUrl, linkFormat === "source_links" ? sourceLinks : []);

  return {
      opportunityCode: opportunity.id || fallbackCode,
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
      auctionActionButton,
      auctionButtonText: auctionActionButton ? "Link do leilão" : undefined,
  };
}
