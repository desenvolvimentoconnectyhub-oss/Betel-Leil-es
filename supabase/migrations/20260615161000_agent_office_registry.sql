create table if not exists public.agent_office_rooms (
  id uuid primary key default gen_random_uuid(),
  room_key text not null unique,
  name text not null,
  sector text not null,
  purpose text,
  lead_label text,
  operating_mode text,
  status text not null default 'planned',
  agent_keys text[] not null default '{}',
  systems text[] not null default '{}',
  rituals text[] not null default '{}',
  maintenance_focus text,
  execution_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_prompt_registry (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null unique,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  department_key text references public.agent_groups(group_key) on delete set null,
  prompt_name text not null,
  prompt_version text not null default 'v0.1',
  purpose text,
  system_prompt text,
  input_contract jsonb not null default '{}'::jsonb,
  output_contract jsonb not null default '{}'::jsonb,
  guardrails jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  owner_label text,
  updated_by_label text,
  change_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text not null unique,
  room_key text references public.agent_office_rooms(room_key) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  area text not null,
  severity text not null default 'medium',
  status text not null default 'open',
  check_description text,
  next_action text,
  owner_label text,
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_office_rooms_status_idx on public.agent_office_rooms(status, execution_order);
create index if not exists agent_prompt_registry_agent_key_idx on public.agent_prompt_registry(agent_key, updated_at desc);
create index if not exists agent_prompt_registry_status_idx on public.agent_prompt_registry(status, updated_at desc);
create index if not exists agent_maintenance_tasks_room_key_idx on public.agent_maintenance_tasks(room_key, status);
create index if not exists agent_maintenance_tasks_agent_key_idx on public.agent_maintenance_tasks(agent_key, status);

drop trigger if exists agent_office_rooms_set_updated_at on public.agent_office_rooms;
create trigger agent_office_rooms_set_updated_at
  before update on public.agent_office_rooms
  for each row execute function public.set_updated_at();

drop trigger if exists agent_prompt_registry_set_updated_at on public.agent_prompt_registry;
create trigger agent_prompt_registry_set_updated_at
  before update on public.agent_prompt_registry
  for each row execute function public.set_updated_at();

drop trigger if exists agent_maintenance_tasks_set_updated_at on public.agent_maintenance_tasks;
create trigger agent_maintenance_tasks_set_updated_at
  before update on public.agent_maintenance_tasks
  for each row execute function public.set_updated_at();

alter table public.agent_office_rooms enable row level security;
alter table public.agent_prompt_registry enable row level security;
alter table public.agent_maintenance_tasks enable row level security;

drop policy if exists agent_office_rooms_service_role_all on public.agent_office_rooms;
create policy agent_office_rooms_service_role_all
  on public.agent_office_rooms
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists agent_prompt_registry_service_role_all on public.agent_prompt_registry;
create policy agent_prompt_registry_service_role_all
  on public.agent_prompt_registry
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists agent_maintenance_tasks_service_role_all on public.agent_maintenance_tasks;
create policy agent_maintenance_tasks_service_role_all
  on public.agent_maintenance_tasks
  for all
  to service_role
  using (true)
  with check (true);
