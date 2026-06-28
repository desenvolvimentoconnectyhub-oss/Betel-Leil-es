import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileText,
  Gavel,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getAdvisoryContractGate } from "@/lib/admin/repository";
import { type ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";
import { issueAdvisoryContractAction, signAdvisoryContractAction } from "./actions";

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

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export default async function AdvisoryContractGatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; opportunityId: string }>;
  searchParams?: Promise<{ status?: string; message?: string }>;
}) {
  const { id, opportunityId } = await params;
  const query = searchParams ? await searchParams : {};
  const gateResult = await getAdvisoryContractGate(id, opportunityId);
  const gate = gateResult.data;

  if (!gate) notFound();

  const packHref = `/admin/investidores/${gate.investor.id}/matches/${gate.opportunity.id}`;
  const canPersistContract = gateResult.source === "supabase" && looksLikeUuid(gate.investor.id);
  const canIssueContract = canPersistContract && gate.canIssueContract;
  const canSignContract = canPersistContract && gate.canSignContract;
  const flashMessage = query.message || "";
  const flashIsError = query.status === "error";

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      {flashMessage && (
        <Alert
          variant={flashIsError ? "destructive" : "default"}
          className={cn(
            "mb-4 border-[var(--admin-border)] bg-[var(--admin-card)]",
            flashIsError
              ? "border-[rgba(239,68,68,0.32)] text-[var(--admin-red)]"
              : "border-[rgba(34,197,94,0.28)] text-[var(--admin-green)]"
          )}
        >
          {flashIsError ? <CircleAlert size={16} /> : <CheckCircle2 size={16} />}
          <AlertTitle>{flashIsError ? "Acao nao concluida" : "Gate atualizado"}</AlertTitle>
          <AlertDescription className="text-[var(--admin-soft)]">{flashMessage}</AlertDescription>
        </Alert>
      )}

      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <Link href={packHref}>
              <ArrowLeft size={15} />
              Voltar ao pacote
            </Link>
          </Button>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={gate.statusTone}>{gate.statusLabel}</StatusBadge>
            <StatusBadge tone={gate.authorization.tone}>{gate.authorization.status}</StatusBadge>
            <Button asChild className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white">
              <Link href={`/admin/oportunidades/${gate.opportunity.id}`}>
                <Gavel size={15} />
                Ver oportunidade
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <div className="mb-3 inline-flex h-8 items-center gap-2 rounded-lg border border-[rgba(139,92,246,0.26)] bg-[rgba(139,92,246,0.09)] px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-purple)]">
              <LockKeyhole size={14} />
              Gate contrato / {gate.id}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              Contrato e autorizacao para {gate.investor.name}
            </h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-muted)]">
              {gate.canOperate
                ? "Autorizacao formal registrada: WhatsApp supervisionado, estrategia de lance e sala de arremate podem seguir com auditoria."
                : "Trava operacional entre dossie comercial e execucao: WhatsApp conclusivo, orientacao de lance e sala de arremate permanecem bloqueados ate autorizacao formal."}
            </p>
            <p className="mt-4 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">{gate.summary}</p>
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Match</p>
                <div className="mt-2">
                  <ScoreBadge score={gate.match.matchScore} className="h-10 min-w-14 text-base" />
                </div>
              </div>
              <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                <p className="text-xs text-[var(--admin-muted)]">Risco</p>
                <div className="mt-2">
                  <RiskBadge score={gate.opportunity.riskScore} className="h-10 min-w-14 text-base" />
                </div>
              </div>
            </div>
            <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
              <p className="text-xs text-[var(--admin-muted)]">Teto sugerido para autorizacao</p>
              <p className="mt-2 font-mono text-lg font-bold text-[var(--admin-cyan)]">
                {gate.authorization.maxAuthorizedBidLabel}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-4 grid gap-3 md:grid-cols-4">
        {gate.metrics.map((metric) => (
          <article key={metric.label} className={cn("min-h-[122px] rounded-lg border px-4 py-4", toneBg[metric.tone])}>
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className={cn("mt-5 font-mono text-xl font-bold tracking-tight", toneText[metric.tone])}>
              {metric.value}
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Travas obrigatorias" eyebrow="precondicoes / assinatura" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {gate.requirements.map((item) => (
                <div
                  key={`${item.scope}-${item.label}`}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_11rem_minmax(12rem,0.9fr)] md:items-center"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {item.tone === "green" ? (
                      <CheckCircle2 size={16} className="shrink-0 text-[var(--admin-green)]" />
                    ) : (
                      <CircleAlert size={16} className="shrink-0 text-[var(--admin-yellow)]" />
                    )}
                    <div className="font-medium text-white">{item.label}</div>
                  </div>
                  <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                  <div className="text-sm leading-5 text-[var(--admin-muted)]">{item.detail}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Pacote documental" eyebrow="dossie / juridico / autorizacao" contentClassName="p-0">
            <div className="divide-y divide-[var(--admin-border)]">
              {gate.documents.map((document) => (
                <div
                  key={document.label}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_10rem_8rem_minmax(12rem,0.9fr)] lg:items-center"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <FileText size={15} className={cn("shrink-0", toneText[document.tone])} />
                    <div className="font-medium text-white">{document.label}</div>
                  </div>
                  <StatusBadge tone={document.tone}>{document.status}</StatusBadge>
                  <div className="text-xs font-medium text-[var(--admin-muted)]">{document.owner}</div>
                  <div className="text-sm leading-5 text-[var(--admin-muted)]">{document.detail}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard title="Acoes operacionais" eyebrow="controle / destravamento">
            <div className="grid gap-3 md:grid-cols-3">
              {gate.lockedActions.map((action) => (
                <div key={action.label} className={cn("rounded-lg border px-3 py-3", toneBg[action.tone])}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold text-white">{action.label}</p>
                    <LockKeyhole size={15} className={toneText[action.tone]} />
                  </div>
                  <StatusBadge tone={action.tone} className="mt-3">
                    {action.status}
                  </StatusBadge>
                  <p className="mt-3 text-xs leading-5 text-[var(--admin-soft)]">{action.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard
            title="Autorizacao"
            eyebrow="minuta segura"
            action={<FileCheck2 size={17} className="text-[var(--admin-cyan)]" />}
          >
            <div className="grid gap-3">
              <div className="rounded-lg border border-[var(--admin-border)] bg-[#070707] p-3">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                  Signatario
                </p>
                <p className="mt-2 font-semibold text-white">{gate.authorization.signerName}</p>
                <p className="text-sm text-[var(--admin-muted)]">{gate.authorization.signerEmail}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                  <p className="text-xs text-[var(--admin-muted)]">Status</p>
                  <div className="mt-2">
                    <StatusBadge tone={gate.authorization.tone}>{gate.authorization.status}</StatusBadge>
                  </div>
                </div>
                <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                  <p className="text-xs text-[var(--admin-muted)]">Validade</p>
                  <p className="mt-2 text-sm font-semibold text-white">{gate.authorization.expiresAt}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                  <p className="text-xs text-[var(--admin-muted)]">Contrato</p>
                  <p className="mt-2 break-all font-mono text-xs font-semibold text-white">
                    {gate.authorization.contractCode}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--admin-border)] px-3 py-3">
                  <p className="text-xs text-[var(--admin-muted)]">Assinatura</p>
                  <p className="mt-2 text-sm font-semibold text-white">{gate.authorization.signedAt}</p>
                </div>
              </div>
              <div className="rounded-lg border border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)] p-3">
                <p className="text-xs text-[var(--admin-muted)]">Limite maximo sugerido</p>
                <p className="mt-2 font-mono text-2xl font-bold text-[var(--admin-cyan)]">
                  {gate.authorization.maxAuthorizedBidLabel}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-soft)]">{gate.authorization.legalNote}</p>
              </div>
              <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--admin-muted)]">
                  Registro interno
                </p>
                <p className="mt-2 text-sm leading-5 text-[var(--admin-soft)]">
                  Revisao: {gate.authorization.reviewOwner} / {gate.authorization.reviewedAt}
                </p>
                <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{gate.authorization.notes}</p>
              </div>

              {!canPersistContract && (
                <div className="rounded-lg border border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)] p-3 text-xs leading-5 text-[var(--admin-soft)]">
                  Persistencia desativada para este registro de demonstracao. Para emitir e assinar, use investidor e
                  oportunidade gravados no Supabase.
                </div>
              )}

              {!gate.preconditionsReady && (
                <div className="rounded-lg border border-[rgba(239,68,68,0.24)] bg-[rgba(239,68,68,0.08)] p-3 text-xs leading-5 text-[var(--admin-soft)]">
                  Resolva as precondicoes obrigatorias antes de emitir minuta ou registrar assinatura.
                </div>
              )}

              <form action={issueAdvisoryContractAction} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[#070707] p-3">
                <input type="hidden" name="investorId" value={gate.investor.id} />
                <input type="hidden" name="opportunityId" value={gate.opportunity.id} />
                <div className="grid gap-2">
                  <Label htmlFor="reviewedBy" className="text-xs text-[var(--admin-muted)]">
                    Responsavel pela minuta
                  </Label>
                  <Input
                    id="reviewedBy"
                    name="reviewedBy"
                    defaultValue={gate.authorization.reviewOwner}
                    className="border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="notes" className="text-xs text-[var(--admin-muted)]">
                    Observacoes
                  </Label>
                  <Textarea
                    id="notes"
                    name="notes"
                    defaultValue="Minuta emitida apos dossie, parecer e fonte oficial validados."
                    className="min-h-20 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!canIssueContract}
                  className="h-9 bg-[var(--admin-cyan)] text-black hover:bg-white disabled:pointer-events-none disabled:opacity-45"
                >
                  <FileCheck2 size={15} />
                  Emitir minuta
                </Button>
              </form>

              <form action={signAdvisoryContractAction} className="grid gap-3 rounded-lg border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] p-3">
                <input type="hidden" name="investorId" value={gate.investor.id} />
                <input type="hidden" name="opportunityId" value={gate.opportunity.id} />
                <input type="hidden" name="reviewedBy" value={gate.authorization.reviewOwner} />
                <input
                  type="hidden"
                  name="notes"
                  value="Assinatura validada pela operacao antes de liberar execucao."
                />
                <p className="text-xs leading-5 text-[var(--admin-soft)]">
                  Use somente depois de confirmar assinatura/aceite formal fora da plataforma.
                </p>
                <Button
                  type="submit"
                  disabled={!canSignContract}
                  className="h-9 bg-[var(--admin-green)] text-black hover:bg-white disabled:pointer-events-none disabled:opacity-45"
                >
                  <ShieldCheck size={15} />
                  Registrar assinatura
                </Button>
              </form>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Liberacoes futuras"
            eyebrow="apos aceite"
            action={<ShieldCheck size={17} className="text-[var(--admin-green)]" />}
          >
            <div className="grid gap-3">
              {gate.nextUnlocks.map((step, index) => (
                <div key={step} className="flex gap-3">
                  <div className="grid size-7 shrink-0 place-items-center rounded-md border border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)] font-mono text-[11px] font-bold text-[var(--admin-green)]">
                    {index + 1}
                  </div>
                  <div className="min-h-8 text-sm leading-6 text-[var(--admin-soft)]">{step}</div>
                </div>
              ))}
            </div>
          </DashboardCard>

          <DashboardCard
            title="Trilha"
            eyebrow="auditoria"
            action={<MessageSquareText size={17} className="text-[var(--admin-purple)]" />}
          >
            <div className="grid gap-2">
              {gate.auditTrail.map((event) => (
                <div key={event.label} className={cn("rounded-md border px-3 py-2", toneBg[event.tone])}>
                  <p className="text-sm font-semibold text-white">{event.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--admin-soft)]">{event.detail}</p>
                </div>
              ))}
            </div>
          </DashboardCard>
        </div>
      </section>
    </div>
  );
}
