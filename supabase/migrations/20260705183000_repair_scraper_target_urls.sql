-- Repair scraper targets that moved, died, or pointed to generic pages.
update public.scraper_targets
set
  name = case target_code
    when 'vip-leiloes' then 'Leilao VIP'
    else name
  end,
  url = case target_code
    when 'vip-leiloes' then 'https://www.leilaovip.com.br/pesquisa/index'
    when 'caixa-imoveis' then 'https://venda-imoveis.caixa.gov.br/sistema/busca-imovel.asp'
    when 'itau-imoveis' then 'https://www.itau.com.br/imoveis-itau'
    else url
  end,
  scrape_strategy = case target_code
    when 'vip-leiloes' then 'playwright'
    when 'caixa-imoveis' then 'playwright'
    when 'itau-imoveis' then 'playwright'
    else scrape_strategy
  end,
  notes = case target_code
    when 'vip-leiloes' then 'Corrigido de vipleiloes.com.br para Leilao VIP com pagina de pesquisa.'
    when 'caixa-imoveis' then 'Busca oficial de imoveis Caixa, evitando a raiz que falha no monitoramento.'
    when 'itau-imoveis' then 'Pagina atual de leiloes de imoveis Itau.'
    else notes
  end,
  last_result_status = null,
  last_result_count = 0,
  consecutive_errors = 0,
  updated_at = now()
where target_code in ('vip-leiloes', 'caixa-imoveis', 'itau-imoveis');
