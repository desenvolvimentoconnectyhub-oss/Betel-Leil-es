"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Braces,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { DashboardCard } from "@/components/admin/DashboardCard";
import type { MetaWhatsAppDashboardData } from "@/lib/meta-whatsapp/official";

type DraftButton = {
  type: "URL" | "PHONE_NUMBER";
  text: string;
  url: string;
  phoneNumber: string;
};

type TemplateDraft = {
  name: string;
  category: string;
  language: string;
  headerType: "none" | "text" | "image" | "video" | "document";
  headerText: string;
  headerMediaHandle: string;
  bodyText: string;
  footerText: string;
  buttons: DraftButton[];
  variableExamples: Record<string, string>;
};

const defaultButton: DraftButton = {
  type: "URL",
  text: "",
  url: "",
  phoneNumber: "",
};

function defaultDraft(language = "pt_BR"): TemplateDraft {
  return {
    name: "",
    category: "MARKETING",
    language,
    headerType: "none",
    headerText: "",
    headerMediaHandle: "",
    bodyText: "",
    footerText: "",
    buttons: [{ ...defaultButton }],
    variableExamples: {},
  };
}

function extractVariables(text: string) {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(match[1]);
  return [...found].sort((a, b) => Number(a) - Number(b));
}

function templateTone(status: string) {
  if (status === "approved") return "border-[rgba(22,163,74,0.26)] bg-[rgba(22,163,74,0.08)] text-[var(--admin-green)]";
  if (status === "rejected" || status === "disabled") return "border-[rgba(220,38,38,0.26)] bg-[rgba(220,38,38,0.08)] text-[var(--admin-red)]";
  if (status === "pending") return "border-[rgba(184,122,22,0.26)] bg-[rgba(184,122,22,0.08)] text-[var(--admin-yellow)]";
  return "border-[var(--admin-border)] bg-white text-[var(--admin-muted)]";
}

function normalizeTemplateName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function requestTemplates(body: Record<string, unknown>) {
  const response = await fetch("/api/admin/meta-whatsapp/templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || payload.message || "Falha ao operar template Meta.");
  }
  return payload;
}

