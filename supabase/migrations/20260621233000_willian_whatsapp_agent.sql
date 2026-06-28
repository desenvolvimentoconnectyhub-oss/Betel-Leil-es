-- Willian WhatsApp agent backbone: instance, webhook inbox, CRM conversation trail and memory.

alter table public.ai_agents
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists whatsapp_behavior_config jsonb not null default '{}'::jsonb,
  add column if not exists lead_qualification_config jsonb not null default '{}'::jsonb;

create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  agent_key text references public.ai_agents(agent_key) on delete set null,
  provider text not null default 'uazapi',
  instance_name text not null,
  provider_instance_id text,
  token_ciphertext text,
  token_preview text,
  phone text,
  status text not null default 'draft',
  webhook_url text,
  webhook_secret_preview text,
  behavior_config jsonb not null default '{}'::jsonb,
  qualification_config jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, instance_name)
);

create index if not exists whatsapp_instances_agent_key_idx
  on public.whatsapp_instances(agent_key, updated_at desc);

drop trigger if exists whatsapp_instances_set_updated_at on public.whatsapp_instances;
create trigger whatsapp_instances_set_updated_at
  before update on public.whatsapp_instances
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  event_hash text not null unique,
  event_type text not null default 'uazapi_event',
  provider_message_id text,
  from_phone text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists whatsapp_webhook_events_instance_idx
  on public.whatsapp_webhook_events(instance_id, received_at desc);

create index if not exists whatsapp_webhook_events_agent_key_idx
  on public.whatsapp_webhook_events(agent_key, received_at desc);

create table if not exists public.whatsapp_leads (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  name text,
  email text,
  source text not null default 'whatsapp',
  status text not null default 'new',
  temperature text not null default 'unknown',
  qualification_score integer not null default 0,
  owner_agent_key text references public.ai_agents(agent_key) on delete set null,
  human_intervention_active boolean not null default false,
  opt_out boolean not null default false,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_leads_owner_idx
  on public.whatsapp_leads(owner_agent_key, updated_at desc);

drop trigger if exists whatsapp_leads_set_updated_at on public.whatsapp_leads;
create trigger whatsapp_leads_set_updated_at
  before update on public.whatsapp_leads
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.whatsapp_leads(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  status text not null default 'open',
  human_intervention_active boolean not null default false,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_conversations_lead_idx
  on public.whatsapp_conversations(lead_id, updated_at desc);

create index if not exists whatsapp_conversations_agent_idx
  on public.whatsapp_conversations(agent_key, updated_at desc);

drop trigger if exists whatsapp_conversations_set_updated_at on public.whatsapp_conversations;
create trigger whatsapp_conversations_set_updated_at
  before update on public.whatsapp_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.whatsapp_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.whatsapp_conversations(id) on delete cascade,
  lead_id uuid references public.whatsapp_leads(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  webhook_event_id uuid references public.whatsapp_webhook_events(id) on delete set null,
  direction text not null default 'inbound'
    check (direction in ('inbound', 'outbound', 'system')),
  author_type text not null default 'lead'
    check (author_type in ('lead', 'ai', 'human', 'system')),
  author_label text,
  message_type text not null default 'text',
  text text,
  provider_message_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_conversation_messages_conversation_idx
  on public.whatsapp_conversation_messages(conversation_id, created_at desc);

create index if not exists whatsapp_conversation_messages_provider_idx
  on public.whatsapp_conversation_messages(provider_message_id);

create table if not exists public.whatsapp_lead_files (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.whatsapp_leads(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  message_id uuid references public.whatsapp_conversation_messages(id) on delete set null,
  storage_key text,
  file_url text,
  mime_type text,
  source text not null default 'whatsapp',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_lead_files_lead_idx
  on public.whatsapp_lead_files(lead_id, created_at desc);

create table if not exists public.intelligence_memory (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null,
  scope_id text not null,
  memory_key text not null,
  value jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) not null default 0.500,
  source text not null default 'agent',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (scope_type, scope_id, memory_key)
);

create index if not exists intelligence_memory_scope_idx
  on public.intelligence_memory(scope_type, scope_id, updated_at desc);

drop trigger if exists intelligence_memory_set_updated_at on public.intelligence_memory;
create trigger intelligence_memory_set_updated_at
  before update on public.intelligence_memory
  for each row execute function public.set_updated_at();

alter table public.whatsapp_instances enable row level security;
alter table public.whatsapp_webhook_events enable row level security;
alter table public.whatsapp_leads enable row level security;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_conversation_messages enable row level security;
alter table public.whatsapp_lead_files enable row level security;
alter table public.intelligence_memory enable row level security;

drop policy if exists whatsapp_instances_service_role_all on public.whatsapp_instances;
create policy whatsapp_instances_service_role_all
  on public.whatsapp_instances
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_webhook_events_service_role_all on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_service_role_all
  on public.whatsapp_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_leads_service_role_all on public.whatsapp_leads;
create policy whatsapp_leads_service_role_all
  on public.whatsapp_leads
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_conversations_service_role_all on public.whatsapp_conversations;
create policy whatsapp_conversations_service_role_all
  on public.whatsapp_conversations
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_conversation_messages_service_role_all on public.whatsapp_conversation_messages;
create policy whatsapp_conversation_messages_service_role_all
  on public.whatsapp_conversation_messages
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_lead_files_service_role_all on public.whatsapp_lead_files;
create policy whatsapp_lead_files_service_role_all
  on public.whatsapp_lead_files
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists intelligence_memory_service_role_all on public.intelligence_memory;
create policy intelligence_memory_service_role_all
  on public.intelligence_memory
  for all
  to service_role
  using (true)
  with check (true);
