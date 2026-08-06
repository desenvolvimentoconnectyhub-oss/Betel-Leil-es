# Plano - Bloco de Analise de Mercado de Imoveis

## Objetivo

Criar no admin da Betel um bloco para transformar a analise manual de mercado dos imoveis em um fluxo estruturado, auditavel e reaproveitavel no pipeline de oportunidades.

O MVP precisa ajudar a equipe a responder rapidamente:

- O lance esta realmente abaixo do mercado?
- Qual e o valor de mercado conservador, provavel e otimista?
- Quais comparaveis sustentam essa conclusao?
- A planilha/link enviado pela equipe virou uma fila de captura e analise, sem retrabalho manual?
- A liquidez da regiao compensa o risco e o prazo?
- Qual e o aluguel estimado e a renda mensal potencial quando o imovel for apto para locacao?
- A forma de pagamento exige a vista ou permite parcelamento com entrada/saldo?
- Qual margem sobra depois de custos, reforma, impostos, desocupacao e reserva?
- O imovel pode avancar, precisa de revisao humana ou deve ser descartado?

## Encaixe no sistema atual

O sistema ja possui os pontos principais para acoplar o bloco:

- `auction_opportunities`: ficha principal do imovel.
- `opportunity_validation_runs` e `opportunity_validation_steps`: pipeline de validacao; ja existe a etapa `market`.
- `ai_analysis_runs`: registro de execucoes de IA com entrada, saida, prompt, modelo e confianca.
- `intelligence_reports`: relatorios estruturados; ja aceita `report_type = 'market'`.
- `source_snapshots`: origem bruta da captura.
- Providers planejados em `src/lib/sources/provider-adapters.ts`: `comparables`, `datazap`, `fipezap`, `big_data`, `ibge`.
- UI principal em `/admin/oportunidades` e `/admin/oportunidades/[id]`.

Recomendacao para o MVP de hoje: criar a analise como uma aba/bloco dentro da ficha do imovel, em vez de comecar por uma area separada. Depois, se a fila crescer, criar `/admin/analise-mercado` como mesa operacional.

## Novo Entendimento - Entrada Por Planilha

Arquivo analisado: `C:/Users/conne/Downloads/Teste avaliacao de mercado.xlsx`.

A planilha enviada representa o processo real de entrada: a equipe encontra manualmente os imoveis em leilao e sobe uma lista para o sistema processar.

Formato identificado:

- Aba: `Pagina1`.
- Linha 1: titulo do lote (`Imoveis para teste`).
- Linhas 2 a 19: 18 imoveis para processamento.
- Coluna A: codigo interno do imovel ou da oportunidade.
- Coluna B: link do imovel em leilao.
- Coluna C: cidade informada manualmente.
- Coluna D: data do leilao ou data de referencia.

Conclusao tecnica:

- A planilha nao deve ser tratada como analise pronta.
- Ela deve virar uma fila de trabalho automatizada.
- Cada linha cria ou atualiza uma oportunidade e prepara um job de scraper.
- O scraper busca dados, imagens, edital/anexos e textos relevantes no site do leiloeiro.
- Depois da captura, o motor calcula margem/tetos e o Gemini ajuda na extracao, comparacao e parecer.
- O usuario humano revisa e aprova antes de publicar o resultado final.

Mudanca de estrategia do scraper:

- Antes o scraper podia buscar imoveis sozinho nas fontes.
- Agora o fluxo principal deve partir de links prontos enviados pela equipe.
- O time escolhe os imoveis fora do sistema, sobe a planilha/lista de links e aciona o processamento.
- O upload sozinho nao deve iniciar captura automaticamente; ele prepara o lote.
- O scraper comeca quando o usuario clicar em "Iniciar processo".
- Ao terminar, o sistema envia aviso por WhatsApp para o setor responsavel.
- Na tela do processo, o usuario escolhe qual agente/instancia de WhatsApp sera usado para enviar o aviso.
- O sistema deve permitir cadastrar o numero ou grupo de WhatsApp do setor que recebera a notificacao.

## Corte Da Fase Antiga Do Scraper

Sim: para iniciar a nova fase corretamente, precisamos limpar a base gerada pelo scraper antigo e mudar totalmente a funcao do modulo.

Mas a limpeza nao deve ser um `delete` direto sem criterio. O plano seguro e:

1. Congelar a fase antiga.
2. Inventariar tudo que foi gerado pelo scraper automatico.
3. Separar o que e legado do que foi cadastrado manualmente.
4. Fazer backup/exportacao.
5. Arquivar ou deletar apenas os registros confirmados como gerados pelo fluxo antigo.
6. Subir o novo scraper orientado por links enviados pelo usuario.

### Como Identificar Imoveis Da Fase Antiga

O fluxo antigo grava oportunidades com sinais claros no payload:

- `raw_payload.collectionMode = "scraper_target"`
- `raw_payload.targetCode`
- `raw_payload.targetName`
- `raw_payload.targetUrl`
- `raw_payload.scrapeStrategy`
- `owner = "Renata - Buscadora de Imoveis"`
- `summary` contendo captura automatica
- `evidenceNotes` contendo captura automatica do scraper

Esses campos devem ser usados para montar a lista de limpeza. O sistema nao deve apagar imoveis manuais, oportunidades importadas pela nova planilha ou registros que ja tenham contrato, investidor, dossie ou validacao humana aprovada.

### O Que Tirar Ou Desativar

Partes da fase antiga que precisam sair do fluxo principal:

- Busca ativa por fontes cadastradas em `scraper_targets`.
- Catalogo fixo de fontes recomendadas em `src/lib/scraper/source-catalog.ts`.
- Botao/acao de "semear fontes recomendadas".
- Cron automatico `scraper-cron` que roda sozinho em agenda.
- Fluxo `runScraperCron`, que percorre todos os alvos habilitados.
- Fluxo `runScraperForTarget`, que parte de um `targetCode`.
- UI antiga de `/admin/scraper` focada em alvo, fonte, prioridade, max pages e agenda.
- Seeds antigas de fontes como bancos, agregadores e leiloeiros para busca ampla.
- Estrategias de varredura por paginas/listagens com `maxPages`.
- Ingestao de candidatos vindos de listagem ampla.
- Indicadores "fontes ativas" e "Renata monitorando" como metrica principal.

Partes que podem ser mantidas e reaproveitadas:

