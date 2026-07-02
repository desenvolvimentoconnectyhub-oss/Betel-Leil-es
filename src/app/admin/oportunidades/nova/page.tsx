import Link from "next/link";
import { ArrowLeft, Save, ShieldAlert } from "lucide-react";
import { createOpportunityAction } from "../actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const inputClass =
  "h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white placeholder:text-[var(--admin-muted)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-3 text-sm text-white outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(0,243,255,0.18)]";

const labelClass = "text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function Field({
  label,
  name,
  placeholder,
  type = "text",
  required,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Input
        className={inputClass}
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
        type={type}
        defaultValue={defaultValue}
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
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <StatusBadge tone="cyan">Novo registro</StatusBadge>
              <StatusBadge tone="yellow">Revisao obrigatoria</StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Novo imóvel captado</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Cadastro operacional de imóvel para entrada na curadoria, score, compliance e revisão jurídica.
            </p>
          </div>

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
        </div>
      </section>

      {status === "error" && message && (
        <div className="mb-4 flex gap-3 rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[var(--admin-soft)]">
          <ShieldAlert className="mt-0.5 shrink-0 text-[var(--admin-red)]" size={17} />
          <div>
            <div className="font-semibold text-white">Cadastro não concluído</div>
            <div className="mt-1 text-[var(--admin-muted)]">{message}</div>
          </div>
        </div>
      )}

      <form action={createOpportunityAction} className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Imóvel" eyebrow="identificação">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Código interno" name="code" placeholder="BC-204" />
              <Field label="Nome do imóvel" name="title" placeholder="Apartamento frente mar" required />
              <SelectField
                label="Tipo"
                name="propertyType"
                defaultValue="Apartamento"
                options={["Apartamento", "Casa", "Terreno", "Comercial", "Galpao", "Rural", "Outro"]}
              />
              <Field label="Endereco" name="address" placeholder="Rua, bairro ou referencia" />
              <Field label="Cidade" name="city" placeholder="Balneario Camboriu" required />
              <Field label="UF" name="state" placeholder="SC" required />
            </div>
          </DashboardCard>

          <DashboardCard title="Fonte e prazos" eyebrow="origem">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Fonte" name="sourceName" placeholder="Portal banco, leiloeiro, tribunal" />
              <SelectField
                label="Tipo de fonte"
                name="sourceType"
                defaultValue="Manual"
                options={["Manual", "Leiloeiro", "Banco", "Judicial", "Tribunal", "API"]}
              />
              <Field label="Data do leilão" name="auctionDate" type="date" />
              <SelectField
                label="Ocupação"
                name="occupancy"
                defaultValue="Não informado"
                options={["Não informado", "Vago", "Ocupado", "Não aplicável"]}
              />
              <Field label="URL oficial" name="sourceUrl" placeholder="https://fonte/oferta-ou-edital" />
              <Field label="ID externo" name="externalId" placeholder="processo, lote ou codigo da fonte" />
              <SelectField
                label="Modo de captura"
                name="collectionMode"
                defaultValue="manual_intake"
                options={["manual_intake", "api_intake", "csv_import", "pdf_notice", "webhook"]}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Resumo" eyebrow="contexto operacional">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label className={labelClass} htmlFor="summary">
                  Resumo inicial
                </Label>
                <Textarea
                  className={cn(inputClass, "min-h-32 py-3")}
                  id="summary"
                  name="summary"
                  placeholder="Descreva o racional inicial, origem do imóvel, pontos de atenção e hipóteses de lucro."
                />
              </div>
              <div className="grid gap-2">
                <Label className={labelClass} htmlFor="evidenceNotes">
                  Evidencias da fonte
                </Label>
                <Textarea
                  className={cn(inputClass, "min-h-24 py-3")}
                  id="evidenceNotes"
                  name="evidenceNotes"
                  placeholder="Cole observacoes da fonte, trecho do edital, divergencias iniciais ou instrucoes para a curadoria."
                />
              </div>
              <div className="grid gap-2">
                <Label className={labelClass} htmlFor="rawPayload">
                  Payload bruto JSON
                </Label>
                <Textarea
                  className={cn(inputClass, "min-h-28 py-3 font-mono text-xs")}
                  id="rawPayload"
                  name="rawPayload"
                  placeholder='{"lote":"12","processo":"0000000-00.0000.0.00.0000","editalUrl":"https://..."}'
                />
              </div>
              <div className="rounded-lg border border-[rgba(0,243,255,0.22)] bg-[rgba(0,243,255,0.06)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
                Preencher URL, ID externo, evidências ou payload ativa a ingestão por fonte: o sistema cria
                snapshot bruto, run de curadoria e log de auditoria antes da revisão humana.
              </div>
            </div>
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard title="Financeiro" eyebrow="lance / mercado">
            <div className="grid gap-4">
              <Field label="Lance inicial" name="initialBid" placeholder="680000" type="text" />
              <Field label="Valor estimado" name="appraisalValue" placeholder="1170000" type="text" />
              <Field label="Desconto manual (%)" name="discountPct" placeholder="42" type="number" />
            </div>
          </DashboardCard>

          <DashboardCard title="Scores iniciais" eyebrow="triagem">
            <div className="grid gap-4">
              <Field label="Score oportunidade" name="opportunityScore" placeholder="80" type="number" defaultValue="70" />
              <Field label="Score risco" name="riskScore" placeholder="40" type="number" defaultValue="50" />
              <Field label="Score compliance" name="complianceScore" placeholder="80" type="number" defaultValue="70" />
            </div>
          </DashboardCard>

          <DashboardCard title="Fluxo" eyebrow="status / ação">
            <div className="grid gap-4">
              <SelectField
                label="Status IA"
                name="aiStatus"
                defaultValue="Fila IA"
                options={["Fila IA", "Analisado", "Requer humano", "Divergencia"]}
              />
              <SelectField
                label="Status jurídico"
                name="legalStatus"
                defaultValue="Pendente"
                options={["Pendente", "Aguardando", "Com ressalvas", "Aprovado", "Risco alto"]}
              />
              <SelectField
                label="Etapa"
                name="stage"
                defaultValue="Entrada"
                options={["Entrada", "Curadoria IA", "Compliance", "Revisão jurídica", "Dossiê", "Matching"]}
              />
              <Field label="Responsável" name="owner" placeholder="Operação" defaultValue="Operação" />
              <Field label="Próxima ação" name="nextAction" placeholder="Triar imóvel" defaultValue="Triar imóvel" />
            </div>
          </DashboardCard>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 sm:flex-row">
            <Button
              className="h-10 flex-1 bg-[var(--admin-cyan)] font-bold text-black hover:bg-white"
              type="submit"
            >
              <Save size={15} />
              Salvar oportunidade
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href="/admin/oportunidades">Cancelar</Link>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
