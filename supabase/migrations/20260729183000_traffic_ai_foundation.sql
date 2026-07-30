-- Traffic IA foundation.
-- Read-first structure for Meta Ads, Google Ads, organic channels, analytics,
-- AI recommendations and human-approved actions.

create table if not exists public.traffic_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null
    check (provider in ('meta', 'google', 'organic', 'multichannel')),
  connection_type text not null,
  label text not null,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'warning', 'error', 'paused', 'disabled')),
  external_account_id text,
  business_name text,
  scopes text[] not null default '{}'::text[],
  permissions jsonb not null default '{}'::jsonb,
  last_tested_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, connection_type, external_account_id)
);

create index if not exists traffic_connections_provider_status_idx
  on public.traffic_connections(provider, connection_type, status, updated_at desc);

drop trigger if exists traffic_connections_set_updated_at on public.traffic_connections;
create trigger traffic_connections_set_updated_at
  before update on public.traffic_connections
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google')),
  connection_id uuid references public.traffic_connections(id) on delete set null,
  external_account_id text not null,
  name text,
  currency text,
  timezone text,
  account_status text not null default 'unknown',
  daily_budget numeric(14,2),
  spend_limit numeric(14,2),
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_account_id)
);

create index if not exists traffic_ad_accounts_provider_status_idx
  on public.traffic_ad_accounts(provider, account_status, updated_at desc);

drop trigger if exists traffic_ad_accounts_set_updated_at on public.traffic_ad_accounts;
create trigger traffic_ad_accounts_set_updated_at
  before update on public.traffic_ad_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_campaign_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google')),
  ad_account_id uuid references public.traffic_ad_accounts(id) on delete cascade,
  external_campaign_id text not null,
  name text not null,
  objective text,
  buying_type text,
  status text not null default 'unknown',
  effective_status text,
  budget numeric(14,2),
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  conversions bigint not null default 0,
  ctr numeric(8,4),
  cpc numeric(14,4),
  cpl numeric(14,4),
  cpa numeric(14,4),
  roas numeric(14,4),
  quality_score numeric(6,2),
  snapshot_date date not null default current_date,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_campaign_id, snapshot_date)
);

create index if not exists traffic_campaign_snapshots_provider_date_idx
  on public.traffic_campaign_snapshots(provider, snapshot_date desc, spend desc);

create table if not exists public.traffic_adset_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google')),
  ad_account_id uuid references public.traffic_ad_accounts(id) on delete cascade,
  campaign_external_id text,
  external_adset_id text not null,
  name text not null,
  status text not null default 'unknown',
  targeting jsonb not null default '{}'::jsonb,
  budget numeric(14,2),
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  conversions bigint not null default 0,
  cpl numeric(14,4),
  cpa numeric(14,4),
  snapshot_date date not null default current_date,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_adset_id, snapshot_date)
);

create index if not exists traffic_adset_snapshots_provider_date_idx
  on public.traffic_adset_snapshots(provider, snapshot_date desc, spend desc);

create table if not exists public.traffic_ad_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google')),
  ad_account_id uuid references public.traffic_ad_accounts(id) on delete cascade,
  campaign_external_id text,
  adset_external_id text,
  external_ad_id text not null,
  creative_external_id text,
  name text not null,
  status text not null default 'unknown',
  spend numeric(14,2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  conversions bigint not null default 0,
  ctr numeric(8,4),
  cpc numeric(14,4),
  cpl numeric(14,4),
  cpa numeric(14,4),
  snapshot_date date not null default current_date,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, external_ad_id, snapshot_date)
);

create index if not exists traffic_ad_snapshots_provider_date_idx
  on public.traffic_ad_snapshots(provider, snapshot_date desc, spend desc);

create table if not exists public.traffic_creative_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('meta', 'google', 'organic')),
  external_creative_id text not null,
  name text,
  format text,
  headline text,
  primary_text text,
  description text,
  media_url text,
  destination_url text,
  status text not null default 'unknown',
  performance_score numeric(6,2),
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_creative_id)
);

drop trigger if exists traffic_creative_snapshots_set_updated_at on public.traffic_creative_snapshots;
create trigger traffic_creative_snapshots_set_updated_at
  before update on public.traffic_creative_snapshots
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_social_profiles (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('facebook', 'instagram', 'google_business', 'youtube', 'tiktok', 'linkedin')),
  connection_id uuid references public.traffic_connections(id) on delete set null,
  external_profile_id text not null,
  username text,
  display_name text,
  profile_url text,
  follower_count bigint,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'warning', 'error', 'disabled')),
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_profile_id)
);

