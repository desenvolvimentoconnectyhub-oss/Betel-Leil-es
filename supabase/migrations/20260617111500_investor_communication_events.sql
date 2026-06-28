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
