-- WhatsApp groups, channels and campaign control center.
-- This keeps group replies and broadcast campaigns permissioned per destination.

create table if not exists public.whatsapp_group_destinations (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.ai_agents(agent_key) on delete set null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  provider text not null default 'connectyhub',
  destination_type text not null default 'group'
    check (destination_type in ('group', 'channel', 'status', 'contact_list', 'lead_segment')),
  jid text not null,
  name text not null,
  description text,
  participant_count integer not null default 0,
  admin_count integer not null default 0,
  is_announcement boolean not null default false,
  is_community boolean not null default false,
  is_admin boolean not null default false,
  invite_url text,
  status text not null default 'paused'
    check (status in ('active', 'paused', 'blocked', 'archived')),
  reply_mode text not null default 'off'
    check (reply_mode in ('off', 'mentions', 'relevant', 'observer', 'all', 'admins', 'approval')),
  respond_with_mention boolean not null default true,
  mention_all_allowed boolean not null default false,
  human_approval_required boolean not null default false,
  daily_message_limit integer not null default 3,
  cooldown_minutes integer not null default 30,
  quiet_hours_start text not null default '21:00',
  quiet_hours_end text not null default '08:00',
  last_synced_at timestamptz,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, jid)
);

create index if not exists whatsapp_group_destinations_agent_idx
  on public.whatsapp_group_destinations(agent_key, status, updated_at desc);

create index if not exists whatsapp_group_destinations_instance_idx
  on public.whatsapp_group_destinations(instance_id, destination_type, updated_at desc)
  where instance_id is not null;

drop trigger if exists whatsapp_group_destinations_set_updated_at on public.whatsapp_group_destinations;
create trigger whatsapp_group_destinations_set_updated_at
  before update on public.whatsapp_group_destinations
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_group_participants (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid not null references public.whatsapp_group_destinations(id) on delete cascade,
  participant_jid text not null,
  phone text,
  display_name text,
  is_admin boolean not null default false,
  is_super_admin boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (destination_id, participant_jid)
);

create index if not exists whatsapp_group_participants_phone_idx
  on public.whatsapp_group_participants(phone)
  where phone is not null;

drop trigger if exists whatsapp_group_participants_set_updated_at on public.whatsapp_group_participants;
create trigger whatsapp_group_participants_set_updated_at
  before update on public.whatsapp_group_participants
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_group_message_events (
  id uuid primary key default gen_random_uuid(),
  destination_id uuid references public.whatsapp_group_destinations(id) on delete set null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  webhook_event_id uuid references public.whatsapp_webhook_events(id) on delete set null,
  provider text not null default 'connectyhub',
  provider_message_id text,
  provider_chat_id text,
  participant_jid text,
  participant_phone text,
  participant_name text,
  message_type text not null default 'text',
  text text,
  media_url text,
  media_mime_type text,
  decision_status text not null default 'observed'
    check (decision_status in ('observed', 'queued', 'responded', 'skipped', 'needs_approval', 'blocked')),
  response_due_at timestamptz,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_group_message_events_destination_idx
  on public.whatsapp_group_message_events(destination_id, occurred_at desc)
  where destination_id is not null;

create index if not exists whatsapp_group_message_events_decision_idx
  on public.whatsapp_group_message_events(decision_status, response_due_at, occurred_at desc);

create unique index if not exists whatsapp_group_message_events_provider_unique_idx
  on public.whatsapp_group_message_events(provider, provider_message_id)
  where provider_message_id is not null;

create table if not exists public.whatsapp_group_campaigns (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.ai_agents(agent_key) on delete set null,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed', 'archived')),
  campaign_type text not null default 'single'
    check (campaign_type in ('single', 'daily', 'weekly', 'monthly', 'fixed', 'ai', 'product', 'voice', 'mixed')),
  approval_mode text not null default 'manual'
    check (approval_mode in ('manual', 'auto')),
  ai_enabled boolean not null default false,
  voice_enabled boolean not null default false,
  voice_id text,
  product_ref text,
  subject text,
  prompt text,
  body_text text,
  media_url text,
  media_type text,
  scheduled_for timestamptz,
  recurrence_rule jsonb not null default '{}'::jsonb,
  timezone text not null default 'America/Sao_Paulo',
  daily_limit integer not null default 20,
  mention_all_requested boolean not null default false,
  mention_all_confirmed boolean not null default false,
  created_by_label text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_group_campaigns_schedule_idx
  on public.whatsapp_group_campaigns(status, coalesce(next_run_at, scheduled_for), updated_at desc);

create index if not exists whatsapp_group_campaigns_agent_idx
  on public.whatsapp_group_campaigns(agent_key, updated_at desc);

drop trigger if exists whatsapp_group_campaigns_set_updated_at on public.whatsapp_group_campaigns;
create trigger whatsapp_group_campaigns_set_updated_at
  before update on public.whatsapp_group_campaigns
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_group_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_group_campaigns(id) on delete cascade,
  destination_id uuid references public.whatsapp_group_destinations(id) on delete set null,
  destination_jid text not null,
  destination_type text not null default 'group',
  status text not null default 'scheduled'
    check (status in ('pending', 'scheduled', 'sent', 'failed', 'skipped', 'paused')),
  last_error text,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, destination_jid)
);

