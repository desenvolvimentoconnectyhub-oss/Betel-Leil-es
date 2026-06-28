create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.admin_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  organization_type text not null default 'internal',
  status text not null default 'active',
  plan_key text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.admin_organizations(id) on delete set null,
  auth_user_id uuid,
  display_name text not null,
  email text,
  role text not null default 'analyst',
  status text not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auction_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_type text not null,
  url text,
  status text not null default 'active',
  quality_score integer not null default 0 check (quality_score between 0 and 100),
  terms_status text,
  last_collected_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, source_type)
);

create table if not exists public.auction_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.admin_organizations(id) on delete set null,
  source_id uuid references public.auction_sources(id) on delete set null,
  code text not null unique,
  title text not null,
  property_type text,
  address text,
  city text,
  state text,
  source_name text,
  source_type text,
  initial_bid numeric(14,2) not null default 0,
  appraisal_value numeric(14,2) not null default 0,
  discount_pct numeric(6,2) not null default 0,
  opportunity_score integer not null default 0 check (opportunity_score between 0 and 100),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  compliance_score integer not null default 0 check (compliance_score between 0 and 100),
  ai_status text not null default 'Fila IA',
  legal_status text not null default 'Pendente',
  stage text not null default 'Entrada',
  next_action text,
  owner_name text,
  auction_date date,
  occupancy text,
  summary text,
  financial_summary jsonb not null default '[]'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  run_code text unique,
  run_type text not null default 'curation',
  model text,
  prompt_version text,
  confidence_pct numeric(5,2),
  status text not null default 'created',
  cost_estimate numeric(10,4),
  input_hash text,
  output_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.legal_reviews (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  review_code text unique,
  topic text not null,
  status text not null default 'pending',
  reviewer_name text,
  sla_due_at timestamptz,
  decision text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  dossier_code text unique,
  status text not null default 'draft',
  version integer not null default 1,
  source_count integer not null default 0,
  storage_path text,
  summary text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.admin_organizations(id) on delete set null,
  name text not null,
  city_focus text[] not null default '{}',
  max_budget numeric(14,2),
  target_roi_pct numeric(6,2),
  risk_appetite text not null default 'moderate',
  status text not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_matches (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  investor_id uuid references public.investor_profiles(id) on delete cascade,
  match_score integer not null default 0 check (match_score between 0 and 100),
  status text not null default 'suggested',
  rationale text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, investor_id)
);

create table if not exists public.bid_strategies (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  strategy_code text unique,
  ceiling_bid numeric(14,2) not null default 0,
  reserve_cost numeric(14,2) not null default 0,
  expected_roi_pct numeric(6,2),
  status text not null default 'draft',
  approved_by text,
  approved_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auction_sessions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  bid_strategy_id uuid references public.bid_strategies(id) on delete set null,
  status text not null default 'scheduled',
  starts_at timestamptz,
  final_bid numeric(14,2),
  result text,
  operator_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_auction_cases (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  auction_session_id uuid references public.auction_sessions(id) on delete set null,
  status text not null default 'opened',
  payment_status text,
  registration_status text,
  possession_status text,
  next_action text,
  owner_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  alert_code text unique,
  title text not null,
  severity text not null default 'info',
  status text not null default 'open',
  owner_name text,
  message text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.admin_organizations(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  actor_name text not null default 'system',
  event_type text not null,
  status text not null default 'registered',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auction_opportunities_stage_idx on public.auction_opportunities(stage);
create index if not exists auction_opportunities_scores_idx on public.auction_opportunities(opportunity_score desc, risk_score asc);
create index if not exists auction_opportunities_auction_date_idx on public.auction_opportunities(auction_date);
create index if not exists auction_opportunities_source_idx on public.auction_opportunities(source_id);
create index if not exists ai_analysis_runs_opportunity_idx on public.ai_analysis_runs(opportunity_id);
create index if not exists legal_reviews_opportunity_idx on public.legal_reviews(opportunity_id);
create index if not exists dossiers_opportunity_idx on public.dossiers(opportunity_id);
create index if not exists admin_alerts_status_idx on public.admin_alerts(status, severity);
create index if not exists audit_logs_opportunity_idx on public.audit_logs(opportunity_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_organizations',
    'admin_users',
    'auction_sources',
    'auction_opportunities',
    'legal_reviews',
    'dossiers',
    'investor_profiles',
    'opportunity_matches',
    'bid_strategies',
    'auction_sessions',
    'post_auction_cases',
    'admin_alerts'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_set_updated_at', table_name);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'admin_organizations',
    'admin_users',
    'auction_sources',
    'auction_opportunities',
    'ai_analysis_runs',
    'legal_reviews',
    'dossiers',
    'investor_profiles',
    'opportunity_matches',
    'bid_strategies',
    'auction_sessions',
    'post_auction_cases',
    'admin_alerts',
    'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop policy if exists %I on public.%I', table_name || '_service_role_all', table_name);
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      table_name || '_service_role_all',
      table_name
    );
  end loop;
end;
$$;
