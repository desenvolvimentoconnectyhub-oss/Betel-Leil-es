-- Safe archive layer for the legacy broad-source scraper cleanup.
-- This table stores full JSON snapshots before any destructive cleanup is allowed.

create table if not exists public.scraper_legacy_archives (
  id uuid primary key default gen_random_uuid(),
  cleanup_run_id uuid references public.scraper_legacy_cleanup_runs(id) on delete set null,
  opportunity_id uuid not null,
  opportunity_code text not null,
  title text,
  owner_name text,
  stage text,
  reason text,
  blocked boolean not null default false,
  archive_status text not null default 'archived'
    check (archive_status in ('archived', 'deleted', 'restored')),
  opportunity_snapshot jsonb not null default '{}'::jsonb,
  source_snapshots jsonb not null default '[]'::jsonb,
  ai_analysis_runs jsonb not null default '[]'::jsonb,
  legal_reviews jsonb not null default '[]'::jsonb,
  dossiers jsonb not null default '[]'::jsonb,
  opportunity_matches jsonb not null default '[]'::jsonb,
  bid_strategies jsonb not null default '[]'::jsonb,
  auction_sessions jsonb not null default '[]'::jsonb,
  post_auction_cases jsonb not null default '[]'::jsonb,
  property_market_analyses jsonb not null default '[]'::jsonb,
  validation_pipelines jsonb not null default '[]'::jsonb,
  validation_steps jsonb not null default '[]'::jsonb,
  audit_logs jsonb not null default '[]'::jsonb,
  archived_at timestamptz not null default now(),
  deleted_at timestamptz,
  delete_run_id uuid references public.scraper_legacy_cleanup_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create index if not exists scraper_legacy_archives_status_idx
  on public.scraper_legacy_archives(archive_status, archived_at desc);

create index if not exists scraper_legacy_archives_code_idx
  on public.scraper_legacy_archives(opportunity_code);

drop trigger if exists scraper_legacy_archives_set_updated_at on public.scraper_legacy_archives;
create trigger scraper_legacy_archives_set_updated_at
before update on public.scraper_legacy_archives
for each row execute function public.set_updated_at();

alter table public.scraper_legacy_archives enable row level security;

drop policy if exists scraper_legacy_archives_service_role_all on public.scraper_legacy_archives;
create policy scraper_legacy_archives_service_role_all
  on public.scraper_legacy_archives
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
