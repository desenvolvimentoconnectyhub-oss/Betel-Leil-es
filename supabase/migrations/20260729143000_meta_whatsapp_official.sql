-- Official Meta WhatsApp campaign foundation.
-- This module is intentionally separate from WhatsApp agent/ConnectyHub tables.

create table if not exists public.meta_whatsapp_senders (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null,
  phone_number_id text not null unique,
  display_phone_number text,
  verified_name text,
  quality_rating text,
  messaging_limit_tier text,
  status text not null default 'active'
    check (status in ('active', 'paused', 'disabled', 'sync_error')),
  is_default boolean not null default false,
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_whatsapp_senders_waba_idx
  on public.meta_whatsapp_senders(waba_id, status, updated_at desc);

drop trigger if exists meta_whatsapp_senders_set_updated_at on public.meta_whatsapp_senders;
create trigger meta_whatsapp_senders_set_updated_at
  before update on public.meta_whatsapp_senders
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  waba_id text not null,
  meta_template_id text unique,
  name text not null,
  language text not null default 'pt_BR',
  category text not null default 'MARKETING',
  status text not null default 'draft'
    check (status in ('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled', 'sync_only')),
  header_type text not null default 'none'
    check (header_type in ('none', 'text', 'image', 'video', 'document')),
  header_text text,
  body_text text not null default '',
  footer_text text,
  buttons jsonb not null default '[]'::jsonb,
  components jsonb not null default '[]'::jsonb,
  variables jsonb not null default '[]'::jsonb,
  media_asset_id uuid,
  managed_from_panel boolean not null default false,
  created_from_panel boolean not null default false,
  last_synced_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (waba_id, name, language)
);

create index if not exists meta_whatsapp_templates_panel_status_idx
  on public.meta_whatsapp_templates(managed_from_panel, status, updated_at desc);

drop trigger if exists meta_whatsapp_templates_set_updated_at on public.meta_whatsapp_templates;
create trigger meta_whatsapp_templates_set_updated_at
  before update on public.meta_whatsapp_templates
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_contact_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  source_filename text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'csv', 'xlsx', 'txt', 'crm_segment', 'import')),
  opt_in_required boolean not null default true,
  valid_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists meta_whatsapp_contact_lists_set_updated_at on public.meta_whatsapp_contact_lists;
create trigger meta_whatsapp_contact_lists_set_updated_at
  before update on public.meta_whatsapp_contact_lists
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_contact_list_contacts (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.meta_whatsapp_contact_lists(id) on delete cascade,
  name text,
  phone_e164 text not null,
  email text,
  city text,
  tags text[] not null default '{}'::text[],
  variables jsonb not null default '{}'::jsonb,
  opt_in_confirmed boolean not null default false,
  opt_in_source text,
  opt_in_at timestamptz,
  status text not null default 'valid'
    check (status in ('valid', 'invalid', 'duplicate', 'blocked', 'opt_out')),
  validation_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (list_id, phone_e164)
);

create index if not exists meta_whatsapp_contact_list_contacts_phone_idx
  on public.meta_whatsapp_contact_list_contacts(phone_e164, status);

drop trigger if exists meta_whatsapp_contact_list_contacts_set_updated_at on public.meta_whatsapp_contact_list_contacts;
create trigger meta_whatsapp_contact_list_contacts_set_updated_at
  before update on public.meta_whatsapp_contact_list_contacts
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_opt_ins (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  source text not null default 'manual',
  source_reference text,
  consent_text text,
  consent_at timestamptz not null default now(),
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (phone_e164, source, source_reference)
);

create table if not exists public.meta_whatsapp_suppression_list (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique,
  reason text not null default 'opt_out',
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists public.meta_whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  campaign_type text not null default 'marketing'
    check (campaign_type in ('marketing', 'follow_up', 'reactivation', 'traffic', 'crm_segment', 'test')),
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  sender_id uuid references public.meta_whatsapp_senders(id) on delete set null,
  sender_pool jsonb not null default '[]'::jsonb,
  template_id uuid references public.meta_whatsapp_templates(id) on delete restrict,
  language text not null default 'pt_BR',
  contact_list_id uuid references public.meta_whatsapp_contact_lists(id) on delete set null,
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  rate_limit_per_minute integer not null default 60,
  daily_limit_per_number integer not null default 1000,
  require_opt_in boolean not null default true,
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'pending_review', 'approved', 'rejected')),
  totals jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_whatsapp_campaigns_status_schedule_idx
  on public.meta_whatsapp_campaigns(status, scheduled_for, updated_at desc);