- Captura de HTML e texto.
- Captura e espelhamento de imagens para storage.
- Limpeza de HTML para IA.
- Extracao Gemini em JSON.
- Guardrails de qualidade para identificar se o bem e realmente imovel.
- `source_snapshots`, agora como snapshot de link enviado pelo usuario.
- Relatorio/aviso WhatsApp, adaptado para lote importado.
- Botao de backfill de imagens, se adaptado para oportunidades da nova fase.

### Mapa Do Codigo Atual A Alterar

Pontos encontrados no sistema atual:

- `src/lib/scraper/source-catalog.ts`: catalogo fixo de fontes recomendadas. Deve sair do fluxo principal.
- `src/lib/scraper/scraper-agent.ts`: hoje contem `runScraperForTarget`, `runScraperCron` e ingestao de candidatos vindos de fontes. Deve virar processamento por link importado.
- `src/lib/scraper/scraper-repository.ts`: hoje gerencia `scraper_targets` e `scraper_runs`. Deve ser substituido/adaptado para batches, rows e link jobs.
- `src/lib/scraper/scraper-strategies.ts`: hoje executa estrategias de varredura por alvo/fonte. Deve manter apenas utilitarios para capturar pagina de detalhe, imagens e anexos.
- `src/lib/scraper/types.ts`: tipos ainda sao orientados a `ScraperTarget`. Devem ganhar tipos de lote, linha importada e job por URL.
- `src/inngest/functions/scraper-cron.ts`: cron automatico de busca. Deve ser desativado ou trocado por worker de fila disparado pelo botao "Iniciar processo".
- `src/app/api/admin/scraper/route.ts`: API antiga tem actions `create`, `toggle`, `update`, `delete`, `run`, `seed_recommended_sources`, `schedule_save`. Deve remover fluxo de alvos e expor actions de importacao, start, retry, status e aviso.
- `src/components/admin/ScraperDashboardPage.tsx`: UI antiga focada em fontes ativas, prioridades e agenda. Deve virar dashboard de lotes importados.
- `src/app/admin/scraper/page.tsx`: rota pode ser reaproveitada, mas o conteudo precisa mudar para nova fase.
- `supabase/migrations/20260618100100_scraper_targets.sql` e seeds posteriores: criam e populam fontes antigas. Nao devem ser repetidas na nova fase; criar migration nova para desativar/arquivar alvos existentes, sem editar historico ja aplicado.
- `src/lib/scraper/whatsapp-report.ts`: pode ser reaproveitado, mas o relatorio deve ser por lote importado, nao por rodada de fontes.

### O Que Colocar No Lugar

Novo fluxo principal:

- Upload de planilha/lista de links.
- Criacao de lote de importacao.
- Preview e validacao antes de iniciar.
- Status inicial `aguardando_inicio`.
- Botao "Iniciar processo".
- Processamento por link individual, nao por fonte ampla.
- Scraper de pagina de detalhe do leilao.
- Job por linha da planilha.
- Captura de imagens, edital, matricula e anexos.
- Extracao Gemini com JSON estruturado.
- Calculo Betel no codigo.
- Analise de mercado na ficha do imovel.
- Aviso WhatsApp ao setor quando o lote terminar.

### Plano De Limpeza Dos Dados Antigos

Etapas recomendadas:

1. Desativar o cron e qualquer execucao automatica.
2. Travar criacao de novos registros por `scraper_targets`.
3. Gerar relatorio com total de oportunidades antigas, snapshots, runs e imagens.
4. Exportar os registros antigos para backup auditavel.
5. Marcar oportunidades antigas como `legado_scraper` ou `arquivado` antes de deletar.
6. Revisar se alguma oportunidade antiga foi usada em contrato, matching, atendimento, relatorio ou validacao aprovada.
7. Deletar somente o que estiver confirmado como legado sem uso operacional.
8. Manter log de quem executou a limpeza, data/hora, filtros usados e totais removidos.

Filtro inicial sugerido para inventario:

```sql
raw_payload->>'collectionMode' = 'scraper_target'
or owner = 'Renata - Buscadora de Imoveis'
or raw_payload ? 'targetCode'
```

Essa limpeza deve ser feita por uma rotina administrativa com dry-run antes da execucao real.

Campos minimos aceitos no upload:

- `codigo`
- `auction_url`
- `city_hint`
- `auction_date_hint`

Campos opcionais recomendados para evoluir a planilha:

- `state_hint`
- `neighborhood_hint`
- `property_type_hint`
- `priority`
- `analyst_notes`
- `manual_market_reference_urls`

O sistema deve aceitar a planilha atual sem cabecalho, mas mostrar uma tela de pre-visualizacao/mapeamento antes de importar. Para os proximos lotes, o ideal e padronizar uma planilha com cabecalhos.

## Fluxo Operacional

1. Upload do lote de imoveis
   - Usuario sobe uma planilha `.xlsx`, `.csv` ou cola uma lista de links.
   - O sistema identifica colunas, valida URLs, cidade e data.
   - A tela mostra preview com erros, duplicados e linhas prontas para importar.
   - O upload deixa o lote em rascunho; ainda nao dispara o scraper.

2. Criacao da fila
   - Cada linha vira um registro de importacao e um job.
   - Se o codigo ou URL ja existir, o sistema atualiza a oportunidade em vez de duplicar.
   - Status inicial: `aguardando_inicio`.

3. Configuracao do processamento
   - Usuario escolhe o agente/instancia de WhatsApp que enviara o aviso.
   - Usuario escolhe ou cadastra o setor responsavel pelo recebimento.
   - O setor pode ter um numero individual ou grupo de WhatsApp.
   - O sistema valida se o agente de WhatsApp esta conectado e liberado para envio.
   - O botao "Iniciar processo" fica bloqueado se nao houver destinatario configurado ou agente disponivel.

4. Inicio manual do processo
   - Usuario clica em "Iniciar processo".
   - O lote muda para `processando`.
   - As linhas mudam de `aguardando_inicio` para `aguardando_scraper`.
   - O sistema registra quem iniciou, data/hora, agente escolhido e destinatario de aviso.

5. Scraper do imovel em leilao
   - O sistema abre o link do leilao e captura a pagina.
   - Extrai titulo, leiloeiro, lote, endereco, cidade/UF, area, lance, avaliacao, data, forma de pagamento, regras do edital e observacoes juridicas visiveis.
   - Baixa imagens do lote e salva em storage.
   - Baixa edital, matricula ou anexos quando o site disponibilizar.
   - Salva snapshot bruto para auditoria.