create index if not exists traffic_social_profiles_provider_status_idx
  on public.traffic_social_profiles(provider, status, updated_at desc);

drop trigger if exists traffic_social_profiles_set_updated_at on public.traffic_social_profiles;
create trigger traffic_social_profiles_set_updated_at
  before update on public.traffic_social_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_social_posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.traffic_social_profiles(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'google_business', 'youtube', 'tiktok', 'linkedin')),
  external_post_id text not null,
  post_type text,
  caption text,
  media_url text,
  permalink text,
  published_at timestamptz,
  reach bigint not null default 0,
  impressions bigint not null default 0,
  engagement bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  ai_score numeric(6,2),
  sentiment text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_post_id)
);

create index if not exists traffic_social_posts_provider_published_idx
  on public.traffic_social_posts(provider, published_at desc);

drop trigger if exists traffic_social_posts_set_updated_at on public.traffic_social_posts;
create trigger traffic_social_posts_set_updated_at
  before update on public.traffic_social_posts
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_social_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.traffic_social_posts(id) on delete cascade,
  provider text not null check (provider in ('facebook', 'instagram', 'google_business', 'youtube', 'tiktok', 'linkedin')),
  external_comment_id text not null,
  author_name text,
  author_external_id text,
  message text,
  sentiment text,
  intent text,
  needs_reply boolean not null default false,
  replied boolean not null default false,
  created_time timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_comment_id)
);

create index if not exists traffic_social_comments_reply_idx
  on public.traffic_social_comments(needs_reply, replied, created_time desc);

drop trigger if exists traffic_social_comments_set_updated_at on public.traffic_social_comments;
create trigger traffic_social_comments_set_updated_at
  before update on public.traffic_social_comments
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_analytics_daily (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ga4', 'search_console', 'google_ads', 'meta_ads', 'organic', 'crm')),
  channel text,
  campaign_name text,
  date date not null,
  sessions bigint not null default 0,
  users_count bigint not null default 0,
  page_views bigint not null default 0,
  clicks bigint not null default 0,
  impressions bigint not null default 0,
  leads bigint not null default 0,
  conversions bigint not null default 0,
  revenue numeric(14,2) not null default 0,
  cost numeric(14,2) not null default 0,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, channel, campaign_name, date)
);

create index if not exists traffic_analytics_daily_source_date_idx
  on public.traffic_analytics_daily(source, date desc);

create table if not exists public.traffic_ai_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null default 'daily'
    check (report_type in ('daily', 'weekly', 'monthly', 'campaign', 'creative', 'account', 'incident')),
  period_start date,
  period_end date,
  title text not null,
  summary text not null default '',
  findings jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  generated_by text not null default 'traffic_ai',
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'approved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists traffic_ai_reports_set_updated_at on public.traffic_ai_reports;
create trigger traffic_ai_reports_set_updated_at
  before update on public.traffic_ai_reports
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'all'
    check (provider in ('all', 'meta', 'google', 'organic', 'multichannel')),
  recommendation_type text not null,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'critical')),
  title text not null,
  rationale text not null default '',
  expected_impact text,
  proposed_action jsonb not null default '{}'::jsonb,
  requires_approval boolean not null default true,
  status text not null default 'open'
    check (status in ('open', 'approved', 'rejected', 'applied', 'archived')),
  source_report_id uuid references public.traffic_ai_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists traffic_ai_recommendations_status_priority_idx
  on public.traffic_ai_recommendations(status, priority, updated_at desc);

drop trigger if exists traffic_ai_recommendations_set_updated_at on public.traffic_ai_recommendations;
create trigger traffic_ai_recommendations_set_updated_at
  before update on public.traffic_ai_recommendations
  for each row execute function public.set_updated_at();

create table if not exists public.traffic_action_approvals (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references public.traffic_ai_recommendations(id) on delete set null,
  provider text not null check (provider in ('meta', 'google', 'organic', 'multichannel')),
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'executed', 'failed', 'cancelled')),
  requested_by text,
  reviewed_by text,
  reviewed_at timestamptz,
  executed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists traffic_action_approvals_status_idx
  on public.traffic_action_approvals(status, provider, updated_at desc);

drop trigger if exists traffic_action_approvals_set_updated_at on public.traffic_action_approvals;
create trigger traffic_action_approvals_set_updated_at
  before update on public.traffic_action_approvals
  for each row execute function public.set_updated_at();

