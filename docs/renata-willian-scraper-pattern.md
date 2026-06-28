# Padrao Willian para Captacao da Renata

Fonte analisada: `C:\Users\conne\Downloads\Controle GERAL.xlsx`.

Data de referencia desta leitura: 2026-06-21.

## O que a planilha mostra

- A planilha e um funil operacional, nao apenas uma lista de bons imoveis.
- Primeiro entram links de imoveis de leilao com data proxima.
- Depois a equipe preenche avaliacao, AVM, status juridico, comercial, forma de pagamento, observacoes e participacao.
- Foram encontrados 2.949 registros com URL e 2.227 com data de leilao.
- Na analise exploratoria, a janela de 30 dias tinha 140 registros com data.
- O prazo manual entre solicitacao e leilao teve mediana de 13 dias quando as duas datas existiam.

## Regra validada com Willian

- Cobertura: Brasil todo.
- Tipos: terrenos, galpoes, apartamentos, casas e qualquer outro bem imobiliario.
- Prazo ideal: leiloes que acontecem hoje ou nos proximos 15 dias.
- Motivo do prazo: acima de 15 dias aumenta a chance de o imovel sair do leilao.
- Prazo minimo: pode ser no mesmo dia, mesmo que seja uma operacao mais corrida.

## Criterio da Renata

Renata deve reproduzir a primeira etapa do Willian:

1. Buscar imoveis de leilao no Brasil todo.
2. Nao limitar por cidade, UF ou cliente.
3. Capturar somente bens imobiliarios.
4. Capturar somente itens com data de leilao clara.
5. Aceitar somente leiloes entre hoje e os proximos 15 dias.
6. Rejeitar veiculos, maquinas, sucatas, equipamentos e outros bens nao imobiliarios.
7. Cadastrar o item em `Entrada` e `Fila IA`, sem decidir juridico/comercial nessa etapa.

## Campos observados na planilha

- Link do leilao
- Tipo
- Cidade
- Cliente
- Status juridico
- Data do leilao
- Pre-analise
- Forma de pagamento
- AVM
- Observacoes

## Tipos recorrentes

- Apartamento
- Casa
- Terreno/area
- Comercial/industrial
- Rural

## Fontes recorrentes

- Central Sul Leiloes
- Portal Zuk
- Superbid
- Pestana Leiloes
- FB Leiloes
- Mazzolli Leiloes
- Daniel Garcia Leiloes
- Mega Leiloes
- Caixa Venda Imoveis
- Krobel Leiloes
- Top Leiloes
- E-Leiloes
- Leilao VIP
- Rocha Leiloes
- Fidalgo Leiloes
- OA Leiloes
- Leiloeiro Publico
- Lance no Leilao
- Agencia Leilao
- Saraiva Leiloes
- Gestor de Leiloes
- Biasi Leiloes
- Moacira Leiloes

## O que fica para curadoria depois da Renata

A planilha mostra que Willian/Fabi reprovam ou restringem depois por motivos como:

- leilao cancelado, suspenso ou sustado;
- divida condominial/IPTU relevante;
- responsabilidade do arrematante por dividas;
- acoes possessoriais, execucoes fiscais ou disputa judicial;
- apenas direitos aquisitivos, e nao propriedade plena;
- imovel sem matricula clara;
- objeto do leilao nao inclui o terreno;
- necessidade de habilitacao, financiamento ou forma de pagamento inadequada.

Esses pontos nao devem impedir a Renata de capturar o imovel. Eles devem alimentar Helena, Igor e a revisao humana.
