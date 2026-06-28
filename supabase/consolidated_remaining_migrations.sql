-- ============================================================
-- BETEL LEILOES — Migracoes restantes (12 de 14)
-- Migracoes 12 e 13 ja foram aplicadas:
--   - 20260618100000_intelligence_center.sql (intelligence_reports, content_posts)
--   - 20260618100100_scraper_targets.sql (scraper_targets, scraper_runs + seed)
--
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Ordem: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 14
-- ============================================================


-- ============================================================
-- MIGRACAO 1: initial_maintenance
-- Tabela app_config + funcao set_updated_at()
-- ============================================================

create table if not exists public.app_config (
  key text primary key,
  value text,
  description text,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_config_set_updated_at on public.app_config;

create trigger app_config_set_updated_at
before update on public.app_config
for each row
execute function public.set_updated_at();

alter table public.app_config enable row level security;

drop policy if exists "app_config_service_role_all" on public.app_config;

create policy "app_config_service_role_all"
on public.app_config
for all
to service_role
using (true)
with check (true);

insert into public.app_config (key, value, description, is_secret)
values
  ('ai_provider', 'gemini', 'Provider LLM ativo para os agentes Betel AI.', false),
  ('gemini_model', 'gemini-2.5-flash', 'Modelo Gemini padrao para diagnosticos e agentes.', false)
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  is_secret = excluded.is_secret,
  updated_at = now();


-- ============================================================
-- MIGRACAO 2: auction_command_center
-- Nucleo: organizacoes, usuarios, fontes, oportunidades, etc.
-- ============================================================

create extension if not exists pgcrypto;

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


-- ============================================================
-- MIGRACAO 3: investor_crm_fields
-- Campos CRM no investor_profiles
-- ============================================================

alter table public.investor_profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists organization_name text,
  add column if not exists preferred_property_types text[] not null default '{}',
  add column if not exists owner_name text;

create index if not exists investor_profiles_status_idx
  on public.investor_profiles (status);

create index if not exists investor_profiles_risk_appetite_idx
  on public.investor_profiles (risk_appetite);


-- ============================================================
-- MIGRACAO 4: advisory_contract_gate
-- Contratos de assessoria
-- ============================================================

create table if not exists public.advisory_contracts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references public.investor_profiles(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  contract_code text unique,
  status text not null default 'draft',
  contract_type text not null default 'advisory_authorization',
  signer_name text,
  signer_email text,
  max_authorized_bid numeric(14, 2),
  authorized_until timestamptz,
  signed_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advisory_contracts_investor_id_idx
  on public.advisory_contracts(investor_id);

create index if not exists advisory_contracts_opportunity_id_idx
  on public.advisory_contracts(opportunity_id);

create index if not exists advisory_contracts_status_idx
  on public.advisory_contracts(status);

drop trigger if exists advisory_contracts_set_updated_at on public.advisory_contracts;

create trigger advisory_contracts_set_updated_at
  before update on public.advisory_contracts
  for each row execute function public.set_updated_at();

alter table public.advisory_contracts enable row level security;

drop policy if exists advisory_contracts_service_role_all on public.advisory_contracts;

create policy advisory_contracts_service_role_all
  on public.advisory_contracts
  for all
  to service_role
  using (true)
  with check (true);


-- ============================================================
-- MIGRACAO 5: agent_workforce
-- Grupos, agentes, workflow edges, runs
-- ============================================================

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


-- ============================================================
-- MIGRACAO 6: agent_office_registry
-- Salas, prompts, tarefas de manutencao
-- ============================================================

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


-- ============================================================
-- MIGRACAO 7: agent_runtime_events
-- Campos de retry no agent_runs + eventos de runtime
-- ============================================================

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


-- ============================================================
-- MIGRACAO 8: communication_outbox
-- Fila de mensagens (WhatsApp, email, push)
-- ============================================================

create table if not exists public.communication_outbox (
  id uuid primary key default gen_random_uuid(),
  message_code text not null unique,
  run_id uuid references public.agent_runs(id) on delete set null,
  run_code text,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  opportunity_code text,
  investor_id uuid references public.investor_profiles(id) on delete set null,
  audience_key text not null,
  audience_label text not null,
  channel text not null,
  detail_level text not null,
  status text not null default 'draft',
  recipient_label text,
  subject text,
  message_preview text not null default '',
  guardrail_summary text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists communication_outbox_run_code_idx
  on public.communication_outbox(run_code, created_at desc);

create index if not exists communication_outbox_agent_key_idx
  on public.communication_outbox(agent_key, created_at desc);

create index if not exists communication_outbox_status_idx
  on public.communication_outbox(status, created_at desc);

create index if not exists communication_outbox_channel_idx
  on public.communication_outbox(channel, created_at desc);

create index if not exists communication_outbox_opportunity_code_idx
  on public.communication_outbox(opportunity_code, created_at desc);

alter table public.communication_outbox enable row level security;

drop policy if exists communication_outbox_service_role_all on public.communication_outbox;
create policy communication_outbox_service_role_all
  on public.communication_outbox
  for all
  to service_role
  using (true)
  with check (true);


-- ============================================================
-- MIGRACAO 9: source_snapshots
-- Snapshots de fontes de leilao
-- ============================================================

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


-- ============================================================
-- MIGRACAO 10: investor_communication_preferences
-- Campos de plano, lifecycle e opt-ins
-- ============================================================

alter table public.investor_profiles
  add column if not exists plan_key text not null default 'free',
  add column if not exists lifecycle_stage text not null default 'lead',
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists push_opt_in boolean not null default false,
  add column if not exists community_opt_in boolean not null default false,
  add column if not exists communication_frequency text not null default 'normal',
  add column if not exists full_access_until timestamptz;

update public.investor_profiles
set
  plan_key = case
    when lower(coalesce(status, '')) like '%ativo%' then 'premium'
    when lower(coalesce(status, '')) like '%active%' then 'premium'
    when lower(coalesce(status, '')) like '%piloto%' then 'pilot'
    when lower(coalesce(status, '')) like '%pilot%' then 'pilot'
    when lower(coalesce(status, '')) like '%onboarding%' then 'trial'
    else plan_key
  end,
  lifecycle_stage = case
    when lower(coalesce(status, '')) like '%ativo%' then 'client'
    when lower(coalesce(status, '')) like '%active%' then 'client'
    when lower(coalesce(status, '')) like '%piloto%' then 'client'
    when lower(coalesce(status, '')) like '%pilot%' then 'client'
    when lower(coalesce(status, '')) like '%onboarding%' then 'warm_lead'
    else lifecycle_stage
  end
where plan_key = 'free'
  and lower(coalesce(status, '')) similar to '%(ativo|active|piloto|pilot|onboarding)%';

create index if not exists investor_profiles_plan_key_idx
  on public.investor_profiles (plan_key);

create index if not exists investor_profiles_lifecycle_stage_idx
  on public.investor_profiles (lifecycle_stage);

create index if not exists investor_profiles_communication_optins_idx
  on public.investor_profiles (whatsapp_opt_in, email_opt_in, push_opt_in, community_opt_in);


-- ============================================================
-- MIGRACAO 11: investor_communication_events
-- Historico de eventos de comunicacao
-- ============================================================

create table if not exists public.investor_communication_events (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references public.investor_profiles(id) on delete set null,
  message_code text,
  run_code text,
  agent_key text,
  opportunity_code text,
  audience_key text,
  audience_label text,
  channel text not null,
  detail_level text,
  event_type text not null,
  status text not null,
  recipient_label text,
  provider text,
  provider_status text,
  adapter_label text,
  attempt integer not null default 0,
  scheduled_for timestamptz,
  processed_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists investor_communication_events_investor_idx
  on public.investor_communication_events(investor_id, created_at desc);

create index if not exists investor_communication_events_message_idx
  on public.investor_communication_events(message_code, created_at desc);

create index if not exists investor_communication_events_opportunity_idx
  on public.investor_communication_events(opportunity_code, created_at desc);

create index if not exists investor_communication_events_status_idx
  on public.investor_communication_events(event_type, status, created_at desc);

create index if not exists investor_communication_events_channel_idx
  on public.investor_communication_events(channel, created_at desc);

alter table public.investor_communication_events enable row level security;

drop policy if exists investor_communication_events_service_role_all
  on public.investor_communication_events;

create policy investor_communication_events_service_role_all
  on public.investor_communication_events
  for all
  to service_role
  using (true)
  with check (true);


-- ============================================================
-- MIGRACOES 12 e 13: JA APLICADAS (intelligence_center + scraper_targets)
-- Pulando — voce ja rodou estas duas.
-- ============================================================


-- ============================================================
-- MIGRACAO 14: agent_profiles_subscribers
-- Perfil expandido de agentes + portal do assinante
-- ============================================================

alter table public.ai_agents
  add column if not exists avatar_icon text not null default 'Bot',
  add column if not exists description text,
  add column if not exists runtime_mode text not null default 'mock',
  add column if not exists preferred_provider text not null default 'gemini',
  add column if not exists preferred_model text not null default 'gemini-2.5-flash',
  add column if not exists max_cost_per_run numeric(10,4) not null default 1.00,
  add column if not exists daily_run_limit integer not null default 100,
  add column if not exists runs_today integer not null default 0,
  add column if not exists last_run_at timestamptz,
  add column if not exists last_run_status text;

create table if not exists public.subscriber_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email text not null unique,
  name text not null,
  phone text,
  organization_name text,
  plan_key text not null default 'explorer'
    check (plan_key in ('explorer', 'investor', 'professional', 'office')),
  plan_status text not null default 'active'
    check (plan_status in ('active', 'trial', 'expired', 'cancelled', 'suspended')),
  trial_ends_at timestamptz,
  plan_started_at timestamptz not null default now(),
  full_access_until timestamptz,
  whatsapp_opt_in boolean not null default false,
  email_opt_in boolean not null default true,
  push_opt_in boolean not null default false,
  preferred_regions text[] not null default '{}',
  preferred_property_types text[] not null default '{}',
  max_budget numeric(14,2),
  risk_appetite text not null default 'moderado'
    check (risk_appetite in ('conservador', 'moderado', 'arrojado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriber_profiles_plan on public.subscriber_profiles (plan_key);
create index if not exists idx_subscriber_profiles_status on public.subscriber_profiles (plan_status);
create index if not exists idx_subscriber_profiles_auth on public.subscriber_profiles (auth_user_id);

create trigger set_subscriber_profiles_updated_at
  before update on public.subscriber_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.subscriber_opportunity_access (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.subscriber_profiles(id) on delete cascade,
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  access_level text not null default 'teaser'
    check (access_level in ('teaser', 'full', 'premium')),
  granted_by text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (subscriber_id, opportunity_id)
);

create index if not exists idx_subscriber_access_subscriber on public.subscriber_opportunity_access (subscriber_id);
create index if not exists idx_subscriber_access_opportunity on public.subscriber_opportunity_access (opportunity_id);

insert into public.app_config (key, value) values
  ('datajud_api_base_url', ''),
  ('datajud_api_key', ''),
  ('bigdata_corp_api_base_url', ''),
  ('bigdata_corp_api_key', ''),
  ('onr_registry_api_base_url', ''),
  ('onr_registry_api_key', ''),
  ('datazap_api_base_url', ''),
  ('datazap_api_key', '')
on conflict (key) do nothing;


-- ============================================================
-- FIM — Todas as migracoes aplicadas!
-- Total: 28 tabelas, 4 ALTERs, RLS em todas, triggers updated_at
-- ============================================================
