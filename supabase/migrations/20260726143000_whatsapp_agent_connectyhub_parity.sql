-- ConnectyHub-style WhatsApp agent parity foundation.
-- Adds the data contracts needed for queued runtime, voice, media, follow-up,
-- multichannel identities, and real clone/Turing review without replacing the
-- existing Willian webhook path.

alter table public.ai_agents
  add column if not exists persona_name text,
  add column if not exists sector text,
  add column if not exists function_summary text,
  add column if not exists llm_model text,
  add column if not exists client_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists whatsapp_behavior_config jsonb not null default '{}'::jsonb,
  add column if not exists scope text not null default 'organization',
  add column if not exists agent_kind text,
  add column if not exists client_created boolean not null default false;

update public.ai_agents
set
  agent_kind = 'whatsapp',
  scope = coalesce(nullif(scope, ''), 'organization'),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'channel', 'whatsapp',
    'channelFamily', 'whatsapp'
  )
where
  agent_key in ('multichannel-dispatch', 'willian', 'willian-whatsapp')
  or lower(coalesce(agent_kind, '')) in ('whatsapp', 'wpp')
  or lower(coalesce(metadata->>'agent_kind', metadata->>'agentKind', '')) = 'whatsapp'
  or lower(coalesce(metadata->>'channel', metadata->>'channelFamily', '')) in ('whatsapp', 'wpp')
  or coalesce(whatsapp_behavior_config, '{}'::jsonb) <> '{}'::jsonb
  or metadata ? 'whatsappAgentConfig'
  or metadata ? 'whatsapp_agent_config';

update public.ai_agents
set
  agent_kind = coalesce(nullif(agent_kind, ''), 'backoffice'),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'channel', 'backoffice',
    'channelFamily', 'backoffice'
  )
where coalesce(agent_kind, '') <> 'whatsapp';

create index if not exists ai_agents_kind_status_idx
  on public.ai_agents(agent_kind, status, updated_at desc);

alter table public.whatsapp_instances
  add column if not exists client_key text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.whatsapp_conversations
  add column if not exists provider text not null default 'connectyhub',
  add column if not exists provider_chat_id text,
  add column if not exists last_message_preview text,
  add column if not exists last_human_message_at timestamptz,
  add column if not exists ai_paused_until timestamptz,
  add column if not exists assigned_to_label text,
  add column if not exists sla_due_at timestamptz,
  add column if not exists follow_up_count integer not null default 0,
  add column if not exists last_follow_up_at timestamptz;

create unique index if not exists whatsapp_conversations_instance_chat_unique_idx
  on public.whatsapp_conversations(instance_id, provider_chat_id)
  where instance_id is not null and provider_chat_id is not null;

create index if not exists whatsapp_conversations_status_last_idx
  on public.whatsapp_conversations(agent_key, status, last_message_at desc);

create index if not exists whatsapp_conversations_human_idx
  on public.whatsapp_conversations(human_intervention_active, ai_paused_until);

alter table public.whatsapp_conversation_messages
  add column if not exists provider text not null default 'connectyhub',
  add column if not exists provider_chat_id text,
  add column if not exists occurred_at timestamptz,
  add column if not exists delivery_status text,
  add column if not exists media_url text,
  add column if not exists media_mime_type text,
  add column if not exists transcript text,
  add column if not exists reply_to_provider_message_id text,
  add column if not exists external_track_id text;

update public.whatsapp_conversation_messages
set occurred_at = created_at
where occurred_at is null;

alter table public.whatsapp_conversation_messages
  alter column occurred_at set default now();

create index if not exists whatsapp_conversation_messages_chat_time_idx
  on public.whatsapp_conversation_messages(provider_chat_id, occurred_at desc)
  where provider_chat_id is not null;

create index if not exists whatsapp_conversation_messages_direction_time_idx
  on public.whatsapp_conversation_messages(conversation_id, direction, occurred_at desc);

create index if not exists whatsapp_conversation_messages_provider_lookup_idx
  on public.whatsapp_conversation_messages(provider, provider_message_id)
  where provider_message_id is not null;

