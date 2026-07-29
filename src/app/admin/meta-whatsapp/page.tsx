import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ExternalLink, Send, ShieldCheck } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { getMetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toneClass(tone: string) {
  if (tone === "green") return "text-[var(--admin-green)] bg-[rgba(22,163,74,0.08)]";
  if (tone === "red") return "text-[var(--admin-red)] bg-[rgba(220,38,38,0.08)]";
  if (tone === "yellow") return "text-[var(--admin-yellow)] bg-[rgba(184,122,22,0.08)]";
  if (tone === "purple") return "text-[var(--admin-purple)] bg-[rgba(126,87,194,0.08)]";
  return "text-[var(--admin-muted)] bg-[rgba(81,60,36,0.04)]";
}

function statusLabel(value: boolean) {
  return value ? "Configurado" : "Pendente";
}

export default async function MetaWhatsAppCampaignsPage() {
  const data = await getMetaWhatsAppDashboardData();
  const config = data.config;

  return (
    <main className="space-y-4 px-4 py-4 lg:px-6">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              Trafego IA / WhatsApp Cloud API Oficial
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">
              Campanhas Meta WhatsApp
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Use somente listas com opt-in e templates aprovados criados ou gerenciados pelo painel.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/maintenance"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] shadow-sm"
            >
              <ShieldCheck size={14} />
              Credenciais Meta
            </Link>
            <Link
              href="/admin/meta-whatsapp-templates"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[rgba(200,90,31,0.28)] bg-[rgba(200,90,31,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)]"
            >
              Templates Meta
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>

        {data.source === "migration_pending" && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] px-3 py-2 text-sm text-[var(--admin-yellow)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.reason}</span>
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.metrics.map((metric) => (
          <div key={metric.label} className={`rounded-lg border border-[var(--admin-border)] p-4 ${toneClass(metric.tone)}`}>
            <p className="text-xs font-medium text-[var(--admin-muted)]">{metric.label}</p>
            <div className="mt-2 text-2xl font-semibold text-[var(--admin-foreground)]">{metric.value}</div>
            <p className="mt-1 text-xs text-[var(--admin-muted)]">{metric.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardCard title="Operacao oficial" eyebrow="configuracao / limites">
          <div className="grid gap-3 md:grid-cols-2">
            <InfoTile label="Meta App ID" value={config.appId || "pendente"} />
            <InfoTile label="WABA ID" value={config.wabaId || "pendente"} />
            <InfoTile label="Phone Number ID" value={config.phoneNumberId || "pendente"} />
            <InfoTile label="Graph API" value={config.apiVersion} />
            <InfoTile label="Token sistema" value={statusLabel(config.systemUserTokenConfigured)} />
            <InfoTile label="Webhook token" value={statusLabel(config.webhookVerifyTokenConfigured)} />
            <InfoTile label="Limite/min" value={`${config.rateLimitPerMinute} envios`} />
            <InfoTile label="Limite diario" value={`${config.dailyLimitPerNumber} por numero`} />
          </div>
          <div className="mt-4 rounded-md border border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.06)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
            Endpoint webhook: <span className="font-mono text-[var(--admin-foreground)]">/api/webhooks/meta-whatsapp</span>
          </div>
        </DashboardCard>

        <DashboardCard title="Travas de campanha" eyebrow="compliance">
          <div className="space-y-3">
            {[
              "Envios ativos somente pela WhatsApp Cloud API oficial.",
              "Templates antigos sincronizados ficam ocultos na criacao de campanhas.",
              "Contato precisa ter opt-in confirmado antes de entrar na fila.",
              "Fila e recorrencia devem rodar pela Inngest, sem cron job da Vercel.",
            ].map((item) => (
              <div key={item} className="flex gap-2 text-sm text-[var(--admin-muted)]">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[var(--admin-green)]" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </DashboardCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DashboardCard title="Campanhas recentes" eyebrow="fila / status" contentClassName="p-0">
          {data.campaigns.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {data.campaigns.map((campaign) => (
                <div key={campaign.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{campaign.name}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {campaign.status} · {campaign.scheduledFor || "sem agenda"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--admin-muted)]">
                    <span>{campaign.sent} env.</span>
                    <span>{campaign.delivered} ent.</span>
                    <span>{campaign.failed} falhas</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Send size={18} />} title="Nenhuma campanha oficial criada" text="A criacao de campanhas entra na proxima fase, depois da configuracao Meta e templates." />
          )}
        </DashboardCard>

        <DashboardCard title="Listas salvas" eyebrow="opt-in / importacao" contentClassName="p-0">
          {data.contactLists.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {data.contactLists.map((list) => (
                <div key={list.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{list.name}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">{list.validCount} validos</p>
                  </div>
                  <div className="text-xs text-[var(--admin-muted)]">
                    {list.duplicateCount} duplicados · {list.invalidCount} invalidos
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Clock3 size={18} />} title="Importacao pendente" text="A proxima fase libera CSV, TXT e XLSX novo. XLS antigo sera bloqueado." />
          )}
        </DashboardCard>
      </section>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--admin-border)] bg-white px-3 py-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--admin-foreground)]">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center px-4 py-8 text-center">
      <div className="grid size-10 place-items-center rounded-md border border-[var(--admin-border)] bg-white text-[var(--admin-cyan)]">{icon}</div>
      <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">{title}</p>
      <p className="mt-1 max-w-md text-xs leading-5 text-[var(--admin-muted)]">{text}</p>
    </div>
  );
}
