-- Financial/idempotency receipts only: never persist speech text, audio or lead PII.
create table public.voice_operation_receipts (
 id text primary key,
 content_hash text not null,
 project_id uuid not null,
 billing_organization_id uuid not null,
 voice_id text not null,
 model_id text not null,
 generation_id uuid,
 status text not null default 'requested' check (status in ('requested','completed','uncertain','failed')),
 charged_credits numeric check (charged_credits >= 0),
 audio_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.voice_operation_receipts enable row level security;
revoke all on public.voice_operation_receipts from public, anon, authenticated;
grant select, insert, update on public.voice_operation_receipts to service_role;
