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
