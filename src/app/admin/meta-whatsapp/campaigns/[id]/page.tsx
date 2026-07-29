import Link from "next/link";
import { AlertTriangle, ArrowLeft, MessageSquare } from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { getMetaWhatsAppCampaignDetail } from "@/lib/meta-whatsapp/official";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusClass(status: string) {
  if (["sent", "delivered", "read", "completed", "approved"].includes(status)) {
    return "border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.08)] text-[var(--admin-green)]";
  }
  if (["failed", "rejected", "cancelled"].includes(status)) {
    return "border-[rgba(220,38,38,0.28)] bg-[rgba(220,38,38,0.08)] text-[var(--admin-red)]";
  }
  if (["queued", "scheduled", "running", "pending_review"].includes(status)) {
    return "border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] text-[var(--admin-yellow)]";
  }
  return "border-[var(--admin-border)] bg-white text-[var(--admin-muted)]";
}

export default async function MetaWhatsAppCampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getMetaWhatsAppCampaignDetail(id);
  const campaign = data.campaign;

  return (
    <main className="space-y-4 px-4 py-4 lg:px-6">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link href="/admin/meta-whatsapp" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--admin-muted)] hover:text-[var(--admin-cyan)]">
              <ArrowLeft size={14} />
              Voltar para campanhas
            </Link>
            <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              Trafego IA / Auditoria Meta WhatsApp
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">
              {campaign?.name || "Campanha Meta WhatsApp"}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Detalhe operacional dos destinatarios, status da Meta, webhooks e payloads de envio.
            </p>
          </div>
          {campaign && (
            <div className="flex flex-wrap gap-2">
              <Badge value={campaign.status} />
              <Badge value={campaign.approvalStatus} />
            </div>
          )}
        </div>

        {data.reason && (
          <div className="mt-4 flex items-start gap-3 rounded-md border border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] px-3 py-2 text-sm text-[var(--admin-yellow)]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{data.reason}</span>
          </div>
        )}
      </section>

      {campaign && (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <Metric label="Total" value={String(campaign.total)} />
            <Metric label="Fila" value={String(campaign.queued)} />
            <Metric label="Enviadas" value={String(campaign.sent)} />
            <Metric label="Entregues" value={String(campaign.delivered)} />
            <Metric label="Lidas" value={String(campaign.read)} />
            <Metric label="Falhas" value={String(campaign.failed)} />
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <DashboardCard title="Campanha" eyebrow="controle">
              <Info label="Tipo" value={campaign.campaignType} />
              <Info label="Agenda" value={formatDate(campaign.scheduledFor)} />
              <Info label="Criada em" value={formatDate(campaign.createdAt)} />
            </DashboardCard>
            <DashboardCard title="Template" eyebrow="meta">
              <Info label="Nome" value={data.template?.name || campaign.templateName || "-"} />
              <Info label="Idioma" value={data.template?.language || "-"} />
              <Info label="Status" value={data.template?.status || "-"} />
            </DashboardCard>
            <DashboardCard title="Remetente e lista" eyebrow="origem">
              <Info label="Numero" value={data.sender?.displayPhoneNumber || data.sender?.label || "-"} />
              <Info label="Lista" value={data.contactList?.name || campaign.contactListName || "-"} />
              <Info label="Opt-in" value={data.contactList ? `${data.contactList.optInCount} contatos` : "-"} />
            </DashboardCard>
          </section>

          <DashboardCard title="Destinatarios" eyebrow="status / erro / payload" contentClassName="p-0">
            {data.recipients.length ? (
              <div className="divide-y divide-[var(--admin-border)]">
                {data.recipients.map((recipient) => (
                  <div key={recipient.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--admin-foreground)]">{recipient.name || recipient.phone}</p>
                        <Badge value={recipient.status} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">
                        {recipient.phone} / tentativas {recipient.attemptCount} / msg {recipient.providerMessageId || "-"}
                      </p>
                      {recipient.errorMessage && (
                        <p className="mt-2 rounded-md border border-[rgba(220,38,38,0.22)] bg-[rgba(220,38,38,0.06)] px-2 py-1 text-xs text-[var(--admin-red)]">
                          {recipient.errorCode ? `${recipient.errorCode}: ` : ""}{recipient.errorMessage}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-2 text-xs text-[var(--admin-muted)] xl:min-w-72">
                      <span>Enviado: {formatDate(recipient.sentAt)}</span>
                      <span>Entregue: {formatDate(recipient.deliveredAt)}</span>
                      <span>Lido: {formatDate(recipient.readAt)}</span>
                      <JsonDetails title="Payload" value={recipient.payload} />
                      <JsonDetails title="Resposta Meta" value={recipient.responsePayload} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nenhum destinatario encontrado" />
            )}
          </DashboardCard>

          <DashboardCard title="Eventos de webhook" eyebrow="meta status callbacks" contentClassName="p-0">
            {data.events.length ? (
              <div className="divide-y divide-[var(--admin-border)]">
                {data.events.map((event) => (
                  <div key={event.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                    <div>
                      <p className="text-sm font-semibold text-[var(--admin-foreground)]">{event.eventType}</p>
                      <p className="mt-1 text-xs text-[var(--admin-muted)]">{event.providerMessageId || "sem message id"}</p>
                    </div>
                    <div className="text-xs text-[var(--admin-muted)]">{formatDate(event.createdAt)}</div>
                    <div className="md:col-span-2">
                      <JsonDetails title="Payload webhook" value={event.payload} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Nenhum webhook recebido ainda" />
            )}
          </DashboardCard>
        </>
      )}
    </main>
  );
}

function Badge({ value }: { value: string }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] ${statusClass(value)}`}>
      {value || "-"}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
      <p className="text-xs font-medium text-[var(--admin-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--admin-foreground)]">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2 rounded-md border border-[var(--admin-border)] bg-white px-3 py-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--admin-foreground)]">{value}</p>
    </div>
  );
}

function JsonDetails({ title, value }: { title: string; value: Record<string, unknown> }) {
  const empty = Object.keys(value || {}).length === 0;
  return (
    <details className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-1">
      <summary className="cursor-pointer text-xs font-semibold text-[var(--admin-foreground)]">{title}</summary>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-5 text-[var(--admin-muted)]">
        {empty ? "{}" : JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

function EmptyState({ title }: { title: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center px-4 py-8 text-center">
      <div className="grid size-10 place-items-center rounded-md border border-[var(--admin-border)] bg-white text-[var(--admin-cyan)]">
        <MessageSquare size={18} />
      </div>
      <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">{title}</p>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">Os dados aparecem aqui assim que a campanha for processada.</p>
    </div>
  );
}
