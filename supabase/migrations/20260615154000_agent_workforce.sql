create table if not exists public.agent_groups (
  id uuid primary key default gen_random_uuid(),
  group_key text not null unique,
  name text not null,
  purpose text,
  status text not null default 'planned',
  execution_order integer not null default 0,
  trigger_description text,
  human_gate text,
  api_dependencies text[] not null default '{}',
  guardrails jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.agent_groups(id) on delete cascade,
  agent_key text not null unique,
  name text not null,
  role text not null,
  status text not null default 'planned',
  prompt_name text not null,
  prompt_version text not null default 'v0.1',
  system_prompt text,
  trigger_type text,
  input_schema jsonb not null default '{}'::jsonb,
  output_schema jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_workflow_edges (
  id uuid primary key default gen_random_uuid(),
  from_agent_id uuid references public.ai_agents(id) on delete cascade,
  to_agent_id uuid references public.ai_agents(id) on delete cascade,
  edge_key text not null unique,
  condition_label text,
  requires_human_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references public.ai_agents(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  investor_id uuid references public.investor_profiles(id) on delete set null,
  run_code text unique,
  status text not null default 'queued',
  trigger_source text,
  input_payload jsonb not null default '{}'::jsonb,
  output_payload jsonb not null default '{}'::jsonb,
  human_review_status text,
  handoff_to text,
  error_message text,
  cost_estimate numeric(10,4),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_agents_group_id_idx on public.ai_agents(group_id);
create index if not exists agent_runs_agent_id_idx on public.agent_runs(agent_id, created_at desc);
create index if not exists agent_runs_opportunity_id_idx on public.agent_runs(opportunity_id, created_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs(status, created_at desc);

drop trigger if exists agent_groups_set_updated_at on public.agent_groups;
create trigger agent_groups_set_updated_at
  before update on public.agent_groups
  for each row execute function public.set_updated_at();

drop trigger if exists ai_agents_set_updated_at on public.ai_agents;
create trigger ai_agents_set_updated_at
  before update on public.ai_agents
  for each row execute function public.set_updated_at();

drop trigger if exists agent_runs_set_updated_at on public.agent_runs;
create trigger agent_runs_set_updated_at
  before update on public.agent_runs
  for each row execute function public.set_updated_at();

alter table public.agent_groups enable row level security;
alter table public.ai_agents enable row level security;
alter table public.agent_workflow_edges enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists agent_groups_service_role_all on public.agent_groups;
create policy agent_groups_service_role_all
  on public.agent_groups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists ai_agents_service_role_all on public.ai_agents;
create policy ai_agents_service_role_all
  on public.ai_agents
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists agent_workflow_edges_service_role_all on public.agent_workflow_edges;
create policy agent_workflow_edges_service_role_all
  on public.agent_workflow_edges
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists agent_runs_service_role_all on public.agent_runs;
create policy agent_runs_service_role_all
  on public.agent_runs
  for all
  to service_role
  using (true)
  with check (true);