6. Extracao inteligente
   - Gemini recebe HTML limpo, texto extraido, imagens e anexos quando existirem.
   - A saida deve ser JSON estruturado, sem inventar dados ausentes.
   - O sistema separa fato capturado, inferencia da IA e calculo deterministico.

7. Normalizacao
   - Padronizar valores, area, preco por m2, bairro, tipo de imovel e estado de conservacao.
   - Marcar dados ausentes com status pendente, sem inventar informacao.

8. Coleta de mercado
   - Registrar comparaveis manuais ou via provider.
   - Separar comparaveis por qualidade: forte, medio, fraco, descartado.
   - Guardar fonte, URL, data de coleta, preco, area, preco/m2, distancia e observacoes.

9. Calculo
   - Calcular preco/m2 do edital, lance e comparaveis.
   - Estimar valor conservador, provavel e otimista.
   - Calcular desconto real sobre valor de mercado, nao apenas sobre avaliacao do edital.
   - Calcular aluguel estimado, yield mensal e yield anual quando houver referencia de locacao.
   - Simular pagamento quando o edital permitir parcelamento: entrada, saldo, quantidade de parcelas e valor mensal.
   - Destacar se parcelas possuem correcao, juros, indice ou regra especifica no edital.
   - Estimar custos: ITBI, registro, comissao, juridico, condominio/IPTU, reforma, desocupacao e reserva.
   - Gerar margem bruta, margem liquida estimada e teto racional.

10. Decisao assistida
   - Status: `pendente`, `em_analise`, `revisao_humana`, `aprovado_com_ressalvas`, `reprovado`.
   - Motivo da decisao sempre obrigatorio.
   - Humano valida antes de comunicar oportunidade completa ou usar teto de lance.

11. Saida
   - Atualiza bloco financeiro da oportunidade.
   - Alimenta etapa `market` do pipeline de validacao.
   - Gera `intelligence_reports` do tipo `market`.
   - Alimenta dossie, matching de investidores e estrategia de lance.

12. Aviso WhatsApp ao setor
   - Quando o lote termina, o sistema envia resumo para o WhatsApp configurado.
   - A mensagem informa total de links, quantos concluiram, quantos falharam, quantos ficaram em revisao e link para abrir o lote no admin.
   - Se houver falhas, a mensagem deve listar os dominios com erro para priorizar adaptadores.
   - O envio deve ser registrado em log para auditoria.

## Motor De Ingestao, Scraper, Analise E Aviso

O motor deve ser dividido em cinco partes. Essa divisao evita depender 100% da IA para calculo, facilita auditar o resultado e permite avisar o setor responsavel quando o lote terminar.

### 1. Importador

Responsavel por transformar Excel/CSV/lista de links em jobs.

Funcoes:

- Ler arquivo enviado.
- Detectar se existe cabecalho.
- Mapear colunas obrigatorias.
- Validar URL e data.
- Identificar dominio do leiloeiro.
- Marcar duplicados.
- Criar lote de importacao.
- Criar uma linha/job por imovel.
- Deixar o lote pronto para inicio manual, sem disparar scraper automaticamente.

Status por linha:

- `importado`
- `duplicado`
- `url_invalida`
- `aguardando_inicio`
- `aguardando_scraper`
- `scraping`
- `scraper_concluido`
- `extracao_concluida`
- `analise_mercado_pendente`
- `pronto_para_revisao`
- `falha`

### 2. Scraper

Responsavel por buscar o imovel no site do leiloeiro.

Estrategia recomendada:

- Comecar com um scraper generico para HTML estatico e metatags.
- Usar navegador headless quando o portal carregar dados por JavaScript.
- Criar adaptadores por dominio quando o generico nao for suficiente.
- Salvar HTML bruto, texto limpo, imagens e anexos.
- Usar rate limit, retry e cache para nao sobrecarregar portais.
- Registrar erro por dominio para saber quais leiloeiros precisam de adaptador dedicado.

Dominios presentes na planilha de teste:

- `fbleiloes.com.br`
- `mullerleiloes.com.br`
- `centralsuldeleiloes.com.br`
- `oesteleiloes.com.br`
- `portalzuk.com.br`
- `topleiloes.com.br`
- `pestanaleiloes.com.br`
- `machadoleiloeiro.com.br`
- `leiloariasmart.com.br`
- `hastapublica.com.br`
- `leilaovip.com.br`
- `satoleiloes.com.br`

Dados que o scraper deve tentar capturar:

- titulo do lote;
- tipo do imovel;
- leiloeiro e codigo/lote externo;
- endereco, bairro, cidade e UF;
- area privativa, terreno e area construida;
- lance atual/inicial;
- valor de avaliacao do edital;
- incremento minimo, comissao e taxas;
- data/hora do leilao;
- forma de pagamento;
- ocupacao, debitos, onus e ressalvas do edital;
- links de edital, matricula, fotos e anexos;
- imagens principais do imovel.

### 3. Extrator Gemini

Gemini deve ser usado como camada de inteligencia, nao como unica fonte da verdade.

Usos recomendados:

- Ler texto baguncado da pagina do leiloeiro.
- Interpretar imagem, PDF, edital e matricula quando enviados.
- Extrair campos em JSON estruturado.
- Sugerir tipo do imovel, padrao, estado aparente e pontos de atencao.
- Resumir riscos e gerar o texto final estilo WhatsApp.
- Classificar qualidade dos comparaveis encontrados ou informados.

Guardrail principal:

- Se o dado nao apareceu no HTML, PDF, imagem, fonte de mercado ou campo manual, Gemini deve retornar `null` e uma pendencia. Ele nao deve inventar valor de lance, area, aluguel, endereco ou juridico.

### 4. Calculadora E Regra Betel

Essa parte deve ficar no codigo, nao no prompt.

Calculos obrigatorios:

- desconto real sobre mercado;
- preco por m2 do lance;
- preco por m2 dos comparaveis;
- teto Betel 30%;
- teto Betel 40%;
- diferenca do lance contra cada teto;
- yield sobre mercado;
- yield sobre lance;
- simulacao de entrada/saldo/parcelas;
- margem estimada apos custos;
- classificacao preliminar.

Regra central:

`classificacao = margem pelo teto + qualidade dos comparaveis + juridico + renda + pagamento`

