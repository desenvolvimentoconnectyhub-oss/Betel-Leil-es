create table if not exists public.llm_operation_receipts (
  id text primary key,
  content_hash text not null,
  model text not null,
  project_id text not null,
  billing_organization_id text not null,
  status text not null check (status in ('processing', 'completed', 'uncertain', 'failed')),
  result_status text check (result_status in ('usable', 'unusable')),
  request_id text,
  charged_credits numeric,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.llm_operation_receipts enable row level security;
revoke all on public.llm_operation_receipts from anon, authenticated;
grant select, insert, update on public.llm_operation_receipts to service_role;
