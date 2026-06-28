-- Expand ai_agents with profile, controls, and runtime preferences
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

-- Subscriber profiles for the public-facing portal
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

-- Track which opportunities each subscriber can access and at what level
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

-- New source provider configs for external APIs (legal, market data)
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