alter table public.traffic_connections enable row level security;
alter table public.traffic_ad_accounts enable row level security;
alter table public.traffic_campaign_snapshots enable row level security;
alter table public.traffic_adset_snapshots enable row level security;
alter table public.traffic_ad_snapshots enable row level security;
alter table public.traffic_creative_snapshots enable row level security;
alter table public.traffic_social_profiles enable row level security;
alter table public.traffic_social_posts enable row level security;
alter table public.traffic_social_comments enable row level security;
alter table public.traffic_analytics_daily enable row level security;
alter table public.traffic_ai_reports enable row level security;
alter table public.traffic_ai_recommendations enable row level security;
alter table public.traffic_action_approvals enable row level security;

drop policy if exists traffic_connections_service_role_all on public.traffic_connections;
create policy traffic_connections_service_role_all
  on public.traffic_connections for all to service_role using (true) with check (true);

drop policy if exists traffic_ad_accounts_service_role_all on public.traffic_ad_accounts;
create policy traffic_ad_accounts_service_role_all
  on public.traffic_ad_accounts for all to service_role using (true) with check (true);

drop policy if exists traffic_campaign_snapshots_service_role_all on public.traffic_campaign_snapshots;
create policy traffic_campaign_snapshots_service_role_all
  on public.traffic_campaign_snapshots for all to service_role using (true) with check (true);

drop policy if exists traffic_adset_snapshots_service_role_all on public.traffic_adset_snapshots;
create policy traffic_adset_snapshots_service_role_all
  on public.traffic_adset_snapshots for all to service_role using (true) with check (true);

drop policy if exists traffic_ad_snapshots_service_role_all on public.traffic_ad_snapshots;
create policy traffic_ad_snapshots_service_role_all
  on public.traffic_ad_snapshots for all to service_role using (true) with check (true);

drop policy if exists traffic_creative_snapshots_service_role_all on public.traffic_creative_snapshots;
create policy traffic_creative_snapshots_service_role_all
  on public.traffic_creative_snapshots for all to service_role using (true) with check (true);

drop policy if exists traffic_social_profiles_service_role_all on public.traffic_social_profiles;
create policy traffic_social_profiles_service_role_all
  on public.traffic_social_profiles for all to service_role using (true) with check (true);

drop policy if exists traffic_social_posts_service_role_all on public.traffic_social_posts;
create policy traffic_social_posts_service_role_all
  on public.traffic_social_posts for all to service_role using (true) with check (true);

drop policy if exists traffic_social_comments_service_role_all on public.traffic_social_comments;
create policy traffic_social_comments_service_role_all
  on public.traffic_social_comments for all to service_role using (true) with check (true);

drop policy if exists traffic_analytics_daily_service_role_all on public.traffic_analytics_daily;
create policy traffic_analytics_daily_service_role_all
  on public.traffic_analytics_daily for all to service_role using (true) with check (true);

drop policy if exists traffic_ai_reports_service_role_all on public.traffic_ai_reports;
create policy traffic_ai_reports_service_role_all
  on public.traffic_ai_reports for all to service_role using (true) with check (true);

drop policy if exists traffic_ai_recommendations_service_role_all on public.traffic_ai_recommendations;
create policy traffic_ai_recommendations_service_role_all
  on public.traffic_ai_recommendations for all to service_role using (true) with check (true);

drop policy if exists traffic_action_approvals_service_role_all on public.traffic_action_approvals;
create policy traffic_action_approvals_service_role_all
  on public.traffic_action_approvals for all to service_role using (true) with check (true);

insert into public.app_config (key, value, description, is_secret)
values
  ('traffic_ai_read_only_mode', 'true', 'Mantem o modulo Trafego IA em modo leitura ate aprovacao humana para executar alteracoes.', false),
  ('traffic_ai_require_human_approval', 'true', 'Exige aprovacao humana antes de aplicar qualquer acao em Meta Ads, Google Ads ou canais organicos.', false),
  ('traffic_ai_sync_interval_minutes', '60', 'Intervalo planejado para sincronizacoes via Inngest.', false),
  ('meta_graph_api_version', 'v26.0', 'Versao da Graph API usada pelos modulos Meta.', false),
  ('google_ads_api_version', 'v21', 'Versao planejada da Google Ads API.', false),
  ('google_default_customer_timezone', 'America/Sao_Paulo', 'Timezone padrao para relatorios Google Ads e GA4.', false)
on conflict (key) do nothing;