create index if not exists whatsapp_group_campaign_targets_status_idx
  on public.whatsapp_group_campaign_targets(status, updated_at desc);

drop trigger if exists whatsapp_group_campaign_targets_set_updated_at on public.whatsapp_group_campaign_targets;
create trigger whatsapp_group_campaign_targets_set_updated_at
  before update on public.whatsapp_group_campaign_targets
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_group_campaign_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.whatsapp_group_campaigns(id) on delete set null,
  target_id uuid references public.whatsapp_group_campaign_targets(id) on delete set null,
  destination_id uuid references public.whatsapp_group_destinations(id) on delete set null,
  provider text not null default 'connectyhub',
  provider_message_id text,
  delivery_status text not null default 'queued'
    check (delivery_status in ('queued', 'sent', 'failed', 'skipped')),
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_group_campaign_deliveries_campaign_idx
  on public.whatsapp_group_campaign_deliveries(campaign_id, created_at desc);

create index if not exists whatsapp_group_campaign_deliveries_status_idx
  on public.whatsapp_group_campaign_deliveries(delivery_status, scheduled_for, created_at desc);

drop trigger if exists whatsapp_group_campaign_deliveries_set_updated_at on public.whatsapp_group_campaign_deliveries;
create trigger whatsapp_group_campaign_deliveries_set_updated_at
  before update on public.whatsapp_group_campaign_deliveries
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_group_reply_decisions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.whatsapp_group_message_events(id) on delete cascade,
  destination_id uuid references public.whatsapp_group_destinations(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  mode text not null default 'observer',
  decision text not null default 'skip'
    check (decision in ('respond', 'skip', 'needs_approval', 'blocked')),
  reason text,
  confidence numeric(5,2) not null default 0,
  suggested_text text,
  approved_by_label text,
  approved_at timestamptz,
  sent_at timestamptz,
  delivery_id uuid references public.whatsapp_group_campaign_deliveries(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_group_reply_decisions_event_idx
  on public.whatsapp_group_reply_decisions(event_id, created_at desc)
  where event_id is not null;

create index if not exists whatsapp_group_reply_decisions_queue_idx
  on public.whatsapp_group_reply_decisions(decision, approved_at, created_at desc);

drop trigger if exists whatsapp_group_reply_decisions_set_updated_at on public.whatsapp_group_reply_decisions;
create trigger whatsapp_group_reply_decisions_set_updated_at
  before update on public.whatsapp_group_reply_decisions
  for each row execute function public.set_updated_at();

alter table public.whatsapp_group_destinations enable row level security;
alter table public.whatsapp_group_participants enable row level security;
alter table public.whatsapp_group_message_events enable row level security;
alter table public.whatsapp_group_campaigns enable row level security;
alter table public.whatsapp_group_campaign_targets enable row level security;
alter table public.whatsapp_group_campaign_deliveries enable row level security;
alter table public.whatsapp_group_reply_decisions enable row level security;

drop policy if exists whatsapp_group_destinations_service_role_all on public.whatsapp_group_destinations;
create policy whatsapp_group_destinations_service_role_all
  on public.whatsapp_group_destinations
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_participants_service_role_all on public.whatsapp_group_participants;
create policy whatsapp_group_participants_service_role_all
  on public.whatsapp_group_participants
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_message_events_service_role_all on public.whatsapp_group_message_events;
create policy whatsapp_group_message_events_service_role_all
  on public.whatsapp_group_message_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_campaigns_service_role_all on public.whatsapp_group_campaigns;
create policy whatsapp_group_campaigns_service_role_all
  on public.whatsapp_group_campaigns
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_campaign_targets_service_role_all on public.whatsapp_group_campaign_targets;
create policy whatsapp_group_campaign_targets_service_role_all
  on public.whatsapp_group_campaign_targets
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_campaign_deliveries_service_role_all on public.whatsapp_group_campaign_deliveries;
create policy whatsapp_group_campaign_deliveries_service_role_all
  on public.whatsapp_group_campaign_deliveries
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_group_reply_decisions_service_role_all on public.whatsapp_group_reply_decisions;
create policy whatsapp_group_reply_decisions_service_role_all
  on public.whatsapp_group_reply_decisions
  for all
  to service_role
  using (true)
  with check (true);
