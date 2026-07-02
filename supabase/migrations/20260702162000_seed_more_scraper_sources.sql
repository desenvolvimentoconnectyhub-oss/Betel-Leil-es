-- Additional verified scraper sources for Renata.
-- These sources are inserted only when missing. Runtime quality gates still
-- require an exact property URL, usable property image, and informed value.
insert into public.scraper_targets (
  target_code,
  name,
  url,
  target_type,
  coverage,
  scrape_strategy,
  priority,
  max_pages,
  rate_limit_ms,
  notes
) values
  ('sodre-santoro', 'Sodre Santoro', 'https://www.sodresantoro.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('hasta-publica', 'Hasta Publica', 'https://www.hastapublica.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('lance-ja', 'Lance Ja', 'https://www.lanceja.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('guariglia-leiloes', 'Guariglia Leiloes', 'https://www.guariglialeiloes.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('nogari-leiloes', 'Nogari Leiloes', 'https://www.nogarileiloes.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('kronberg-leiloes', 'Kronberg Leiloes', 'https://www.kronbergleiloes.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.'),
  ('frazao-leiloes', 'Frazao Leiloes', 'https://www.frazaoleiloes.com.br/', 'auctioneer', 'nacional', 'fetch', 59, 10, 2500, 'Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.')
on conflict (target_code) do nothing;
