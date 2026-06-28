alter table public.agent_runs
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists provider text,
  add column if not exists model text;

create table if not exists public.agent_runtime_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.agent_runs(id) on delete cascade,
  run_code text,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  event_type text not null,
  status text not null default 'registered',
  provider text,
  model text,
  attempt integer not null default 1,
  duration_ms integer,
  cost_estimate numeric(10,4),
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_runtime_events_run_id_idx
  on public.agent_runtime_events(run_id, created_at desc);

create index if not exists agent_runtime_events_run_code_idx
  on public.agent_runtime_events(run_code, created_at desc);

create index if not exists agent_runtime_events_agent_key_idx
  on public.agent_runtime_events(agent_key, created_at desc);

create index if not exists agent_runtime_events_status_idx
  on public.agent_runtime_events(status, created_at desc);

alter table public.agent_runtime_events enable row level security;

drop policy if exists agent_runtime_events_service_role_all on public.agent_runtime_events;
create policy agent_runtime_events_service_role_all
  on public.agent_runtime_events
  for all
  to service_role
  using (true)
  with check (true);
