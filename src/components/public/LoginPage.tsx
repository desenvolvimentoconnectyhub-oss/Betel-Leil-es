"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

const errorMessages: Record<string, string> = {
  admin_required: "Seu usuario ainda nao esta liberado para acessar o painel.",
  operator_invite_required: "Novos acessos devem ser criados por um administrador do sistema.",
  supabase_not_configured: "Servico de login temporariamente indisponivel.",
};

const statusMessages: Record<string, string> = {
  signup_success: "Acesso criado. Entre com seu email e senha.",
  admin_signup_success: "Acesso administrativo criado. Entre com seu email e senha.",
  admin_linked_success: "Acesso administrativo vinculado. Entre com seu email e senha.",
  admin_ready: "Acesso administrativo ativo. Entre com sua senha.",
};

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const nextPath = searchParams.get("next") || "/admin";
  const urlError = searchParams.get("error");
  const urlStatus = searchParams.get("status");
  const signupEmail = searchParams.get("email") || "";
  const [error, setError] = useState(urlError ? errorMessages[urlError] || "Acesso negado." : "");
  const [statusMessage, setStatusMessage] = useState(urlStatus ? statusMessages[urlStatus] || "" : "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setError("Informe email e senha.");
      setIsSubmitting(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError("Email ou senha invalidos.");
      setIsSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Nao foi possivel validar sua sessao.");
      setIsSubmitting(false);
      return;
    }

    await supabase.rpc("claim_admin_user_by_email");

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id,status")
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (adminUser) {
      router.replace(nextPath.startsWith("/") ? nextPath : "/admin");
      router.refresh();
      return;
    }

    await supabase.auth.signOut();
    setError("Usuario sem acesso operacional ativo. Solicite liberacao ao administrador.");
    setIsSubmitting(false);
  }

  return (
    <main className="relative min-h-svh overflow-hidden bg-[#18130f] text-[#f8efe2]">
      <div className="absolute inset-0 betel-grid-bg opacity-10" aria-hidden="true" />
      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(216,154,52,0.65),transparent)]" />

      <section className="relative mx-auto grid min-h-svh w-full max-w-6xl items-center gap-8 px-5 py-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
        <div className="hidden min-h-[640px] flex-col justify-between rounded-lg border border-[#3b2d20] bg-[#211a14] p-7 shadow-[0_28px_110px_rgba(0,0,0,0.32)] lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-lg border border-[#4f3922] bg-[#f8efe2]">
                <Image src={logoUrl} alt="Betel Leiloes" width={36} height={36} className="object-contain" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d89a34]">Betel Leiloes</p>
                <p className="mt-1 text-sm text-[#b9a996]">CRM operacional</p>
              </div>
            </div>

            <div className="mt-20">
              <div className="inline-flex h-8 items-center gap-2 rounded-md border border-[#315b57] bg-[#173331] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#87d5c8]">
                <ShieldCheck size={14} />
                Acesso interno
              </div>
              <h1 className="mt-5 max-w-md text-4xl font-semibold leading-tight text-[#fffaf2]">
                Painel dos operadores Betel.
              </h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-[#b9a996]">
                Entrada exclusiva para equipe autorizada acompanhar analises, tarefas e etapas do pipeline.
              </p>
            </div>
          </div>

          <div className="grid gap-3 border-t border-[#3b2d20] pt-6">
            <div className="flex items-center justify-between rounded-md border border-[#3b2d20] bg-[#18130f] px-4 py-3">
              <span className="text-xs uppercase tracking-[0.14em] text-[#8f8171]">Ambiente</span>
              <span className="text-sm font-semibold text-[#fffaf2]">Administrativo</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-[#3b2d20] bg-[#18130f] px-4 py-3">
              <span className="text-xs uppercase tracking-[0.14em] text-[#8f8171]">Permissao</span>
              <span className="text-sm font-semibold text-[#87d5c8]">Operador autorizado</span>
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[520px]">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="grid size-11 place-items-center rounded-lg border border-[#4f3922] bg-[#f8efe2]">
              <Image src={logoUrl} alt="Betel Leiloes" width={32} height={32} className="object-contain" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d89a34]">Betel Leiloes</p>
              <p className="text-sm text-[#b9a996]">CRM operacional</p>
            </div>
          </div>

          <section className="rounded-lg border border-[#3b2d20] bg-[#fffaf2] p-5 text-[#241d16] shadow-[0_24px_90px_rgba(0,0,0,0.35)] sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4 border-b border-[#e2d7c8] pb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#b87a16]">Login do sistema</p>
                <h2 className="mt-2 text-2xl font-semibold text-[#241d16]">Acessar CRM</h2>
                <p className="mt-2 text-sm leading-5 text-[#74685b]">
                  Use seu email e senha cadastrados pelo administrador.
                </p>
              </div>
              <div className="grid size-11 place-items-center rounded-lg border border-[#eadcc8] bg-[#f4eadb] text-[#b87a16]">
                <LockKeyhole size={20} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold text-[#5f5144]">
                  Email
                </label>
                <div className="relative">
                  <UserRoundCheck
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9b8b78]"
                  />
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="operador@empresa.com"
                    defaultValue={signupEmail}
                    autoComplete="email"
                    required
                    className="h-12 w-full rounded-md border border-[#d8cbb9] bg-white pl-10 pr-3 text-sm text-[#241d16] outline-none transition placeholder:text-[#9b8b78] focus:border-[#b87a16] focus:ring-3 focus:ring-[rgba(184,122,22,0.16)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-semibold text-[#5f5144]">
                  Senha
                </label>
                <div className="relative">
                  <KeyRound
                    size={17}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9b8b78]"
                  />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                    className="h-12 w-full rounded-md border border-[#d8cbb9] bg-white px-10 text-sm text-[#241d16] outline-none transition placeholder:text-[#9b8b78] focus:border-[#b87a16] focus:ring-3 focus:ring-[rgba(184,122,22,0.16)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-[#74685b] transition hover:bg-[#f4eadb] hover:text-[#241d16]"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="flex gap-2 rounded-md border border-[rgba(196,61,45,0.28)] bg-[rgba(196,61,45,0.08)] px-3 py-2 text-xs leading-5 text-[#8e241a]">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#c43d2d]" />
                  <span>{error}</span>
                </div>
              )}

              {statusMessage && (
                <div className="flex gap-2 rounded-md border border-[rgba(19,122,69,0.28)] bg-[rgba(19,122,69,0.08)] px-3 py-2 text-xs leading-5 text-[#0f6338]">
                  <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#137a45]" />
                  <span>{statusMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-[#b87a16] text-sm font-bold text-white transition hover:bg-[#9f6410] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
                {isSubmitting ? "Validando acesso..." : "Entrar no CRM"}
              </button>
            </form>

            <p className="mt-5 border-t border-[#e2d7c8] pt-4 text-center text-xs leading-5 text-[#74685b]">
              Acesso restrito aos operadores cadastrados pela administracao.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
