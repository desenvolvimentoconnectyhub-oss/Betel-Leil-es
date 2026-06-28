import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { createAdminSignupAction } from "./actions";
import { bootstrapAdmin, formatPhone } from "@/lib/auth/bootstrap-admin";
import { cn } from "@/lib/utils";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

export const metadata = {
  title: "Cadastro Admin | Betel Leiloes",
  description: "Configure o primeiro acesso administrativo da Betel.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

function Message({ status, message }: { status: string; message: string }) {
  if (!message) return null;
  const isSuccess = status === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={cn(
        "mb-5 flex gap-2 rounded-md border px-3 py-2 text-xs leading-5",
        isSuccess
          ? "border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-green-100"
          : "border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] text-red-100"
      )}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

const assuranceItems = [
  { label: "Perfil", value: "Owner", tone: "text-[var(--gold)]" },
  { label: "Auth", value: "Supabase", tone: "text-[var(--cyan)]" },
  { label: "Status", value: "Ativo", tone: "text-[var(--green)]" },
];

export default async function CadastroRoute({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] px-5 py-10 lg:px-8">
      <div className="absolute inset-0 betel-grid-bg opacity-45" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-[calc(100svh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <section className="max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)]">
              <Image src={logoUrl} alt="Betel Leiloes" width={34} height={34} className="object-contain" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Betel AI</p>
              <p className="text-sm text-[var(--muted)]">Command Center de Leiloes</p>
            </div>
          </div>

          <div className="mb-5 inline-flex h-8 items-center gap-2 rounded-md border border-[rgba(110,199,214,0.3)] bg-[rgba(110,199,214,0.08)] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
            <ShieldCheck size={14} />
            Cadastro administrativo
          </div>

          <h1 className="max-w-lg text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Primeiro acesso com cara de operacao profissional.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
            Crie o owner inicial da Betel para liberar o painel interno com sessao real, permissao ativa e trilha de
            acesso segura.
          </p>

          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
            {assuranceItems.map((item) => (
              <div key={item.label} className="rounded-lg border border-[var(--line)] bg-[rgba(21,23,27,0.76)] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                  {item.label}
                </p>
                <p className={cn("mt-2 text-sm font-semibold", item.tone)}>{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[rgba(21,23,27,0.94)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-7">
          <div className="mb-6 flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Owner Betel</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Criar acesso admin</h2>
            </div>
            <div className="inline-flex size-11 items-center justify-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)] text-[var(--gold)]">
              <UserPlus size={20} />
            </div>
          </div>

          <Message status={status} message={message} />

          <form action={createAdminSignupAction} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-xs font-medium text-[var(--muted)]">
                Nome do admin
              </label>
              <input
                id="name"
                name="name"
                required
                readOnly
                autoComplete="name"
                defaultValue={bootstrapAdmin.displayName}
                className="h-11 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.24)] px-3 text-sm font-medium text-white outline-none focus:border-[var(--gold)]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="email" className="text-xs font-medium text-[var(--muted)]">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  readOnly
                  autoComplete="email"
                  defaultValue={bootstrapAdmin.email}
                  className="h-11 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.24)] px-3 text-sm font-medium text-white outline-none focus:border-[var(--gold)]"
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="phone" className="text-xs font-medium text-[var(--muted)]">
                  WhatsApp
                </label>
                <input
                  id="phone"
                  name="phone"
                  inputMode="tel"
                  required
                  readOnly
                  autoComplete="tel"
                  defaultValue={formatPhone(bootstrapAdmin.phone)}
                  className="h-11 rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.24)] px-3 text-sm font-medium text-white outline-none focus:border-[var(--gold)]"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="password" className="text-xs font-medium text-[var(--muted)]">
                  Senha
                </label>
                <div className="relative">
                  <LockKeyhole size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    placeholder="Minimo 8 caracteres"
                    className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-9 text-sm text-white outline-none placeholder:text-[var(--muted)] focus:border-[var(--gold)]"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <label htmlFor="confirmPassword" className="text-xs font-medium text-[var(--muted)]">
                  Confirmar senha
                </label>
                <div className="relative">
                  <KeyRound size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    minLength={8}
                    required
                    autoComplete="new-password"
                    placeholder="Repita a senha"
                    className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-9 text-sm text-white outline-none placeholder:text-[var(--muted)] focus:border-[var(--gold)]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--gold)] px-4 text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)]"
            >
              Criar admin owner
              <ArrowRight size={15} />
            </button>
          </form>

          <div className="mt-5 flex flex-col gap-3 border-t border-[var(--line)] pt-5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
            <span>Ja tem acesso administrativo?</span>
            <Link href="/login?next=%2Fadmin" className="font-semibold text-[var(--gold)] transition hover:text-white">
              Entrar no painel
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
