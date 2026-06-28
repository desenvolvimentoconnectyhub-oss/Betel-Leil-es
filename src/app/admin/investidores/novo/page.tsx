import Link from "next/link";
import { ArrowLeft, Save, ShieldAlert, Users } from "lucide-react";
import { createInvestorAction } from "../actions";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    <label className="flex min-h-10 items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-[var(--admin-soft)]">
      <input
        className="size-4 accent-[var(--admin-cyan)]"
        defaultChecked={defaultChecked}
        name={name}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

export default async function NewInvestorPage({
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
              <StatusBadge tone="purple">CRM de investidores</StatusBadge>
              <StatusBadge tone="cyan">Matching assistido</StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Novo investidor</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Cadastro de tese, capital, praca e apetite de risco para conectar oportunidades com o investidor certo.
            </p>
          </div>

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
        </div>
      </section>

      {status === "error" && message && (
        <div className="mb-4 flex gap-3 rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-4 py-3 text-sm text-[var(--admin-soft)]">
          <ShieldAlert className="mt-0.5 shrink-0 text-[var(--admin-red)]" size={17} />
          <div>
            <div className="font-semibold text-white">Cadastro nao concluido</div>
            <div className="mt-1 text-[var(--admin-muted)]">{message}</div>
          </div>
        </div>
      )}

      <form action={createInvestorAction} className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <div className="grid gap-4">
          <DashboardCard title="Perfil" eyebrow="identificacao">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nome do investidor" name="name" placeholder="Fundo Litoral SC" required />
              <Field label="Organizacao" name="organization" placeholder="Fundo parceiro" />
              <Field label="Email" name="email" placeholder="contato@exemplo.com" type="email" />
              <Field label="Telefone" name="phone" placeholder="+55 47 99999-0000" />
              <Field label="Responsavel interno" name="owner" placeholder="Comercial" defaultValue="Comercial" />
              <SelectField
                label="Status"
                name="status"
                defaultValue="Ativo"
                options={["Ativo", "Piloto", "Em onboarding", "Pausado"]}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Tese de compra" eyebrow="praca / tipo">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Cidades de foco"
                name="cityFocus"
                placeholder="Balneario Camboriu, Itajai, Porto Belo"
              />
              <Field
                label="Tipos preferidos"
                name="preferredPropertyTypes"
                placeholder="Apartamento, Terreno, Comercial"
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Observacoes" eyebrow="relacionamento">
            <div className="grid gap-2">
              <Label className={labelClass} htmlFor="notes">
                Notas comerciais
              </Label>
              <Textarea
                className={cn(inputClass, "min-h-32 py-3")}
                id="notes"
                name="notes"
                placeholder="Registre restricoes, preferencia por dossie, perfil de comunicacao e limites para contato."
              />
            </div>
          </DashboardCard>
        </div>

        <div className="grid content-start gap-4">
          <DashboardCard title="Capital" eyebrow="limites">
            <div className="grid gap-4">
              <Field label="Teto por oportunidade" name="maxBudget" placeholder="650000" type="text" />
              <Field label="ROI alvo (%)" name="targetRoiPct" placeholder="18" type="number" defaultValue="18" />
              <SelectField
                label="Apetite de risco"
                name="riskAppetite"
                defaultValue="moderado"
                options={["conservador", "moderado", "arrojado"]}
              />
            </div>
          </DashboardCard>

          <DashboardCard title="Acesso e comunicacao" eyebrow="plano / opt-in">
            <div className="grid gap-4">
              <SelectField
                label="Plano"
                name="planKey"
                defaultValue="free"
                options={["free", "trial", "premium", "pro", "enterprise"]}
              />
              <SelectField
                label="Estagio"
                name="lifecycleStage"
                defaultValue="lead"
                options={["lead", "warm_lead", "client"]}
              />
              <SelectField
                label="Frequencia"
                name="communicationFrequency"
                defaultValue="normal"
                options={["low", "normal", "high", "paused"]}
              />
              <Field label="Acesso completo ate" name="fullAccessUntil" type="date" />
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckboxField defaultChecked label="WhatsApp" name="whatsappOptIn" />
                <CheckboxField defaultChecked label="Email" name="emailOptIn" />
                <CheckboxField label="Push" name="pushOptIn" />
                <CheckboxField label="Comunidade" name="communityOptIn" />
              </div>
            </div>
          </DashboardCard>

          <DashboardCard
            title="Matching"
            eyebrow="regra inicial"
            action={<Users size={17} className="text-[var(--admin-purple)]" />}
          >
            <div className="grid gap-3 text-sm leading-6 text-[var(--admin-soft)]">
              <p>O score considera teto, praca, tipo de imovel, desconto estimado e risco juridico.</p>
              <p className="text-[var(--admin-muted)]">
                O envio ao investidor continua supervisionado: dossie, parecer humano e compliance devem vir antes de
                qualquer recomendacao conclusiva.
              </p>
            </div>
          </DashboardCard>

          <div className="flex flex-col gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-3 sm:flex-row">
            <Button className="h-10 flex-1 bg-[var(--admin-cyan)] font-bold text-black hover:bg-white" type="submit">
              <Save size={15} />
              Salvar investidor
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-10 border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white"
            >
              <Link href="/admin/investidores">Cancelar</Link>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
