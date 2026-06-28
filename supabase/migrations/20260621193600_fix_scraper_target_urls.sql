-- Refresh scraper target URLs that moved or no longer resolve.
update public.scraper_targets
set
  url = case target_code
    when 'zukerman' then 'https://www.portalzuk.com.br/'
    when 'sold-leiloes' then 'https://www.sold.com.br/'
    when 'bb-licitacoes' then 'https://www.seuimovelbb.com.br/'
    when 'bradesco-imoveis' then 'https://vitrinebradesco.com.br/'
    else url
  end,
  scrape_strategy = case target_code
    when 'zukerman' then 'fetch'
    when 'sold-leiloes' then 'playwright'
    when 'bb-licitacoes' then 'playwright'
    when 'bradesco-imoveis' then 'playwright'
    else scrape_strategy
  end,
  notes = case target_code
    when 'zukerman' then 'Zuk, antigo Zukerman. Fetch evita bloqueio Cloudflare do navegador headless.'
    when 'sold-leiloes' then 'Dominio atual da Sold Leiloes.'
    when 'bb-licitacoes' then 'Portal Seu Imovel BB para oportunidades imobiliarias.'
    when 'bradesco-imoveis' then 'Vitrine Bradesco oficial para imoveis e veiculos em leilao.'
    else notes
  end,
  last_result_status = null,
  last_result_count = 0,
  consecutive_errors = 0,
  updated_at = now()
where target_code in ('zukerman', 'sold-leiloes', 'bb-licitacoes', 'bradesco-imoveis');
