# Retorno da aprovação de mercado

Diagnóstico em 14/09/2026, às 16h36 de Brasília: a aprovação da oportunidade `PORTALZUK-COM-BR-CA04632F80ECA054` já estava registrada. A primeira versão recente foi criada às 16h35min27s; duas outras às 16h36min03s e 16h36min12s. O estado era `approved_with_notes`, com versão aprovada vinculada. A auditoria confirmou avanço da revisão de mercado e da comunicação. Não houve aprovação executada durante esta investigação.

O servidor redirecionava para `market=divulgacao`, `concluido` e outros resultados de aprovação, mas a tela só tinha avisos de erro e de WhatsApp. Portanto, a aprovação bem-sucedida não exibia confirmação. Os botões de revisão também não indicavam processamento nem eram desativados enquanto a verificação dos anúncios estava em andamento.

A correção apresenta todos os resultados de sucesso do fluxo, mostra o andamento com `useFormStatus`, bloqueia cliques repetidos durante o processamento e mantém um aviso de aprovação junto aos botões quando há versão aprovada e três referências vinculadas. Não altera validação, decisão, riscos, permissões, gravação da aprovação ou envio de WhatsApp.

Regressão offline compara os resultados reais de `workflowApprovalParam` com os avisos da tela e renderiza os estados pendente/inativo dos botões. A investigação não enviou WhatsApp nem gerou áudio. A aba do usuário posteriormente mostrou `whatsapp-teste-enviado`; esse envio não foi acionado pela investigação.

Para conferir: atualizar a página do imóvel; observar a confirmação de análise aprovada e as três referências vinculadas. Não é necessário repetir a aprovação já registrada. Em uma futura revisão, clicar uma vez e aguardar a confirmação. O teste continua sendo uma ação separada, com seleção de Teste e conferência do número.

## Coerência do criativo e destinos

A campanha de teste recebida manteve a estimativa estruturada de R$ 1.533/mês, mas também incluiu `analysis.summary` da pesquisa original (14 anúncios Zapimóveis, média R$ 1.874). Esse texto antigo estava dentro do próprio snapshot aprovado: não houve leitura de outra versão, mas havia duas amostras sem distinção. O resumo do criativo agora usa o valor de mercado estruturado e os três anúncios vinculados à versão aprovada, cuja faixa é R$ 1.450 a R$ 1.650/mês. Snapshots e mensagens enviados permanecem imutáveis. A regressão cobre o resumo antigo e exclui comparáveis que não integram as referências aprovadas.

Por leitura do banco da ConnectyHub, sem abrir redirecionadores: o link `6c240424-838e-4858-858b-bfe9fdbe1188` é Aluguel 1 (Ibagy 134353); `d092efae-55d7-4ffa-aeff-aefc1888dd64` é Aluguel 2 (Ibagy 134151); `8506f63a-333f-4f1e-bd0e-241984f3f89d` é Aluguel 3 (Imobiliária Biguaçu 5424). Os destinos coincidem com as referências do snapshot e da campanha. O link de leilão na campanha é o PortalZuk `37082-231208`, com parâmetros UTM. O domínio apresentado pelos redirecionadores será tratado separadamente por contrato de origem autorizada entre Betel e ConnectyHub.