drop trigger if exists meta_whatsapp_campaigns_set_updated_at on public.meta_whatsapp_campaigns;
create trigger meta_whatsapp_campaigns_set_updated_at
  before update on public.meta_whatsapp_campaigns
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.meta_whatsapp_campaigns(id) on delete cascade,
  contact_list_contact_id uuid references public.meta_whatsapp_contact_list_contacts(id) on delete set null,
  sender_id uuid references public.meta_whatsapp_senders(id) on delete set null,
  phone_e164 text not null,
  name text,
  variables jsonb not null default '{}'::jsonb,
  opt_in_confirmed boolean not null default false,
  status text not null default 'queued'
    check (status in ('queued', 'scheduled', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped', 'cancelled')),
  provider_message_id text,
  provider_status text,
  error_code text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  attempt_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, phone_e164)
);

create index if not exists meta_whatsapp_campaign_recipients_status_idx
  on public.meta_whatsapp_campaign_recipients(status, scheduled_for, updated_at desc);

create index if not exists meta_whatsapp_campaign_recipients_message_idx
  on public.meta_whatsapp_campaign_recipients(provider_message_id);

drop trigger if exists meta_whatsapp_campaign_recipients_set_updated_at on public.meta_whatsapp_campaign_recipients;
create trigger meta_whatsapp_campaign_recipients_set_updated_at
  before update on public.meta_whatsapp_campaign_recipients
  for each row
  execute function public.set_updated_at();

create table if not exists public.meta_whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null default 'unknown',
  provider_message_id text,
  phone_number_id text,
  waba_id text,
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists meta_whatsapp_webhook_events_message_idx
  on public.meta_whatsapp_webhook_events(provider_message_id, created_at desc);

alter table public.meta_whatsapp_senders enable row level security;
alter table public.meta_whatsapp_templates enable row level security;
alter table public.meta_whatsapp_contact_lists enable row level security;
alter table public.meta_whatsapp_contact_list_contacts enable row level security;
alter table public.meta_whatsapp_opt_ins enable row level security;
alter table public.meta_whatsapp_suppression_list enable row level security;
alter table public.meta_whatsapp_campaigns enable row level security;
alter table public.meta_whatsapp_campaign_recipients enable row level security;
alter table public.meta_whatsapp_webhook_events enable row level security;

drop policy if exists meta_whatsapp_senders_service_role_all on public.meta_whatsapp_senders;
create policy meta_whatsapp_senders_service_role_all on public.meta_whatsapp_senders
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_templates_service_role_all on public.meta_whatsapp_templates;
create policy meta_whatsapp_templates_service_role_all on public.meta_whatsapp_templates
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_contact_lists_service_role_all on public.meta_whatsapp_contact_lists;
create policy meta_whatsapp_contact_lists_service_role_all on public.meta_whatsapp_contact_lists
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_contact_list_contacts_service_role_all on public.meta_whatsapp_contact_list_contacts;
create policy meta_whatsapp_contact_list_contacts_service_role_all on public.meta_whatsapp_contact_list_contacts
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_opt_ins_service_role_all on public.meta_whatsapp_opt_ins;
create policy meta_whatsapp_opt_ins_service_role_all on public.meta_whatsapp_opt_ins
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_suppression_list_service_role_all on public.meta_whatsapp_suppression_list;
create policy meta_whatsapp_suppression_list_service_role_all on public.meta_whatsapp_suppression_list
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_campaigns_service_role_all on public.meta_whatsapp_campaigns;
create policy meta_whatsapp_campaigns_service_role_all on public.meta_whatsapp_campaigns
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_campaign_recipients_service_role_all on public.meta_whatsapp_campaign_recipients;
create policy meta_whatsapp_campaign_recipients_service_role_all on public.meta_whatsapp_campaign_recipients
  for all to service_role using (true) with check (true);

drop policy if exists meta_whatsapp_webhook_events_service_role_all on public.meta_whatsapp_webhook_events;
create policy meta_whatsapp_webhook_events_service_role_all on public.meta_whatsapp_webhook_events
  for all to service_role using (true) with check (true);

insert into public.app_config (key, value, description, is_secret)
values
  ('meta_graph_api_version', 'v26.0', 'Versao da Graph API usada pelo modulo Meta WhatsApp Oficial.', false),
  ('meta_default_language', 'pt_BR', 'Idioma padrao dos templates Meta WhatsApp.', false),
  ('meta_rate_limit_per_minute', '60', 'Limite interno de envios por minuto para Meta WhatsApp.', false),
  ('meta_daily_limit_per_number', '1000', 'Limite interno diario por numero oficial Meta WhatsApp.', false)
on conflict (key) do nothing;
