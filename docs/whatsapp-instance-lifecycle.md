# Ciclo de vida das instâncias WhatsApp

O padrão enviado em novos pareamentos é `systemName: ConnectyHub`. Alterar esse padrão não muda o rótulo de uma sessão já pareada. A atualização não desconecta a sessão atual.

## Política diária

A configuração produtiva da ConnectyHub foi verificada em 14/09/2026: Cost Guard ativo às **00:30, America/Sao_Paulo**, com carência de trial de sete dias. O código `src/lib/whatsapp/uazapi-cost-guard.ts` da ConnectyHub não exige 24 horas de desconexão: considera o estado confirmado na execução diária. A Betel estava em `scale/active`, fora de trial.

A Betel aplica essa janela ao arquivamento **local**, usando a rotina Inngest existente `whatsapp-temp-media-cleanup`, executada a cada 30 minutos. Uma reserva transacional limita a limpeza a uma janela por dia. Instalação durante o dia não dispara limpeza retroativa. A execução seguinte ao horário configurado consulta o estado remoto antes de arquivar. A política fica em `BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY`; `trialHoldUntil` permite preservar uma carência comercial aplicável. Se o contrato comercial da Betel mudar para trial, esse limite deve acompanhar o término do trial mais a carência. A integração não lê o banco comercial privado da ConnectyHub em produção.

Instâncias conectadas, pareando, aguardando QR ou com consulta desconhecida são preservadas. Respostas de acesso, cobrança, limite ou timeout não comprovam exclusão. O sistema registra a desconexão observada, limpa essa contagem após reconexão/estado desconhecido e não usa idade histórica para decidir a limpeza diária.

Ausência confirmada por `404/410` com código estruturado de instância ou resposta explícita `archived/deleted` é sincronizada independentemente da janela. Um `404` genérico não basta. As consultas de status e a rotina periódica fazem essa reconciliação; nenhum `DELETE` remoto faz parte dela.

## Histórico e referências

O arquivamento mantém linhas, identificadores, conversas e mensagens. Remove a instância das opções operacionais e limpa apenas configurações cujo valor ainda corresponde à instância arquivada. Não seleciona outra instância automaticamente. Configurações de vínculo vazias não voltam a usar valores antigos do ambiente. Identificadores inválidos de registros de teste não são opções de remetente.

A função SQL serializa observações por instância, rejeita observações atrasadas e impede que webhooks tardios restaurem uma identidade arquivada. Novo vínculo explícito com outro identificador reinicia seu ciclo de vida. As funções de manutenção só permitem execução pela `service_role`.

## Validação

- `node scripts/whatsapp-lifecycle.test.cjs`: payload real de conexão, identidade, acesso/ausência, QR, sinais atuais do provedor e rejeição de vínculos arquivados.
- `npm run test:publication-regressions`: regressões existentes de conexão e publicação.
- `scripts/whatsapp-lifecycle-regression.sql`: executar depois da migração dentro de uma transação e terminar com `ROLLBACK`. Verifica limite diário, carência, concorrência temporal, permissões, referências, idempotência e webhook atrasado com registros fictícios.
- `npm run build`: compilação e verificação TypeScript.

A migração necessária é `20260914160000_whatsapp_instance_lifecycle.sql` e deve preceder o código que utiliza as funções RPC.
