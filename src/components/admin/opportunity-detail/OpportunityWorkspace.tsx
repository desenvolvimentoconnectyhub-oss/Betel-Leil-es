"use client";

import { createContext, useContext, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Pencil, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "./opportunity-workspace.css";

type Panel = { id: string; label: string; icon: ReactNode; content: ReactNode };
const SendPanelContext = createContext(true);
export function useSendPanelOpen() { return useContext(SendPanelContext); }

/** Panels stay mounted: navigation must not discard unsaved native form fields. */
export function OpportunityWorkspace({ header, panels, initialTab, actions, sendPanel, reviewStatus, notices, revisionToken, saveSucceeded, sendAvailable }: {
  header: ReactNode; panels: Panel[]; initialTab: string; actions: ReactNode;
  sendPanel: ReactNode; reviewStatus: string; notices: ReactNode; revisionToken: string; saveSucceeded: boolean; sendAvailable: boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const [dirty, setDirty] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();
  const [submitted, setSubmitted] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState(revisionToken);
  if (loadedRevision !== revisionToken) {
    setLoadedRevision(revisionToken);
    if (submitted && saveSucceeded) { setDirty(false); setSubmitted(false); }
  }

  useEffect(() => {
    const form = root.current?.closest("form");
    const markSubmission = () => setSubmitted(true);
    // React resets uncontrolled inputs after a resolved action, including actions
    // that redirect to an error. Keep the draft until a saved revision is returned.
    const protectDraft = (event: Event) => { if (dirty) event.preventDefault(); };
    form?.addEventListener("reset", protectDraft);
    form?.addEventListener("submit", markSubmission);
    return () => { form?.removeEventListener("reset", protectDraft); form?.removeEventListener("submit", markSubmission); };
  }, [dirty]);

  useEffect(() => {
    const sync = () => {
      const selected = new URLSearchParams(window.location.search).get("tab") || "visao-geral";
      if (panels.some(panel => panel.id === selected)) setTab(selected);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [panels]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function navigate(id: string, hash = "") {
    setTab(id);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    url.hash = hash;
    window.history.pushState(null, "", url);
    requestAnimationFrame(() => {
      const target = hash ? root.current?.querySelector<HTMLElement>(`[id="${hash.slice(1)}"]`) : root.current?.querySelector<HTMLElement>(`#panel-${id}`);
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ block: "start" });
      if (hash) target?.focus();
    });
  }

  function handleLink(event: MouseEvent<HTMLDivElement>) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href]");
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) {
      if (dirty && !window.confirm("Há alterações não salvas nesta revisão. Sair e descartar o rascunho?")) {
        event.preventDefault(); event.stopPropagation();
      }
      return;
    }
    const nextTab = url.searchParams.get("tab");
    // Photo/filter links still use Next to refresh their server-rendered content.
    if (!nextTab || !panels.some(panel => panel.id === nextTab) || url.searchParams.has("photo") || url.searchParams.has("marketFilter") || url.searchParams.has("marketSort")) return;
    event.preventDefault();
    event.stopPropagation();
    navigate(nextTab, url.hash);
  }

  return (
    <div ref={root} id="topo-oportunidade" className="opportunity-workspace mx-auto w-full max-w-[1520px] px-3 py-4 lg:px-5" onClickCapture={handleLink}
      onChangeCapture={event => { if ((event.target as HTMLElement).closest('[data-review-fields]')) setDirty(true); }}>
      {header}
      {notices}
      <nav aria-label="Seções da oportunidade" className="opportunity-tabs my-4 flex flex-wrap gap-1 border-b border-[var(--admin-border)]" role="tablist">
        {panels.map(panel => <button key={panel.id} id={`tab-${panel.id}`} type="button" role="tab" aria-selected={tab === panel.id} aria-controls={`panel-${panel.id}`}
          tabIndex={tab === panel.id ? 0 : -1}
          onKeyDown={event => {
            const index = panels.findIndex(item => item.id === panel.id);
            const next = event.key === "Home" ? 0 : event.key === "End" ? panels.length - 1 : event.key === "ArrowRight" ? (index + 1) % panels.length : event.key === "ArrowLeft" ? (index + panels.length - 1) % panels.length : -1;
            if (next < 0) return;
            event.preventDefault(); navigate(panels[next].id);
            root.current?.querySelector<HTMLButtonElement>(`#tab-${panels[next].id}`)?.focus();
          }}
          onClick={() => navigate(panel.id)} className={cn("inline-flex min-h-11 items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2", tab === panel.id ? "border-[var(--admin-cyan)] text-[var(--admin-cyan)]" : "border-transparent text-[var(--admin-muted)] hover:text-[var(--admin-foreground)]")}>
          {panel.icon}{panel.label}
        </button>)}
      </nav>
      {panels.map(panel => <div key={panel.id} id={`panel-${panel.id}`} role="tabpanel" aria-labelledby={`tab-${panel.id}`} tabIndex={-1} hidden={tab !== panel.id} data-review-fields={panel.id === "revisao" ? "true" : undefined} className="scroll-mt-20">
        {panel.content}
      </div>)}
      <div className="opportunity-toolbar sticky bottom-0 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--admin-border)] bg-white p-3 shadow-lg">
        <div className="min-w-0 text-sm"><p className="font-semibold">Revisão humana: {reviewStatus}</p><p role="status" className="text-xs text-[var(--admin-muted)]">{dirty ? "Alterações não salvas" : "Versão carregada • revise antes de decidir"}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => navigate("revisao")}><Pencil size={15} />Editar revisão</Button>
          {actions}
          <Button ref={trigger} type="button" disabled={pending || !sendAvailable} title={sendAvailable ? undefined : "A análise precisa existir antes de preparar o envio"} className="bg-[var(--admin-cyan)] text-white" onClick={() => { setSendOpen(true); dialog.current?.showModal(); }}><Send size={15} />Preparar envio</Button>
        </div>
      </div>
      {/* Native dialog stays inside the form, preserving form ownership and state. */}
      <dialog ref={dialog} aria-labelledby="send-panel-title" aria-describedby="send-panel-description" className="opportunity-send-dialog" onClose={() => { setSendOpen(false); trigger.current?.focus(); }} onCancel={event => { if (pending) event.preventDefault(); }}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--admin-border)] bg-white p-4">
          <div><h2 id="send-panel-title" className="text-lg font-semibold">Preparar envio</h2><p id="send-panel-description" className="mt-1 text-sm text-[var(--admin-muted)]">Confira a revisão, o remetente e o destino. O envio exige a ação final abaixo.</p></div>
          <Button type="button" variant="outline" size="icon" aria-label="Fechar preparação de envio" disabled={pending} onClick={() => dialog.current?.close()}><X size={18} /></Button>
        </div>
        <div className="p-4"><SendPanelContext value={sendOpen}>{sendPanel}</SendPanelContext></div>
      </dialog>
    </div>
  );
}

export function ReferenceGroups({ rentals, sales, rentalCount, saleCount }: { rentals: ReactNode; sales: ReactNode; rentalCount: number; saleCount: number }) {
  const [selected, setSelected] = useState("rent");
  return <div>
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Tipo de referência">
      <Button type="button" variant={selected === "rent" ? "default" : "outline"} aria-pressed={selected === "rent"} onClick={() => setSelected("rent")}>Aluguel ({rentalCount})</Button>
      <Button type="button" variant={selected === "sale" ? "default" : "outline"} aria-pressed={selected === "sale"} onClick={() => setSelected("sale")}>Venda ({saleCount})</Button>
      <a className="ml-auto text-sm font-semibold text-[var(--admin-cyan)] underline" href="?tab=mercado">Ver todos os comparáveis</a>
    </div>
    <div hidden={selected !== "rent"}>{rentals}</div><div hidden={selected !== "sale"}>{sales}</div>
  </div>;
}