alter table public.agent_runs
  add column if not exists agent_key text references public.ai_agents(agent_key) on delete set null,
  add column if not exists whatsapp_conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  add column if not exists whatsapp_lead_id uuid references public.whatsapp_leads(id) on delete set null,
  add column if not exists whatsapp_instance_id uuid references public.whatsapp_instances(id) on delete set null,
  add column if not exists webhook_event_id uuid references public.whatsapp_webhook_events(id) on delete set null,
  add column if not exists scheduled_for timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists agent_runs_agent_key_status_idx
  on public.agent_runs(agent_key, status, created_at desc);

create index if not exists agent_runs_whatsapp_conversation_idx
  on public.agent_runs(whatsapp_conversation_id, created_at desc)
  where whatsapp_conversation_id is not null;

create index if not exists agent_runs_whatsapp_queue_idx
  on public.agent_runs(status, scheduled_for, created_at)
  where trigger_source = 'connectyhub/whatsapp.message.received';

create table if not exists public.lead_channel_identities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.whatsapp_leads(id) on delete cascade,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  provider text not null default 'connectyhub',
  channel text not null default 'whatsapp',
  external_account_id text,
  external_user_id text not null,
  display_name text,
  profile_image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists lead_channel_identities_unique_external_idx
  on public.lead_channel_identities(provider, channel, coalesce(external_account_id, ''), external_user_id);

create index if not exists lead_channel_identities_lead_idx
  on public.lead_channel_identities(lead_id, updated_at desc)
  where lead_id is not null;

drop trigger if exists lead_channel_identities_set_updated_at on public.lead_channel_identities;
create trigger lead_channel_identities_set_updated_at
  before update on public.lead_channel_identities
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_lead_profiles (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.whatsapp_leads(id) on delete cascade,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  assigned_to_label text,
  crm_stage text not null default 'entrada',
  classification text not null default 'novo',
  lead_score integer not null default 0,
  source text not null default 'whatsapp',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  referrer text,
  preferred_regions text[] not null default '{}',
  property_types text[] not null default '{}',
  budget_min numeric(14,2),
  budget_max numeric(14,2),
  investment_goal text,
  experience_level text,
  urgency text,
  notes text,
  ai_summary text,
  next_action text,
  next_action_due_at timestamptz,
  last_contact_at timestamptz,
  last_human_contact_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id)
);

create index if not exists whatsapp_lead_profiles_stage_score_idx
  on public.whatsapp_lead_profiles(crm_stage, lead_score desc, updated_at desc);

create index if not exists whatsapp_lead_profiles_agent_idx
  on public.whatsapp_lead_profiles(agent_key, updated_at desc)
  where agent_key is not null;

insert into public.whatsapp_lead_profiles (
  lead_id,
  agent_key,
  crm_stage,
  classification,
  lead_score,
  source,
  last_contact_at,
  metadata
)
select
  lead.id,
  lead.owner_agent_key,
  case
    when lead.opt_out then 'perdido'
    when lead.human_intervention_active then 'handoff'
    when lead.qualification_score >= 85 then 'vip'
    when lead.qualification_score >= 70 then 'quente'
    when lead.qualification_score >= 40 then 'qualificando'
    else 'entrada'
  end,
  case
    when lead.opt_out then 'opt_out'
    when lead.human_intervention_active then 'handoff_humano'
    when lead.qualification_score >= 85 then 'vip'
    when lead.qualification_score >= 70 then 'quente'
    when lead.qualification_score >= 40 then 'morno'
    else 'novo'
  end,
  lead.qualification_score,
  lead.source,
  lead.last_message_at,
  jsonb_build_object('seededFrom', 'whatsapp_leads')
from public.whatsapp_leads lead
on conflict (lead_id) do update
set
  agent_key = excluded.agent_key,
  crm_stage = excluded.crm_stage,
  classification = excluded.classification,
  lead_score = excluded.lead_score,
  source = excluded.source,
  last_contact_at = excluded.last_contact_at,
  metadata = public.whatsapp_lead_profiles.metadata || excluded.metadata,
  updated_at = now();

