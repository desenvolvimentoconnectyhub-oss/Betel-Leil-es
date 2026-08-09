create table if not exists public.admin_sectors (
  id uuid primary key default gen_random_uuid(),
  sector_key text not null unique,
  name text not null,
  description text,
  default_route text not null default '/admin',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_user_sector_memberships (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  sector_id uuid not null references public.admin_sectors(id) on delete cascade,
  role_in_sector text not null default 'member'
    check (role_in_sector in ('coordinator', 'reviewer', 'member', 'viewer')),
  can_review boolean not null default true,
  can_approve boolean not null default false,
  can_receive_notifications boolean not null default true,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (admin_user_id, sector_id)
);

create table if not exists public.pipeline_stage_definitions (
  id uuid primary key default gen_random_uuid(),
  stage_key text not null unique,
  name text not null,
  description text,
  sector_id uuid references public.admin_sectors(id) on delete set null,
  next_stage_key text,
  required_permission text not null default 'review',
  sla_hours integer not null default 24,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.opportunity_workflow_tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.auction_opportunities(id) on delete cascade,
  batch_id uuid references public.market_analysis_import_batches(id) on delete set null,
  import_row_id uuid references public.market_analysis_import_rows(id) on delete set null,
  stage_key text not null,
  sector_id uuid references public.admin_sectors(id) on delete set null,
  assigned_admin_user_id uuid references public.admin_users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'approved', 'approved_with_notes', 'rejected', 'blocked', 'cancelled')),
  title text not null,
  description text,
  action_url text,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  due_at timestamptz,
  created_by_admin_user_id uuid references public.admin_users(id) on delete set null,
  resolved_by_admin_user_id uuid references public.admin_users(id) on delete set null,
  resolved_at timestamptz,
  decision text,
  decision_notes text,
  source_type text not null default 'manual',
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.opportunity_workflow_tasks(id) on delete cascade,
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  batch_id uuid references public.market_analysis_import_batches(id) on delete set null,
  sector_id uuid references public.admin_sectors(id) on delete set null,
  recipient_admin_user_id uuid references public.admin_users(id) on delete set null,
  notification_type text not null default 'workflow_task',
  channel text not null default 'whatsapp',
  title text not null,
  message_text text not null,
  action_url text,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped', 'read')),
  provider text,
  provider_message_id text,
  provider_response jsonb not null default '{}'::jsonb,
  error_message text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_sectors_key_idx
  on public.admin_sectors(sector_key)
  where is_active = true;

create index if not exists admin_user_sector_memberships_user_idx
  on public.admin_user_sector_memberships(admin_user_id, is_active);

create index if not exists admin_user_sector_memberships_sector_idx
  on public.admin_user_sector_memberships(sector_id, is_active);

create index if not exists pipeline_stage_definitions_stage_idx
  on public.pipeline_stage_definitions(stage_key)
  where is_active = true;

create index if not exists opportunity_workflow_tasks_queue_idx
  on public.opportunity_workflow_tasks(stage_key, status, updated_at desc);

create index if not exists opportunity_workflow_tasks_opportunity_idx
  on public.opportunity_workflow_tasks(opportunity_id, stage_key, status);

create unique index if not exists opportunity_workflow_tasks_one_open_stage_idx
  on public.opportunity_workflow_tasks(opportunity_id, stage_key)
  where status in ('pending', 'in_progress');

create index if not exists internal_notifications_recipient_idx
  on public.internal_notifications(recipient_admin_user_id, status, created_at desc);

drop trigger if exists admin_sectors_set_updated_at on public.admin_sectors;
create trigger admin_sectors_set_updated_at
before update on public.admin_sectors
for each row execute function public.set_updated_at();

drop trigger if exists admin_user_sector_memberships_set_updated_at on public.admin_user_sector_memberships;
create trigger admin_user_sector_memberships_set_updated_at
before update on public.admin_user_sector_memberships
for each row execute function public.set_updated_at();

drop trigger if exists pipeline_stage_definitions_set_updated_at on public.pipeline_stage_definitions;
create trigger pipeline_stage_definitions_set_updated_at
before update on public.pipeline_stage_definitions
for each row execute function public.set_updated_at();

drop trigger if exists opportunity_workflow_tasks_set_updated_at on public.opportunity_workflow_tasks;
create trigger opportunity_workflow_tasks_set_updated_at
before update on public.opportunity_workflow_tasks
for each row execute function public.set_updated_at();

drop trigger if exists internal_notifications_set_updated_at on public.internal_notifications;
create trigger internal_notifications_set_updated_at
before update on public.internal_notifications
for each row execute function public.set_updated_at();

insert into public.admin_sectors
  (sector_key, name, description, default_route, sort_order)
values
  ('operations', 'Operacao / Admin', 'Usuarios que administram a operacao e acompanham todas as filas.', '/admin', 10),
  ('market_analysis', 'Analise de mercado', 'Setor que revisa a analise automatica dos imoveis.', '/admin/oportunidades', 20),
  ('legal', 'Juridico', 'Setor que valida risco juridico, edital, ocupacao e impedimentos.', '/admin/fontes/capturas', 30),
  ('validation', 'Validacao', 'Setor que faz a validacao final antes da publicacao ou comunicacao.', '/admin/oportunidades', 40),
  ('creative', 'Criativos', 'Setor que prepara pecas e materiais de comunicacao.', '/admin/meta-whatsapp', 50),
  ('communication', 'Comunicacao', 'Setor que envia oportunidades aprovadas para usuarios e canais.', '/admin/whatsapp', 60)
