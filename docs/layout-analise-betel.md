# Análise imobiliária: layout e formulário

A página usa a largura disponível para a análise. No desktop, os oito indicadores aparecem em duas linhas de quatro ao lado da galeria. A recomendação ocupa um card compacto; a ficha completa segue numa faixa horizontal que quebra conforme o espaço. Os motivos favoráveis e impedimentos têm alturas independentes e preservam todas as descrições. A galeria enquadra a imagem sem deformar, com acesso explícito à foto inteira.

O status da revisão humana e a recomendação da análise continuam separados. Valores, fotos, referências e decisões vêm dos registros existentes. Nenhuma informação da imagem de referência visual é usada como dado do imóvel.

Revisão visual local de 15/09: o título principal foi reduzido em 50% a pedido do usuário (24→12 px no desktop; 20→10 px no mobile), mantendo o texto completo. O botão Reprovar perdeu as classes de fundo vermelho/texto branco que ativavam uma regra global mais específica com `!important`. A paleta local agora define texto, ícone, borda, hover, foco e desabilitado sem reduzir a opacidade. Contrastes texto/fundo medidos: 8,27:1 normal, 8,86:1 hover, 5,31:1 desabilitado. Ação e bloqueios preservados; conferência visual desktop/mobile, teste offline de layout e ESLint concluídos sem acionar decisões.

## Navegação e formulário

- As oito abas permanecem montadas. Alternar abas, fotos e filtros não desmonta a revisão.
- Existe um único conjunto de campos de revisão, inclusive quando ela está recolhida. O diálogo nativo fica dentro do mesmo formulário, preservando a associação dos botões e campos à Server Action existente.
- Remetente, modo, destino e formato permanecem no estado do painel ao fechar e reabrir.
- A sincronização automática existente só pode iniciar com o painel de envio aberto. Abrir a página para analisar não dispara essa sincronização.
- Rascunhos alterados ficam protegidos de resets automáticos até o retorno de uma versão salva. Sair da página com alterações exige confirmação de descarte; números de contatos não são persistidos em armazenamento local para essa finalidade.
- O rodapé mostra Aprovar sem enviar, Aprovar com ressalvas sem envio, Reprovar e Aprovar e enviar. Revisar dados leva ao editor, onde fica Salvar revisão. Editar cadastro está na aba Imóvel.
- Aprovar e enviar apenas abre um diálogo central de até 1120 px, com rolagem interna e os passos Destino, Mensagem e Confirmação. A aprovação e o pedido de envio ocorrem somente na confirmação final, pelas actions existentes. Fechar/Escape restaura o foco; durante processamento, fechamento e novos cliques ficam bloqueados.
- Ressalvas operacionais são obrigatórias para a decisão com ressalvas, com validação na interface e no servidor antes de gravar. Falha de envio depois da aprovação é identificada como tal. O modo Teste mantém a guarda existente de análise previamente aprovada e não avança o workflow.
- O botão Criar dossiê era inerte: não tinha handler, action nem link. Foi removido do rodapé; o dossiê e seu feedback permanecem na Revisão. Nenhuma geração nova ou cobrança foi implementada.

## Localização das informações

| Área | Conteúdo |
| --- | --- |
| Visão geral | Galeria, valores, decisão, fatores favoráveis, riscos, três aluguéis e três vendas selecionados |
| Expansíveis da Visão geral | Memória de cálculo, metodologia, pendências, fundamentos completos; os oito valores e toda a ficha ficam visíveis |
| Financeiro | Cenários, pagamento, custos e rentabilidade |
| Mercado | Todos os comparáveis, filtros, ordenação, fontes e ajustes |
| Jurídico | Parecer, riscos, ocupação, débitos e fontes |
| Imóvel | Todas as imagens, ficha completa, descrição e cobertura do cadastro |
| Documentos | Documentos, fontes, status e ações existentes |
| Revisão | Campos editáveis e dossiê de qualificação com evidências e feedback |
| Histórico | Eventos, progresso e auditoria técnica |

## Validação

### Prévia em celular

O modal agora reúne remetente, quatro destinos em uma linha, formato Botões/Links no texto e seletor de destino na coluna esquerda. A confirmação fica abaixo desses controles, com CTA de tamanho normal. A coluna direita mostra a conversa em uma moldura de celular com rolagem própria. Em telas pequenas as colunas se empilham; a troca de formato leva o conteúdo visível aos botões ou links correspondentes.

