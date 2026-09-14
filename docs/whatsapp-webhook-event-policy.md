# Eventos de chat não são mensagens recebidas

Em 14/09/2026, o webhook da Betel convertia eventos `chats` da ConnectyHub em mensagens inbound. Esses eventos contêm um resumo (`chat.wa_lastMessageType`), sem mensagem nem ID de mensagem. Depois de um áudio enviado pela agente, a atualização do chat indicava `AudioMessage`; a Betel criava o texto artificial “Audio recebido sem transcricao.” e respondia com outro áudio. O novo envio gerava outra atualização de chat e realimentava o atendimento.

A ConnectyHub entregava corretamente `event=chats` e `ingest.messageId=null`. O defeito confirmado estava na ingestão Betel, anterior ao modelo de linguagem.

## Contrato de entrada

- Somente eventos `messages`/`message`, com objeto de mensagem, ID estável e direção inbound comprovada, entram no processamento de atendimento.
- `chats`, presença, contatos e histórico permanecem como eventos de auditoria. Não criam mensagens/lead, não acionam STT e não alimentam o modelo.
- Eventos de conexão e ACK continuam no reconciliador específico de publicação.
- `fromMe`, origem API e remetente próprio identificam saída. Eventos sem direção confiável são preservados na auditoria sem resposta automática.
- Campos de resumo do chat e mensagens citadas não definem o tipo, conteúdo, mídia ou autoria da mensagem atual.
- IDs de saída no formato `owner:messageId` são comparados com o ID curto do webhook, dentro da mesma instância e direção outbound.

Há uma segunda barreira no runtime, independente da persistência no CRM. A pausa do agente é conferida novamente antes da entrega. Mensagens marcadas `payload.runtime_excluded=true`, eventos técnicos e entradas cuja origem não é uma mensagem inbound válida são excluídos do contexto do atendimento e dos follow-ups.

## Recuperação de um incidente

Preservar sessão, eventos originais e histórico. Uma pausa temporária do agente permite interromper o ciclo sem desconectar o WhatsApp. Para uma conversa confirmadamente afetada, manter backup, reclassificar entradas artificiais como registros de sistema e conservar seus campos originais em `payload.incident_original_message`. Marcar essas entradas e as respostas derivadas do mesmo `webhook_event_id` com `runtime_excluded=true`. Não mudar a autoria das respostas efetivamente enviadas. Corrigir somente a memória derivada dos eventos comprovadamente inválidos, preservando dados comerciais legítimos. Restaurar a pausa apenas após publicação e validação, sem reproduzir os eventos em produção.

Teste: `node scripts/whatsapp-webhook-policy.test.cjs`. A reprodução usa eventos sanitizados, banco simulado e rede bloqueada, incluindo o caminho de persistência de auditoria, barreira do runtime, ACKs, mídia real, citações, redelivery e IDs de eco.
