create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  channel text not null default 'whatsapp',
  audience_key text not null default 'general',
  name text not null,
  description text,
  subject_template text not null default '',
  body_template text not null default '',
  guardrail_template text not null default '',
  button_label_template text,
  button_url_template text,
  variables jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'archived')),
  version integer not null default 1,
  created_by_label text,
  updated_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, channel, audience_key, version)
);

create unique index if not exists message_templates_active_unique_idx
  on public.message_templates(template_key, channel, audience_key)
  where status = 'active';

create index if not exists message_templates_key_idx
  on public.message_templates(template_key, channel, audience_key, status);

drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at
before update on public.message_templates
for each row execute function public.set_updated_at();

create table if not exists public.message_recipient_segments (
  segment_key text primary key,
  label text not null,
  recipient_type text not null default 'mixed',
  description text,
  filters jsonb not null default '{}'::jsonb,
  channel_preferences text[] not null default '{}',
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists message_recipient_segments_set_updated_at on public.message_recipient_segments;
create trigger message_recipient_segments_set_updated_at
before update on public.message_recipient_segments
for each row execute function public.set_updated_at();

create table if not exists public.message_routes (
  route_key text primary key,
  name text not null,
  description text,
  template_key text not null,
  channel text not null default 'whatsapp',
  recipient_segment_keys text[] not null default '{}',
  recipient_keys text[] not null default '{}',
  manual_recipients jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  updated_by_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists message_routes_set_updated_at on public.message_routes;
create trigger message_routes_set_updated_at
before update on public.message_routes
for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;
alter table public.message_recipient_segments enable row level security;
alter table public.message_routes enable row level security;

drop policy if exists message_templates_service_role_all on public.message_templates;
create policy message_templates_service_role_all
  on public.message_templates
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists message_recipient_segments_service_role_all on public.message_recipient_segments;
create policy message_recipient_segments_service_role_all
  on public.message_recipient_segments
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists message_routes_service_role_all on public.message_routes;
create policy message_routes_service_role_all
  on public.message_routes
  for all
  to service_role
  using (true)
  with check (true);

insert into public.message_recipient_segments
  (segment_key, label, recipient_type, description, filters, channel_preferences)
values
  (
    'admin.operations',
    'Administradores da operacao',
    'admin',
    'Owners, admins e managers ativos que recebem avisos operacionais internos.',
    '{"roles":["owner","admin","manager"],"statuses":["active","invited"]}'::jsonb,
    array['whatsapp','email']
  ),
  (
    'admin.all',
    'Todos os administradores ativos',
    'admin',
    'Todos os usuarios administrativos ativos ou convidados.',
    '{"statuses":["active","invited"]}'::jsonb,
    array['whatsapp','email']
  ),
  (
    'investors.premium',
    'Clientes premium/pagantes',
    'investor',
    'Investidores com plano, piloto ou acesso completo ativo.',
    '{"access":"full"}'::jsonb,
    array['whatsapp','email','push']
  ),
  (
    'investors.all',
    'Investidores com opt-in',
    'investor',
    'Base de investidores que aceita comunicacao pelo canal selecionado.',
    '{"opt_in":true}'::jsonb,
    array['whatsapp','email','push']
  ),
  (
    'leads.whatsapp',
    'Leads do WhatsApp',
    'lead',
    'Leads captados no WhatsApp com telefone registrado.',
    '{"channel":"whatsapp"}'::jsonb,
    array['whatsapp']
  )
on conflict (segment_key) do update
set
  label = excluded.label,
  recipient_type = excluded.recipient_type,
  description = excluded.description,
  filters = excluded.filters,
  channel_preferences = excluded.channel_preferences,
  status = 'active',
  updated_at = now();

insert into public.message_routes
  (route_key, name, description, template_key, channel, recipient_segment_keys, enabled)
values
  (
    'scraper.report.admin',
    'Relatorio do scraper para administradores',
    'Define quem recebe o resumo operacional apos cada rodada do scraper.',
    'scraper.report.admin',
    'whatsapp',
    array['admin.operations'],
    true
  )
on conflict (route_key) do update
set
  name = excluded.name,
  description = excluded.description,
  template_key = excluded.template_key,
  channel = excluded.channel,
  recipient_segment_keys = excluded.recipient_segment_keys,
  enabled = excluded.enabled,
  updated_at = now();
