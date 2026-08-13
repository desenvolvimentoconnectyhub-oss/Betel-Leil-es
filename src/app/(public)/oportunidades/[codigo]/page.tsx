/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, CheckCircle2, Gavel, MapPin, Ruler, ShieldAlert, TrendingUp } from "lucide-react";
import {
  getAuctionOpportunityByCode,
  getPropertyMarketAnalysisByOpportunityCode,
} from "@/lib/admin/repository";
import type { PropertyMarketAnalysis } from "@/lib/admin/market-analysis";
import type { AuctionOpportunity } from "@/lib/admin/resources";

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
  if (!value) return "Nao informado";
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
  if (!area) return "Nao informado";
  return `${area.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2`;
}

function primaryImage(opportunity: AuctionOpportunity) {
  const images = (opportunity.images || []).filter((image) => image.url && image.status !== "failed");
  return images.find((image) => image.status === "mirrored")?.url || images[0]?.url || "";
}

function metricItems(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  return [
    {
      label: "Mercado ajustado",
      value: formatCurrency(analysis?.marketValueBase || opportunity.appraisalValue),
      icon: TrendingUp,
    },
    {
      label: "Lance",
      value: formatCurrency(analysis?.initialBid || opportunity.initialBid),
      icon: Gavel,
    },
    {
      label: "Desconto",
      value: formatPct(analysis?.realDiscountPct || opportunity.discountPct),
      icon: CheckCircle2,
    },
    {
      label: "Area",
      value: formatArea(analysis),
      icon: Ruler,
    },
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  const { codigo } = await params;
  const result = await getAuctionOpportunityByCode(codigo);
  const opportunity = result.data;
  return {
    title: opportunity ? `${opportunity.title} | Betel Leiloes` : "Oportunidade | Betel Leiloes",
    description: opportunity?.summary || "Ficha publica de oportunidade imobiliaria avaliada pela Betel.",
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
  const imageUrl = primaryImage(opportunity);
  const metrics = metricItems(opportunity, analysis);
  const location = [opportunity.city, opportunity.state].filter(Boolean).join("/");
  const ceilingTargets = analysis?.ceilingTargets?.slice(0, 2) || [];

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-8 text-white lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6">
        <Link href="/oportunidades" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-[var(--gold)] transition hover:text-white">
          <ArrowLeft size={16} />
          Voltar para oportunidades
        </Link>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] lg:items-start">
          <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
            {imageUrl ? (
              <img src={imageUrl} alt={opportunity.title} className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center bg-[#14161a] text-sm text-[var(--muted)]">
                Foto do imovel em validacao
              </div>
            )}
          </div>

          <div className="grid gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Oportunidade Betel</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{opportunity.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={15} />
                  {location || "Localizacao em validacao"}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar size={15} />
                  {formatDate(opportunity.auctionDate)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-lg border border-[var(--line)] bg-[#101216] p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                      <Icon size={14} className="text-[var(--gold)]" />
                      {item.label}
                    </div>
                    <p className="mt-2 text-lg font-bold text-white">{item.value}</p>
                  </div>
                );
              })}
            </div>

            {analysis?.summary || opportunity.summary ? (
              <div className="rounded-lg border border-[var(--line)] bg-[#101216] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Resumo da analise</p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{analysis?.summary || opportunity.summary}</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Teto Betel</p>
            <div className="mt-3 grid gap-2">
              {ceilingTargets.length ? (
                ceilingTargets.map((target) => (
                  <div key={target.label} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[var(--muted)]">{target.label}</span>
                    <span className="font-bold">{formatCurrency(target.value)}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">Teto em validacao.</p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">Aluguel estimado</p>
            <p className="mt-3 text-xl font-bold">{formatCurrency(analysis?.rentalEstimate.monthlyRent || 0)}</p>
            {analysis?.rentalEstimate.notes ? (
              <p className="mt-2 text-sm leading-5 text-[var(--muted)]">{analysis.rentalEstimate.notes}</p>
            ) : null}
          </div>

          <div className="rounded-lg border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.06)] p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--gold)]">
              <ShieldAlert size={16} />
              Validacao operacional
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Informacoes sujeitas a conferencia de edital, disponibilidade, custos, ocupacao e regras do leilao antes de qualquer decisao.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
