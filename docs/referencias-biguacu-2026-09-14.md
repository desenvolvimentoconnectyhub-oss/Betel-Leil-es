# Referências de aluguel e revisão de Biguaçu

A importação concatenava vendas e aluguéis e salvava apenas as primeiras 12 linhas. Neste caso, Gecko retornou 14 vendas e 14 aluguéis, mas a tabela recebeu 12 vendas e nenhum aluguel. A prévia contava candidatos de venda como referências válidas, mesmo sem uma versão aprovada. O verificador também removia a barra final ao seguir redirecionamentos, causando falsos bloqueios.

A correção preserva os comparáveis, recupera evidências retidas no payload e mantém decisões manuais. A seleção exige três anúncios de aluguel pertinentes e prioriza condomínio, rua e bairro. A aprovação verifica acesso, tenta outros candidatos já coletados e, quando necessário, complementa com busca pública gratuita limitada. Novas evidências exigem nova revisão humana. A prévia distingue candidatos de referências vinculadas à versão aprovada; o teste de rascunho explica a aprovação pendente. A ocupação não aceita mais textos de navegação do portal.

## Evidência do caso

Em 14/09/2026, três anúncios públicos do Ilhas do Atlântico foram conferidos: Ibagy 134353, R$ 1.650 por 52,73 m²; Ibagy 134151, R$ 1.500 por 52,77 m²; Imobiliária Biguaçu 5424, R$ 1.450 por 52,77 m², com desconto de pontualidade. Condomínio, IPTU e seguro estão separados nas notas. A estimativa preliminar é R$ 1.533/mês; anúncios não comprovam contratos ou renda garantida. Disponibilidade e identidade das unidades exigem conferência humana.

Foram recuperados 28 comparáveis originais e acrescentadas três referências de aluguel e três de venda: 34 registros. Vendas adicionais: anúncios 8919 e 9042 no mesmo condomínio, e 9621 no Portinari, mesmo bairro, com necessidade explícita de ajuste. A análise permanece `human_review`, sem versão aprovada. Ocupação confirmada: ocupado; bairro corrigido: Vendaval. A viabilidade líquida permanece inconclusiva por custos de aquisição, desocupação, obras e vacância ainda incompletos.

Gecko e Google Maps foram efetivamente usados na análise original. Apify e Bright Data eram alternativas condicionais e não foram executados: a contagem devolvida por Gecko impediu o fallback. Maps forneceu localização, não preços. O Bright Data tinha SERP configurado, mas não Web Unlocker. Não foram consultados extratos externos de faturamento. A recuperação técnica não executou consultas pagas nem enviou WhatsApp.

## Validação

Build Next.js e TypeScript concluídos, 85 páginas. Regressões offline de publicação e de recuperação/aluguel/ocupação/redirecionamento aprovadas. Conferência pública de três links de venda e três de aluguel concluída sem falhas; validação estrutural sem pendências, preservando revisão humana. Evidência sanitizada em `referencias-biguacu-2026-09-14-evidencias.json`.
