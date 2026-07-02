import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2, Gavel, Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { getAuctionOpportunityByCode } from "@/lib/admin/repository";
import {
  formatCurrency,
  formatDate,
  type ResourceTone,
} from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBg: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)]",
  yellow: "border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)]",
  red: "border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.08)]",
  purple: "border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunityResult = await getAuctionOpportunityByCode(id);
  const opportunity = opportunityResult.data;

  if (!opportunity) notFound();

  const images = opportunity.images || [];
  const heroImage = images.find((image) => image.status === "mirrored") || images[0];

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <Link href="/admin/oportunidades">
              <ArrowLeft size={15} />
              Imóveis captados
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getStatusTone(opportunity.aiStatus)}>{opportunity.aiStatus}</StatusBadge>
            <StatusBadge tone={getStatusTone(opportunity.legalStatus)}>{opportunity.legalStatus}</StatusBadge>
            <Button
              asChild
              variant="outline"
              className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href={`/admin/oportunidades/${opportunity.id}/editar`}>
                <Pencil size={15} />
                Editar imóvel
              </Link>
            </Button>
            <Button className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <FileCheck2 size={15} />
              Gerar dossie
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-8 items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-cyan)]">
              <Gavel size={14} />
              {opportunity.id} / {opportunity.stage}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">{opportunity.title}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">
              {opportunity.address} - {opportunity.city}/{opportunity.state}. Fonte: {opportunity.sourceName}.
            </p>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">{opportunity.summary}</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Lance inicial</p>
                <p className="mt-2 font-mono text-lg font-bold text-white">{formatCurrency(opportunity.initialBid)}</p>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Desconto</p>
                <p className="mt-2 font-mono text-lg font-bold text-[var(--admin-green)]">
                  {opportunity.discountPct}%
                </p>
              </div>
            </div>
            <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
              <p className="text-xs text-[var(--admin-muted)]">Data do leilão</p>
              <p className="mt-2 font-mono text-sm font-semibold text-white">{formatDate(opportunity.auctionDate)}</p>
            </div>
          </div>
        </div>
      </section>

      {heroImage && (
        <section className="mb-4 overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4 py-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-cyan)]">
                galeria / r2
              </p>
              <h2 className="mt-1 text-lg font-semibold text-white">Fotos do imóvel</h2>
            </div>
            <StatusBadge tone="cyan">{images.length} foto(s)</StatusBadge>
          </div>

          <div className="grid gap-3 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
            <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]">
              <img
                src={heroImage.url}
                alt={heroImage.alt || opportunity.title}
                className="aspect-[16/9] h-full w-full object-cover"
              />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-2">
              {images.slice(1, 9).map((image, index) => (
                <div
                  key={`${image.url}-${index}`}
                  className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]"
                >
                  <img
                    src={image.url}
                    alt={image.alt || `${opportunity.title} foto ${index + 2}`}
                    loading="lazy"
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mb-4 grid gap-3 md:grid-cols-3">
        <DashboardCard title="Score oportunidade" eyebrow="potencial">
          <div className="flex items-end justify-between gap-3">
            <ScoreBadge score={opportunity.opportunityScore} className="h-12 min-w-16 text-lg" />
            <p className="max-w-56 text-right text-xs leading-5 text-[var(--admin-muted)]">
              Potencial combinado de desconto, liquidez e qualidade da fonte.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard title="Score risco" eyebrow="bloqueios">
          <div className="flex items-end justify-between gap-3">
            <RiskBadge score={opportunity.riskScore} className="h-12 min-w-16 text-lg" />
            <p className="max-w-56 text-right text-xs leading-5 text-[var(--admin-muted)]">
              Quanto maior o numero, maior a necessidade de diligencia humana.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard title="Compliance" eyebrow="guardrails">
          <div className="flex items-end justify-between gap-3">
            <ScoreBadge score={opportunity.complianceScore} className="h-12 min-w-16 text-lg" />
            <p className="max-w-56 text-right text-xs leading-5 text-[var(--admin-muted)]">
              Valida linguagem, fonte oficial, evidências e revisão obrigatória.
            </p>
          </div>
        </DashboardCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Financeiro" eyebrow="lance / mercado">
            <div className="grid gap-3 md:grid-cols-3">
              {opportunity.financialSummary.map((item) => (
                <div key={item.label} className="rounded-lg border border-[var(--admin-border)] px-3 py-3">
                  <p className="text-xs text-[var(--admin-muted)]">{item.label}</p>
                  <p className="mt-3 font-mono text-xl font-bold text-white">{item.value}</p>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{item.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Checklist jurídico" eyebrow="advogado / compliance" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {opportunity.checklist.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem] md:items-center"
                >
                  <div className="font-medium text-white">{item.label}</div>
                  <StatusBadge tone={getStatusTone(item.status)}>{item.status}</StatusBadge>
                  <div className="text-sm text-[var(--admin-soft)]">{item.owner}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Documentos" eyebrow="fontes / evidências" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {opportunity.documents.map((document) => (
                <div
                  key={document.label}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_9rem_12rem] md:items-center"
                >
                  <div className="font-medium text-white">{document.label}</div>
                  <StatusBadge tone={getStatusTone(document.status)}>{document.status}</StatusBadge>
                  <div className="text-sm text-[var(--admin-soft)]">{document.source}</div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="grid gap-4">
          <DashboardCard
            title="Riscos e ressalvas"
            eyebrow="guardrails"
            action={<ShieldAlert size={17} className="text-[var(--admin-yellow)]" />}
          >
            <div className="grid gap-3">
              {opportunity.riskFlags.map((risk) => (
                <div key={risk.label} className={cn("rounded-lg border px-3 py-3", toneBg[risk.severity])}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{risk.label}</p>
                    <span className={cn("font-mono text-[10px] uppercase", toneText[risk.severity])}>
                      {risk.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{risk.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Próxima ação" eyebrow="responsável">
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
              <p className="font-semibold text-white">{opportunity.nextAction}</p>
              <p className="mt-2 text-sm text-[var(--admin-soft)]">Responsável: {opportunity.owner}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">
                Ocupação: {opportunity.occupancy}. Tipo: {opportunity.propertyType}. Fonte: {opportunity.sourceType}.
              </p>
            </div>
          </DashboardCard>

          <DashboardCard title="Linha do tempo" eyebrow="auditoria" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {opportunity.timeline.map((item) => (
                <div key={`${item.time}-${item.actor}`} className="flex gap-3 px-4 py-3">
                  <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", toneText[item.tone], "bg-current")} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-[var(--admin-muted)]">{item.time}</span>
                      <span className="text-sm font-semibold text-white">{item.actor}</span>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-[var(--admin-soft)]">{item.action}</p>
                  </div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
