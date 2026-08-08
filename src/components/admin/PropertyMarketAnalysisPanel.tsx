import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Banknote,
  BarChart3,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileSearch,
  Home,
  Save,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { savePropertyMarketAnalysisAction } from "@/app/admin/oportunidades/actions";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decisionTone,
  statusTone,
  type PropertyMarketAnalysis,
  type PropertyMarketComparable,
} from "@/lib/admin/market-analysis";
import { formatCurrency, type ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.24)] bg-[rgba(0,243,255,0.08)]",
  green: "border-[rgba(34,197,94,0.24)] bg-[rgba(34,197,94,0.08)]",
  yellow: "border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)]",
  red: "border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)]",
  purple: "border-[rgba(139,92,246,0.28)] bg-[rgba(139,92,246,0.09)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]",
};

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const inputClass =
  "h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const textareaClass =
  "min-h-20 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-sm text-white outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(0,243,255,0.18)]";

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function area(value: number) {
  if (!value) return "nao informado";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2`;
}

function pricePerM2(value: number) {
  return value ? `${formatCurrency(value)}/m2` : "nao calculado";
}

function decodeEscapedText(value: string) {
  const decoded = value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );

  if (!/[\u00c3\u00c2\u00e2]/.test(decoded)) return decoded;

  try {
    const bytes = Uint8Array.from(
      Array.from(decoded, (char) => Math.min(char.charCodeAt(0), 255))
    );
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decoded;
  }
}

function compactText(value?: string, fallback = "nao informado") {
  const cleaned = decodeEscapedText(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function paymentLabel(value?: string) {
  const normalized = compactText(value, "").toLowerCase();
  if (!normalized) return "validar edital";
  if (normalized.includes("parcel")) return "parcelado";
  if (normalized.includes("financi")) return "financiamento";
  if (normalized.includes("vista") || normalized.includes("a_vista")) return "a vista";
  return normalized.length > 26 ? `${normalized.slice(0, 26)}...` : normalized;
}

function sourceUrlFor(analysis: PropertyMarketAnalysis, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  return analysis.sourceLinks.find((item) => {
    const label = item.label.toLowerCase();
    return normalizedLabels.some((needle) => label.includes(needle));
  })?.url || "";
}

function MetricTile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
}) {
  return (
    <div className={cn("min-h-[88px] rounded-md border px-3 py-2.5", toneBorder[tone])}>
      <p className="text-xs text-[var(--admin-muted)]">{label}</p>
      <p className={cn("mt-2 truncate font-mono text-lg font-bold", toneText[tone])}>{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-soft)]">{detail}</p>
    </div>
  );
}

function ComparableRow({ comparable }: { comparable: PropertyMarketComparable }) {
  const value = comparable.soldPrice || comparable.askingPrice;
  const qualityTone: Record<PropertyMarketComparable["quality"], ResourceTone> = {
    strong: "green",
    medium: "yellow",
    weak: "purple",
    discarded: "red",
  };

  return (
    <div className="grid gap-3 border-b border-[var(--admin-border)] px-3 py-3 last:border-b-0 xl:grid-cols-[minmax(0,1fr)_8rem_8rem_7rem_6rem] xl:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-white">{comparable.sourceLabel}</p>
          <StatusBadge tone={qualityTone[comparable.quality]}>{comparable.quality}</StatusBadge>
        </div>
        <p className="mt-1 truncate text-xs text-[var(--admin-muted)]">
          {[comparable.neighborhood, comparable.city, comparable.state].filter(Boolean).join(" / ") || comparable.address}
        </p>
        {comparable.notes ? <p className="mt-1 line-clamp-2 text-xs text-[var(--admin-soft)]">{comparable.notes}</p> : null}
      </div>
      <div>
        <p className="font-mono text-sm font-semibold text-white">{formatCurrency(value)}</p>
        <p className="mt-1 text-[10px] text-[var(--admin-muted)]">{comparable.listingType}</p>
      </div>
      <div>
        <p className="font-mono text-sm font-semibold text-white">{pricePerM2(comparable.pricePerM2)}</p>
        <p className="mt-1 text-[10px] text-[var(--admin-muted)]">{area(comparable.areaM2)}</p>
      </div>
      <ScoreBadge score={comparable.similarityScore} className="h-8 min-w-11" />
      {comparable.sourceUrl ? (
        <Link
          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-[var(--admin-border)] px-2 text-xs font-semibold text-[var(--admin-muted)] transition hover:text-white"
          href={comparable.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Fonte
          <ArrowUpRight size={12} />
        </Link>
      ) : (
        <span className="text-xs text-[var(--admin-muted)]">sem link</span>
      )}
    </div>
  );
}

function InfoValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)] px-3 py-2", className)}>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs font-medium leading-5 text-[var(--admin-soft)]">{value}</p>
    </div>
  );
}

function TextDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.025)]">
      <summary className="flex min-h-9 cursor-pointer items-center justify-between gap-3 px-3 text-xs font-semibold text-[var(--admin-muted)]">
        {label}
        <ChevronDown size={14} className="transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--admin-border)] px-3 py-2 text-xs leading-5 text-[var(--admin-soft)]">
        {children}
      </div>
    </details>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Input className={inputClass} defaultValue={defaultValue} id={name} name={name} placeholder={placeholder} />
    </div>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Textarea className={textareaClass} defaultValue={defaultValue} id={name} name={name} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <select className={selectClass} defaultValue={defaultValue} id={name} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 text-sm text-[var(--admin-soft)]">
      <input className="accent-[var(--admin-cyan)]" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function CostField({ label, name, value }: { label: string; name: string; value?: number }) {
  return <Field label={label} name={name} defaultValue={value || ""} />;
}

function SubmitReviewButton({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className: string;
}) {
  return (
    <Button className={cn("h-9", className)} name="submitStatus" type="submit" value={value}>
      {children}
    </Button>
  );
}

export function PropertyMarketAnalysisPanel({
  analysis,
  reason,
}: {
  analysis: PropertyMarketAnalysis | null;
  reason?: string;
}) {
  if (!analysis) {
    return (
      <DashboardCard title="Analise de mercado" eyebrow="mercado / comparaveis">
        <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-sm text-[var(--admin-muted)]">
          Nenhuma analise de mercado encontrada para este imovel.
        </div>
      </DashboardCard>
    );
  }

  const subject = analysis.subject;
  const primaryCeiling = analysis.ceilingTargets[0];
  const secondaryCeiling = analysis.ceilingTargets[1];
  const decision = decisionTone(analysis.decision);
  const rental = analysis.rentalEstimate;
  const payment = analysis.paymentSimulation;
  const costByLabel = new Map(analysis.estimatedCosts.map((item) => [item.label.toLowerCase(), item.value]));
  const visibleSources = analysis.sourceLinks.slice(0, 5);
  const remainingSources = analysis.sourceLinks.slice(5);
  const cleanSummary = compactText(analysis.summary);
  const cleanDecisionReason = compactText(analysis.decisionReason);
  const cleanCautionNotes = compactText(analysis.cautionNotes, "");
  const cleanLegalSignal = compactText(analysis.legalSignal);
  const cleanPaymentCondition = compactText(analysis.paymentCondition, "");
  const rentYieldDetail = rental.monthlyRent
    ? `${percent(rental.monthlyYieldOnMarketPct)} a.m. mercado / ${percent(rental.monthlyYieldOnBidPct)} a.m. lance`
    : rental.referenceFound
      ? "referencia encontrada sem valor informado"
      : "sem referencia de aluguel";

  return (
    <DashboardCard
      title="Analise de mercado"
      eyebrow="comparaveis / teto / decisao"
      action={<StatusBadge tone={statusTone(analysis.status)}>{analysis.status}</StatusBadge>}
      contentClassName="p-3 lg:p-4"
    >
      <div className="grid gap-4">
        {reason ? <p className="text-xs leading-5 text-[var(--admin-muted)]">{reason}</p> : null}

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile label="Mercado base" value={formatCurrency(analysis.marketValueBase)} detail={pricePerM2(analysis.marketPricePerM2)} tone="cyan" />
          <MetricTile label="Lance atual" value={formatCurrency(analysis.initialBid)} detail={pricePerM2(analysis.initialBidPricePerM2)} tone="yellow" />
          <MetricTile label="Desconto real" value={percent(analysis.realDiscountPct)} detail="sobre mercado base" tone={analysis.realDiscountPct >= 35 ? "green" : "yellow"} />
          <MetricTile label={`Teto ${primaryCeiling?.label || "30%"}`} value={formatCurrency(primaryCeiling?.value || 0)} detail="margem Betel" tone="green" />
          <MetricTile label={`Teto ${secondaryCeiling?.label || "40%"}`} value={formatCurrency(secondaryCeiling?.value || 0)} detail="cenario mais defensivo" tone="purple" />
          <MetricTile label="Margem liquida" value={formatCurrency(analysis.estimatedNetMargin)} detail={`${analysis.estimatedCosts.length} custo(s)`} tone={analysis.estimatedNetMargin > 0 ? "green" : "yellow"} />
          <MetricTile label="Aluguel" value={rental.monthlyRent ? formatCurrency(rental.monthlyRent) : "pendente"} detail={rentYieldDetail} tone={rental.monthlyRent ? "cyan" : "muted"} />
          <MetricTile label="Confianca" value={`${analysis.confidenceScore}%`} detail={`${analysis.comparables.length} comparavel(is)`} tone={analysis.confidenceScore >= 70 ? "green" : "yellow"} />
        </div>

        <div className="grid gap-3 2xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.22fr)]">
          <div className={cn("rounded-md border p-3", toneBorder[decision])}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2">
                <BarChart3 size={17} className={toneText[decision]} />
                <h3 className="text-base font-semibold text-white">{analysis.decisionLabel}</h3>
              </div>
              <ScoreBadge score={analysis.liquidityScore} className="h-8 min-w-11" />
            </div>
            <p className="mt-3 max-h-20 overflow-hidden text-sm leading-5 text-[var(--admin-soft)]">{cleanSummary}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <InfoValue label="Liquidez" value={`${analysis.liquidityScore}%`} />
              <InfoValue label="Comparaveis" value={analysis.comparables.length || "pendente"} />
              <InfoValue label="Status" value={analysis.status} />
            </div>
            {cleanCautionNotes ? (
              <p className="mt-3 max-h-16 overflow-hidden rounded-md border border-[rgba(234,179,8,0.24)] bg-[rgba(234,179,8,0.08)] px-3 py-2 text-xs leading-5 text-[var(--admin-soft)]">
                {cleanCautionNotes}
              </p>
            ) : null}
            <div className="mt-3 grid gap-2">
              <TextDisclosure label="Ler justificativa completa">
                <p>{cleanDecisionReason}</p>
                {cleanCautionNotes ? <p className="mt-2">{cleanCautionNotes}</p> : null}
              </TextDisclosure>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Home size={16} className="text-[var(--admin-cyan)]" />
                Imovel analisado
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <InfoValue label="Tipo" value={subject.propertyType || "nao informado"} />
                <InfoValue label="Pagamento" value={paymentLabel(payment.paymentMode || analysis.paymentCondition)} />
                <InfoValue label="Privativa" value={area(subject.privateAreaM2)} />
                <InfoValue label="Terreno" value={area(subject.landAreaM2)} />
                <InfoValue label="Construida" value={area(subject.builtAreaM2)} />
                <InfoValue label="Dormitorios" value={subject.bedrooms || "nao informado"} />
                <InfoValue label="Garagem" value={subject.parkingSpaces || "nao informado"} className="sm:col-span-2" />
              </div>
            </div>

            <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Scale size={16} className="text-[var(--admin-yellow)]" />
                Juridico e ressalvas
              </div>
              <p className="max-h-24 overflow-hidden text-xs leading-5 text-[var(--admin-soft)]">{cleanLegalSignal}</p>
              {cleanLegalSignal.length > 220 ? (
                <div className="mt-3">
                  <TextDisclosure label="Ver texto juridico completo">{cleanLegalSignal}</TextDisclosure>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3 md:col-span-2">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <CreditCard size={16} className="text-[var(--admin-green)]" />
                Pagamento
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <InfoValue label="Modo" value={paymentLabel(payment.paymentMode)} />
                <InfoValue label="Entrada" value={payment.downPaymentPct ? `${percent(payment.downPaymentPct)} / ${formatCurrency(payment.downPaymentAmount)}` : "nao informado"} />
                <InfoValue label="Saldo" value={payment.installmentBalance ? formatCurrency(payment.installmentBalance) : "nao informado"} />
                <InfoValue label="Parcelas" value={payment.installmentCount ? `${payment.installmentCount}x de ${formatCurrency(payment.installmentAmount)}` : "nao informado"} />
              </div>
              {cleanPaymentCondition ? (
                <p className="mt-3 max-h-10 overflow-hidden text-xs leading-5 text-[var(--admin-muted)]">Condicao: {cleanPaymentCondition}</p>
              ) : null}
              {payment.correctionWarning ? <p className="mt-2 max-h-10 overflow-hidden text-xs leading-5 text-[var(--admin-yellow)]">{compactText(payment.correctionWarning)}</p> : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
          <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--admin-border)] px-3">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white">
                <FileSearch size={16} className="text-[var(--admin-cyan)]" />
                Comparaveis
              </div>
              <StatusBadge tone={analysis.comparables.length ? "green" : "yellow"}>
                {analysis.comparables.length || "pendente"}
              </StatusBadge>
            </div>
            {analysis.comparables.length ? (
              analysis.comparables.map((comparable) => <ComparableRow key={comparable.id} comparable={comparable} />)
            ) : (
              <p className="px-3 py-4 text-sm text-[var(--admin-muted)]">
                Sem comparaveis estruturados. O calculo atual usa os valores da ficha e precisa de validacao humana.
              </p>
            )}
          </div>

          <div className="grid gap-4">
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Calculator size={16} className="text-[var(--admin-green)]" />
                Cenarios
              </div>
              <div className="grid gap-2">
                {analysis.scenarios.map((scenario) => (
                  <div key={scenario.label} className="rounded-md border border-[var(--admin-border)] px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white">{scenario.label}</span>
                      <span className="font-mono text-xs font-bold text-[var(--admin-cyan)]">
                        {formatCurrency(scenario.marketValue)}
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--admin-muted)]">
                      {percent(scenario.realDiscountPct)} desconto / margem {formatCurrency(scenario.estimatedNetMargin)}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <Banknote size={16} className="text-[var(--admin-cyan)]" />
                Renda
              </div>
              <div className="grid gap-2 text-xs text-[var(--admin-soft)]">
                <span>Aluguel mensal: {rental.monthlyRent ? formatCurrency(rental.monthlyRent) : "nao informado"}</span>
                <span>Yield mercado: {rental.monthlyRent ? `${percent(rental.monthlyYieldOnMarketPct)} a.m. / ${percent(rental.annualYieldOnMarketPct)} a.a.` : "nao calculado"}</span>
                <span>Yield lance: {rental.monthlyRent ? `${percent(rental.monthlyYieldOnBidPct)} a.m. / ${percent(rental.annualYieldOnBidPct)} a.a.` : "nao calculado"}</span>
                <span>Referencia: {rental.referenceFound ? "encontrada" : "pendente"}</span>
              </div>
              {rental.notes ? <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{rental.notes}</p> : null}
            </div>

            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-4">
              <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                <ShieldCheck size={16} className="text-[var(--admin-purple)]" />
                Fontes
              </div>
              <div className="grid gap-2">
                {visibleSources.length ? (
                  visibleSources.map((source) => (
                    <Link
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-9 items-center justify-between gap-3 rounded-md border border-[var(--admin-border)] px-3 text-xs font-semibold text-[var(--admin-soft)] transition hover:text-white"
                    >
                      <span className="truncate">{source.label}</span>
                      <ArrowUpRight size={12} className="shrink-0" />
                    </Link>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-[var(--admin-muted)]">Fontes ainda nao estruturadas.</p>
                )}
                {remainingSources.length ? (
                  <TextDisclosure label={`Ver mais ${remainingSources.length} fonte(s)`}>
                    <div className="grid gap-2">
                      {remainingSources.map((source) => (
                        <Link
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-8 items-center justify-between gap-3 rounded-md border border-[var(--admin-border)] px-2 text-xs font-semibold text-[var(--admin-soft)] transition hover:text-white"
                        >
                          <span className="truncate">{source.label}</span>
                          <ArrowUpRight size={12} className="shrink-0" />
                        </Link>
                      ))}
                    </div>
                  </TextDisclosure>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <form
          id="ajustes"
          action={savePropertyMarketAnalysisAction}
          className="scroll-mt-24 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)] p-3"
        >
          <input name="opportunityCode" type="hidden" value={analysis.opportunityCode} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
                decisao / ajustes
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">Revisao operacional</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitReviewButton className="border border-[var(--admin-border)] text-white hover:bg-[rgba(255,255,255,0.08)]" value="human_review">
                <Save size={15} />
                Salvar revisao
              </SubmitReviewButton>
              <SubmitReviewButton className="bg-[var(--admin-green)] text-black hover:bg-white" value="approved">
                <CheckCircle2 size={15} />
                Aprovar
              </SubmitReviewButton>
              <SubmitReviewButton className="bg-[var(--admin-yellow)] text-black hover:bg-white" value="approved_with_notes">
                <ShieldCheck size={15} />
                Aprovar com ressalvas
              </SubmitReviewButton>
              <SubmitReviewButton className="bg-[var(--admin-red)] text-white hover:bg-red-300 hover:text-black" value="rejected">
                <XCircle size={15} />
                Reprovar
              </SubmitReviewButton>
            </div>
          </div>

          <details className="group mt-3 overflow-hidden rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.02)]">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 text-sm font-semibold text-white">
              <span className="inline-flex items-center gap-2">
                <SlidersHorizontal size={15} className="text-[var(--admin-cyan)]" />
                Campos de curadoria e preenchimento manual
              </span>
              <ChevronDown size={16} className="text-[var(--admin-muted)] transition group-open:rotate-180" />
            </summary>

          <div className="grid gap-4 border-t border-[var(--admin-border)] p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Mercado conservador" name="marketValueLow" defaultValue={analysis.marketValueLow || ""} />
                <Field label="Mercado base" name="marketValueBase" defaultValue={analysis.marketValueBase || ""} />
                <Field label="Mercado otimista" name="marketValueHigh" defaultValue={analysis.marketValueHigh || ""} />
                <Field label="Privativa m2" name="privateAreaM2" defaultValue={analysis.subject.privateAreaM2 || ""} />
                <Field label="Terreno m2" name="landAreaM2" defaultValue={analysis.subject.landAreaM2 || ""} />
                <Field label="Construida m2" name="builtAreaM2" defaultValue={analysis.subject.builtAreaM2 || ""} />
                <Field label="Dormitorios" name="bedrooms" defaultValue={analysis.subject.bedrooms || ""} />
                <Field label="Garagens" name="parkingSpaces" defaultValue={analysis.subject.parkingSpaces || ""} />
                <Field label="Liquidez" name="liquidityScore" defaultValue={analysis.liquidityScore || 60} />
                <Field label="Confianca" name="confidenceScore" defaultValue={analysis.confidenceScore || 50} />
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Analista" name="analystName" defaultValue={analysis.analystName} />
                <Field label="Pagamento" name="paymentCondition" defaultValue={analysis.paymentCondition} />
                <SelectField
                  label="Status"
                  name="status"
                  defaultValue={analysis.status}
                  options={[
                    { value: "human_review", label: "Revisao humana" },
                    { value: "approved", label: "Aprovada" },
                    { value: "approved_with_notes", label: "Aprovada com ressalvas" },
                    { value: "rejected", label: "Reprovada" },
                    { value: "insufficient_data", label: "Dados insuficientes" },
                  ]}
                />
                <SelectField
                  label="Decisao"
                  name="decision"
                  defaultValue={analysis.decision}
                  options={[
                    { value: "excellent", label: "Excelente" },
                    { value: "good", label: "Boa" },
                    { value: "caution", label: "Cautela" },
                    { value: "review", label: "Revisar" },
                    { value: "reject", label: "Descartar" },
                  ]}
                />
              </div>

              <div className="rounded-lg border border-[var(--admin-border)] p-3">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <Banknote size={16} className="text-[var(--admin-cyan)]" />
                  Aluguel e yield
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Aluguel mensal" name="monthlyRent" defaultValue={rental.monthlyRent || ""} />
                  <Field label="Referencia aluguel" name="rentReferenceUrl" defaultValue={rental.referenceUrl} />
                  <CheckboxField label="Referencia de aluguel encontrada" name="rentReferenceFound" defaultChecked={rental.referenceFound} />
                  <CheckboxField label="Valor de aluguel conhecido" name="rentValueKnown" defaultChecked={rental.valueKnown} />
                </div>
                <div className="mt-3">
                  <TextField label="Notas de aluguel" name="rentNotes" defaultValue={rental.notes} />
                </div>
              </div>

              <div className="rounded-lg border border-[var(--admin-border)] p-3">
                <div className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-white">
                  <CreditCard size={16} className="text-[var(--admin-green)]" />
                  Pagamento e parcelamento
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <SelectField
                    label="Modo"
                    name="paymentMode"
                    defaultValue={payment.paymentMode || "a_vista"}
                    options={[
                      { value: "a_vista", label: "A vista" },
                      { value: "parcelado", label: "Parcelado" },
                      { value: "financiamento_edital", label: "Financiamento edital" },
                      { value: "validar_edital", label: "Validar edital" },
                    ]}
                  />
                  <Field label="Entrada %" name="downPaymentPct" defaultValue={payment.downPaymentPct || ""} />
                  <Field label="Entrada R$" name="downPaymentAmount" defaultValue={payment.downPaymentAmount || ""} />
                  <Field label="Saldo R$" name="installmentBalance" defaultValue={payment.installmentBalance || ""} />
                  <Field label="Parcelas" name="installmentCount" defaultValue={payment.installmentCount || ""} />
                  <Field label="Valor parcela" name="installmentAmount" defaultValue={payment.installmentAmount || ""} />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <TextField label="Regra de correcao" name="installmentCorrectionRule" defaultValue={payment.correctionRule} />
                  <TextField label="Alerta de correcao" name="installmentCorrectionWarning" defaultValue={payment.correctionWarning} />
                </div>
              </div>

              <TextField label="Resumo" name="summary" defaultValue={analysis.summary} />
              <TextField label="Juridico" name="legalSignal" defaultValue={analysis.legalSignal} />
              <TextField label="Ressalva" name="cautionNotes" defaultValue={analysis.cautionNotes} />
              <TextField label="Motivo da decisao" name="decisionReason" defaultValue={analysis.decisionReason} />
            </div>

            <div className="grid content-start gap-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Link leilao" name="auctionUrl" defaultValue={sourceUrlFor(analysis, ["leilao"])} />
                <Field label="Referencia" name="referenceUrl" defaultValue={sourceUrlFor(analysis, ["referencia"])} />
              </div>

              <div className="rounded-lg border border-[var(--admin-border)] p-3">
                <p className="mb-3 text-sm font-semibold text-white">Custos estimados</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <CostField label="ITBI" name="costItbi" value={costByLabel.get("itbi")} />
                  <CostField label="Registro" name="costRegistry" value={costByLabel.get("registro")} />
                  <CostField label="Comissao" name="costCommission" value={costByLabel.get("comissao leiloeiro")} />
                  <CostField label="Juridico" name="costLegal" value={costByLabel.get("juridico")} />
                  <CostField label="Condominio/IPTU" name="costCondoIptu" value={costByLabel.get("condominio/iptu")} />
                  <CostField label="Reforma" name="costReform" value={costByLabel.get("reforma")} />
                  <CostField label="Desocupacao" name="costVacancy" value={costByLabel.get("desocupacao")} />
                  <CostField label="Reserva" name="costReserve" value={costByLabel.get("reserva")} />
                </div>
              </div>

              <div className="rounded-lg border border-[var(--admin-border)] p-3">
                <p className="mb-3 text-sm font-semibold text-white">Comparavel manual</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Fonte" name="comparableSourceLabel" placeholder="Chaves na Mao" />
                  <Field label="URL" name="comparableSourceUrl" />
                  <Field label="Tipo" name="comparablePropertyType" defaultValue={analysis.subject.propertyType} />
                  <Field label="Bairro" name="comparableNeighborhood" />
                  <Field label="Cidade" name="comparableCity" defaultValue={analysis.subject.city} />
                  <Field label="UF" name="comparableState" defaultValue={analysis.subject.state} />
                  <Field label="Area m2" name="comparableAreaM2" />
                  <Field label="Preco pedido" name="comparableAskingPrice" />
                  <Field label="Preco vendido" name="comparableSoldPrice" />
                  <Field label="Distancia km" name="comparableDistanceKm" />
                  <Field label="Similaridade" name="comparableSimilarityScore" defaultValue={60} />
                  <SelectField
                    label="Qualidade"
                    name="comparableQuality"
                    defaultValue="medium"
                    options={[
                      { value: "strong", label: "Forte" },
                      { value: "medium", label: "Media" },
                      { value: "weak", label: "Fraca" },
                      { value: "discarded", label: "Descartada" },
                    ]}
                  />
                </div>
                <div className="mt-3">
                  <TextField label="Notas do comparavel" name="comparableNotes" />
                </div>
              </div>
            </div>
          </div>
          </details>
        </form>
      </div>
    </DashboardCard>
  );
}
