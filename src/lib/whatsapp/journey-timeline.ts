type Row = Record<string, unknown>;
export function journeyTimelineMessage(row: Row, viewingLeadId: string): Row {
  const metadata = (row.metadata || {}) as Row;
  if (row.source === 'betel_process_stage') {
    const state = (value: unknown) => Object.entries((value || {}) as Row).filter(([,v]) => v !== null && v !== '').map(([key,value]) => `${key}: ${value}`).join('; ');
    return { id: row.id, direction: 'system', author_type: 'system', author_label: 'Processo Betel', message_type: 'event', text: `${metadata.process || 'Processo'} ${metadata.operation === 'insert' ? 'registrado' : 'atualizado'}.\n${metadata.before ? `Antes: ${state(metadata.before)}\n` : ''}Agora: ${state(metadata.after)}\nRegistro operacional da Betel.`, created_at: row.created_at, payload: { source: 'betel_process', sourceLabel: 'Processo Betel' } };
  }
  const confirmed = row.lead_id === viewingLeadId && metadata.actorConfirmed === true;
  const differentActor = Boolean(row.lead_id) && row.lead_id !== viewingLeadId;
  const action = row.source === 'betel_page_view' ? `Visitou a pagina ${metadata.path || '/'}` : `Abriu ${metadata.label || 'um link'}`;
  const attribution = confirmed ? 'Contato confirmado neste navegador.' : differentActor ? 'Link destinado a este lead, aberto por outro contato confirmado. Nao atribuir a acao a este destinatario.' : 'Autor nao identificado. Link associado ao destinatario; pode ter sido encaminhado.';
  const context = [metadata.opportunityCode ? `Imovel: ${metadata.opportunityCode}` : '', metadata.campaignId ? `Campanha: ${metadata.campaignId}` : '', metadata.partKind ? `Mensagem: ${metadata.partKind}` : '', metadata.origin ? `Origem: ${metadata.origin}` : '', row.file_url ? `Destino: ${row.file_url}` : ''].filter(Boolean).join('\n');
  const groupNote = String(row.file_url || '').includes('chat.whatsapp.com') ? '\nAbrir convite nao comprova ingresso no grupo.' : '';
  return { id: row.id, direction: 'system', author_type: 'system', author_label: 'Atividade Betel', message_type: 'event', text: `${action}. ${attribution}${groupNote}${context ? `\n${context}` : ''}`, created_at: row.created_at, payload: { source: 'betel_journey', sourceLabel: 'Historico Betel' } };
}

export function interactiveReplyFromPayload(value: unknown): { id: string; label: string; kind: string } | null {
  const queue: unknown[] = [value];
  for (let index = 0; index < queue.length && index < 120; index++) {
    const row = queue[index];
    if (!row || typeof row !== 'object') continue;
    for (const [key, child] of Object.entries(row)) {
      // Quoted messages and chat snapshots describe earlier events, never this reply.
      if (/quoted|contextinfo|lastmessage|history|^chat$|^chats$|metadata/i.test(key)) continue;
      if (['buttonsResponseMessage', 'templateButtonReplyMessage', 'listResponseMessage', 'interactiveResponseMessage'].includes(key) && child && typeof child === 'object') {
        const reply = child as Row;
        const single = reply.singleSelectReply as Row | undefined;
        const flow = reply.nativeFlowResponseMessage as Row | undefined;
        let params: Row = {};
        if (typeof flow?.paramsJson === 'string' && flow.paramsJson.length < 4096) {
          try { const parsed = JSON.parse(flow.paramsJson); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) params = parsed; } catch { /* Preserve message text if provider params are malformed. */ }
        }
        const body = reply.body as Row | undefined;
        return { id: String(reply.selectedButtonId || reply.selectedId || single?.selectedRowId || params.id || '').slice(0, 250), label: String(reply.selectedDisplayText || reply.title || params.display_text || body?.text || '').slice(0, 500), kind: key };
      }
      if (child && typeof child === 'object') queue.push(child);
    }
  }
  return null;
}
