# Análise imobiliária: layout e formulário

A página usa a largura disponível para a análise. A galeria e o resumo financeiro/decisório compartilham apenas a região inicial; referências, riscos e detalhes seguem em largura total. O painel de envio abre como diálogo e não reserva uma coluna ao longo de toda a página.

O status da revisão humana e a recomendação da análise continuam separados. Valores, fotos, referências e decisões vêm dos registros existentes. Nenhuma informação da imagem de referência visual é usada como dado do imóvel.

## Navegação e formulário

- As oito abas permanecem montadas. Alternar abas, fotos e filtros não desmonta a revisão.
- Existe um único conjunto de campos de revisão, inclusive quando ela está recolhida. O diálogo nativo fica dentro do mesmo formulário, preservando a associação dos botões e campos à Server Action existente.
- Remetente, modo, destino e formato permanecem no estado do painel ao fechar e reabrir.
- A sincronização automática existente só pode iniciar com o painel de envio aberto. Abrir a página para analisar não dispara essa sincronização.
- Rascunhos alterados ficam protegidos de resets automáticos até o retorno de uma versão salva. Sair da página com alterações exige confirmação de descarte; números de contatos não são persistidos em armazenamento local para essa finalidade.
- Aprovação, salvamento, envio e suas validações continuam nas actions existentes. Preparar envio apenas abre o painel.

## Localização das informações

| Área | Conteúdo |
| --- | --- |
| Visão geral | Galeria, valores, decisão, fatores favoráveis, riscos, três aluguéis e três vendas selecionados |
| Expansíveis da Visão geral | Teto/custos/margem, ficha secundária, memória de cálculo, metodologia, pendências, fundamentos completos |
| Financeiro | Cenários, pagamento, custos e rentabilidade |
| Mercado | Todos os comparáveis, filtros, ordenação, fontes e ajustes |
| Jurídico | Parecer, riscos, ocupação, débitos e fontes |
| Imóvel | Todas as imagens, ficha completa, descrição e cobertura do cadastro |
| Documentos | Documentos, fontes, status e ações existentes |
| Revisão | Campos editáveis e dossiê de qualificação com evidências e feedback |
| Histórico | Eventos, progresso e auditoria técnica |

## Validação

`node scripts/opportunity-layout-contract.test.cjs` verifica sem rede o conjunto único de campos, montagem das oito abas, preservação de notas zero, propriedade do formulário no diálogo, distinção revisão/recomendação e ausência de envio quando não há análise.

A validação visual foi feita em uma cópia local isolada, usando snapshot real já capturado e leitura do dossiê, com APIs e actions bloqueadas/substituídas. Cobriu as oito abas em 1366×768, 1440×900 e 390×844, sidebar expandida, menu mobile, dossiê completo, textos extensos, sem foto/análise, teclado, foco, rascunho, destino e formato. Nenhum envio, aprovação, sincronização operacional ou chamada paga foi executado.

Antes da correção, a página exigia 1737 px numa viewport de 1366 px e 919 px numa viewport de 390 px. Depois, todas as 24 combinações de abas/telas medidas apresentaram `scrollWidth` igual à largura útil do documento. As tabelas podem rolar internamente, com região identificada e foco por teclado. O body não oculta overflow para mascarar o problema.