on conflict (sector_key) do update set
  name = excluded.name,
  description = excluded.description,
  default_route = excluded.default_route,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.pipeline_stage_definitions
  (stage_key, name, description, sector_id, next_stage_key, required_permission, sla_hours, sort_order)
select
  values_table.stage_key,
  values_table.name,
  values_table.description,
  sector.id,
  values_table.next_stage_key,
  values_table.required_permission,
  values_table.sla_hours,
  values_table.sort_order
from (
  values
    ('capture', 'Captura', 'Base importada e coleta em andamento.', 'operations', 'ai_analysis', 'review', 24, 10),
    ('ai_analysis', 'Analise IA', 'Curadoria e analise automatica do imovel.', 'operations', 'market_review', 'review', 24, 20),
    ('market_review', 'Revisao de mercado', 'Analista valida valores, desconto, score e dados essenciais.', 'market_analysis', 'legal_review', 'approve', 24, 30),
    ('legal_review', 'Revisao juridica', 'Juridico valida edital, ocupacao, riscos e permissao de seguir.', 'legal', 'validation', 'approve', 24, 40),
    ('validation', 'Validacao final', 'Validacao operacional antes dos criativos e comunicacao.', 'validation', 'creative', 'approve', 24, 50),
    ('creative', 'Criativos', 'Criacao dos materiais de comunicacao.', 'creative', 'communication', 'approve', 48, 60),
    ('communication', 'Comunicacao', 'Envio para usuarios e canais aprovados.', 'communication', null, 'approve', 24, 70)
) as values_table(stage_key, name, description, sector_key, next_stage_key, required_permission, sla_hours, sort_order)
left join public.admin_sectors sector on sector.sector_key = values_table.sector_key
on conflict (stage_key) do update set
  name = excluded.name,
  description = excluded.description,
  sector_id = excluded.sector_id,
  next_stage_key = excluded.next_stage_key,
  required_permission = excluded.required_permission,
  sla_hours = excluded.sla_hours,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.message_templates
  (
    template_key,
    channel,
    audience_key,
    name,
    description,
    subject_template,
    body_template,
    guardrail_template,
    button_label_template,
    button_url_template,
    variables,
    status,
    version,
    created_by_label,
    updated_by_label
  )
values
  (
    'internal.workflow.batch_ready',
    'whatsapp',
    'admin',
    'Lote pronto para revisao interna',
    'Aviso ao setor quando um lote de imoveis termina a analise automatica.',
    'Betel AI - {{ready_count}} imovel(is) aguardam {{stage_name}}',
    'Oi, {{recipient_first_name}}.' || E'\n\n' ||
    'O lote {{batch_label}} terminou a analise automatica.' || E'\n' ||
    '{{ready_count}} imovel(is) estao prontos para conferencia no setor {{sector_name}}.' || E'\n\n' ||
    'Acesse o painel para revisar e aprovar os imoveis liberados.',
    'Aviso interno automatico. Revise no painel antes de encaminhar a proxima etapa.',
    'Abrir fila',
    '{{action_url}}',
    '["recipient_first_name","ready_count","stage_name","batch_label","sector_name","action_url"]'::jsonb,
    'active',
    1,
    'migration:admin_pipeline_sector_access',
    'migration:admin_pipeline_sector_access'
  ),
  (
    'internal.workflow.task_assigned',
    'whatsapp',
    'admin',
    'Nova tarefa interna de workflow',
    'Aviso ao setor quando uma oportunidade entra em uma nova etapa.',
    'Betel AI - nova tarefa: {{stage_name}}',
    'Oi, {{recipient_first_name}}.' || E'\n\n' ||
    '{{task_title}}' || E'\n' ||
    '{{task_description}}' || E'\n\n' ||
    'Entre no painel para continuar o processo.',
    'Aviso interno automatico. A decisao deve ser registrada no painel.',
    'Abrir tarefa',
    '{{action_url}}',
    '["recipient_first_name","stage_name","task_title","task_description","action_url"]'::jsonb,
    'active',
    1,
    'migration:admin_pipeline_sector_access',
    'migration:admin_pipeline_sector_access'
  )
on conflict (template_key, channel, audience_key, version) do update set
  name = excluded.name,
  description = excluded.description,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  guardrail_template = excluded.guardrail_template,
  button_label_template = excluded.button_label_template,
  button_url_template = excluded.button_url_template,
  variables = excluded.variables,
  status = excluded.status,
  updated_by_label = excluded.updated_by_label,
  updated_at = now();

alter table public.admin_sectors enable row level security;
alter table public.admin_user_sector_memberships enable row level security;
alter table public.pipeline_stage_definitions enable row level security;
alter table public.opportunity_workflow_tasks enable row level security;
alter table public.internal_notifications enable row level security;

drop policy if exists admin_sectors_service_role_all on public.admin_sectors;
create policy admin_sectors_service_role_all
  on public.admin_sectors
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists admin_user_sector_memberships_service_role_all on public.admin_user_sector_memberships;
create policy admin_user_sector_memberships_service_role_all
  on public.admin_user_sector_memberships
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists pipeline_stage_definitions_service_role_all on public.pipeline_stage_definitions;
create policy pipeline_stage_definitions_service_role_all
  on public.pipeline_stage_definitions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists opportunity_workflow_tasks_service_role_all on public.opportunity_workflow_tasks;
create policy opportunity_workflow_tasks_service_role_all
  on public.opportunity_workflow_tasks
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists internal_notifications_service_role_all on public.internal_notifications;
create policy internal_notifications_service_role_all
  on public.internal_notifications
  for all
  to service_role
  using (true)
  with check (true);