Exemplo:

- Lance abaixo do teto 40%, desconto forte, juridico limpo e comparaveis aderentes: tende a `excelente`.
- Lance abaixo do teto 30%, mas acima do teto 40%: tende a `moderada`.
- Lance acima do teto 30% ou com juridico novo relevante: tende a `revisao`.
- Comparaveis fracos ou dados incompletos reduzem confianca.

### 5. Notificador WhatsApp

Responsavel por avisar o setor quando o processamento terminar ou quando houver falha critica.

Requisitos:

- Permitir escolher qual agente/instancia de WhatsApp sera usado no envio.
- Permitir cadastrar destinatarios por setor: numero individual ou grupo.
- Validar se o numero esta em formato internacional ou JID WhatsApp quando aplicavel.
- Validar se o agente/instancia esta conectado antes de iniciar o processo.
- Enviar mensagem de conclusao com resumo do lote.
- Registrar tentativas de envio, resposta do provider e erro quando houver.
- Permitir reenvio manual do aviso pelo admin.

Mensagem minima de conclusao:

- nome do lote ou arquivo;
- total de links importados;
- total processado com sucesso;
- total com falha;
- total pendente de revisao humana;
- principais dominios com erro;
- link para abrir o lote no admin.

Integracao recomendada:

- Usar o WhatsApp/ConnectyHub ja previsto no projeto.
- Reaproveitar agentes/instancias existentes em `whatsapp_instances` quando disponiveis.
- Manter fallback por variaveis operacionais ja previstas, como `BETEL_SCRAPER_REPORT_WHATSAPP_NUMBER` e `BETEL_SCRAPER_REPORT_WHATSAPP_NUMBERS`, enquanto a tela de cadastro nao estiver pronta.

## Modelo de Dados Proposto

Criar uma migration para tabelas dedicadas, mantendo compatibilidade com `auction_opportunities`.

### `scraper_legacy_cleanup_runs`

- `id`
- `requested_by`
- `mode`
- `status`
- `filter_payload`
- `matched_opportunities_count`
- `matched_snapshots_count`
- `matched_runs_count`
- `archived_opportunities_count`
- `deleted_opportunities_count`
- `backup_storage_path`
- `started_at`
- `completed_at`
- `error_message`
- `created_at`

Uso:

- `mode = dry_run`: apenas calcula e mostra o que seria afetado.
- `mode = archive`: marca como legado/arquivado, sem apagar.
- `mode = delete`: remove registros confirmados apos revisao.

### `market_analysis_import_batches`

- `id`
- `uploaded_by`
- `original_filename`
- `source_type`
- `row_count`
- `valid_row_count`
- `invalid_row_count`
- `status`
- `started_by`
- `started_at`
- `completed_at`
- `whatsapp_agent_key`
- `whatsapp_instance_id`
- `notification_recipient_id`
- `notification_status`
- `raw_file_path`
- `mapping_payload`
- `created_at`
- `updated_at`

### `market_analysis_import_rows`

- `id`
- `batch_id`
- `row_number`
- `external_code`
- `auction_url`
- `city_hint`
- `state_hint`
- `auction_date_hint`
- `property_type_hint`
- `status`
- `opportunity_id`
- `scrape_run_id`
- `error_message`
- `raw_row_payload`
- `created_at`
- `updated_at`

### `auction_scrape_runs`

- `id`
- `opportunity_id`
- `import_row_id`
- `source_url`
- `source_domain`
- `adapter_key`
- `status`
- `started_at`
- `completed_at`
- `http_status`
- `raw_snapshot_id`
- `extracted_payload`
- `gemini_extraction_run_id`
- `error_message`
- `created_at`
- `updated_at`

### `auction_scrape_assets`

- `id`
- `scrape_run_id`
- `opportunity_id`
- `asset_type`
- `source_url`
- `storage_path`
- `content_hash`
- `caption`
- `sort_order`
- `raw_payload`
- `created_at`

### `scraper_notification_recipients`

- `id`
- `sector_name`
- `recipient_name`
- `recipient_type`
- `whatsapp_number`
- `whatsapp_jid`
- `is_group`
- `is_active`
- `notes`
- `created_at`
- `updated_at`

### `scraper_process_notifications`

- `id`
- `batch_id`
- `whatsapp_agent_key`
- `whatsapp_instance_id`
- `recipient_id`
- `recipient_number`
- `recipient_jid`
- `message_text`
- `status`
- `provider`
- `provider_message_id`
- `provider_response`
- `error_message`
- `sent_at`
- `created_at`

### `property_market_analyses`

- `id`
- `opportunity_id`
- `analysis_code`
- `status`
- `analyst_name`
- `subject_property_snapshot`
- `market_value_low`
- `market_value_base`
- `market_value_high`
- `market_price_per_m2`
- `initial_bid_price_per_m2`
- `real_discount_pct`
- `estimated_costs`
- `estimated_monthly_rent`
- `estimated_annual_rent_yield_pct`
- `payment_mode`
- `down_payment_pct`
- `down_payment_amount`
- `installment_balance`
- `installment_count`
- `installment_amount`
- `installment_correction_warning`
- `estimated_net_margin`
- `suggested_ceiling_bid`
- `liquidity_score`
- `confidence_score`
- `decision`
- `decision_reason`
- `raw_payload`
- `created_at`
- `updated_at`

### `property_market_comparables`

- `id`
- `analysis_id`
- `opportunity_id`
- `source_label`
- `source_url`
- `listing_type`
- `property_type`
- `address`
- `neighborhood`
- `city`
- `state`
- `area_m2`
- `asking_price`
- `sold_price`
- `price_per_m2`
- `distance_km`
- `similarity_score`
- `quality`
- `notes`
- `collected_at`
- `raw_payload`

## UI do MVP

Adicionar duas superficies no admin:

### Limpeza da fase antiga

Tela sugerida: `/admin/scraper/migracao`.

Componentes:

- Botao "Congelar scraper antigo".
- Relatorio de oportunidades antigas encontradas pelo filtro legado.
- Contadores de oportunidades, snapshots, runs e imagens vinculadas.
- Avisos de bloqueio quando houver contrato, matching, atendimento ou validacao aprovada.
- Botao "Gerar dry-run".
- Botao "Arquivar legado".
- Botao "Deletar legado confirmado", com confirmacao forte.
- Historico de limpezas executadas.