export function MetaWhatsAppTemplatesClient({
  initialData,
}: {
  initialData: MetaWhatsAppDashboardData;
}) {
  const [data, setData] = useState(initialData);
  const [draft, setDraft] = useState<TemplateDraft>(() => defaultDraft(initialData.config.defaultLanguage || "pt_BR"));
  const [loading, setLoading] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; message: string } | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const variables = useMemo(() => extractVariables(draft.bodyText), [draft.bodyText]);
  const canCreate = Boolean(data.config.configured && draft.name.trim() && draft.bodyText.trim());

  async function refresh() {
    const response = await fetch("/api/admin/meta-whatsapp/templates", { cache: "no-store" });
    const payload = await response.json();
    if (payload.ok && payload.data) setData(payload.data);
  }

  function updateDraft(patch: Partial<TemplateDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateButton(index: number, patch: Partial<DraftButton>) {
    setDraft((current) => ({
      ...current,
      buttons: current.buttons.map((button, itemIndex) => (itemIndex === index ? { ...button, ...patch } : button)),
    }));
  }

  function insertVariable(variable: string) {
    const token = `{{${variable}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      updateDraft({ bodyText: `${draft.bodyText}${draft.bodyText ? " " : ""}${token}` });
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = `${draft.bodyText.slice(0, start)}${token}${draft.bodyText.slice(end)}`;
    updateDraft({ bodyText: next });
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  async function handleSync() {
    setLoading("sync");
    setFeedback(null);
    try {
      const payload = await requestTemplates({ action: "sync" });
      await refresh();
      setFeedback({ type: "ok", message: `${payload.result?.synced || 0} template(s) sincronizado(s) da Meta.` });
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao sincronizar Meta." });
    } finally {
      setLoading("");
    }
  }

  async function handleCreate() {
    if (!canCreate) return;
    setLoading("create");
    setFeedback(null);
    try {
      await requestTemplates({
        action: "create",
        ...draft,
        name: normalizeTemplateName(draft.name),
        buttons: draft.buttons.filter((button) => button.text.trim()),
      });
      await refresh();
      setDraft(defaultDraft(data.config.defaultLanguage || "pt_BR"));
      setFeedback({ type: "ok", message: "Template enviado para aprovacao da Meta e salvo como gerenciado pelo painel." });
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao criar template Meta." });
    } finally {
      setLoading("");
    }
  }

  async function handleDelete(id: string) {
    setLoading(`delete:${id}`);
    setFeedback(null);
    try {
      await requestTemplates({ action: "delete", id });
      await refresh();
      setFeedback({ type: "ok", message: "Template removido do painel e solicitado para exclusao na Meta." });
    } catch (error) {
      setFeedback({ type: "err", message: error instanceof Error ? error.message : "Falha ao excluir template." });
    } finally {
      setLoading("");
    }
  }

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
              onClick={handleSync}
              disabled={loading === "sync"}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-white px-3 text-xs font-semibold text-[var(--admin-foreground)] shadow-sm disabled:opacity-60"
            >
              {loading === "sync" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sincronizar Meta
            </button>
          </div>
        </div>

        {data.source === "migration_pending" && (
          <Notice tone="warn" message={data.reason || "Migration pendente."} />
        )}
        {!data.config.configured && (
          <Notice tone="warn" message="Configure Meta System User Token, WABA ID, Phone Number ID e Webhook Verify Token na Sala de Manutencao." />
        )}
        {feedback && <Notice tone={feedback.type === "ok" ? "ok" : "err"} message={feedback.message} />}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Gerenciados" value={String(data.templates.length)} detail="created_from_panel" />
        <SummaryCard label="Aprovados" value={String(approvedCount)} detail="aptos para campanha" />
        <SummaryCard label="Pendentes" value={String(pendingCount)} detail="aguardando Meta" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <DashboardCard title="Criar template oficial" eyebrow="builder / meta api">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Nome" value={draft.name} onChange={(name) => updateDraft({ name: normalizeTemplateName(name) })} placeholder="ex: dica_leilao_vip" />
            <Select label="Categoria" value={draft.category} onChange={(category) => updateDraft({ category })} options={["MARKETING", "UTILITY", "AUTHENTICATION"]} />
            <Field label="Idioma" value={draft.language} onChange={(language) => updateDraft({ language })} placeholder="pt_BR" />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[0.6fr_1fr]">
            <Select label="Header" value={draft.headerType} onChange={(headerType) => updateDraft({ headerType: headerType as TemplateDraft["headerType"] })} options={["none", "text", "image", "video", "document"]} />
            {draft.headerType === "text" ? (
              <Field label="Texto do header" value={draft.headerText} onChange={(headerText) => updateDraft({ headerText })} placeholder="Betel Leiloes" />
            ) : ["image", "video", "document"].includes(draft.headerType) ? (
              <Field label="Media handle de exemplo" value={draft.headerMediaHandle} onChange={(headerMediaHandle) => updateDraft({ headerMediaHandle })} placeholder="handle gerado pela Meta" />
            ) : (
              <div className="rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-xs text-[var(--admin-muted)]">Sem header.</div>
            )}
          </div>

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Corpo</label>
              <div className="flex gap-1">
                {["1", "2", "3"].map((variable) => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => insertVariable(variable)}
                    className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-1 font-mono text-[10px] font-semibold text-[var(--admin-cyan)]"
                  >
                    {"{{"}{variable}{"}}"}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={bodyRef}
              value={draft.bodyText}
              onChange={(event) => updateDraft({ bodyText: event.target.value })}
              rows={5}
              className="w-full resize-none rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] outline-none transition focus:border-[var(--admin-cyan)]"
              placeholder="Ola {{1}}, separei uma oportunidade que pode fazer sentido para seu perfil."
            />
          </div>

          {variables.length > 0 && (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {variables.map((variable) => (
                <Field
                  key={variable}
                  label={`Exemplo {{${variable}}}`}
                  value={draft.variableExamples[variable] || ""}
                  onChange={(value) => updateDraft({ variableExamples: { ...draft.variableExamples, [variable]: value } })}
                  placeholder={variable === "1" ? "Willian" : `exemplo ${variable}`}
                />
              ))}
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="Footer" value={draft.footerText} onChange={(footerText) => updateDraft({ footerText })} placeholder="Opcional" />
            <div className="rounded-md border border-[var(--admin-border)] bg-white p-2">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">Botoes</p>
                <button
                  type="button"
                  disabled={draft.buttons.length >= 3}
                  onClick={() => updateDraft({ buttons: [...draft.buttons, { ...defaultButton }] })}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold text-[var(--admin-cyan)] disabled:opacity-40"
                >
                  <Plus size={12} />
                  Adicionar
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {draft.buttons.map((button, index) => (
                  <div key={index} className="grid gap-2 rounded-md border border-[var(--admin-border)] bg-[rgba(81,60,36,0.02)] p-2">
                    <div className="grid gap-2 md:grid-cols-[0.7fr_1fr]">
                      <select
                        value={button.type}
                        onChange={(event) => updateButton(index, { type: event.target.value as DraftButton["type"] })}
                        className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-2 text-xs"
                      >
                        <option value="URL">URL</option>
                        <option value="PHONE_NUMBER">Telefone</option>
                      </select>
                      <input
                        value={button.text}
                        onChange={(event) => updateButton(index, { text: event.target.value })}
                        placeholder="Texto do botao"
                        className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-2 text-xs"
                      />
                    </div>
                    <input
                      value={button.type === "URL" ? button.url : button.phoneNumber}
                      onChange={(event) => updateButton(index, button.type === "URL" ? { url: event.target.value } : { phoneNumber: event.target.value })}
                      placeholder={button.type === "URL" ? "https://..." : "+5547999999999"}
                      className="rounded-md border border-[var(--admin-border)] bg-white px-2 py-2 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[var(--admin-muted)]">Templates com midia precisam de media handle oficial da Meta para aprovacao.</p>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canCreate || loading === "create"}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[rgba(200,90,31,0.32)] bg-[var(--admin-cyan)] px-3 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading === "create" ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Enviar para Meta
            </button>
          </div>
        </DashboardCard>

        <DashboardCard title="Preview WhatsApp" eyebrow="template">
          <div className="mx-auto max-w-md rounded-xl border border-[var(--admin-border)] bg-[rgba(37,211,102,0.08)] p-3">
            <div className="rounded-lg bg-white p-3 shadow-sm">
              {draft.headerType === "text" && draft.headerText && <p className="mb-2 text-sm font-semibold text-[var(--admin-foreground)]">{draft.headerText}</p>}
              {["image", "video", "document"].includes(draft.headerType) && (
                <div className="mb-2 grid h-32 place-items-center rounded-md border border-dashed border-[var(--admin-border)] bg-[rgba(81,60,36,0.03)] text-[var(--admin-muted)]">
                  <ImageIcon size={24} />
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-6 text-[var(--admin-foreground)]">
                {draft.bodyText || "Digite o corpo do template para ver o preview."}
              </p>
              {draft.footerText && <p className="mt-3 text-xs text-[var(--admin-muted)]">{draft.footerText}</p>}
              {draft.buttons.filter((button) => button.text).length > 0 && (
                <div className="mt-3 grid gap-1.5 border-t border-[var(--admin-border)] pt-2">
                  {draft.buttons.filter((button) => button.text).map((button, index) => (
                    <div key={index} className="rounded-md bg-[rgba(37,99,235,0.08)] px-2 py-1.5 text-center text-xs font-semibold text-[var(--admin-cyan)]">
                      {button.text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            <Feature icon={<Braces size={16} />} title="Variaveis assistidas" text="Use os chips para inserir variaveis e informe exemplos obrigatorios para aprovacao." />
            <Feature icon={<Phone size={16} />} title="Botoes oficiais" text="URL e telefone sao enviados no componente BUTTONS da Meta." />
          </div>
        </DashboardCard>
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
                      {template.category} / {template.language} / {template.headerType} / {template.managedFromPanel ? "painel" : "sincronizado"}
                    </p>
                    {template.bodyText && <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{template.bodyText}</p>}
                    {template.rejectionReason && <p className="mt-1 text-xs text-[var(--admin-red)]">{template.rejectionReason}</p>}
                  </div>
                  <div className="flex items-start gap-2">
                    <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-[10px] font-bold uppercase tracking-[0.12em] ${templateTone(template.status)}`}>
                      {template.status}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(template.id)}
                      disabled={loading === `delete:${template.id}`}
                      className="grid size-8 place-items-center rounded-md border border-[rgba(220,38,38,0.22)] bg-[rgba(220,38,38,0.06)] text-[var(--admin-red)] disabled:opacity-50"
                      title="Excluir template"
                    >
                      {loading === `delete:${template.id}` ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 text-center">
              <FileText size={24} className="text-[var(--admin-muted)]" />
              <p className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">Nenhum template gerenciado ainda</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-[var(--admin-muted)]">
                Sincronize a Meta para auditoria ou crie o primeiro template pelo painel.
              </p>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Regras de uso" eyebrow="campanhas meta">
          <div className="space-y-3">
            <Feature icon={<ShieldCheck size={16} />} title="Somente painel" text="Campanhas oficiais usam apenas templates managed_from_panel=true." />
            <Feature icon={<RefreshCw size={16} />} title="Sync de auditoria" text="Templates antigos sincronizados ficam no banco, mas nao aparecem como aptos para campanha." />
            <Feature icon={<CheckCircle2 size={16} />} title="Aprovacao Meta" text="A campanha so deve usar status approved e contatos com opt-in confirmado." />
          </div>
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

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] p-4 shadow-sm">
      <p className="text-xs font-medium text-[var(--admin-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[var(--admin-foreground)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--admin-muted)]">{detail}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] outline-none transition focus:border-[var(--admin-cyan)]"
      />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-foreground)] outline-none transition focus:border-[var(--admin-cyan)]"
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
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
