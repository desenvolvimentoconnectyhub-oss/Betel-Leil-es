create table if not exists public.opportunity_validation_runs (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  snapshot_id uuid references public.source_snapshots(id) on delete set null,
  opportunity_code text not null,
  opportunity_title text not null,
  run_code text not null unique,
  overall_status text not null default 'in_review'
    check (overall_status in ('completed', 'in_review', 'blocked', 'discarded')),
  current_step_key text,
  current_step_label text,
  progress_pct integer not null default 0 check (progress_pct between 0 and 100),
  final_score integer not null default 0 check (final_score between 0 and 100),
  blocked_reason text,
  completed_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id)
);

create table if not exists public.opportunity_validation_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.opportunity_validation_runs(id) on delete cascade,
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  snapshot_id uuid references public.source_snapshots(id) on delete set null,
  step_key text not null,
  step_label text not null,
  step_order integer not null default 0,
  status text not null default 'pending'
    check (status in ('passed', 'warning', 'pending', 'blocked', 'skipped')),
  score integer not null default 0 check (score between 0 and 100),
  summary text,
  evidence jsonb not null default '{}'::jsonb,
  provider text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, step_key)
);

create index if not exists opportunity_validation_runs_status_idx
  on public.opportunity_validation_runs(overall_status, updated_at desc);

create index if not exists opportunity_validation_runs_current_step_idx
  on public.opportunity_validation_runs(current_step_key, updated_at desc);

create index if not exists opportunity_validation_steps_run_idx
  on public.opportunity_validation_steps(run_id, step_order);

create index if not exists opportunity_validation_steps_status_idx
  on public.opportunity_validation_steps(status, step_key);

drop trigger if exists opportunity_validation_runs_set_updated_at on public.opportunity_validation_runs;
create trigger opportunity_validation_runs_set_updated_at
before update on public.opportunity_validation_runs
for each row execute function public.set_updated_at();

drop trigger if exists opportunity_validation_steps_set_updated_at on public.opportunity_validation_steps;
create trigger opportunity_validation_steps_set_updated_at
before update on public.opportunity_validation_steps
for each row execute function public.set_updated_at();

alter table public.opportunity_validation_runs enable row level security;
alter table public.opportunity_validation_steps enable row level security;

drop policy if exists opportunity_validation_runs_service_role_all on public.opportunity_validation_runs;
create policy opportunity_validation_runs_service_role_all
  on public.opportunity_validation_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists opportunity_validation_steps_service_role_all on public.opportunity_validation_steps;
create policy opportunity_validation_steps_service_role_all
  on public.opportunity_validation_steps
  for all
  to service_role
  using (true)
  with check (true);