### Importacao em lote

Tela sugerida: `/admin/analise-mercado/importar`.

Componentes:

- Upload de `.xlsx` ou `.csv`.
- Preview das linhas.
- Mapeamento de colunas.
- Validacao de URL, cidade e data.
- Deteccao de duplicidade por codigo e URL.
- Botao "Salvar lote".
- Seletor do agente/instancia de WhatsApp que enviara o aviso.
- Seletor ou cadastro rapido do setor/destinatario que recebera o aviso.
- Botao "Iniciar processo" somente depois do lote salvo e do aviso configurado.
- Lista de jobs com status e erros.

### Cadastro de aviso WhatsApp do scraper

Tela sugerida: dentro da propria importacao no MVP; depois pode virar configuracao em `/admin/scraper/configuracoes`.

Componentes:

- Lista de agentes/instancias de WhatsApp disponiveis.
- Status do agente: conectado, desconectado, sem token ou indisponivel.
- Cadastro de setores, por exemplo `Analise de Mercado`, `Juridico`, `Operacoes`.
- Cadastro de numero do responsavel ou grupo do setor.
- Campo para numero em formato internacional, por exemplo `5548999999999`, ou JID quando for grupo.
- Botao "Enviar teste".
- Historico dos ultimos avisos enviados.

### Bloco na ficha do imovel

Adicionar na pagina `/admin/oportunidades/[id]` um bloco "Analise de mercado" com:

- Cards: valor mercado conservador, valor base, desconto real, margem liquida, teto sugerido, confianca.
- Galeria de imagens capturadas do leilao.
- Link para HTML/PDF/anexos capturados pelo scraper.
- Card opcional de aluguel estimado e yield quando o analista informar renda mensal.
- Bloco de pagamento mostrando a vista, parcelado, entrada, saldo, parcelas e alerta de correcao.
- Tabela de comparaveis com qualidade, preco, area, preco/m2, distancia e fonte.
- Checklist de pendencias: area, bairro, conservacao, ocupacao, reforma, debitos, liquidez.
- Cenarios: conservador, base e otimista.
- Campo de parecer do analista.
- Botao "Reprocessar scraper".
- Botao "Gerar analise com IA".
- Botao "Atualizar analise de mercado".

Criar tambem um formulario simples para registrar comparaveis manualmente, porque o processo atual provavelmente vem de planilhas, prints, portais e conhecimento da equipe.

## IA e Regras

Criar ou evoluir um agente/prompt de mercado com saida JSON:

- resumo executivo;
- valor de mercado baixo/base/alto;
- justificativa por comparaveis;
- riscos de liquidez;
- custos estimados;
- aluguel estimado e renda potencial, quando houver dados;
- condicao de pagamento e riscos do parcelamento;
- teto racional sugerido;
- campos ausentes;
- recomendacao: prosseguir, cautela, revisar, descartar;
- confianca.

Guardrails:

- Nunca prometer lucro.
- Nunca tratar valor de mercado como certeza.
- Separar fato, calculo e inferencia.
- Reduzir confianca quando houver poucos comparaveis ou dados incompletos.
- Exigir revisao humana antes de publicar dossie completo ou orientar lance.

## Entrega Recomendada Ainda Hoje

1. Congelar o scraper antigo e impedir novas coletas automaticas por fonte.
2. Criar rotina de inventario/dry-run para identificar oportunidades geradas por `scraper_target`.
3. Criar backup/exportacao dos registros antigos antes de qualquer exclusao.
4. Arquivar ou deletar somente oportunidades confirmadas como legado do scraper antigo.
5. Desativar/remover do fluxo principal `scraper_targets`, catalogo de fontes, cron automatico, seed de fontes e tela antiga focada em alvos.
6. Criar upload/importacao da planilha como lote de trabalho.
7. Criar tabelas de batches, linhas importadas, execucoes de scraper, assets, destinatarios e logs de aviso WhatsApp.
8. Criar parser da planilha atual sem cabecalho: codigo, URL, cidade e data.
9. Criar fila/status por linha, iniciando em `aguardando_inicio`.
10. Criar botao "Iniciar processo" para disparar o scraper manualmente.
11. Permitir escolher agente/instancia de WhatsApp antes de iniciar.
12. Permitir cadastrar o numero ou grupo do setor que recebera o aviso.
13. Criar scraper generico inicial para capturar HTML, texto, metatags, imagens e links de anexos de um link especifico.
14. Criar camada de extracao Gemini com JSON estruturado.
15. Criar calculadora deterministica: desconto, tetos, preco/m2, yield, parcelamento e classificacao preliminar.
16. Enviar aviso WhatsApp ao final com resumo do processamento.
17. Criar UI de importacao e status dos jobs.
18. Manter o bloco de analise na ficha do imovel para revisao humana.
19. Rodar `npm run lint` e `npm run build`.

Escopo realista para hoje:

- Importar a planilha.
- Congelar o fluxo antigo de busca automatica por fontes.
- Gerar dry-run da limpeza do legado antigo.
- Arquivar/deletar registros antigos confirmados como gerados pelo scraper antigo.
- Criar oportunidades/jobs.
- Iniciar o processamento manualmente pelo botao "Iniciar processo".
- Capturar dados basicos e imagens dos links que o scraper generico conseguir ler.
- Gravar falhas por dominio para adaptadores futuros.
- Gerar analise preliminar quando houver dados minimos.
- Deixar pendente para humano quando faltarem area, lance, valor de mercado ou juridico.
- Enviar aviso WhatsApp de conclusao para o setor configurado.

Escopo para a proxima etapa:

- Adaptadores dedicados para os dominios com maior volume.
- Busca automatica de comparaveis de mercado.
- Integracao juridica/processual.
- Ranking diario de oportunidades por verde/amarelo/laranja/vermelho.
- Templates diferentes de aviso por setor e prioridade.

## Perguntas Para Extrair Dos Audios/Arquivos

- Quais portais/ferramentas a equipe usa para achar comparaveis?
- Quantos comparaveis sao considerados suficientes?
- Como diferenciam anuncio caro de valor real de venda?
- Quais custos entram sempre na conta?
- Como calculam teto de lance hoje?
- Quais sinais fazem descartar um imovel mesmo com desconto alto?
- Quem aprova a analise final?
- Qual formato final a equipe usa: planilha, texto, relatorio, audio, PDF?

