# Grupos por conexão atual e identificação do agente

O modal de publicação exibiu seis grupos históricos para uma instância nova que retornava `HTTP 200` com `groups: []`. A captura ocorreu no domínio de produção, não no ambiente local. A consulta de pertencimento à organização confirmou a instância e a credencial no cliente Betel correto.

Os seis registros estavam vinculados a duas instâncias anteriores, arquivada e excluída, com sincronizações de agosto. Todas compartilhavam a chave do agente `multichannel-dispatch`. O catálogo era consultado apenas por agente; a sincronização atualizava os grupos recebidos e depois devolvia todo o catálogo persistido. Uma lista vazia, portanto, mantinha os destinos antigos. A listagem do provedor ainda tentava recuperar chats após uma resposta vazia válida. O frontend abortava consultas ao trocar agente, mas não incluía instância e telefone na identidade e usava o catálogo inicial como alternativa.

## Comportamento corrigido

- O modal começa sem destinos persistidos e consulta a conexão identificada por agente, instância e telefone. Limpa seleção e catálogo durante troca/atualização. Respostas tardias ou com outra identidade são descartadas.
- A consulta ao provedor aceita uma lista vazia como resultado final. Erros e respostas inválidas continuam como erro; não há recuperação a partir do histórico de chats.
- A resolução de instância exige o agente pedido, exclui registros arquivados/excluídos e nunca recorre a uma instância global de outro agente. A identidade é conferida antes e depois da consulta.
- O catálogo retornado exige agente, instância e pertencimento à lista atual de JIDs. A sincronização vazia devolve zero destinos sem apagar registros históricos.
- A publicação valida novamente que o destino pertence à instância e à lista atual, inclusive grupos usados como origem de listas. Um ID explícito inválido não é substituído silenciosamente por um grupo padrão.
- O modo sem participantes não persiste participantes, mesmo que o provedor os inclua inesperadamente na resposta.

## Limite preservado do esquema atual

A tabela ainda possui unicidade por `(provider, jid)`. Se um grupo realmente existir na conexão nova e já estiver cadastrado em outra instância, a correção bloqueia a sincronização com mensagem explícita, preservando proprietário, histórico e participantes. Não transfere o cadastro silenciosamente. O suporte ao mesmo grupo em múltiplas instâncias exige uma mudança separada no modelo de dados e nos consumidores. Nenhuma migration ou alteração de registros foi executada nesta correção.

## Validação

`npm run build`, TypeScript, ESLint e `git diff --check` passaram. Também passaram as regressões de layout, decisões, mensagem, publicação e rastreamento nativo.

`scripts/whatsapp-group-isolation.test.cjs` executa o código real com banco e transporte simulados. Cobre vazio válido com catálogo antigo, grupos de outro agente/instância, troca de telefone durante consulta, instância ausente, identidade inicial incompatível, colisão de JID sem transferência de histórico, falha do provedor, ausência de fallback a chats, resposta tardia ignorando abort e resposta de identidade errada com uma única repetição.

Na prévia isolada, o primeiro remetente apresentou seus grupos simulados. A troca para o segundo apagou imediatamente a lista e terminou em “Nenhum grupo encontrado”, após exatamente duas consultas simuladas e zero chamadas operacionais. A prévia e seus mocks ficam fora deste pacote.

## Identificação humana do remetente

O seletor usa o rótulo “Agente que vai enviar”. Cada opção apresenta o nome cadastrado em `ai_agents.name`, ligado à conexão atual, e o telefone dessa conexão formatado. Não usa o nome técnico da instância ou a chave do agente como texto alternativo. Dados ausentes aparecem como “Agente sem nome” ou “Telefone indisponível”; nenhum dígito é inventado. Identificadores e telefone bruto usados no isolamento permanecem intactos. O mesmo rótulo humano aparece na prévia da mensagem.

Conferidos desktop e celular de 390 px, inclusive seleção da segunda opção sem grupos. Formatação de números brasileiros com oito e nove dígitos, ausência de dados e rejeição de nomes técnicos/UUID foram verificadas offline.

Publicação do pacote completo autorizada em 15/09/2026 após os testes. Diagnóstico e validação em produção usam somente leituras; não houve envio WhatsApp, aprovação/reprovação, mudança de conexão/credencial, exclusão de registros ou consulta de participantes. Evidências operacionais ficam no diretório local `docs/layout-qa`, fora do pacote publicado.
