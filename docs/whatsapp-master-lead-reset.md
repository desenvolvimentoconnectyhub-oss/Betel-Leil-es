# Resetar lead no atendimento WhatsApp

O botão fica no cabeçalho da conversa em `/admin/whatsapp`. Apenas o MASTER da Betel pode usá-lo: no modelo atual, esse usuário tem `admin_users.role = owner`, status ativo e vínculo com a organização interna da Betel. O painel chama esse nível de **Super admin**. Administrador, gestor, analista e visualizador não podem executar a API nem conceder a si mesmos esse nível. A API e a função SQL conferem a autorização; esconder o botão é apenas parte da interface.

## Efeito para o operador

O modal identifica o lead selecionado e exige **Excluir tudo e resetar**. Remove o cadastro WhatsApp, todas as suas conversas ativas/arquivadas nas instâncias da Betel, mensagens, perfil, qualificação, memória, identidades, arquivos próprios, avaliações, interações e agendamentos/filas vinculados. O reset não pode ser desfeito pelo painel. O próximo contato novo cria outro cadastro, sem recuperar o histórico excluído.

Sessões WhatsApp, configurações, ativos compartilhados, catálogo, oportunidades, investidores/contratos independentes e totais numéricos de execução são preservados. Não há envio de mensagem, cobrança, estorno ou cancelamento em provedor externo; conversas nos aparelhos não são apagadas. O modelo WhatsApp da Betel não possui os carrinhos/pedidos da ConnectyHub: não se inventa equivalência com contratos independentes. Fica uma auditoria mínima de autor, conta, alvo, data e contagens, além de identificadores resumidos para impedir reenvios antigos. Essa auditoria não contém uma cópia da conversa.

Se houver atendimento em processamento, o servidor retorna conflito e orienta aguardar. Se um arquivo não puder ser removido, o modal indica pendência e permite nova tentativa; a rotina já existente de limpeza também retoma o manifesto. Chaves de objetos vêm do banco, nunca da requisição do navegador. Arquivos compartilhados com outro lead permanecem.

## Consistência e isolamento

O banco da Betel tem um único cadastro WhatsApp por telefone, sem `organization_id` no lead. A migração vincula a permissão à única organização interna ativa, validada na instalação, e rejeita instalação ambígua. A seleção exige correspondência entre lead, conversa e instância real. O alcance é o lead inteiro nessa conta, incluindo outras conversas/instâncias, como no contrato atual da ConnectyHub (`docs/auditoria-reset-lead-2026-09-13.md` e migrações 0134/0135 desse projeto).

Intake, reconciliação de histórico, resposta manual, follow-up, agenda e entrega de outbox usam reservas de execução por contato. Aquisição e reset compartilham um lock transacional; reset não atravessa uma reserva ativa. A reserva é liberada também em erros, e o transporte confere sua validade antes de enviar. A validade máxima é uma hora, acima da duração dos handlers hospedados. IDs antigos de lead deixam de ser válidos após a exclusão.

A barreira de reset bloqueia mensagens com timestamp ausente/anterior, IDs já conhecidos, histórico e eco outbound antes do novo contato. Apenas um novo inbound identificado pode reabrir o contato. Depois disso, o histórico anterior continua bloqueado. A correção que separa `chats` de mensagens reais permanece ativa.

## Validação

- `node scripts/whatsapp-lead-reset-api.test.cjs`: acesso anônimo/roles/conta, confirmação, estados de erro e pendência, reservas e concessão do nível máximo.
- `node scripts/whatsapp-lead-reset-sql.test.cjs`: PostgreSQL isolado com PGlite; exclusão, isolamento, memória/filas, conta, permissões RPC, idempotência, concorrência, replay, histórico e eco.
- `scripts/whatsapp-lead-reset-regression.sql`: regressões com registros fictícios no esquema real, obrigatoriamente dentro de transação com rollback.
- Build Next.js/TypeScript e regressões do webhook, publicação e ciclo das instâncias.

Nenhum reset em lead real ou mensagem a usuário é necessário para esses testes. A confirmação de um reset real pertence ao MASTER pelo painel.
