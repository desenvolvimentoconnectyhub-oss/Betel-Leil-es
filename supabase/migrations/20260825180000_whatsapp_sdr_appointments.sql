create table if not exists public.whatsapp_sdr_settings (
  id boolean primary key default true,
  notification_admin_user_id uuid references public.admin_users(id) on delete set null,
  timezone text not null default 'America/Sao_Paulo',
  business_start_hour integer not null default 8 check (business_start_hour >= 0 and business_start_hour <= 23),
  business_end_hour integer not null default 19 check (business_end_hour >= 1 and business_end_hour <= 24),
  max_bookings_per_hour integer not null default 2 check (max_bookings_per_hour >= 1 and max_bookings_per_hour <= 10),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_sdr_settings_singleton check (id),
  constraint whatsapp_sdr_settings_hours_check check (business_start_hour < business_end_hour)
);

insert into public.whatsapp_sdr_settings (id)
values (true)
on conflict (id) do nothing;

drop trigger if exists whatsapp_sdr_settings_set_updated_at on public.whatsapp_sdr_settings;
create trigger whatsapp_sdr_settings_set_updated_at
before update on public.whatsapp_sdr_settings
for each row
execute function public.set_updated_at();

create table if not exists public.whatsapp_sdr_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.whatsapp_leads(id) on delete cascade,
  conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  agent_key text references public.ai_agents(agent_key) on delete set null,
  assigned_admin_user_id uuid references public.admin_users(id) on delete set null,
  created_by_admin_user_id uuid references public.admin_users(id) on delete set null,
  source_message_id uuid references public.whatsapp_conversation_messages(id) on delete set null,
  status text not null default 'scheduled' check (
    status in ('pending_confirmation', 'scheduled', 'notified', 'completed', 'missed', 'cancelled', 'rescheduled')
  ),
  scheduled_for timestamptz not null,
  timezone text not null default 'America/Sao_Paulo',
  hour_bucket timestamptz not null,
  slot_position integer not null default 1 check (slot_position >= 1 and slot_position <= 10),
  lead_name text,
  lead_phone text,
  lead_email text,
  schedule_label text,
  conversation_summary text,
  sdr_briefing text,
  qualification_snapshot jsonb not null default '{}'::jsonb,
  notification_payload jsonb not null default '{}'::jsonb,
  notified_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists whatsapp_sdr_appointments_set_updated_at on public.whatsapp_sdr_appointments;
create trigger whatsapp_sdr_appointments_set_updated_at
before update on public.whatsapp_sdr_appointments
for each row
execute function public.set_updated_at();

create index if not exists idx_whatsapp_sdr_appointments_scheduled_for
  on public.whatsapp_sdr_appointments (scheduled_for);

create index if not exists idx_whatsapp_sdr_appointments_lead
  on public.whatsapp_sdr_appointments (lead_id, scheduled_for desc);

create index if not exists idx_whatsapp_sdr_appointments_admin
  on public.whatsapp_sdr_appointments (assigned_admin_user_id, scheduled_for)
  where assigned_admin_user_id is not null;

create index if not exists idx_whatsapp_sdr_appointments_active_hour
  on public.whatsapp_sdr_appointments (hour_bucket, status);

create unique index if not exists idx_whatsapp_sdr_appointments_hour_slot_active
  on public.whatsapp_sdr_appointments (hour_bucket, slot_position)
  where status in ('pending_confirmation', 'scheduled', 'notified');

alter table public.whatsapp_sdr_settings enable row level security;
alter table public.whatsapp_sdr_appointments enable row level security;

drop policy if exists whatsapp_sdr_settings_service_role_all on public.whatsapp_sdr_settings;
create policy whatsapp_sdr_settings_service_role_all
  on public.whatsapp_sdr_settings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists whatsapp_sdr_appointments_service_role_all on public.whatsapp_sdr_appointments;
create policy whatsapp_sdr_appointments_service_role_all
  on public.whatsapp_sdr_appointments
  for all
  to service_role
  using (true)
  with check (true);