`opportunity-whatsapp-message.ts` contém o formatter puro extraído do envio, usado tanto pela publicação aprovada quanto pela prévia. `whatsapp-publication-parts.ts` compartilha a ordem e o conteúdo de cada parte com o dispatcher. A extração preserva as chaves, o texto e o hash do payload: comparação byte a byte com o formatter anterior passou nos 16 cenários de formato, imagem, leilão e código alternativo. Mensagens históricas não são reprocessadas.

A prévia acompanha os campos da revisão: mercado, área, aluguel, parecer, pagamento e comparáveis. Desconto, tetos e pagamento usam as mesmas funções de domínio do salvamento. No modo Teste, usa o snapshot aprovado carregado pela página; se indisponível, isso é informado fora da conversa. A validação de referências pode substituir anúncios antes da aprovação final. URLs definitivas de rastreamento Betel só são materializadas pelo transporte; a prévia mostra os endereços de origem e não cria registros nem cliques. A aparência é aproximada, com aviso visível.

A lista de grupos é consultada em cada abertura e troca de remetente, usando o endpoint existente com `noParticipants: true`, sem entrada em grupos ou envio. O endpoint atualiza o catálogo local, preservando o fluxo operacional existente. Respostas antigas são canceladas/ignoradas; há no máximo uma tentativa adicional. Erro de consulta é distinto de uma resposta vazia. Não há botão de atualização manual nem refresh da página após carregar destinos.

QA local: 1366×768, 1440×900, 1920×900 e 390×844, sem overflow horizontal; alvos de destino de 44 px no desktop; CTA com aproximadamente 241 px. Testados abertura, reabertura, troca de remetente, cancelamento de resposta antiga, erro, vazio, recuperação limitada, edição de mercado refletida na legenda/desconto/tetos, foco preso no diálogo, Escape e duplo clique na confirmação. Duplo clique gerou uma única verificação **simulada** de conexão e nenhuma submissão. Trocar formato ou clicar nos botões da prévia gerou zero chamadas operacionais. Build passou com 85 páginas; testes de publicação, decisões, layout e rastreamento passaram offline. Evidências em `docs/layout-qa/celular-qa.json` e `celular-*.png`.

URL de revisão: `http://127.0.0.1:3014/layout-preview?dossier=1&photo=1`. O ambiente isolado mantém APIs e ações bloqueadas/substituídas e não integra o pacote de produção. A publicação dos ajustes foi autorizada pelo usuário em 15/09/2026, mantendo o título exatamente como validado. A validação não executou aprovação real, envio, sincronização real ou chamada paga.

`node scripts/opportunity-layout-contract.test.cjs` verifica sem rede o conjunto único de campos, montagem das oito abas, preservação de notas zero, propriedade do formulário no diálogo, distinção revisão/recomendação e ausência de envio quando não há análise.

`node scripts/opportunity-decision-contract.test.cjs` exercita as actions com todas as operações substituídas: ressalvas obrigatórias antes de gravar, decisões sem envio, aprovação e envio numa ação, mensagem de falha após aprovação e guarda do modo Teste.

O refinamento também foi medido em 1920×900. A deduplicação de campanhas existente por conteúdo/remetente/destino foi preservada; isso não elimina o comportamento anterior de registrar uma nova versão ao salvar novamente uma análise aprovada. Não houve alteração na copy enviada, nos cálculos, nos recibos ou em mensagens históricas.

A validação visual foi feita em uma cópia local isolada, usando snapshot real já capturado e leitura do dossiê, com APIs e actions bloqueadas/substituídas. Cobriu as oito abas em 1366×768, 1440×900 e 390×844, sidebar expandida, menu mobile, dossiê completo, textos extensos, sem foto/análise, teclado, foco, rascunho, destino e formato. Nenhum envio, aprovação, sincronização operacional ou chamada paga foi executado.

Antes da correção, a página exigia 1737 px numa viewport de 1366 px e 919 px numa viewport de 390 px. Depois, todas as 24 combinações de abas/telas medidas apresentaram `scrollWidth` igual à largura útil do documento. As tabelas podem rolar internamente, com região identificada e foco por teclado. O body não oculta overflow para mascarar o problema.