## Exemplo Real Recebido - Itapiranga/SC

Arquivo de referencia:

- Audio: `C:/Users/conne/Downloads/WhatsApp Audio 2026-08-06 at 10.42.57.ogg`
- Imagem: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.53.jpeg`
- Imagem duplicada/reencaminhada: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.53 (1).jpeg`

Dados extraidos da mensagem:

- Tipo: casa.
- Cidade/UF: Itapiranga/SC.
- Data da analise: 05/08/2026.
- Terreno: 360 m2.
- Area construida aproximada: 400 m2, dois pavimentos.
- Caracteristicas: 3 dormitorios, area de festas com churrasqueira, sacada e garagem.
- Valor de mercado conservador: R$ 795.000,00.
- Lance: R$ 460.953,19.
- Desconto informado: 42,0%.
- Pagamento: a vista.
- Teto Betel 30%: R$ 556.500,00.
- Teto Betel 40%: R$ 477.000,00.
- Juridico: nao possui acoes possessorias nem de natureza propter rem.
- Conclusao: excelente oportunidade.
- Link leilao: https://www.superbid.net/oferta/imovel-matriculado-no-cri-da-comarca-de-itapiranga-sc-com-area-de-36000m-e-area-total-construida-de-aproximadamente-40000m-4754420
- Referencia de mercado: https://www.chavesnamao.com.br/imovel/casa-a-venda-3-quartos-com-garagem-sc-itapiranga-bela-vista-960m2-RS795000/id-27452274/

Regras reveladas por este exemplo:

- O valor de mercado pode ser conservador mesmo quando so existe um comparavel direto disponivel.
- A analise precisa registrar ressalva quando o comparavel tem area/padrao diferente do imovel analisado.
- O teto Betel e calculado sobre o valor de mercado, nao sobre o valor de avaliacao do edital.
- Teto 30% = valor de mercado x 70%.
- Teto 40% = valor de mercado x 60%.
- A conclusao operacional combina desconto, juridico e qualidade do comparativo.
- O texto final para compartilhamento precisa ser compacto, mas deve carregar fonte de leilao, referencia de mercado e ressalva.

Campos que o MVP precisa suportar por causa deste exemplo:

- `payment_condition`
- `land_area_m2`
- `built_area_m2`
- `market_value_base`
- `real_discount_pct`
- `ceiling_targets`
- `legal_signal`
- `decision`
- `decision_reason`
- `caution_notes`
- `source_links`
- comparaveis com `area_m2`, `asking_price`, `source_url`, `similarity_score`, `quality` e `notes`.

## Exemplo Real Recebido - Curitiba/PR (Uberaba)

Arquivo de referencia:

- Imagem: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.56.jpeg`

Dados extraidos da mensagem:

- Tipo: apartamento.
- Cidade/UF: Curitiba/PR.
- Bairro: Uberaba.
- Data/hora do leilao: 07/08/2026 09:00.
- Area privativa: 59,04 m2.
- Caracteristicas: 2 dormitorios, sala, cozinha, area de servico e 1 vaga de garagem.
- Valor de mercado: R$ 519.000,00.
- Lance: R$ 399.000,00.
- Desconto informado: 23,1%.
- Pagamento: a vista.
- Teto Betel 30%: R$ 363.300,00.
- Teto Betel 40%: R$ 311.400,00.
- Aluguel estimado: R$ 2.500,00/mes.
- Juridico: possui uma acao anulatoria de consolidacao de propriedade recem distribuida.
- Conclusao: oportunidade moderada.
- Link leilao: https://www.faleiloes.com.br/item/24279/detalhes?page=8
- Referencias de mercado:
  - https://www.imovelweb.com.br/propriedades/residencial-tom-jobim-apto-1401b-3032613295.html?n_src=Listado&n_pills=Churrasqueira&n_pg=1&n_pos=3&n_search_id=61f1eee7-ae70-4868-bfb9-2fdbc5985cf7
  - https://www.imovelweb.com.br/propriedades/apartamento-a-venda-no-bairro-uberaba-no-residencial-3015782788.html?n_src=Listado&n_pills=Varanda&n_pg=1&n_pos=7&n_search_id=61f1eee7-ae70-4868-bfb9-2fdbc5985cf7

Regras reveladas por este exemplo:

- A analise pode usar comparaveis do mesmo residencial e tambem imoveis de padrao semelhante no bairro.
- O valor de aluguel estimado precisa entrar no bloco, principalmente para apartamentos com tese de renda.
- Desconto de aproximadamente 23% pode ser insuficiente para classificar como excelente quando o teto Betel fica abaixo do lance.
- A existencia de acao anulatoria recem distribuida deve puxar a decisao para moderada/revisao, mesmo com mercado bem referenciado.
- O sistema precisa diferenciar `desconto sobre mercado` de `aderencia ao teto Betel`.
- Quando o lance atual esta acima dos tetos de 30% e 40%, a oportunidade deve sinalizar pressao de margem.
- Multiplas referencias aumentam confianca, mas nao anulam risco juridico.

Campos novos que este exemplo adiciona ao plano:

- `neighborhood`
- `auction_datetime`
- `estimated_monthly_rent`
- `estimated_annual_rent_yield_pct`
- `betel_ceiling_gap`
- `legal_action_type`
- `legal_action_status`
- `market_reference_group`, para indicar se o comparavel e do mesmo condominio, mesmo bairro ou padrao semelhante.

## Exemplo Real Recebido - Biguacu/SC (Jardim Janaina)

Arquivo de referencia:

- Imagem: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.55.jpeg`

Dados extraidos da mensagem:

