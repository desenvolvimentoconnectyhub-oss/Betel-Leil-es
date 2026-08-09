create table if not exists public.property_qualification_dossiers (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  scrape_run_id uuid references public.auction_scrape_runs(id) on delete set null,
  dossier_code text not null unique,
  mode text not null default 'shadow'
    check (mode in ('shadow', 'active')),
  version text not null default 'qualification-v2-shadow-1',
  status text not null default 'shadow'
    check (status in ('shadow', 'auto_candidate', 'human_review', 'blocked')),
  readiness_status text not null default 'human_review'
    check (readiness_status in ('auto_candidate', 'human_review', 'blocked')),
  property_type text,
  identity_score integer not null default 0 check (identity_score between 0 and 100),
  market_score integer not null default 0 check (market_score between 0 and 100),
  image_score integer not null default 0 check (image_score between 0 and 100),
  documentation_score integer not null default 0 check (documentation_score between 0 and 100),
  compliance_score integer not null default 0 check (compliance_score between 0 and 100),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  confidence_score integer not null default 0 check (confidence_score between 0 and 100),
  overall_score integer not null default 0 check (overall_score between 0 and 100),
  blockers jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  property_playbook jsonb not null default '{}'::jsonb,
  identity_evidence jsonb not null default '{}'::jsonb,
  market_evidence jsonb not null default '{}'::jsonb,
  image_evidence jsonb not null default '{}'::jsonb,
  document_evidence jsonb not null default '{}'::jsonb,
  compliance_evidence jsonb not null default '{}'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, version)
);

create table if not exists public.property_qualification_evidence (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null references public.property_qualification_dossiers(id) on delete cascade,
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  category text not null
    check (category in ('identity', 'image', 'market', 'document', 'compliance', 'risk', 'source')),
  label text not null,
  status text not null default 'info'
    check (status in ('passed', 'warning', 'blocked', 'info')),
  score integer not null default 0 check (score between 0 and 100),
  source_url text,
  details text,
  sort_order integer not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists property_qualification_dossiers_opportunity_idx
  on public.property_qualification_dossiers(opportunity_id, updated_at desc);

create index if not exists property_qualification_dossiers_status_idx
  on public.property_qualification_dossiers(status, overall_score desc, updated_at desc);

create index if not exists property_qualification_dossiers_readiness_idx
  on public.property_qualification_dossiers(readiness_status, overall_score desc, updated_at desc);

create index if not exists property_qualification_dossiers_property_type_idx
  on public.property_qualification_dossiers(property_type, overall_score desc);

create index if not exists property_qualification_evidence_dossier_idx
  on public.property_qualification_evidence(dossier_id, sort_order);

create index if not exists property_qualification_evidence_category_idx
  on public.property_qualification_evidence(category, status, score desc);

drop trigger if exists property_qualification_dossiers_set_updated_at on public.property_qualification_dossiers;
create trigger property_qualification_dossiers_set_updated_at
before update on public.property_qualification_dossiers
for each row execute function public.set_updated_at();

alter table public.property_qualification_dossiers enable row level security;
alter table public.property_qualification_evidence enable row level security;

drop policy if exists property_qualification_dossiers_service_role_all on public.property_qualification_dossiers;
create policy property_qualification_dossiers_service_role_all
  on public.property_qualification_dossiers
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists property_qualification_evidence_service_role_all on public.property_qualification_evidence;
create policy property_qualification_evidence_service_role_all
  on public.property_qualification_evidence
  for all
  to service_role
  using (true)
  with check (true);
