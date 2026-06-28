import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2, Gavel, LockKeyhole, MessageSquareText, ShieldCheck } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { getInvestorCommercialPack } from "@/lib/admin/repository";
import { formatCurrency, type ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function InvestorMatchPage({
  params,
}: {
  params: Promise<{ id: string; opportunityId: string }>;
}) {
  const { id, opportunityId } = await params;
  const packResult = await getInvestorCommercialPack(id, opportunityId);
  const pack = packResult.data;

  if (!pack) notFound();

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <Link href={`/admin/investidores/${pack.investor.id}`}>
              <ArrowLeft size={15} />
              Voltar ao investidor
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={pack.suitability.tone}>{pack.suitability.label}</StatusBadge>
            <StatusBadge tone={getStatusTone(pack.opportunity.legalStatus)}>{pack.opportunity.legalStatus}</StatusBadge>
            <Button
              asChild
              variant="outline"
              className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href={`/admin/investidores/${pack.investor.id}/matches/${pack.opportunity.id}/contrato`}>
                <LockKeyhole size={15} />
                Gate contrato
              </Link>
            </Button>
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href={`/admin/oportunidades/${pack.opportunity.id}`}>
                <Gavel size={15} />
                Ver oportunidade
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-8 items-center gap-2 rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-cyan)]">
              <FileCheck2 size={14} />
              Pacote comercial / {pack.id}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              {pack.investor.name} x {pack.opportunity.title}
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">
              Dossie operacional para validar fit, riscos, mensagem supervisionada e proximos passos antes de contato
              externo.
            </p>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">{pack.suitability.detail}</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Match</p>
                <div className="mt-2">
                  <ScoreBadge score={pack.match.matchScore} className="h-10 min-w-14 text-base" />
                </div>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Risco</p>
                <div className="mt-2">
                  <RiskBadge score={pack.opportunity.riskScore} className="h-10 min-w-14 text-base" />
                </div>
              </div>
            </div>
            <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
              <p className="text-xs text-[var(--admin-muted)]">Lance inicial</p>
              <p className="mt-2 font-mono text-lg font-bold text-white">
                {formatCurrency(pack.opportunity.initialBid)}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        {pack.metrics.map((metric) => (
          <article
            key={metric.label}
            className={cn("min-h-[122px] rounded-lg border px-4 py-4", toneBg[metric.tone])}
          >
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className={cn("mt-5 font-mono text-2xl font-bold tracking-tight", toneText[metric.tone])}>
              {metric.value}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Dossie comercial" eyebrow="resumo / tese / fit">
            <div className="grid gap-3">
              {pack.dossierBlocks.map((block) => (
                <div key={block.title} className={cn("rounded-lg border px-3 py-3", toneBg[block.tone])}>
                  <div className={cn("font-mono text-[10px] font-semibold uppercase", toneText[block.tone])}>
                    {block.title}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--admin-soft)]">{block.body}</p>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Checklist antes do envio" eyebrow="compliance / comercial" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {pack.checklist.map((item) => (
                <div
                  key={item.label}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_11rem_minmax(12rem,0.9fr)] md:items-center"
                >
                  <div className="font-medium text-white">{item.label}</div>
                  <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  <div className="text-sm leading-5 text-[var(--admin-muted)]">{item.detail}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Riscos e ressalvas" eyebrow="bloqueios possiveis">
            <div className="grid gap-3 md:grid-cols-2">
              {pack.riskNotes.map((risk) => (
                <div key={risk.label} className={cn("rounded-lg border px-3 py-3", toneBg[risk.tone])}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{risk.label}</p>
                    <span className={cn("font-mono text-[10px] uppercase", toneText[risk.tone])}>{risk.tone}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{risk.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard
            title="Mensagem supervisionada"
            eyebrow="rascunho seguro"
            action={<MessageSquareText size={17} className="text-[var(--admin-cyan)]" />}
          >
            <div className="rounded-lg border border-[var(--admin-border)] bg-[#070707] p-3">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-[var(--admin-soft)]">
                {pack.supervisedMessage}
              </pre>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Guardrails"
            eyebrow="antes de WhatsApp"
            action={<ShieldCheck size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="grid gap-2">
              {pack.complianceNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm leading-5 text-[var(--admin-soft)]"
                >
                  {note}
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Proximos passos" eyebrow="esteira">
            <div className="grid gap-3">
              {pack.nextSteps.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="grid size-7 shrink-0 place-items-center rounded-md border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] font-mono text-[11px] font-bold text-[var(--admin-cyan)]">
                    {index + 1}
                  </div>
                  <div className="min-h-8 text-sm leading-6 text-[var(--admin-soft)]">{step}</div>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
