/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Calendar,
  Camera,
  CheckCircle2,
  Gavel,
  Home,
  ImageOff,
  MapPin,
  MessageCircle,
  Ruler,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import {
  getAuctionOpportunityByCode,
  getPropertyMarketAnalysisByOpportunityCode,
} from "@/lib/admin/repository";
import type { PropertyMarketAnalysis } from "@/lib/admin/market-analysis";
import type { AuctionOpportunity, PropertyImageAsset } from "@/lib/admin/resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatCurrency(value: number) {
  if (!value) return "Nao informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number) {
  if (!value) return "Nao informado";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatDate(value: string) {
  if (!value) return "Data em confirmacao";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatArea(analysis: PropertyMarketAnalysis | null) {
  const subject = analysis?.subject;
  const area = subject?.privateAreaM2 || subject?.builtAreaM2 || subject?.landAreaM2 || 0;
  if (!area) return "Area em confirmacao";
  return `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2`;
}

function plainText(value?: string) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function shortText(value: string, limit: number) {
  const clean = plainText(value);
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trim()}...`;
}

function publicImages(opportunity: AuctionOpportunity) {
  const seen = new Set<string>();
  return (opportunity.images || [])
    .filter((image) => image.url && image.status !== "failed")
    .filter((image) => {
      if (seen.has(image.url)) return false;
      seen.add(image.url);
      return true;
    });
}

function primaryImage(images: PropertyImageAsset[]) {
  return images.find((image) => image.status === "mirrored")?.url || images[0]?.url || "";
}

function locationText(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  const city = analysis?.subject.city || opportunity.city;
  const state = analysis?.subject.state || opportunity.state;
  return [city, state].filter(Boolean).join("/");
}

function propertyTypeText(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return analysis?.subject.propertyType || opportunity.propertyType || "Imovel";
}

function marketValue(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return analysis?.marketValueBase || opportunity.appraisalValue || 0;
}

function bidValue(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return analysis?.initialBid || opportunity.initialBid || 0;
}

function discountValue(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return analysis?.realDiscountPct || opportunity.discountPct || 0;
}

function buildLeadSummary(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  const type = propertyTypeText(opportunity, analysis).toLowerCase();
  const location = locationText(opportunity, analysis) || "localizacao em confirmacao";
  const discount = discountValue(opportunity, analysis);
  const bid = bidValue(opportunity, analysis);
  const market = marketValue(opportunity, analysis);
  const area = formatArea(analysis);

  const parts = [
    `Oportunidade selecionada pela Betel em ${location}, com perfil de ${type} e ${area}.`,
    market && bid
      ? `O lance atual esta em ${formatCurrency(bid)} frente a uma referencia de mercado de ${formatCurrency(market)}.`
      : "",
    discount ? `O desconto aparente de ${formatPct(discount)} cria uma margem interessante para estudar entrada.` : "",
    "A ficha foi resumida para o lead enxergar rapidamente o potencial e pedir a analise completa com a equipe Betel.",
  ].filter(Boolean);

  return parts.join(" ");
}

function buildLeadHighlights(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  const highlights = [];
  const discount = discountValue(opportunity, analysis);
  const market = marketValue(opportunity, analysis);
  const bid = bidValue(opportunity, analysis);
  const rent = analysis?.rentalEstimate.monthlyRent || 0;
  const area = formatArea(analysis);

  if (discount) highlights.push(`Desconto aparente de ${formatPct(discount)} sobre a referencia de mercado.`);
  if (market && bid) highlights.push(`Entrada em estudo a partir de ${formatCurrency(bid)}, com mercado ajustado em ${formatCurrency(market)}.`);
  if (area !== "Area em confirmacao") highlights.push(`Area informada de ${area}, ajudando a comparar valor por metro quadrado.`);
  if (rent) highlights.push(`Referencia de aluguel estimada em ${formatCurrency(rent)} por mes.`);
  if (opportunity.auctionDate) highlights.push(`Leilao previsto para ${formatDate(opportunity.auctionDate)}.`);

  return highlights.slice(0, 4);
}

function metricItems(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return [
    {
      label: "Mercado estimado",
      value: formatCurrency(marketValue(opportunity, analysis)),
      detail: "referencia Betel",
      icon: TrendingUp,
    },
    {
      label: "Lance",
      value: formatCurrency(bidValue(opportunity, analysis)),
      detail: "valor de partida",
      icon: Gavel,
    },
    {
      label: "Desconto",
      value: formatPct(discountValue(opportunity, analysis)),
      detail: "margem aparente",
      icon: CheckCircle2,
    },
    {
      label: "Area",
      value: formatArea(analysis),
      detail: "base informada",
      icon: Ruler,
    },
  ];
}

function factItems(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return [
    { label: "Tipo", value: propertyTypeText(opportunity, analysis), icon: Home },
    { label: "Cidade", value: locationText(opportunity, analysis) || "Em confirmacao", icon: MapPin },
    { label: "Leilao", value: formatDate(opportunity.auctionDate), icon: Calendar },
    { label: "Ocupacao", value: opportunity.occupancy || "Em validacao", icon: ShieldAlert },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const [opportunityResult, analysisResult] = await Promise.all([
    getAuctionOpportunityByCode(codigo),
    getPropertyMarketAnalysisByOpportunityCode(codigo),
  ]);
  const opportunity = opportunityResult.data;
  const analysis = analysisResult.data;

  return {
    title: opportunity ? `${opportunity.title} | Betel Leiloes` : "Oportunidade | Betel Leiloes",
    description: opportunity
      ? shortText(buildLeadSummary(opportunity, analysis), 155)
      : "Ficha publica de oportunidade imobiliaria avaliada pela Betel.",
  };
}

export default async function PublicOpportunityDetailPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const [opportunityResult, analysisResult] = await Promise.all([
    getAuctionOpportunityByCode(codigo),
    getPropertyMarketAnalysisByOpportunityCode(codigo),
  ]);

  const opportunity = opportunityResult.data;
  if (!opportunity) notFound();

  const analysis = analysisResult.data;
  const images = publicImages(opportunity);
  const imageUrl = primaryImage(images);
  const metrics = metricItems(opportunity, analysis);
  const facts = factItems(opportunity, analysis);
  const highlights = buildLeadHighlights(opportunity, analysis);
  const location = locationText(opportunity, analysis);
  const leadSummary = buildLeadSummary(opportunity, analysis);
  const ceilingTargets = analysis?.ceilingTargets?.slice(0, 2) || [];
  const publicNote = shortText(analysis?.decisionReason || analysis?.summary || opportunity.summary || "", 340);

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--foreground)] lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8">
        <Link href="/oportunidades" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--gold)] transition hover:text-[var(--foreground)]">
          <ArrowLeft size={16} />
          Voltar para oportunidades
        </Link>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)] xl:items-start">
          <div className="grid gap-3">
            <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-sm">
              {imageUrl ? (
                <img src={imageUrl} alt={opportunity.title} className="aspect-[16/10] w-full object-cover" />
              ) : (
                <div className="grid aspect-[16/10] place-items-center bg-[var(--panel-soft)] text-sm text-[var(--muted)]">
                  <ImageOff size={28} />
                  Foto do imovel em validacao
                </div>
              )}
            </div>

            {images.length > 1 ? (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {images.slice(1, 6).map((image, index) => (
                  <a
                    key={`${image.url}-${index}`}
                    href={image.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]"
                  >
                    <img src={image.url} alt={image.alt || `${opportunity.title} foto ${index + 2}`} className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    {index === 4 && images.length > 6 ? (
                      <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-semibold text-white">
                        +{images.length - 6} fotos
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-5">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-[rgba(184,122,22,0.24)] bg-[rgba(184,122,22,0.08)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
                <Sparkles size={14} />
                Oportunidade selecionada
              </p>
              <h1 className="mt-4 max-w-3xl text-3xl font-bold tracking-tight text-[var(--foreground)] md:text-5xl">
                {opportunity.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} />
                  {location || "Localizacao em validacao"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} />
                  {formatDate(opportunity.auctionDate)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Camera size={15} />
                  {images.length ? `${images.length} foto(s)` : "Fotos em validacao"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Resumo para o investidor</p>
              <p className="mt-3 text-base leading-7 text-[#3d3328]">{leadSummary}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-[var(--line)] bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      <Icon size={14} className="text-[var(--gold)]" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-xl font-bold text-[var(--foreground)]">{item.value}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">{item.detail}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/cadastro?opportunity=${encodeURIComponent(opportunity.id)}`}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-[var(--gold)] px-5 text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
              >
                Tenho interesse
                <MessageCircle size={16} />
              </Link>
              <Link
                href="/planos"
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white px-5 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--gold)]"
              >
                Ver acesso completo
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
          <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BadgeCheck size={18} className="text-[var(--green)]" />
              <h2 className="text-lg font-bold text-[var(--foreground)]">Por que vale olhar</h2>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {(highlights.length ? highlights : ["Oportunidade capturada, analisada e preparada para conversa com a Betel."]).map((highlight) => (
                <div key={highlight} className="rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3 text-sm leading-6 text-[#4d4034]">
                  {highlight}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-[var(--foreground)]">Dados rapidos</h2>
            <div className="mt-4 grid gap-3">
              {facts.map((fact) => {
                const Icon = fact.icon;
                return (
                  <div key={fact.label} className="flex items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel-soft)] p-3">
                    <Icon size={16} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">{fact.label}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{fact.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Estrategia de lance</p>
            <div className="mt-3 grid gap-2">
              {ceilingTargets.length ? (
                ceilingTargets.map((target) => (
                  <div key={target.label} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--panel-soft)] px-3 py-2 text-sm">
                    <span className="text-[var(--muted)]">Teto com {target.label} de margem</span>
                    <span className="font-bold text-[var(--foreground)]">{formatCurrency(target.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">Estrategia em validacao com a equipe Betel.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Potencial de renda</p>
            <p className="mt-3 text-2xl font-bold text-[var(--foreground)]">
              {formatCurrency(analysis?.rentalEstimate.monthlyRent || 0)}
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              {analysis?.rentalEstimate.notes
                ? shortText(analysis.rentalEstimate.notes, 190)
                : "Estimativa de aluguel sera confirmada conforme comparaveis e perfil final do imovel."}
            </p>
          </div>

          <div className="rounded-lg border border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--gold)]">
              <ShieldAlert size={16} />
              Antes de decidir
            </div>
            <p className="mt-3 text-sm leading-6 text-[#5a4b3d]">
              A Betel recomenda conferir edital, disponibilidade, ocupacao, custos e documentos antes de qualquer proposta.
            </p>
          </div>
        </section>

        {publicNote ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Leitura Betel</p>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[#4d4034]">{publicNote}</p>
          </section>
        ) : null}

        {images.length > 6 ? (
          <section className="rounded-lg border border-[var(--line)] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-[var(--foreground)]">Mais fotos do imovel</h2>
              <span className="text-xs font-semibold text-[var(--muted)]">{images.length} foto(s)</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {images.slice(6, 18).map((image, index) => (
                <a
                  key={`${image.url}-gallery-${index}`}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]"
                >
                  <img src={image.url} alt={image.alt || `${opportunity.title} galeria ${index + 7}`} className="aspect-[4/3] w-full object-cover transition duration-300 hover:scale-[1.03]" />
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
