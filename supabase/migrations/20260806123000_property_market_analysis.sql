create table if not exists public.property_market_analyses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  analysis_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'in_analysis', 'human_review', 'approved', 'approved_with_notes', 'rejected', 'insufficient_data')),
  analyst_name text,
  payment_condition text,
  subject_property_snapshot jsonb not null default '{}'::jsonb,
  market_value_low numeric(14,2) not null default 0,
  market_value_base numeric(14,2) not null default 0,
  market_value_high numeric(14,2) not null default 0,
  market_price_per_m2 numeric(12,2) not null default 0,
  initial_bid_price_per_m2 numeric(12,2) not null default 0,
  real_discount_pct numeric(6,2) not null default 0,
  estimated_costs jsonb not null default '[]'::jsonb,
  estimated_net_margin numeric(14,2) not null default 0,
  suggested_ceiling_bid numeric(14,2) not null default 0,
  ceiling_targets jsonb not null default '[]'::jsonb,
  liquidity_score integer not null default 0 check (liquidity_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  legal_signal text,
  decision text not null default 'review'
    check (decision in ('excellent', 'good', 'caution', 'review', 'reject')),
  decision_reason text,
  summary text,
  caution_notes text,
  source_links jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create table if not exists public.property_market_comparables (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.property_market_analyses(id) on delete cascade,
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  source_label text,
  source_url text,
  listing_type text,
  property_type text,
  address text,
  neighborhood text,
  city text,
  state text,
  area_m2 numeric(12,2) not null default 0,
  asking_price numeric(14,2) not null default 0,
  sold_price numeric(14,2) not null default 0,
  price_per_m2 numeric(12,2) not null default 0,
  distance_km numeric(8,2) not null default 0,
  similarity_score integer not null default 0 check (similarity_score between 0 and 100),
  quality text not null default 'medium'
    check (quality in ('strong', 'medium', 'weak', 'discarded')),
  notes text,
  collected_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_market_analyses_status_idx
  on public.property_market_analyses(status, updated_at desc);

create index if not exists property_market_analyses_decision_idx
  on public.property_market_analyses(decision, confidence_score desc);

create index if not exists property_market_comparables_analysis_idx
  on public.property_market_comparables(analysis_id, similarity_score desc);

create index if not exists property_market_comparables_location_idx
  on public.property_market_comparables(city, state, property_type);

drop trigger if exists property_market_analyses_set_updated_at on public.property_market_analyses;
create trigger property_market_analyses_set_updated_at
before update on public.property_market_analyses
for each row execute function public.set_updated_at();

drop trigger if exists property_market_comparables_set_updated_at on public.property_market_comparables;
create trigger property_market_comparables_set_updated_at
before update on public.property_market_comparables
for each row execute function public.set_updated_at();

alter table public.property_market_analyses enable row level security;
alter table public.property_market_comparables enable row level security;

drop policy if exists property_market_analyses_service_role_all on public.property_market_analyses;
create policy property_market_analyses_service_role_all
  on public.property_market_analyses
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists property_market_comparables_service_role_all on public.property_market_comparables;
create policy property_market_comparables_service_role_all
  on public.property_market_comparables
  for all
  to service_role
  using (true)
  with check (true);