drop trigger if exists whatsapp_lead_profiles_set_updated_at on public.whatsapp_lead_profiles;
create trigger whatsapp_lead_profiles_set_updated_at
  before update on public.whatsapp_lead_profiles
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_follow_ups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.whatsapp_leads(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'running', 'sent', 'skipped', 'failed', 'cancelled')),
  reason text not null default 'proactive_follow_up',
  template_key text,
  response_mode text not null default 'text'
    check (response_mode in ('text', 'audio', 'mirror')),
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_follow_ups_queue_idx
  on public.whatsapp_follow_ups(status, scheduled_for, created_at);

create index if not exists whatsapp_follow_ups_conversation_idx
  on public.whatsapp_follow_ups(conversation_id, created_at desc);

drop trigger if exists whatsapp_follow_ups_set_updated_at on public.whatsapp_follow_ups;
create trigger whatsapp_follow_ups_set_updated_at
  before update on public.whatsapp_follow_ups
  for each row execute function public.set_updated_at();

create table if not exists public.customer_voices (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.ai_agents(agent_key) on delete set null,
  provider text not null default 'elevenlabs',
  provider_voice_id text,
  name text not null,
  status text not null default 'draft',
  consent_status text not null default 'pending',
  default_for_agent boolean not null default false,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_voices_agent_idx
  on public.customer_voices(agent_key, status, updated_at desc);

drop trigger if exists customer_voices_set_updated_at on public.customer_voices;
create trigger customer_voices_set_updated_at
  before update on public.customer_voices
  for each row execute function public.set_updated_at();

create table if not exists public.generated_media (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.ai_agents(agent_key) on delete set null,
  lead_id uuid references public.whatsapp_leads(id) on delete set null,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  message_id uuid references public.whatsapp_conversation_messages(id) on delete set null,
  customer_voice_id uuid references public.customer_voices(id) on delete set null,
  provider text,
  media_type text not null,
  storage_url text,
  storage_key text,
  duration_seconds numeric(12,3),
  bytes_size bigint,
  transcript text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists generated_media_agent_time_idx
  on public.generated_media(agent_key, created_at desc);

create index if not exists generated_media_conversation_idx
  on public.generated_media(conversation_id, created_at desc)
  where conversation_id is not null;

create table if not exists public.whatsapp_agent_reviews (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.whatsapp_leads(id) on delete set null,
  message_id uuid references public.whatsapp_conversation_messages(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  review_type text not null default 'turing_benchmark',
  score numeric(5,2),
  verdict text,
  metrics jsonb not null default '{}'::jsonb,
  review_flags text[] not null default '{}',
  notes text,
  reviewed_by_label text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_agent_reviews_conversation_idx
  on public.whatsapp_agent_reviews(conversation_id, created_at desc);

create index if not exists whatsapp_agent_reviews_agent_type_idx
  on public.whatsapp_agent_reviews(agent_key, review_type, created_at desc);

alter table public.lead_channel_identities enable row level security;
alter table public.whatsapp_lead_profiles enable row level security;
alter table public.whatsapp_follow_ups enable row level security;
alter table public.customer_voices enable row level security;
alter table public.generated_media enable row level security;
alter table public.whatsapp_agent_reviews enable row level security;

drop policy if exists lead_channel_identities_service_role_all on public.lead_channel_identities;
create policy lead_channel_identities_service_role_all
  on public.lead_channel_identities
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_lead_profiles_service_role_all on public.whatsapp_lead_profiles;
create policy whatsapp_lead_profiles_service_role_all
  on public.whatsapp_lead_profiles
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_follow_ups_service_role_all on public.whatsapp_follow_ups;
create policy whatsapp_follow_ups_service_role_all
  on public.whatsapp_follow_ups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists customer_voices_service_role_all on public.customer_voices;
create policy customer_voices_service_role_all
  on public.customer_voices
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists generated_media_service_role_all on public.generated_media;
create policy generated_media_service_role_all
  on public.generated_media
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_agent_reviews_service_role_all on public.whatsapp_agent_reviews;
create policy whatsapp_agent_reviews_service_role_all
  on public.whatsapp_agent_reviews
  for all
  to service_role
  using (true)
  with check (true);
