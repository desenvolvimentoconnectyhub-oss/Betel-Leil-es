"use client";

import { Check, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { SubscriberPlanInfo } from "@/lib/subscribers";
import type { ResourceTone } from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(0,243,255,0.3)]",
  green: "border-[rgba(34,197,94,0.4)]",
  yellow: "border-[rgba(234,179,8,0.3)]",
  red: "border-[rgba(239,68,68,0.3)]",
  purple: "border-[rgba(139,92,246,0.3)]",
  muted: "border-[var(--line)]",
};

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[#00f3ff]",
  green: "text-[#22c55e]",
  yellow: "text-[#eab308]",
  red: "text-[#ef4444]",
  purple: "text-[#8b5cf6]",
  muted: "text-[var(--muted)]",
};

export function PlansPage({ plans }: { plans: SubscriberPlanInfo[] }) {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-12 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white">Escolha seu plano</h1>
          <p className="mt-3 text-base text-[var(--muted)]">
            Acesse oportunidades de leilao imobiliario com IA, analise de risco e alertas em tempo real.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => (
            <div
              key={plan.key}
              className={cn(
                "relative flex flex-col rounded-xl border bg-[var(--panel)] p-6",
                plan.highlight
                  ? "border-[var(--gold)] shadow-[0_0_30px_rgba(216,173,88,0.12)]"
                  : toneBorder[plan.tone]
              )}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[var(--gold)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#141007]">
                  Mais popular
                </div>
              )}

              <p className={cn("text-sm font-bold uppercase tracking-[0.14em]", toneText[plan.tone])}>
                {plan.name}
              </p>

              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.period && <span className="text-sm text-[var(--muted)]">{plan.period}</span>}
              </div>

              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{plan.description}</p>

              <ul className="mt-5 flex-1 space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-[#d7d1c6]">
                    <Check size={14} className={cn("mt-0.5 shrink-0", toneText[plan.tone])} />
                    {feature}
                  </li>
                ))}
              </ul>

              <Link
                href={`/cadastro?plan=${plan.key}`}
                className={cn(
                  "mt-6 flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition",
                  plan.highlight
                    ? "bg-[var(--gold)] text-[#141007] hover:bg-[var(--betel-gold-soft)]"
                    : "border border-[var(--line)] text-white hover:border-[var(--gold)] hover:text-[var(--gold)]"
                )}
              >
                {plan.key === "explorer" ? "Comecar gratis" : plan.key === "office" ? "Falar com vendas" : "Assinar agora"}
                <ArrowRight size={14} />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
