"use client";

import { Gavel, MapPin, Calendar, TrendingUp, Lock, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { PublicOpportunitiesData, PublicOpportunity } from "@/lib/subscribers";
import type { DataResult } from "@/lib/admin/repository/shared";
import type { ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan,#00f3ff)]",
  green: "text-[#22c55e]",
  yellow: "text-[#eab308]",
  red: "text-[#ef4444]",
  purple: "text-[#8b5cf6]",
  muted: "text-[var(--muted)]",
};

function formatCurrency(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ScoreBadge({ score }: { score: number }) {
  const tone: ResourceTone = score >= 75 ? "green" : score >= 50 ? "yellow" : "red";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", toneText[tone])}>
      {score}
    </span>
  );
}

function OpportunityCard({ opp }: { opp: PublicOpportunity }) {
  const isTeaser = opp.accessLevel === "teaser";

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 transition hover:border-[var(--gold)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{opp.title}</p>
          <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
            <MapPin size={12} />
            <span>
              {opp.city}/{opp.state}
            </span>
            <span className="text-[var(--line)]">|</span>
            <span>{opp.propertyType}</span>
          </div>
        </div>
        <ScoreBadge score={opp.opportunityScore} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <p className="text-[var(--muted)]">Desconto</p>
          <p className="font-semibold text-[#22c55e]">{opp.discountPct}%</p>
        </div>
        <div>
          <p className="text-[var(--muted)]">Lance inicial</p>
          {isTeaser ? (
            <p className="flex items-center gap-1 text-[var(--muted)]">
              <Lock size={10} /> Plano Investor+
            </p>
          ) : (
            <p className="font-semibold text-white">{opp.initialBid ? formatCurrency(opp.initialBid) : "—"}</p>
          )}
        </div>
        <div>
          <p className="text-[var(--muted)]">Avaliacao</p>
          {isTeaser ? (
            <p className="flex items-center gap-1 text-[var(--muted)]">
              <Lock size={10} /> Plano Investor+
            </p>
          ) : (
            <p className="font-semibold text-white">{opp.appraisalValue ? formatCurrency(opp.appraisalValue) : "—"}</p>
          )}
        </div>
        <div>
          <p className="text-[var(--muted)]">Leilao</p>
          <p className="flex items-center gap-1 font-semibold text-white">
            <Calendar size={10} />
            {formatDate(opp.auctionDate)}
          </p>
        </div>
      </div>

      {isTeaser && (
        <div className="mt-4 rounded-md border border-[rgba(216,173,88,0.2)] bg-[rgba(216,173,88,0.06)] px-3 py-2">
          <p className="flex items-center gap-2 text-xs text-[var(--gold)]">
            <Lock size={12} />
            Endereco, valores e analise completa disponiveis no plano Investor+
          </p>
        </div>
      )}

      {!isTeaser && opp.summary && (
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{opp.summary}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] font-medium text-[var(--muted)]">
          {opp.sourceName} · {opp.code}
        </span>
        {!isTeaser && opp.riskScore !== null && (
          <span className="text-[10px] text-[var(--muted)]">
            Risco: <span className={cn("font-semibold", opp.riskScore > 60 ? "text-[#ef4444]" : "text-[#22c55e]")}>{opp.riskScore}</span>
          </span>
        )}
      </div>
    </article>
  );
}

export function OpportunitiesListPage({ data }: { data: DataResult<PublicOpportunitiesData> }) {
  const { opportunities, total, planKey } = data.data;

  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-10 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Gavel size={24} className="text-[var(--gold)]" />
            <h1 className="text-2xl font-bold text-white">Oportunidades de Leilao</h1>
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {total} oportunidades encontradas. Mostrando com acesso nivel{" "}
            <span className="font-semibold capitalize text-[var(--gold)]">{planKey}</span>.
          </p>
          {data.source === "mock" && (
            <p className="mt-2 text-xs text-[var(--muted)]">{data.reason}</p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {opportunities.map((opp) => (
            <OpportunityCard key={opp.id} opp={opp} />
          ))}
        </div>

        {planKey === "explorer" && (
          <div className="mt-8 rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.06)] p-6 text-center">
            <TrendingUp size={32} className="mx-auto text-[var(--gold)]" />
            <h2 className="mt-3 text-lg font-semibold text-white">Desbloqueie todas as oportunidades</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Assine o plano Investor+ para ver endereco completo, valores reais, dossie de risco e receber alertas.
            </p>
            <Link
              href="/planos"
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-[var(--gold)] px-5 text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
            >
              Ver planos
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
