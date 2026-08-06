-- Link-driven scraper phase for Betel market analysis.
-- The legacy source-target scraper is frozen; processing now starts from
-- user-uploaded links and an explicit "start process" action.

create table if not exists public.scraper_legacy_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid,
  mode text not null default 'dry_run'
    check (mode in ('dry_run', 'archive', 'delete')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  filter_payload jsonb not null default '{}'::jsonb,
  matched_opportunities_count integer not null default 0,
  matched_snapshots_count integer not null default 0,
  matched_runs_count integer not null default 0,
  archived_opportunities_count integer not null default 0,
  deleted_opportunities_count integer not null default 0,
  backup_storage_path text,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_analysis_import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid,
  original_filename text,
  source_type text not null default 'xlsx',
  row_count integer not null default 0,
  valid_row_count integer not null default 0,
  invalid_row_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'aguardando_inicio', 'processando', 'concluido', 'falha', 'cancelado')),
  started_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  whatsapp_agent_key text,
  whatsapp_instance_id uuid,
  notification_recipient_id uuid,
  notification_status text,
  raw_file_path text,
  mapping_payload jsonb not null default '{}'::jsonb,
  summary_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_analysis_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.market_analysis_import_batches(id) on delete cascade,
  row_number integer not null,
  external_code text,
  auction_url text not null,
  source_domain text,
  city_hint text,
  state_hint text,
  auction_date_hint text,
  property_type_hint text,
  status text not null default 'aguardando_inicio'
    check (status in (
      'importado',
      'duplicado',
      'url_invalida',
      'aguardando_inicio',
      'aguardando_scraper',
      'scraping',
      'scraper_concluido',
      'extracao_concluida',
      'analise_mercado_pendente',
      'pronto_para_revisao',
      'falha'
    )),
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  scrape_run_id uuid,
  error_message text,
  raw_row_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auction_scrape_runs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  import_row_id uuid references public.market_analysis_import_rows(id) on delete set null,
  source_url text not null,
  source_domain text,
  adapter_key text not null default 'generic_link_detail',
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'partial')),
  started_at timestamptz,
  completed_at timestamptz,
  http_status integer,
  raw_snapshot_id uuid references public.source_snapshots(id) on delete set null,
  extracted_payload jsonb not null default '{}'::jsonb,
  gemini_extraction_run_id uuid references public.ai_analysis_runs(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'market_analysis_import_rows_scrape_run_fk'
      and conrelid = 'public.market_analysis_import_rows'::regclass
  ) then
    alter table public.market_analysis_import_rows
      add constraint market_analysis_import_rows_scrape_run_fk
      foreign key (scrape_run_id) references public.auction_scrape_runs(id) on delete set null;
  end if;
end $$;

create table if not exists public.auction_scrape_assets (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid references public.auction_scrape_runs(id) on delete cascade,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  asset_type text not null default 'image',
  source_url text,
  storage_path text,
  content_hash text,
  caption text,
  sort_order integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.scraper_notification_recipients (
  id uuid primary key default gen_random_uuid(),
  sector_name text not null,
  recipient_name text,
  recipient_type text not null default 'sector'
    check (recipient_type in ('sector', 'user', 'group')),
  whatsapp_number text,
  whatsapp_jid text,
  is_group boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scraper_process_notifications (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.market_analysis_import_batches(id) on delete cascade,
  whatsapp_agent_key text,
  whatsapp_instance_id uuid,
  recipient_id uuid references public.scraper_notification_recipients(id) on delete set null,
  recipient_number text,
  recipient_jid text,
  message_text text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),
  provider text not null default 'connectyhub',
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists market_analysis_import_batches_status_idx
  on public.market_analysis_import_batches(status, created_at desc);

create index if not exists market_analysis_import_rows_batch_idx
  on public.market_analysis_import_rows(batch_id, row_number);

create index if not exists market_analysis_import_rows_status_idx
  on public.market_analysis_import_rows(status, updated_at desc);

create index if not exists market_analysis_import_rows_url_idx
  on public.market_analysis_import_rows(auction_url);

create index if not exists auction_scrape_runs_import_row_idx
  on public.auction_scrape_runs(import_row_id, created_at desc);

create index if not exists auction_scrape_runs_status_idx
  on public.auction_scrape_runs(status, created_at desc);

create index if not exists auction_scrape_assets_run_idx
  on public.auction_scrape_assets(scrape_run_id, sort_order);

create index if not exists scraper_notification_recipients_active_idx
  on public.scraper_notification_recipients(is_active, sector_name);

create index if not exists scraper_process_notifications_batch_idx
  on public.scraper_process_notifications(batch_id, created_at desc);

drop trigger if exists market_analysis_import_batches_set_updated_at on public.market_analysis_import_batches;
create trigger market_analysis_import_batches_set_updated_at
before update on public.market_analysis_import_batches
for each row execute function public.set_updated_at();

drop trigger if exists market_analysis_import_rows_set_updated_at on public.market_analysis_import_rows;
create trigger market_analysis_import_rows_set_updated_at
before update on public.market_analysis_import_rows
for each row execute function public.set_updated_at();

drop trigger if exists auction_scrape_runs_set_updated_at on public.auction_scrape_runs;
create trigger auction_scrape_runs_set_updated_at
before update on public.auction_scrape_runs
for each row execute function public.set_updated_at();

drop trigger if exists scraper_notification_recipients_set_updated_at on public.scraper_notification_recipients;
create trigger scraper_notification_recipients_set_updated_at
before update on public.scraper_notification_recipients
for each row execute function public.set_updated_at();

alter table public.scraper_legacy_cleanup_runs enable row level security;
alter table public.market_analysis_import_batches enable row level security;
alter table public.market_analysis_import_rows enable row level security;
alter table public.auction_scrape_runs enable row level security;
alter table public.auction_scrape_assets enable row level security;
alter table public.scraper_notification_recipients enable row level security;
alter table public.scraper_process_notifications enable row level security;

drop policy if exists scraper_legacy_cleanup_runs_service_role_all on public.scraper_legacy_cleanup_runs;
create policy scraper_legacy_cleanup_runs_service_role_all
  on public.scraper_legacy_cleanup_runs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists market_analysis_import_batches_service_role_all on public.market_analysis_import_batches;
create policy market_analysis_import_batches_service_role_all
  on public.market_analysis_import_batches
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists market_analysis_import_rows_service_role_all on public.market_analysis_import_rows;
create policy market_analysis_import_rows_service_role_all
  on public.market_analysis_import_rows
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists auction_scrape_runs_service_role_all on public.auction_scrape_runs;
create policy auction_scrape_runs_service_role_all
  on public.auction_scrape_runs
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists auction_scrape_assets_service_role_all on public.auction_scrape_assets;
create policy auction_scrape_assets_service_role_all
  on public.auction_scrape_assets
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists scraper_notification_recipients_service_role_all on public.scraper_notification_recipients;
create policy scraper_notification_recipients_service_role_all
  on public.scraper_notification_recipients
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists scraper_process_notifications_service_role_all on public.scraper_process_notifications;
create policy scraper_process_notifications_service_role_all
  on public.scraper_process_notifications
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Freeze the old target-based source crawler. This keeps history, but prevents
-- new broad-source crawls after the link-batch phase is deployed.
update public.scraper_targets
set enabled = false,
    notes = coalesce(notes || E'\n', '') || 'Congelado pela fase link-batch do scraper em 2026-08-06.',
    updated_at = now()
where enabled = true;