- Tipo: apartamento.
- Cidade/UF: Biguacu/SC.
- Bairro: Jardim Janaina.
- Empreendimento: Residencial Flores do Porto.
- Data da analise: 05/08/2026.
- Area privativa: 81,62 m2.
- Caracteristicas usadas no comparativo: 2 dormitorios, 1 banheiro, 1 vaga de garagem e padrao construtivo equivalente.
- Valor de mercado: R$ 255.500,00.
- Lance: R$ 162.000,00.
- Desconto informado: 36,6%.
- Pagamento: a vista.
- Teto Betel 30%: R$ 178.850,00.
- Teto Betel 40%: R$ 153.300,00.
- Aluguel estimado: R$ 1.980,00/mes.
- Yield estimado sobre valor de mercado: aproximadamente 0,77% ao mes e 9,3% ao ano.
- Yield estimado sobre lance: aproximadamente 1,22% ao mes e 14,7% ao ano.
- Juridico: nao possui acoes possessorias nem de natureza propter rem.
- Conclusao: oportunidade moderada.
- Link leilao: https://www.flexleiloes.com.br/detalhe-lote/2906/425/?utm_source=Leilao_Imovel&utm_medium=Link_Leilao_Imovel
- Referencias de mercado:
  - https://ibagy.com.br/imovel/130929/apartamento-2-quartos-flores-do-porto-jardim-janaina-bigua%C3%A7u/
  - https://imobiliariabiguacu.com.br/imovel/8816/apartamento-2-quartos-flores-do-porto-jardim-janaina-bigua%C3%A7u/
  - https://sc.mgfimoveis.com.br/residencial-flores-do-porto-venda-sc-biguacu-flores-do-porto-301050056

Regras reveladas por este exemplo:

- Comparaveis do mesmo empreendimento devem receber aderencia alta quando tambem batem em tipologia, vaga, dormitorio e padrao.
- Usar media entre comparaveis do mesmo residencial aumenta a confianca da estimativa.
- Mesmo com juridico limpo e desconto de 36,6%, a oportunidade pode continuar moderada se nao atingir o teto Betel de 40%.
- Quando o lance fica abaixo do teto 30%, mas acima do teto 40%, a classificacao tende a ser moderada/boa com cautela, nao excelente automaticamente.
- Aluguel estimado melhora a tese de renda, mas nao substitui a regra de margem de compra.
- O sistema deve mostrar dois yields: sobre valor de mercado e sobre lance, porque eles respondem perguntas diferentes.
- A conclusao deve considerar tres eixos juntos: margem de compra, juridico e renda potencial.

Regra de classificacao derivada:

- `excelente`: desconto forte, juridico limpo, comparaveis aderentes e lance dentro ou muito proximo do teto Betel mais defensivo.
- `moderada`: juridico limpo e boa renda, mas lance apenas dentro do teto de 30% ou acima do teto de 40%.
- `revisao`: risco juridico relevante ou comparaveis fracos, mesmo quando o desconto parece bom.

Campos novos/reforcados por este exemplo:

- `development_name`
- `reference_same_development_count`
- `estimated_monthly_rent`
- `yield_on_market_pct`
- `yield_on_bid_pct`
- `ceiling_30_gap`
- `ceiling_40_gap`
- `market_confidence_reason`

## Exemplo Real Recebido - Londrina/PR (Spazio Lyon)

Arquivo de referencia:

