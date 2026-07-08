"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

type InviteState = "checking" | "ready" | "error";

export function AdminInvitePasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const nextPath = searchParams.get("next") || "/admin";
  const [state, setState] = useState<InviteState>("checking");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function prepareInviteSession() {
      setError("");
      setStatusMessage("");
      setState("checking");

      try {
        const code = searchParams.get("code");

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;

          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete("code");
          window.history.replaceState({}, "", cleanUrl.toString());
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        if (!session?.user) {
          if (!isMounted) return;
          setState("error");
          setError("Convite expirado ou invalido. Solicite um novo convite ao administrador.");
          return;
        }

        if (!isMounted) return;
        setEmail(session.user.email || "");
        setState("ready");
      } catch (sessionError) {
        if (!isMounted) return;
        setState("error");
        setError(sessionError instanceof Error ? sessionError.message : "Nao foi possivel validar o convite.");
      }
    }

    void prepareInviteSession();

    return () => {
      isMounted = false;
    };
  }, [searchParams, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatusMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      setIsSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("As senhas informadas nao conferem.");
      setIsSubmitting(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message || "Nao foi possivel definir a senha.");
      setIsSubmitting(false);
      return;
    }

    await supabase.rpc("claim_admin_user_by_email");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Senha cadastrada, mas nao foi possivel validar a sessao.");
      setIsSubmitting(false);
      return;
    }

    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("id,status")
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!adminUser) {
      await supabase.auth.signOut();
      setError("Senha cadastrada, mas este usuario ainda nao esta ativo no painel admin.");
      setIsSubmitting(false);
      return;
    }

    setStatusMessage("Senha cadastrada. Abrindo o painel...");
    router.replace(nextPath.startsWith("/") ? nextPath : "/admin");
    router.refresh();
  }

  return (
    <main className="relative min-h-[calc(100svh-9rem)] overflow-hidden bg-[var(--background)] px-5 py-10 lg:px-8">
      <div className="absolute inset-0 betel-grid-bg opacity-35" aria-hidden="true" />
      <section className="relative mx-auto flex min-h-[calc(100svh-14rem)] max-w-xl items-center">
        <div className="w-full rounded-lg border border-[var(--line)] bg-[rgba(21,23,27,0.94)] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.28)] sm:p-7">
          <div className="mb-6 flex items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)]">
                <Image src={logoUrl} alt="Betel Leiloes" width={34} height={34} className="object-contain" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">Convite admin</p>
                <h1 className="mt-2 text-2xl font-semibold text-white">Definir senha</h1>
              </div>
            </div>
            <div className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-[rgba(216,173,88,0.28)] bg-[rgba(216,173,88,0.08)] text-[var(--gold)]">
              <KeyRound size={20} />
            </div>
          </div>

          <div className="mb-5 flex items-start gap-2 rounded-md border border-[rgba(110,199,214,0.3)] bg-[rgba(110,199,214,0.08)] px-3 py-2 text-xs leading-5 text-[var(--cyan)]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0" />
            <span>{email ? `Convite validado para ${email}.` : "Validando convite seguro pelo Supabase Auth."}</span>
          </div>

          {state === "checking" ? (
            <div className="flex h-32 items-center justify-center gap-2 text-sm text-[var(--muted)]">
              <Loader2 size={17} className="animate-spin" />
              Validando convite...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-medium text-[var(--muted)]">
                  Nova senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={state !== "ready" || isSubmitting}
                  className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-3 text-sm text-white placeholder:text-[var(--muted)] focus:border-[var(--gold)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                />
              </div>
              <div>
                <label htmlFor="confirmPassword" className="mb-2 block text-xs font-medium text-[var(--muted)]">
                  Confirmar senha
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  disabled={state !== "ready" || isSubmitting}
                  className="h-11 w-full rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.34)] px-3 text-sm text-white placeholder:text-[var(--muted)] focus:border-[var(--gold)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                disabled={state !== "ready" || isSubmitting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[var(--gold)] text-sm font-semibold text-[#141007] transition hover:bg-[var(--betel-gold-soft)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
                {isSubmitting ? "Salvando..." : "Salvar senha e acessar"}
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-4 flex h-10 items-center justify-center rounded-md border border-[var(--line)] bg-[rgba(255,255,255,0.03)] text-sm font-semibold text-[var(--muted)] transition hover:border-[var(--gold)] hover:text-white"
          >
            Voltar para login
          </Link>
        </div>
      </section>
    </main>
  );
}

