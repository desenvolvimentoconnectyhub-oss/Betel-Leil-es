"use client";

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Link2, MoreVertical, Smartphone } from 'lucide-react';
import type { AuctionOpportunity } from '@/lib/admin/resources';
import type { PropertyMarketAnalysis } from '@/lib/admin/market-analysis';
import type { ApprovedMarketPublication } from '@/lib/domain/market-publication';
import { selectRentalReferences } from '@/lib/domain/rental-references';
import { formatOpportunityWhatsAppMessage } from '@/lib/domain/opportunity-whatsapp-message';
import { projectMessageReview } from '@/lib/domain/opportunity-message-review';
import { whatsappPublicationParts } from '@/lib/domain/whatsapp-publication-parts';

export type OpportunityMessagePreview = {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  approved?: ApprovedMarketPublication | null;
  publicUrl: string;
};

function MessageText({ text }: { text: string }) {
  return <p className="opportunity-phone-text">{text.split(/(https?:\/\/[^\s]+|\*[^*\n]+\*)/g).map((piece, i) =>
    /^https?:\/\//.test(piece) ? <span className="opportunity-phone-link" key={i}>{piece}</span>
      : piece.startsWith('*') && piece.endsWith('*') ? <strong key={i}>{piece.slice(1, -1)}</strong> : piece
  )}</p>;
}

export function OpportunityMessagePhone({ preview, format, sender, destination, open, test }: {
  preview: OpportunityMessagePreview; format: 'source_buttons' | 'source_links';
  sender: string; destination: string; open: boolean; test: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const chat = useRef<HTMLDivElement>(null);
  const lastFormat = useRef(format);
  const [review, setReview] = useState(preview.analysis);
  useEffect(() => {
    if (lastFormat.current !== format && chat.current) {
      chat.current.scrollTop = chat.current.scrollHeight;
      if ((root.current?.parentElement?.clientWidth || 0) < 760) root.current?.scrollIntoView({ block: 'start' });
    }
    lastFormat.current = format;
  }, [format]);
  useEffect(() => {
    const form = root.current?.closest('form');
    if (!form || !open || !preview.analysis) return;
    const update = () => setReview(projectMessageReview(preview.analysis!, new FormData(form), preview.opportunity.initialBid));
    const timer = window.setTimeout(update, 0);
    const onEdit = (event: Event) => {
      const name = (event.target as HTMLInputElement)?.name || '';
      if (name && !name.startsWith('whatsapp')) update();
    };
    form.addEventListener('input', onEdit);
    form.addEventListener('change', onEdit);
    return () => { window.clearTimeout(timer); form.removeEventListener('input', onEdit); form.removeEventListener('change', onEdit); };
  }, [open, preview.analysis, preview.opportunity.initialBid]);
  const snapshot = test ? preview.approved : null;
  const analysis = snapshot?.analysis || review;
  const references = snapshot?.references || (analysis ? selectRentalReferences(analysis) : []);
  const post = formatOpportunityWhatsAppMessage(snapshot?.opportunity || preview.opportunity, analysis, references, preview.publicUrl, format);
  const parts = whatsappPublicationParts({ ...post, mediaUrl: post.imageUrl });
  return <div ref={root} className="opportunity-send-preview">
    <h3 className="text-sm font-semibold">Prévia da mensagem</h3>
    <p className="mt-1 text-xs text-[var(--admin-muted)]" role="status">{format === 'source_buttons' ? 'Com botões' : 'Com links no texto'} · {test && snapshot ? 'versão aprovada' : 'dados da revisão'}</p>
    <div className="opportunity-phone" aria-label="Simulação da conversa no WhatsApp">
      <div className="opportunity-phone-speaker" aria-hidden="true" />
      <div className="opportunity-phone-header">
        <ArrowLeft size={17} aria-hidden="true" /><span className="opportunity-phone-avatar" aria-hidden="true"><Smartphone size={18} /></span>
        <div><p className="font-semibold">{destination}</p><p className="text-xs">Enviado por {sender}</p></div><MoreVertical size={17} aria-hidden="true" />
      </div>
      <div ref={chat} className="opportunity-phone-chat" role="region" aria-label="Conteúdo completo da mensagem" tabIndex={0}>
        {parts.map(part => <article key={part.kind} className="opportunity-phone-bubble" data-message-part={part.kind}>
          {part.imageUrl ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={part.imageUrl} alt="Foto que acompanha a mensagem" className="opportunity-phone-image" /> : null}
          <MessageText text={part.text} />
          {part.actionButton?.footerText ? <p className="opportunity-phone-footer">{part.actionButton.footerText}</p> : null}
          {(part.actionButton?.choices?.length ? part.actionButton.choices : part.actionButton?.url ? [{ label: part.actionButton.label || 'Abrir link', url: part.actionButton.url }] : []).map((choice, index) =>
            <button type="button" className="opportunity-phone-button" key={index} title="Botão de demonstração; não abre o link nem envia mensagens" onClick={event => event.preventDefault()}><Link2 size={15} aria-hidden="true" />{choice.label}</button>
          )}
        </article>)}
      </div>
      <div className="opportunity-phone-home" aria-hidden="true" />
    </div>
    <p className="mt-2 text-xs leading-4 text-[var(--admin-muted)]">A aparência pode variar no WhatsApp. Links e botões aqui são apenas demonstração.</p>
    <p className="mt-1 text-xs leading-4 text-[var(--admin-muted)]">{test ? snapshot ? 'Conteúdo da versão aprovada.' : 'Versão aprovada indisponível; mostrando a revisão. O teste exige aprovação.' : 'A validação final pode atualizar os anúncios antes do envio.'} Os links de rastreamento Betel são aplicados no envio.</p>
  </div>;
}
