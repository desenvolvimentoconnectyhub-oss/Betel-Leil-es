import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileCheck2, Users } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  getInvestorProfileById,
  listInvestorCommunicationEvents,
  listInvestorMatchesForInvestor,
} from "@/lib/admin/repository";
import { riskAppetiteLabel } from "@/lib/admin/investors";
import { formatCurrency } from "@/lib/admin/resources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [investorResult, matchesResult, communicationResult] = await Promise.all([
    getInvestorProfileById(id),
    listInvestorMatchesForInvestor(id),
    listInvestorCommunicationEvents(id, 8),
  ]);
  const investor = investorResult.data;

  if (!investor) notFound();

  const primaryMatchHref = matchesResult.data[0]
    ? `/admin/investidores/${investor.id}/matches/${matchesResult.data[0].opportunity.id}`
    : `/admin/investidores/${investor.id}`;

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <Link href="/admin/investidores">
              <ArrowLeft size={15} />
              Investidores
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={getStatusTone(investor.status)}>{investor.status}</StatusBadge>
            <StatusBadge tone="cyan">{investor.planKey.toUpperCase()}</StatusBadge>
            <StatusBadge tone="purple">{riskAppetiteLabel(investor.riskAppetite)}</StatusBadge>
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href={primaryMatchHref}>
                <FileCheck2 size={15} />
                Preparar dossie
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-8 items-center gap-2 rounded-lg border border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-purple)]">
              <Users size={14} />
              {investor.id} / {investor.organization}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">{investor.name}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">
              {investor.email || "Email nao informado"} - {investor.phone || "Telefone nao informado"}. Responsavel:{" "}
              {investor.owner}.
            </p>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">{investor.notes}</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Teto</p>
                <p className="mt-2 font-mono text-lg font-bold text-white">{formatCurrency(investor.maxBudget)}</p>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">ROI alvo</p>
                <p className="mt-2 font-mono text-lg font-bold text-[var(--admin-green)]">
                  {investor.targetRoiPct}%
                </p>
              </div>
            </div>
            <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
              <p className="text-xs text-[var(--admin-muted)]">Pracas foco</p>
              <p className="mt-2 text-sm font-semibold text-white">{investor.cityFocus.join(", ") || "Sem foco"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardCard title="Apetite de risco" eyebrow="perfil">
          <div className="flex items-end justify-between gap-3">
            <StatusBadge tone="purple">{riskAppetiteLabel(investor.riskAppetite)}</StatusBadge>
            <p className="max-w-56 text-right text-xs leading-5 text-[var(--admin-muted)]">
              Define quao restritivo o matching sera em ocupacao, processo e revisao juridica.
            </p>
          </div>
        </DashboardCard>

        <DashboardCard title="Acesso" eyebrow="comunicacao">
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <StatusBadge tone="cyan">{investor.planKey}</StatusBadge>
              <StatusBadge tone="purple">{investor.lifecycleStage}</StatusBadge>
              <StatusBadge tone={investor.communicationFrequency === "paused" ? "yellow" : "green"}>
                {investor.communicationFrequency}
              </StatusBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              {investor.whatsappOptIn && <StatusBadge tone="green">WhatsApp</StatusBadge>}
              {investor.emailOptIn && <StatusBadge tone="green">Email</StatusBadge>}
              {investor.pushOptIn && <StatusBadge tone="cyan">Push</StatusBadge>}
              {investor.communityOptIn && <StatusBadge tone="purple">Comunidade</StatusBadge>}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Tipos preferidos" eyebrow="tese">
          <div className="flex flex-wrap gap-2">
            {(investor.preferredPropertyTypes.length ? investor.preferredPropertyTypes : ["Todos"]).map((item) => (
              <StatusBadge key={item} tone="cyan">
                {item}
              </StatusBadge>
            ))}
          </div>
        </DashboardCard>

        <DashboardCard title="Fonte de dados" eyebrow="runtime">
          <div className="flex items-end justify-between gap-3">
            <StatusBadge tone={investorResult.source === "supabase" ? "green" : "yellow"}>
              {investorResult.source}
            </StatusBadge>
            <p className="max-w-56 text-right text-xs leading-5 text-[var(--admin-muted)]">
              {investorResult.reason || "Perfil carregado da camada runtime."}
            </p>
          </div>
        </DashboardCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.7fr)]">
        <DashboardCard
          title="Oportunidades compativeis"
          eyebrow="matching deterministico"
          action={<StatusBadge tone="purple">{matchesResult.data.length} matches</StatusBadge>}
          contentClassName="p-0"
        >
          <div className="divide-y divide-[var(--admin-border)]">
            {matchesResult.data.map((match) => (
              <div key={match.id} className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="font-semibold text-white transition hover:text-[var(--admin-cyan)]"
                      href={`/admin/oportunidades/${match.opportunity.id}`}
                    >
                      {match.opportunity.title}
                    </Link>
                    <StatusBadge tone={getStatusTone(match.opportunity.legalStatus)}>
                      {match.opportunity.legalStatus}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-sm text-[var(--admin-muted)]">
                    {match.opportunity.city}/{match.opportunity.state} - {match.opportunity.propertyType} -{" "}
                    {formatCurrency(match.opportunity.initialBid)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {match.reasons.slice(0, 4).map((reason) => (
                      <span
                        key={reason}
                        className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 text-xs text-[var(--admin-soft)]"
                      >
                        {reason}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid content-start gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <ScoreBadge score={match.matchScore} />
                    <RiskBadge score={match.opportunity.riskScore} />
                  </div>
                  <p className="text-xs leading-5 text-[var(--admin-muted)]">{match.action}</p>
                  <Button
                    asChild
                    variant="outline"
                    className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                  >
                    <Link href={`/admin/investidores/${investor.id}/matches/${match.opportunity.id}`}>
                      Preparar abordagem
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>

        <div className="grid content-start gap-4">
          <DashboardCard title="Criterios do matching" eyebrow="score">
            <div className="grid gap-3 text-sm leading-6 text-[var(--admin-soft)]">
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                Teto, praca, tipo de imovel, desconto estimado e risco juridico entram no score.
              </div>
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                O resultado e uma sugestao operacional. Contato e recomendacao final continuam supervisionados.
              </div>
            </div>
          </DashboardCard>

          <DashboardCard title="Proxima acao" eyebrow="comercial">
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
              <p className="font-semibold text-white">Selecionar oportunidade e preparar abordagem</p>
              <p className="mt-2 text-sm leading-6 text-[var(--admin-muted)]">
                Gere ou revise o dossie antes de enviar qualquer mensagem para o investidor.
              </p>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Historico de comunicacao"
            eyebrow="crm / outbox / entrega"
            contentClassName="p-0"
          >
            <div className="divide-y divide-[var(--admin-border)]">
              {communicationResult.data.length ? (
                communicationResult.data.map((event) => (
                  <div key={event.id} className="grid gap-2 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                          {event.eventType} / {event.channel}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-white">
                          {event.opportunityCode || event.messageCode || "Comunicacao"}
                        </p>
                      </div>
                      <StatusBadge tone={event.tone}>{event.status}</StatusBadge>
                    </div>
                    <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[var(--admin-muted)]">
                      {event.adapterLabel && <span>{event.adapterLabel}</span>}
                      {event.providerStatus && <span>{event.providerStatus}</span>}
                      {!!event.attempt && <span>t{event.attempt}</span>}
                      {event.scheduledFor && <span>agenda {event.scheduledFor}</span>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-5 text-sm leading-6 text-[var(--admin-muted)]">
                  {communicationResult.reason || "Nenhum evento registrado para este investidor ainda."}
                </div>
              )}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
