"use client";

import { useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import type { MetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

type CampaignDraft = {
  name: string;
  campaignType: string;
  templateId: string;
  contactListId: string;
  senderId: string;
  scheduledFor: string;
  requireOptIn: boolean;
  rateLimitPerMinute: number;
  dailyLimitPerNumber: number;
};

type ListDraft = {
  name: string;
  optInConfirmed: boolean;
  optInSource: string;
};

const campaignTypes = [
  { value: "marketing", label: "Marketing" },
  { value: "follow_up", label: "Follow-up" },
  { value: "reactivation", label: "Reativacao" },
  { value: "traffic", label: "Trafego pago" },
  { value: "crm_segment", label: "Segmento CRM" },
  { value: "test", label: "Teste" },
];

const sampleCsv =
  "Nome,WhatsApp,Email,Cidade,Tags,var1,var2\nWillian,+55 47 99999-9999,lead@exemplo.com,Itajai,\"vip,leilao\",Willian,Imoveis abaixo do mercado\n";
const campaignsComingSoon = true;
const comingSoonMessage =
  "Em breve: o envio de campanhas Meta WhatsApp ainda nao esta liberado. Estamos mantendo credenciais, templates e preparacao visiveis, mas listas, criacao e disparo ficam bloqueados por enquanto.";

function defaultCampaignDraft(data: MetaWhatsAppDashboardData): CampaignDraft {
  const approvedTemplate = data.templates.find((template) => template.status === "approved");
  const list = data.contactLists[0];
  const sender = data.senders.find((item) => item.isDefault) || data.senders[0];
  return {
    name: "",
    campaignType: "marketing",
    templateId: approvedTemplate?.id || "",
    contactListId: list?.id || "",
    senderId: sender?.id || "",
    scheduledFor: "",
    requireOptIn: true,
    rateLimitPerMinute: data.config.rateLimitPerMinute,
    dailyLimitPerNumber: data.config.dailyLimitPerNumber,
  };
}

function toneClass(tone: string) {
  if (tone === "green") return "text-[var(--admin-green)] bg-[rgba(22,163,74,0.08)]";
  if (tone === "red") return "text-[var(--admin-red)] bg-[rgba(220,38,38,0.08)]";
  if (tone === "yellow") return "text-[var(--admin-yellow)] bg-[rgba(184,122,22,0.08)]";
  if (tone === "purple") return "text-[var(--admin-purple)] bg-[rgba(126,87,194,0.08)]";
  return "text-[var(--admin-muted)] bg-[rgba(81,60,36,0.04)]";
}

function formatDate(value: string) {
  if (!value) return "sem agenda";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function requestJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha na operacao Meta WhatsApp.");
  return payload;
}

export function MetaWhatsAppCampaignsClient({
  initialData,
}: {
  initialData: MetaWhatsAppDashboardData;
}) {
  const [data, setData] = useState(initialData);
  const [campaign, setCampaign] = useState<CampaignDraft>(() => defaultCampaignDraft(initialData));
  const [listDraft, setListDraft] = useState<ListDraft>({
    name: "",
    optInConfirmed: true,
    optInSource: "upload_painel_meta_whatsapp",
  });
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const approvedTemplates = useMemo(
    () => data.templates.filter((template) => template.status === "approved" && template.managedFromPanel),
    [data.templates]
  );
  const selectedTemplate = approvedTemplates.find((template) => template.id === campaign.templateId);
  const selectedList = data.contactLists.find((list) => list.id === campaign.contactListId);
  const selectedSender = data.senders.find((sender) => sender.id === campaign.senderId);
  const eligiblePreview = campaign.requireOptIn ? selectedList?.optInCount || 0 : selectedList?.validCount || 0;
  const canCreate = !campaignsComingSoon && Boolean(campaign.name.trim() && selectedTemplate && selectedList && selectedSender && eligiblePreview > 0);

  async function refresh() {
    const response = await fetch("/api/admin/meta-whatsapp/campaigns", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (payload.ok && payload.data) setData(payload.data);
  }

  async function handleSyncMeta() {
    setLoading("sync");
    setFeedback(null);
    try {
      const payload = await requestJson("/api/admin/meta-whatsapp/templates", { action: "sync" });
      await refresh();
      setFeedback({ type: "ok", message: `${payload.result?.synced || 0} template(s) sincronizado(s) e numeros oficiais atualizados.` });
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao sincronizar Meta." });
    } finally {
      setLoading("");
    }
  }

  function updateCampaign(patch: Partial<CampaignDraft>) {
    setCampaign((current) => ({ ...current, ...patch }));
  }

  function updateListDraft(patch: Partial<ListDraft>) {
    setListDraft((current) => ({ ...current, ...patch }));
  }

  async function handleImportList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (campaignsComingSoon) {
      setFeedback({ type: "err", message: "Importacao de listas para campanhas Meta WhatsApp esta em breve." });
      return;
    }
    if (!file) {
      setFeedback({ type: "err", message: "Selecione um arquivo .csv, .txt ou .xlsx." });
      return;
    }
    setLoading("import");
    setFeedback(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", listDraft.name || file.name.replace(/\.[^.]+$/, ""));
      formData.append("optInConfirmed", String(listDraft.optInConfirmed));
      formData.append("optInSource", listDraft.optInSource);
      const response = await fetch("/api/admin/meta-whatsapp/contact-lists", { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha ao importar lista.");
      await refresh();
      setFeedback({
        type: "ok",
        message: `Lista importada: ${payload.result.validCount} validos, ${payload.result.duplicateCount} duplicados, ${payload.result.invalidCount} invalidos.`,
      });
      if (!campaign.contactListId && payload.result.listId) updateCampaign({ contactListId: payload.result.listId });
      setFile(null);
      setListDraft({ name: "", optInConfirmed: true, optInSource: "upload_painel_meta_whatsapp" });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao importar lista." });
    } finally {
      setLoading("");
    }
  }

  async function handleCreateCampaign() {
    if (campaignsComingSoon) {
      setFeedback({ type: "err", message: "Criacao e envio de campanhas Meta WhatsApp estao em breve." });
      return;
    }
    if (!canCreate) return;
    setLoading("campaign");
    setFeedback(null);
    try {
      const payload = await requestJson("/api/admin/meta-whatsapp/campaigns", campaign);
      await refresh();
      setFeedback({
        type: "ok",
        message: `Campanha criada com ${payload.result.queued} destinatario(s) e ${payload.result.skipped} contato(s) ignorado(s). Ficou pendente de aprovacao humana antes da fila Inngest.`,
      });
      setCampaign((current) => ({
        ...defaultCampaignDraft(data),
        senderId: current.senderId,
        templateId: current.templateId,
        contactListId: current.contactListId,
      }));
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao criar campanha." });
    } finally {
      setLoading("");
    }
  }

  async function handleStartCampaign(campaignId: string) {
    if (campaignsComingSoon) {
      setFeedback({ type: "err", message: "Aprovacao e disparo de campanhas Meta WhatsApp estao em breve." });
      return;
    }
    setLoading(`start:${campaignId}`);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/meta-whatsapp/campaigns/${campaignId}/start`, { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Falha ao iniciar campanha.");
      await refresh();
      setFeedback({
        type: "ok",
        message: payload.result.status === "scheduled"
          ? "Campanha aprovada e agendada na Inngest."
          : "Campanha aprovada e enviada para a fila Inngest.",
      });
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao iniciar campanha." });
    } finally {
      setLoading("");
    }
  }

  return (
    <main className="space-y-4 px-4 py-4 lg:px-6">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              Trafego IA / WhatsApp Cloud API Oficial
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-[var(--admin-foreground)]">Campanhas Meta WhatsApp</h1>
              <span className="inline-flex h-6 items-center rounded-full border border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-yellow)]">
                Em breve
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Preparacao para campanhas oficiais com templates aprovados, listas com opt-in e revisao humana antes do disparo.
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
            <button
              type="button"
              onClick={handleSyncMeta}
              disabled={campaignsComingSoon || loading === "sync"}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[rgba(200,90,31,0.28)] bg-[rgba(200,90,31,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)] disabled:opacity-60"
            >
              {loading === "sync" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {campaignsComingSoon ? "Em breve" : "Sincronizar Meta"}
            </button>
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] shadow-sm"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          </div>
        </div>

        {data.source === "migration_pending" && <Notice tone="warn" message={data.reason || "Migration pendente."} />}
        {campaignsComingSoon && <Notice tone="warn" message={comingSoonMessage} />}
        {!data.config.configured && <Notice tone="warn" message="Configure token, WABA ID, Phone Number ID e webhook na Sala de Manutencao." />}
        {feedback && <Notice tone={feedback.type === "ok" ? "ok" : "err"} message={feedback.message} />}
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

      <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <DashboardCard title="Nova campanha oficial" eyebrow="template / lista / opt-in">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome da campanha" value={campaign.name} onChange={(name) => updateCampaign({ name })} placeholder="Ex: Leads quentes julho" />
            <Select label="Tipo" value={campaign.campaignType} onChange={(campaignType) => updateCampaign({ campaignType })} options={campaignTypes} />
            <Select
              label="Template aprovado"
              value={campaign.templateId}
              onChange={(templateId) => updateCampaign({ templateId })}
              options={approvedTemplates.map((template) => ({ value: template.id, label: `${template.name} / ${template.language}` }))}
              placeholder="Nenhum template aprovado"
            />
            <Select
              label="Lista"
              value={campaign.contactListId}
              onChange={(contactListId) => updateCampaign({ contactListId })}
              options={data.contactLists.map((list) => ({ value: list.id, label: `${list.name} / ${list.validCount} contatos` }))}
              placeholder="Nenhuma lista salva"
            />
            <Select
              label="Numero oficial"
              value={campaign.senderId}
              onChange={(senderId) => updateCampaign({ senderId })}
              options={data.senders.map((sender) => ({ value: sender.id, label: `${sender.label}${sender.isDefault ? " / padrao" : ""}` }))}
              placeholder="Sincronize numeros"
            />
            <Field
              label="Agendar"
              type="datetime-local"
              value={campaign.scheduledFor}
              onChange={(scheduledFor) => updateCampaign({ scheduledFor })}
            />
            <Field
              label="Limite por minuto"
              type="number"
              value={String(campaign.rateLimitPerMinute)}
              onChange={(rateLimitPerMinute) => updateCampaign({ rateLimitPerMinute: Number(rateLimitPerMinute) || data.config.rateLimitPerMinute })}
            />
            <Field
              label="Limite diario"
              type="number"
              value={String(campaign.dailyLimitPerNumber)}
              onChange={(dailyLimitPerNumber) => updateCampaign({ dailyLimitPerNumber: Number(dailyLimitPerNumber) || data.config.dailyLimitPerNumber })}
            />
          </div>

          <label className="mt-3 flex items-start gap-3 rounded-md border border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.06)] p-3 text-sm text-[var(--admin-foreground)]">
            <input
              type="checkbox"
              checked={campaign.requireOptIn}
              onChange={(event) => updateCampaign({ requireOptIn: event.target.checked })}
              className="mt-1"
            />
            <span>
              Exigir opt-in confirmado. Com essa trava ativa, entram apenas contatos autorizados na fila da campanha.
            </span>
          </label>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <MiniStat label="Template" value={selectedTemplate?.name || "pendente"} />
            <MiniStat label="Elegiveis" value={String(eligiblePreview)} />
            <MiniStat label="Numero" value={selectedSender?.displayPhoneNumber || selectedSender?.label || "pendente"} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs leading-5 text-[var(--admin-muted)]">
              Esta fase ficara responsavel por listas, revisao humana e disparo pela fila Inngest.
            </p>
            <button
              type="button"
              disabled={!canCreate || loading === "campaign"}
              onClick={handleCreateCampaign}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[var(--admin-cyan)] px-3 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "campaign" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {campaignsComingSoon ? "Em breve" : "Criar campanha"}
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="Importar lista salva" eyebrow="csv / txt / xlsx">
          <form onSubmit={handleImportList} className="space-y-3">
            <Field label="Nome da lista" value={listDraft.name} onChange={(name) => updateListDraft({ name })} placeholder="Ex: Midhaus selecao 250 leads" />
            <label className="block">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Arquivo</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx"
                disabled={campaignsComingSoon}
                onChange={(event) => {
                  const nextFile = event.currentTarget.files?.[0] || null;
                  setFile(nextFile);
                  if (nextFile && !listDraft.name) updateListDraft({ name: nextFile.name.replace(/\.[^.]+$/, "") });
                }}
                className="mt-1 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <Field label="Fonte do opt-in" value={listDraft.optInSource} onChange={(optInSource) => updateListDraft({ optInSource })} />
            <label className="flex items-start gap-3 rounded-md border border-[rgba(22,163,74,0.22)] bg-[rgba(22,163,74,0.06)] p-3 text-sm">
              <input
                type="checkbox"
                checked={listDraft.optInConfirmed}
                onChange={(event) => updateListDraft({ optInConfirmed: event.target.checked })}
                className="mt-1"
              />
              <span>Confirmo que esta lista possui opt-in para receber mensagens oficiais da Betel pelo WhatsApp.</span>
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsv)}`}
                download="modelo-meta-whatsapp.csv"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)]"
              >
                <FileSpreadsheet size={14} />
                Baixar modelo CSV
              </a>
              <button
                type="submit"
                disabled={campaignsComingSoon || !file || loading === "import"}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-[rgba(200,90,31,0.28)] bg-[rgba(200,90,31,0.08)] px-3 text-xs font-semibold text-[var(--admin-cyan)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading === "import" ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {campaignsComingSoon ? "Em breve" : "Salvar lista"}
              </button>
            </div>
          </form>
        </DashboardCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <DashboardCard title="Campanhas recentes" eyebrow="fila / revisao" contentClassName="p-0">
          {data.campaigns.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {data.campaigns.map((item) => (
                <div key={item.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[1fr_auto]">
                  <div>
                    <Link
                      href={`/admin/meta-whatsapp/campaigns/${item.id}`}
                      className="text-sm font-semibold text-[var(--admin-foreground)] hover:text-[var(--admin-cyan)]"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {item.campaignType} / {item.templateName || "template"} / {item.contactListName || "lista"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {item.status} / {item.approvalStatus} / {formatDate(item.scheduledFor)}
                    </p>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <MiniStat label="Fila" value={String(item.queued)} />
                    <MiniStat label="Enviadas" value={String(item.sent)} />
                    <MiniStat label="Lidas" value={String(item.read)} />
                    <MiniStat label="Falhas" value={String(item.failed)} />
                  </div>
                  {item.approvalStatus !== "approved" && item.queued > 0 && (
                    <div className="xl:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleStartCampaign(item.id)}
                        disabled={campaignsComingSoon || loading === `start:${item.id}`}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.08)] px-3 text-xs font-semibold text-[var(--admin-green)] disabled:opacity-60"
                      >
                        {loading === `start:${item.id}` ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        {campaignsComingSoon ? "Em breve" : "Aprovar e enfileirar"}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Send size={18} />} title="Nenhuma campanha criada" text="Crie uma lista, aprove um template e monte a primeira campanha oficial." />
          )}
        </DashboardCard>

        <DashboardCard title="Listas salvas" eyebrow="opt-in / qualidade" contentClassName="p-0">
          {data.contactLists.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {data.contactLists.map((list) => (
                <div key={list.id} className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto]">
                  <div>
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{list.name}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">
                      {list.sourceType} / {list.sourceFilename || "manual"} / {formatDate(list.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge>{list.validCount} validos</Badge>
                    <Badge>{list.optInCount} opt-in</Badge>
                    <Badge>{list.duplicateCount} dup.</Badge>
                    <Badge>{list.invalidCount} invalidos</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Users size={18} />} title="Nenhuma lista salva" text="Importe CSV, TXT ou XLSX para reutilizar em campanhas oficiais." />
          )}
        </DashboardCard>
      </section>
    </main>
  );
}

function Notice({ tone, message }: { tone: "ok" | "warn" | "err"; message: string }) {
  const className =
    tone === "ok"
      ? "border-[rgba(22,163,74,0.28)] bg-[rgba(22,163,74,0.08)] text-[var(--admin-green)]"
      : tone === "err"
        ? "border-[rgba(220,38,38,0.28)] bg-[rgba(220,38,38,0.08)] text-[var(--admin-red)]"
        : "border-[rgba(184,122,22,0.28)] bg-[rgba(184,122,22,0.08)] text-[var(--admin-yellow)]";
  return (
    <div className={`mt-4 flex items-start gap-3 rounded-md border px-3 py-2 text-sm ${className}`}>
      {tone === "ok" ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <span>{message}</span>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] outline-none transition focus:border-[var(--admin-cyan)]"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder = "Selecione",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] outline-none transition focus:border-[var(--admin-cyan)]"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--admin-border)] bg-white px-3 py-2">
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[var(--admin-foreground)]">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-7 items-center rounded-full border border-[var(--admin-border)] bg-white px-2.5 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--admin-muted)]">
      {children}
    </span>
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
