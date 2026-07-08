create table if not exists public.scraper_report_notifications (
  id uuid primary key default gen_random_uuid(),
  message_code text not null unique,
  channel text not null default 'whatsapp',
  recipient_phone text,
  status text not null default 'prepared'
    check (status in ('prepared', 'sent', 'failed', 'skipped')),
  run_started_at timestamptz,
  run_finished_at timestamptz,
  targets_processed integer not null default 0,
  targets_failed integer not null default 0,
  targets_skipped integer not null default 0,
  items_found integer not null default 0,
  items_ingested integer not null default 0,
  items_skipped integer not null default 0,
  message_text text not null default '',
  provider_status text,
  external_delivery_id text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scraper_report_notifications_status_idx
  on public.scraper_report_notifications(status, created_at desc);

create index if not exists scraper_report_notifications_run_idx
  on public.scraper_report_notifications(run_started_at desc, run_finished_at desc);

drop trigger if exists scraper_report_notifications_set_updated_at on public.scraper_report_notifications;
create trigger scraper_report_notifications_set_updated_at
before update on public.scraper_report_notifications
for each row execute function public.set_updated_at();

alter table public.scraper_report_notifications enable row level security;

drop policy if exists scraper_report_notifications_service_role_all on public.scraper_report_notifications;
create policy scraper_report_notifications_service_role_all
  on public.scraper_report_notifications
  for all
  to service_role
  using (true)
  with check (true);
