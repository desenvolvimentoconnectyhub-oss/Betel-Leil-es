"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";

export function WhatsAppLeadResetDialog({ lead, onClose, onDeleted }: {
  lead: { leadId: string; conversationId: string; name: string };
  onClose: () => void; onDeleted: (leadId: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    cancel.current?.focus();
    return () => previous?.focus();
  }, []);
  async function reset() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/admin/whatsapp/leads/reset", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.leadId, conversationId: lead.conversationId, confirmation: "RESETAR" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível resetar o lead.");
      if (!result.complete) { setNotice(result.message); return; }
      onDeleted(lead.leadId); onClose();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Falha ao resetar o lead."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby="reset-lead-title" aria-describedby="reset-lead-description"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-[var(--admin-border)] bg-white p-6 text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
    <h2 id="reset-lead-title" className="text-xl font-bold">Resetar lead: {lead.name}</h2>
    <p id="reset-lead-description" className="mt-4 text-sm leading-6">Todos os dados deste lead no atendimento WhatsApp da Betel serão excluídos definitivamente: cadastro, conversas ativas e arquivadas em todas as instâncias, memória, qualificação, arquivos, agendamentos e filas de contato vinculadas.</p>
    <p className="mt-3 text-sm font-semibold leading-6">Esta ação não pode ser desfeita. O próximo contato recebido começará com um novo cadastro, do zero.</p>
    <p className="mt-3 text-sm leading-6">A conexão do WhatsApp permanece ativa. O reset não envia mensagens, não apaga conversas dos aparelhos e não altera contratos ou transações externas. Um registro mínimo da operação é preservado para auditoria.</p>
    {notice && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <button ref={cancel} type="button" disabled={busy} onClick={onClose} className="rounded-full border px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancelar</button>
      <button type="button" disabled={busy} onClick={() => void reset()} className="inline-flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}{busy ? "Excluindo…" : "Excluir tudo e resetar"}
      </button>
    </div>
  </dialog>;
}