- Imagem: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.55 (1).jpeg`

Dados extraidos da mensagem:

- Tipo: apartamento.
- Cidade/UF: Londrina/PR.
- Empreendimento: Residencial Spazio Lyon.
- Data da analise: 05/08/2026.
- Area privativa do imovel: 67,59 m2.
- Area dos comparaveis citados: aproximadamente 46 m2.
- Caracteristicas usadas no comparativo: 2 dormitorios e 1 vaga de garagem.
- Valor de mercado: R$ 217.500,00.
- Lance: R$ 103.704,06.
- Desconto informado: 52,3%.
- Pagamento: a vista.
- Teto Betel 30%: R$ 152.250,00.
- Teto Betel 40%: R$ 130.500,00.
- Aluguel estimado: R$ 1.200,00/mes.
- Yield estimado sobre valor de mercado: aproximadamente 0,55% ao mes e 6,6% ao ano.
- Yield estimado sobre lance: aproximadamente 1,16% ao mes e 13,9% ao ano.
- Juridico: nao possui acoes possessorias nem de natureza propter rem.
- Conclusao: excelente oportunidade.
- Link leilao: https://www.lancenoleilao.com.br/lote.php?idLote=26623
- Referencias:
  - https://pr.olx.com.br/regiao-de-londrina/imoveis/apartamento-a-venda-no-spazio-lyon-regiao-norte-de-londrina-1513103076
  - https://pr.mgfimoveis.com.br/apartamento-para-alugar-no-spazio-lyon-regiao-norte-londrina-aluguel-pr-309444391
  - https://imobiliariaserenity.com.br/imovel/venda-e-locacao/apartamentos/londrina/conjunto-habitacional-doutor-farid-libos-spazio-lyon/358

Regras reveladas por este exemplo:

- Quando o lance esta abaixo do teto Betel de 40%, a margem e forte o suficiente para sustentar classificacao excelente se o juridico estiver limpo.
- Desconto acima de 50% sobre mercado e sinal forte de oportunidade, mas ainda precisa de comparaveis e juridico.
- Comparaveis do mesmo empreendimento podem sustentar boa aderencia mesmo quando a metragem e menor, desde que a ressalva fique registrada.
- Diferenca de area entre imovel e comparaveis precisa ser medida e exibida como `area_delta_pct`.
- Referencias podem cumprir papeis diferentes: uma para venda/valor de mercado e outra para aluguel/renda.
- Yield sobre lance pode ser muito mais relevante para tese de renda que yield sobre valor de mercado.
- Excelente oportunidade nao exige aluguel alto sobre mercado; pode ser excelente pela combinacao de compra muito abaixo do teto, juridico limpo e renda aceitavel.

Regra de classificacao reforcada:

- `excelente`: lance abaixo do teto 40%, desconto acima de 40%-50%, juridico limpo e comparaveis aderentes.
- `moderada`: lance abaixo do teto 30%, mas acima do teto 40%, mesmo com juridico limpo.
- `revisao`: risco juridico novo, comparaveis fracos ou divergencia material de area/padrao sem justificativa.

Campos novos/reforcados por este exemplo:

- `area_delta_pct`
- `reference_role`, por exemplo `market_sale`, `rent_reference`, `same_development_sale`
- `rent_reference_url`
- `bid_below_ceiling_40`
- `classification_drivers`, para explicar por que a oportunidade recebeu verde/amarelo/vermelho.

## Exemplo Real Recebido - Londrina/PR (Centro, Edificio Dom Camilo)

Arquivo de referencia:

- Imagem: `C:/Users/conne/Downloads/WhatsApp Image 2026-08-06 at 10.42.54.jpeg`

Dados extraidos da mensagem:

- Tipo: apartamento.
- Cidade/UF: Londrina/PR.
- Bairro: Centro.
- Endereco indicado na imagem: Rua Pernambuco.
- Empreendimento: Edificio Dom Camilo.
- Data da analise: 05/08/2026.
- Area privativa: 92,91 m2.
- Comparavel: apartamento no proprio Edificio Dom Camilo, com 92 m2, 3 dormitorios, 1 suite e 1 vaga.
- Valor de mercado: R$ 390.000,00.
- Lance: R$ 175.000,00.
- Desconto informado: 55,1%.
- Pagamento: parcelado.
- Entrada: 25%, R$ 43.750,00.
- Saldo: 75%, R$ 131.250,00.
- Parcelamento simulado: 30x de R$ 4.375,00/mes, sem correcao na simulacao.
- Alerta: parcelas sujeitas a correcao conforme edital.
- Teto Betel 30%: R$ 273.000,00.
- Teto Betel 40%: R$ 234.000,00.
- Juridico: arrematante recebera o imovel livre de onus, conforme edital.
- Aluguel: referencia encontrada no mesmo condominio, mas valor nao informado.
- Conclusao: excelente oportunidade.
- Link leilao: https://magalhaesleiloes.leilao.br/lote/26/apartamento-com-929-m2-e-vaga-de-garagem-no-02-na-rua-pernambuco-737-centro-londrina-pr?utm_source=Leilao_Imovel&utm_medium=Link_Leilao_Imovel
- Referencias:
  - https://www.imobiliariafarah.com.br/imovel/edificio-dom-camilo-1
  - https://pr.mgfimoveis.com.br/apartamento-para-alugar-no-edificio-dom-camilo-bairro-centro-3-quartos-sendo-309562091

Regras reveladas por este exemplo:

- A forma de pagamento pode ser parcelada e precisa virar um bloco proprio na analise.
- Simulacao sem correcao deve sempre exibir alerta quando o edital prever correcao das parcelas.
- O sistema precisa separar `pagamento real do edital` de `simulacao financeira feita pela Betel`.
- Lance abaixo do teto de 40% e desconto acima de 55% sustentam classificacao excelente quando a referencia de mercado e muito aderente.
- Comparavel quase equivalente no mesmo edificio gera alta confiabilidade de mercado.
- Aluguel pode ter referencia sem valor informado; nesse caso o campo de renda fica como `referencia encontrada`, sem calcular yield.
- "Livre de onus conforme edital" e diferente de "nao possui acoes"; o juridico precisa registrar a fonte da afirmacao.
- O fluxo deve destacar risco financeiro de correcao no parcelamento mesmo quando o risco juridico e baixo.

Regra de classificacao reforcada:

- `excelente`: desconto acima de 50%, lance abaixo do teto 40%, comparavel quase equivalente no mesmo edificio e juridico sem bloqueio relevante.
- `excelente_com_alerta`: mesma condicao acima, mas com parcelamento sujeito a correcao ou outro ponto financeiro que precisa leitura do edital.
- `moderada`: margem boa, mas pagamento/correcao, juridico ou renda incerta exigem cautela maior.

Campos novos/reforcados por este exemplo:

- `payment_mode`, com valores como `a_vista`, `parcelado`, `financiamento_edital`.
- `payment_simulation`
- `down_payment_pct`
- `down_payment_amount`
- `installment_balance`
- `installment_count`
- `installment_amount`
- `installment_correction_rule`
- `installment_correction_warning`
- `rent_reference_found`
- `rent_value_known`
- `legal_statement_source`, por exemplo `edital`.
- `same_building_comparable`

## Definicao de Pronto do MVP

- A ficha do imovel mostra analise de mercado estruturada.
- O usuario consegue registrar comparaveis manualmente.
- O sistema calcula desconto real, preco/m2, cenarios, custos, margem e teto.
- O sistema mostra aluguel estimado/yield quando existir tese de renda.
- O sistema mostra referencia de aluguel mesmo quando o valor nao foi informado, sem inventar yield.
- O sistema registra parcelamento, entrada, saldo, parcelas e alerta de correcao.
- O sistema alerta quando o lance esta acima do teto Betel desejado.
- A etapa `market` do pipeline usa a analise nova.
- O dossie consegue consumir o resultado.
- Toda decisao fica auditavel e com status humano quando necessario.

## Status De Implementacao - 06/08/2026

Concluido nesta fase:

- Scraper antigo congelado no cron para nao iniciar novas buscas amplas.
- Upload de lote por `.xlsx`, `.csv` e `.txt` criado em `/admin/scraper`.
- Processo novo orientado por links importados, iniciado por botao manual.
- Captura de HTML, imagens, edital/matricula/anexos encontrados como links na pagina.
- Extracao preliminar por Gemini em JSON, com campos faltantes e score de confianca.
- Criacao/atualizacao de oportunidade a partir do link importado.
- Criacao de analise preliminar de mercado vinculada a oportunidade.
- Painel de lotes com status, retry de linhas com falha, titulo extraido, confianca, pendencias, imagens e documentos.
- Cadastro de destinatario WhatsApp do setor responsavel.
- Envio de aviso de conclusao por WhatsApp usando agente/instancia escolhidos no lote.
- Dry-run administrativo para inventariar imoveis da fase antiga antes de qualquer limpeza real.
- Pre-visualizacao da planilha antes de salvar o lote definitivo.
- Inicio de processamento em segundo plano via Inngest para o lote importado.
- Adaptadores por dominio para Superbid, Faleiloes, Flex Leiloes, Lance no Leilao e plataformas `*.leilao.br`.
- Rastreio do adaptador usado em cada linha processada no painel do scraper.
- Tela de revisao humana da analise gerada com status, aprovacao, aprovacao com ressalvas e reprovacao.
- Edicao de aluguel/yield, pagamento parcelado, custos estimados, margem liquida, juridico, teto Betel e parecer.
- Rotina segura de limpeza do legado com dry-run, bloqueio por uso operacional, arquivamento JSON e exclusao apenas de registros ja arquivados.

Proxima fase:

- Rodar os testes reais com a planilha `Teste avaliacao de mercado.xlsx`, cobrindo upload, preview, processamento, revisao humana, WhatsApp e limpeza legado.
- Corrigir os adaptadores dos dominios que falharem nos testes reais.

Migrations aplicadas no Supabase nesta fase:

- `20260806123000_property_market_analysis.sql`
- `20260806143000_link_batch_scraper_phase.sql`
- `20260806170000_scraper_legacy_archive.sql`
