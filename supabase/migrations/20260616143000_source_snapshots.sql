create table if not exists public.source_snapshots (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.auction_sources(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  snapshot_code text not null unique,
  external_id text,
  snapshot_type text not null default 'manual_intake',
  source_url text,
  title text,
  content_hash text,
  status text not null default 'captured',
  collected_by text,
  collected_at timestamptz not null default now(),
  raw_payload jsonb not null default '{}'::jsonb,
  extracted_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists source_snapshots_source_idx
  on public.source_snapshots(source_id, collected_at desc);

create index if not exists source_snapshots_opportunity_idx
  on public.source_snapshots(opportunity_id, collected_at desc);

create index if not exists source_snapshots_external_idx
  on public.source_snapshots(external_id);

alter table public.source_snapshots enable row level security;

drop policy if exists source_snapshots_service_role_all on public.source_snapshots;
create policy source_snapshots_service_role_all
  on public.source_snapshots
  for all
  to service_role
  using (true)
  with check (true);
