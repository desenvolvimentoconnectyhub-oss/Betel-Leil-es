import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Braces, FileText, ImageIcon, Phone, Plus, ShieldCheck } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { getMetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function templateTone(status: string) {
  if (status === "approved") return "border-[rgba(22,163,74,0.26)] bg-[rgba(22,163,74,0.08)] text-[var(--admin-green)]";
  if (status === "rejected" || status === "disabled") return "border-[rgba(220,38,38,0.26)] bg-[rgba(220,38,38,0.08)] text-[var(--admin-red)]";
  if (status === "pending") return "border-[rgba(184,122,22,0.26)] bg-[rgba(184,122,22,0.08)] text-[var(--admin-yellow)]";
  return "border-[var(--admin-border)] bg-white text-[var(--admin-muted)]";
}

export default async function MetaTemplatesPage() {
  const data = await getMetaWhatsAppDashboardData();
  const approvedCount = data.templates.filter((item) => item.status === "approved").length;
  const pendingCount = data.templates.filter((item) => item.status === "pending").length;

  return (
    <main className="space-y-4 px-4 py-4 lg:px-6">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              Trafego IA / Templates oficiais
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">Templates Meta</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Campanhas Meta WhatsApp usam somente templates aprovados e marcados como gerenciados pelo painel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/meta-whatsapp"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] shadow-sm"
            >
              Campanhas
            </Link>
            <button
              type="button"
              disabled
              className="inline-flex h-9 cursor-not-allowed items-center gap-2 rounded-md border border-[rgba(200,90,31,0.22)] bg-[rgba(200,90,31,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)] opacity-70"
            >
              <Plus size={14} />
              Novo template
            </button>
          </div>
        </div>

        {data.source === "migration_pending" && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] px-3 py-2 text-sm text-[var(--admin-yellow)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.reason}</span>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Gerenciados" value={String(data.templates.length)} detail="created_from_panel" />
        <SummaryCard label="Aprovados" value={String(approvedCount)} detail="aptos para campanha" />
        <SummaryCard label="Pendentes" value={String(pendingCount)} detail="aguardando Meta" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
        <DashboardCard title="Templates gerenciados pelo painel" eyebrow="aprovacao / campanha" contentClassName="p-0">
          {data.templates.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {data.templates.map((template) => (
                <div key={template.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{template.name}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {template.category} · {template.language} · {template.managedFromPanel ? "painel" : "sincronizado"}
                    </p>
                  </div>
                  <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] ${templateTone(template.status)}`}>
                    {template.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 text-center">
              <FileText size={24} className="text-[var(--admin-muted)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">Nenhum template gerenciado ainda</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-[var(--admin-muted)]">
                Templates antigos da Meta podem ser sincronizados para auditoria, mas nao entram na criacao de campanhas.
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Builder esperado" eyebrow="proxima fase">
          <div className="space-y-3">
            <Feature icon={<Braces size={16} />} title="Variaveis assistidas" text="Chips para inserir {{1}}, {{2}} e {{3}} sem digitar manualmente." />
            <Feature icon={<ImageIcon size={16} />} title="Header com midia" text="Texto, imagem, video ou documento com preview antes do envio para a Meta." />
            <Feature icon={<Phone size={16} />} title="Botoes oficiais" text="URL e telefone com validacao antes da submissao do template." />
            <Feature icon={<ShieldCheck size={16} />} title="Governanca" text="Salvar como created_from_panel e managed_from_panel para liberar campanha." />
          </div>
        </DashboardCard>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
      <p className="text-xs font-medium text-[var(--admin-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--admin-foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">{detail}</p>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-[var(--admin-border)] bg-white p-3">
      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-[rgba(200,90,31,0.08)] text-[var(--admin-cyan)]">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-[var(--admin-foreground)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{text}</p>
      </div>
    </div>
  );
}
