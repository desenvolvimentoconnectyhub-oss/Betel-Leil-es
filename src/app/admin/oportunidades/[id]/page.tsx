import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  FileCheck2,
  Gavel,
  ImageOff,
  ListChecks,
  MapPin,
  Pencil,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { PropertyMarketAnalysisPanel } from "@/components/admin/PropertyMarketAnalysisPanel";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { getAuctionOpportunityByCode, getPropertyMarketAnalysisByOpportunityCode } from "@/lib/admin/repository";
import {
  type PropertyImageAsset,
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

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      className="inline-flex h-8 items-center rounded-md border border-[var(--admin-border)] px-3 text-xs font-semibold text-[var(--admin-muted)] transition hover:border-[rgba(255,90,31,0.32)] hover:text-[var(--admin-foreground)]"
    >
      {children}
    </a>
  );
}

function HeaderScoreCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 py-2">
      <p className="truncate text-[10px] text-[var(--admin-muted)]">{label}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Gallery({
  images,
  heroImage,
  title,
}: {
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  title: string;
}) {
  const thumbnails = images.filter((image) => image.url !== heroImage?.url).slice(0, 6);
  const extraCount = Math.max(0, images.length - thumbnails.length - (heroImage ? 1 : 0));
  const hasThumbnails = thumbnails.length > 0 || extraCount > 0;

  return (
    <section
      id="fotos"
      className="scroll-mt-24 overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)]"
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
            galeria / r2
          </p>
          <h2 className="truncate text-sm font-semibold text-[var(--admin-foreground)]">Fotos do imovel</h2>
        </div>
        <StatusBadge tone={heroImage ? "green" : "yellow"}>{images.length} foto(s)</StatusBadge>
      </div>

      <div className="grid gap-2 p-3">
        {heroImage ? (
          <div className="overflow-hidden rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]">
            <img
              src={heroImage.url}
              alt={heroImage.alt || title}
              className="aspect-[16/10] max-h-[280px] w-full object-cover"
            />
          </div>
        ) : (
          <div className="grid aspect-[16/10] max-h-[280px] place-items-center rounded-md border border-[var(--admin-border)] bg-[rgba(234,179,8,0.08)] text-center">
            <div>
              <ImageOff className="mx-auto text-[var(--admin-muted)]" size={34} />
              <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-yellow)]">
                Sem foto real
              </p>
            </div>
          </div>
        )}

        {hasThumbnails ? (
          <div className="grid grid-cols-4 gap-2">
            {thumbnails.map((image, index) => (
              <div
                key={`${image.url}-${index}`}
                className="overflow-hidden rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]"
              >
                <img
                  src={image.url}
                  alt={image.alt || `${title} foto ${index + 2}`}
                  loading="lazy"
                  className="aspect-[4/3] h-full w-full object-cover"
                />
              </div>
            ))}
            {extraCount > 0 ? (
              <div className="grid aspect-[4/3] place-items-center rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] font-mono text-xs font-semibold text-[var(--admin-muted)]">
                +{extraCount}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [opportunityResult, marketAnalysisResult] = await Promise.all([
    getAuctionOpportunityByCode(id),
    getPropertyMarketAnalysisByOpportunityCode(id),
  ]);
  const opportunity = opportunityResult.data;

  if (!opportunity) notFound();

  const analysis = marketAnalysisResult.data;
  const images = (opportunity.images || []).filter((image) => image.status !== "failed");
  const heroImage = images.find((image) => image.status === "mirrored") || images[0];
  const latestTimeline = [...opportunity.timeline].slice(-3).reverse();

  return (
    <div className="mx-auto max-w-[1580px] px-3 py-3 lg:px-5">
      <section className="mb-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                asChild
                variant="outline"
                className="h-8 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-foreground)]"
              >
                <Link href="/admin/oportunidades">
                  <ArrowLeft size={14} />
                  Imoveis analisados
                </Link>
              </Button>
              <StatusBadge tone={getStatusTone(opportunity.aiStatus)}>{opportunity.aiStatus}</StatusBadge>
              <StatusBadge tone={getStatusTone(opportunity.legalStatus)}>{opportunity.legalStatus}</StatusBadge>
              {analysis ? <StatusBadge tone={getStatusTone(analysis.status)}>{analysis.status}</StatusBadge> : null}
            </div>

            <div className="mb-2 inline-flex h-7 items-center gap-2 rounded-md border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] px-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-cyan)]">
              <Gavel size={13} />
              {opportunity.id} / {opportunity.stage}
            </div>
            <h1 className="max-w-5xl text-xl font-semibold tracking-tight text-[var(--admin-foreground)] lg:text-2xl">
              {opportunity.title}
            </h1>
            <p className="mt-2 flex flex-wrap items-center gap-1 text-sm text-[var(--admin-muted)]">
              <MapPin size={14} />
              <span>{opportunity.address} - {opportunity.city}/{opportunity.state}</span>
              <span className="text-[var(--admin-border)]">|</span>
              <span>Fonte: {opportunity.sourceName}</span>
            </p>
            <p className="mt-2 max-w-5xl text-sm leading-6 text-[var(--admin-soft)]">{opportunity.summary}</p>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <Button
                asChild
                variant="outline"
                className="h-8 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-foreground)]"
              >
                <Link href={`/admin/oportunidades/${opportunity.id}/editar`}>
                  <Pencil size={14} />
                  Editar imovel
                </Link>
              </Button>
              <Button className="h-8 bg-[var(--admin-cyan)] text-black hover:bg-white">
                <FileCheck2 size={14} />
                Gerar dossie
              </Button>
            </div>
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-2">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                  score da analise
                </p>
                <StatusBadge tone={getStatusTone(opportunity.stage)}>{opportunity.stage}</StatusBadge>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <HeaderScoreCard label="Potencial">
                  <ScoreBadge score={opportunity.opportunityScore} className="h-9 min-w-12" />
                </HeaderScoreCard>
                <HeaderScoreCard label="Risco">
                  <RiskBadge score={opportunity.riskScore} className="h-9 min-w-12" />
                </HeaderScoreCard>
                <HeaderScoreCard label="Compliance">
                  <ScoreBadge score={opportunity.complianceScore} className="h-9 min-w-12" />
                </HeaderScoreCard>
              </div>
            </div>
          </div>
        </div>

        <nav className="mt-3 flex gap-2 overflow-x-auto border-t border-[var(--admin-border)] pt-3">
          <SectionLink href="#fotos">Fotos</SectionLink>
          <SectionLink href="#mercado">Mercado</SectionLink>
          <SectionLink href="#operacao">Operacao</SectionLink>
          <SectionLink href="#evidencias">Evidencias</SectionLink>
          <SectionLink href="#ajustes">Ajustes</SectionLink>
        </nav>
      </section>

      <div className="grid gap-4 xl:grid-cols-[430px_minmax(0,1fr)]">
        <aside id="operacao" className="grid content-start gap-4 xl:sticky xl:top-4">
          <Gallery images={images} heroImage={heroImage} title={opportunity.title} />

          <DashboardCard title="Fila de decisao" eyebrow="operacao">
            <div className="grid gap-3">
              <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--admin-foreground)]">
                  <Target size={15} className="text-[var(--admin-cyan)]" />
                  Proxima acao
                </div>
                <p className="text-sm leading-5 text-[var(--admin-soft)]">{opportunity.nextAction}</p>
                <p className="mt-2 text-xs text-[var(--admin-muted)]">Responsavel: {opportunity.owner}</p>
              </div>

              <Button
                asChild
                className="h-9 bg-[var(--admin-green)] text-black hover:bg-white"
              >
                <a href="#ajustes">
                  <ListChecks size={15} />
                  Decidir analise
                </a>
              </Button>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Riscos principais"
            eyebrow="guardrails"
            action={<ShieldAlert size={17} className="text-[var(--admin-yellow)]" />}
          >
            <div className="grid gap-2">
              {opportunity.riskFlags.slice(0, 3).map((risk) => (
                <div key={risk.label} className={cn("rounded-md border px-3 py-2", toneBg[risk.severity])}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{risk.label}</p>
                    <span className={cn("font-mono text-[10px] uppercase", toneText[risk.severity])}>
                      {risk.severity}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">{risk.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Checklist" eyebrow="etapas" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {opportunity.checklist.slice(0, 5).map((item) => (
                <div key={item.label} className="grid gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-[var(--admin-foreground)]">{item.label}</p>
                    <StatusBadge tone={getStatusTone(item.status)}>{item.status}</StatusBadge>
                  </div>
                  <p className="text-xs text-[var(--admin-muted)]">{item.owner}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
        </aside>

        <main className="grid min-w-0 content-start gap-4">
          <section id="mercado" className="scroll-mt-24">
            <PropertyMarketAnalysisPanel
              analysis={analysis}
              reason={marketAnalysisResult.reason}
            />
          </section>
        </main>
      </div>

      <section id="evidencias" className="mt-4 grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <DashboardCard title="Documentos e trilha" eyebrow="evidencias" contentClassName="p-0">
          <div className="divide-y divide-[var(--admin-border)]">
            {opportunity.documents.map((document) => (
              <div
                key={document.label}
                className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_9rem_12rem] md:items-center"
              >
                <div className="font-medium text-[var(--admin-foreground)]">{document.label}</div>
                <StatusBadge tone={getStatusTone(document.status)}>{document.status}</StatusBadge>
                <div className="text-sm text-[var(--admin-soft)]">{document.source}</div>
              </div>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Linha do tempo" eyebrow="auditoria" contentClassName="p-0">
          <div className="divide-y divide-[var(--admin-border)]">
            {latestTimeline.map((item) => (
              <div key={`${item.time}-${item.actor}`} className="flex gap-3 px-4 py-3">
                <div className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", toneText[item.tone], "bg-current")} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10px] text-[var(--admin-muted)]">{item.time}</span>
                    <span className="text-sm font-semibold text-[var(--admin-foreground)]">{item.actor}</span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-sm leading-5 text-[var(--admin-soft)]">{item.action}</p>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </section>

    </div>
  );
}
