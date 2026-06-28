-- Scraper targets: auction sites, bank portals, court listings to crawl
create table if not exists public.scraper_targets (
  id uuid primary key default gen_random_uuid(),
  target_code text not null unique,
  name text not null,
  url text not null,
  target_type text not null default 'auctioneer'
    check (target_type in ('auctioneer', 'bank', 'court', 'portal', 'aggregator')),
  region text,
  coverage text not null default 'nacional',
  scrape_strategy text not null default 'playwright'
    check (scrape_strategy in ('playwright', 'fetch', 'api')),
  selectors jsonb not null default '{}'::jsonb,
  schedule_cron text default '0 */6 * * *',
  enabled boolean not null default true,
  priority integer not null default 50 check (priority between 1 and 100),
  last_scraped_at timestamptz,
  last_result_status text,
  last_result_count integer default 0,
  error_count integer not null default 0,
  consecutive_errors integer not null default 0,
  max_retries integer not null default 3,
  max_pages integer not null default 10,
  rate_limit_ms integer not null default 2000,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scraper_targets_enabled on public.scraper_targets (enabled) where enabled = true;
create index if not exists idx_scraper_targets_type on public.scraper_targets (target_type);

create trigger set_scraper_targets_updated_at
  before update on public.scraper_targets
  for each row execute function public.set_updated_at();

-- Scraper run history
create table if not exists public.scraper_runs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references public.scraper_targets(id) on delete cascade,
  run_code text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  items_found integer not null default 0,
  items_ingested integer not null default 0,
  items_skipped integer not null default 0,
  items_duplicate integer not null default 0,
  pages_scraped integer not null default 0,
  error_message text,
  duration_ms integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_scraper_runs_target on public.scraper_runs (target_id);
create index if not exists idx_scraper_runs_status on public.scraper_runs (status);

-- Seed initial scraper targets for major Brazilian auction sources
insert into public.scraper_targets (target_code, name, url, target_type, coverage, scrape_strategy, notes) values
  ('zukerman', 'Zukerman Leiloes', 'https://www.zfrj.com.br', 'auctioneer', 'nacional', 'playwright', 'Maior leiloeiro do Brasil'),
  ('mega-leiloes', 'Mega Leiloes', 'https://www.megaleiloes.com.br', 'auctioneer', 'nacional', 'playwright', 'Portal nacional de leiloes'),
  ('vip-leiloes', 'Vip Leiloes', 'https://www.vipleiloes.com.br', 'auctioneer', 'nacional', 'playwright', null),
  ('sold-leiloes', 'Sold Leiloes', 'https://www.soldleiloes.com.br', 'auctioneer', 'nacional', 'playwright', null),
  ('lance-no-leilao', 'Lance no Leilao', 'https://www.lancenoleilao.com.br', 'auctioneer', 'nacional', 'playwright', null),
  ('superbid', 'Superbid', 'https://www.superbid.net', 'auctioneer', 'nacional', 'playwright', 'Industrial e imobiliario'),
  ('leilao-imovel', 'Leilao Imovel', 'https://www.leilaoimovel.com.br', 'aggregator', 'nacional', 'playwright', 'Agregador'),
  ('caixa-imoveis', 'Caixa Economica Federal', 'https://venda-imoveis.caixa.gov.br', 'bank', 'nacional', 'fetch', 'Imoveis retomados Caixa'),
  ('bb-licitacoes', 'Banco do Brasil', 'https://licitacoes.bb.com.br', 'bank', 'nacional', 'playwright', null),
  ('itau-imoveis', 'Itau Unibanco', 'https://www.itau.com.br/imoveis-venda', 'bank', 'nacional', 'playwright', null),
  ('bradesco-imoveis', 'Bradesco Imoveis', 'https://www.bradescoimoveis.com.br', 'bank', 'nacional', 'playwright', null),
  ('santander-imoveis', 'Santander Imoveis', 'https://www.santanderimoveis.com.br', 'bank', 'nacional', 'playwright', null),
  ('emgea', 'Emgea (Caixa)', 'https://www.emgea.gov.br/imoveis', 'bank', 'nacional', 'fetch', 'Subsidiaria da Caixa'),
  ('resale', 'Resale', 'https://www.resale.com.br', 'aggregator', 'nacional', 'playwright', 'Agregador de leiloes')
on conflict (target_code) do nothing;
