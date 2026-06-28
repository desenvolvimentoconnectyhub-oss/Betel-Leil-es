"use client";

import { useMemo, useState, type FormEvent } from "react";
import { Activity, AlertCircle, ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

const errorMessages: Record<string, string> = {
  admin_required: "Seu usuario existe, mas ainda nao esta liberado como admin ativo.",
  supabase_not_configured: "Supabase publico nao esta configurado para login.",
};

const statusMessages: Record<string, string> = {
  signup_success: "Cadastro criado. Entre com o email e senha cadastrados.",
  admin_signup_success: "Admin owner criado. Entre com o email e senha cadastrados.",
  admin_linked_success: "Admin vinculado ao usuario existente no Supabase Auth.",
  admin_ready: "Admin owner ja esta ativo. Entre com a senha cadastrada.",
};

const accessItems = [
  { label: "Painel", value: "Admin", icon: ShieldCheck },
  { label: "Sessao", value: "Supabase", icon: KeyRound },
  { label: "Status", value: "Protegido", icon: Activity },
];

export function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const nextPath = searchParams.get("next") || "/admin";
  const urlError = searchParams.get("error");
  const urlStatus = searchParams.get("status");
  const signupEmail = searchParams.get("email") || "";
  const [error, setError] = useState(urlError ? errorMessages[urlError] || "Acesso administrativo negado." : "");
  const [statusMessage, setStatusMessage] = useState(urlStatus ? statusMessages[urlStatus] || "" : "");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setError("Nao foi possivel validar a sessao.");
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

    const { data: subscriber } = await supabase
      .from("subscriber_profiles")
      .select("id,plan_key,plan_status")
      .eq("auth_user_id", user.id)
      .in("plan_status", ["active", "trial"])
      .maybeSingle();

    if (!subscriber) {
      await supabase.auth.signOut();
      setError("Usuario autenticado, mas ainda sem cadastro ativo na Betel.");
      setIsSubmitting(false);
      return;
    }

    const planKey = typeof subscriber.plan_key === "string" ? subscriber.plan_key : "explorer";
    router.replace(`/oportunidades?plan=${encodeURIComponent(planKey)}`);
    router.refresh();
  }

  return (
    <main className="relative min-h-[calc(100svh-9rem)] overflow-hidden bg-[var(--background)] px-5 py-10 lg:px-8">
      <div className="absolute inset-0 betel-grid-bg opacity-35" aria-hidden="true" />
      <div className="relative mx-auto grid min-h-[calc(100svh-14rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="max-w-xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)]">
              <Image src={logoUrl} alt="Betel Leiloes" width={34} height={34} className="object-contain" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--gold)]">Betel AI</p>
              <p className="text-sm text-[var(--muted)]">Acesso seguro ao painel</p>
            </div>
          </div>

          <div className="mb-5 inline-flex h-8 items-center gap-2 rounded-md border border-[rgba(110,199,214,0.3)] bg-[rgba(110,199,214,0.08)] px-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--cyan)]">
            <ShieldCheck size={14} />
            Area protegida
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
            Entre no Command Center da Betel.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-[var(--muted)]">
            Acompanhe oportunidades, operacao de IA, fontes de leilao e tarefas administrativas em uma entrada unica.
          </p>

          <div className="mt-8 grid max-w-lg gap-3 sm:grid-cols-3">
            {accessItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="rounded-lg border border-[var(--line)] bg-[rgba(21,23,27,0.76)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
                      {item.label}
                    </p>
                    <Icon size={14} className="text-[var(--cyan)]" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-white">{item.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-[var(--line)] bg-[rgba(21,23,27,0.94)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-7">
          <div className="mb-6 flex flex-col gap-4 border-b border-[var(--line)] pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Login</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Acessar painel</h2>
            </div>
            <div className="inline-flex size-11 items-center justify-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)] text-[var(--gold)]">
              <KeyRound size={20} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-2 block text-xs font-medium text-[var(--muted)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="seu@email.com"
                defaultValue={signupEmail}
                autoComplete="email"
                required
                className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-3 text-sm text-white placeholder:text-[var(--muted)] focus:border-[var(--gold)] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block text-xs font-medium text-[var(--muted)]">
                Senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="********"
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-3 text-sm text-white placeholder:text-[var(--muted)] focus:border-[var(--gold)] focus:outline-none"
              />
            </div>
            {error && (
              <div className="flex gap-2 rounded-md border border-[rgba(239,68,68,0.35)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs leading-5 text-red-200">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-300" />
                <span>{error}</span>
              </div>
            )}
            {statusMessage && (
              <div className="flex gap-2 rounded-md border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] px-3 py-2 text-xs leading-5 text-green-100">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-300" />
                <span>{statusMessage}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--gold)] text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {isSubmitting ? "Entrando..." : "Entrar no painel"}
            </button>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/cadastro"
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-sm font-semibold text-white transition hover:border-[var(--gold)] hover:text-[var(--gold)]"
            >
              <UserPlus size={16} />
              Criar admin
            </Link>
            <Link
              href="/oportunidades"
              className="flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--cyan)] hover:text-white"
            >
              Ver oportunidades
              <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
