import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Save, ShieldAlert } from "lucide-react";
import { updateOpportunityAction } from "../../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { getAuctionOpportunityByCode } from "@/lib/admin/repository";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputClass =
  "h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-sm text-white outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(0,243,255,0.18)]";

const labelClass = "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

type PageParams = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function optionSet(options: string[], selected: string) {
  return Array.from(new Set([selected, ...options].filter(Boolean)));
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
  defaultValue,
  readOnly,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  readOnly?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Input
        className={cn(inputClass, readOnly && "text-[var(--admin-muted)]")}
        defaultValue={defaultValue}
        id={name}
        name={name}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        type={type}
      />
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
  options: string[];
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <select className={selectClass} defaultValue={defaultValue} id={name} name={name}>
        {optionSet(options, defaultValue).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function EditOpportunityPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: SearchParams;
}) {
  const [{ id }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams || Promise.resolve({}),
  ]);
  const opportunityResult = await getAuctionOpportunityByCode(id);
  const opportunity = opportunityResult.data;

  if (!opportunity) notFound();

  const status = paramValue(resolvedSearchParams, "status");
  const message = paramValue(resolvedSearchParams, "message");

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone="cyan">Editar imóvel</StatusBadge>
              <StatusBadge tone={opportunityResult.source === "supabase" ? "green" : "purple"}>
                {opportunityResult.source}
              </StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">{opportunity.title}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Ajuste dados, valores, scores, status e próxima ação do imóvel {opportunity.id}.
            </p>
          </div>

          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
          >
            <Link href={`/admin/oportunidades/${opportunity.id}`}>
              <ArrowLeft size={15} />
              Voltar ao dossie
            </Link>
          </Button>
        </div>
      </section>

      {status === "error" && message && (
        <div className="mb-4 flex gap-3 rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[var(--admin-soft)]">
          <ShieldAlert className="mt-0.5 shrink-0 text-[var(--admin-red)]" size={17} />
          <div>
            <div className="font-semibold text-white">Atualização não concluída</div>
            <div className="mt-1 text-[var(--admin-muted)]">{message}</div>
          </div>
        </div>
      )}

      <form action={updateOpportunityAction} className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <input name="currentCode" type="hidden" value={opportunity.id} />

        <div className="grid gap-4">
          <DashboardCard title="Imóvel" eyebrow="identificação">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Código interno" name="code" defaultValue={opportunity.id} readOnly />
              <Field label="Nome do imóvel" name="title" defaultValue={opportunity.title} required />
              <SelectField
                label="Tipo"
                name="propertyType"
                defaultValue={opportunity.propertyType}
                options={["Apartamento", "Casa", "Terreno", "Comercial", "Galpao", "Rural", "Outro"]}
              />
              <Field label="Endereco" name="address" defaultValue={opportunity.address} />
              <Field label="Cidade" name="city" defaultValue={opportunity.city} required />
              <Field label="UF" name="state" defaultValue={opportunity.state} required />
            </div>
          </DashboardCard>

          <DashboardCard title="Fonte e prazos" eyebrow="origem">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Fonte" name="sourceName" defaultValue={opportunity.sourceName} />
              <SelectField
                label="Tipo de fonte"
                name="sourceType"
                defaultValue={opportunity.sourceType}
                options={["Manual", "Leiloeiro", "Banco", "Judicial", "Tribunal", "API"]}
              />
              <Field label="Data do leilão" name="auctionDate" type="date" defaultValue={opportunity.auctionDate} />
              <SelectField
                label="Ocupação"
                name="occupancy"
                defaultValue={opportunity.occupancy}
                options={["Não informado", "Vago", "Ocupado", "Não aplicável"]}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Resumo" eyebrow="contexto operacional">
            <div className="grid gap-2">
              <Label className={labelClass} htmlFor="summary">
                Resumo inicial
              </Label>
              <Textarea
                className={cn(inputClass, "min-h-32 py-3")}
                defaultValue={opportunity.summary}
                id="summary"
                name="summary"
              />
            </div>
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard title="Financeiro" eyebrow="lance / mercado">
            <div className="grid gap-4">
              <Field label="Lance inicial" name="initialBid" defaultValue={opportunity.initialBid} type="text" />
              <Field label="Valor estimado" name="appraisalValue" defaultValue={opportunity.appraisalValue} type="text" />
              <Field label="Desconto manual (%)" name="discountPct" defaultValue={opportunity.discountPct} type="number" />
            </div>
          </DashboardCard>

          <DashboardCard title="Scores iniciais" eyebrow="triagem">
            <div className="grid gap-4">
              <Field label="Score oportunidade" name="opportunityScore" defaultValue={opportunity.opportunityScore} type="number" />
              <Field label="Score risco" name="riskScore" defaultValue={opportunity.riskScore} type="number" />
              <Field label="Score compliance" name="complianceScore" defaultValue={opportunity.complianceScore} type="number" />
            </div>
          </DashboardCard>

          <DashboardCard title="Fluxo" eyebrow="status / ação">
            <div className="grid gap-4">
              <SelectField
                label="Status IA"
                name="aiStatus"
                defaultValue={opportunity.aiStatus}
                options={["Fila IA", "Analisado", "Requer humano", "Divergencia"]}
              />
              <SelectField
                label="Status jurídico"
                name="legalStatus"
                defaultValue={opportunity.legalStatus}
                options={["Pendente", "Aguardando", "Com ressalvas", "Aprovado", "Risco alto"]}
              />
              <SelectField
                label="Etapa"
                name="stage"
                defaultValue={opportunity.stage}
                options={["Entrada", "Curadoria IA", "Compliance", "Revisão jurídica", "Dossiê", "Matching"]}
              />
              <Field label="Responsável" name="owner" defaultValue={opportunity.owner} />
              <Field label="Próxima ação" name="nextAction" defaultValue={opportunity.nextAction} />
            </div>
          </DashboardCard>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 sm:flex-row">
            <Button className="h-10 flex-1 bg-[var(--admin-cyan)] font-bold text-black hover:bg-white" type="submit">
              <Save size={15} />
              Salvar alteracoes
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href={`/admin/oportunidades/${opportunity.id}`}>Cancelar</Link>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
