-- Deploy separately after local review. No existing analysis becomes public automatically.
create table if not exists public.property_market_publication_versions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.property_market_analyses(id),
  opportunity_code text not null,
  content_hash text not null,
  snapshot jsonb not null,
  reference_checks jsonb not null,
  approved_by text not null,
  created_at timestamptz not null default now(),
  unique (analysis_id,content_hash)
);
alter table public.property_market_publication_versions enable row level security;
revoke all on public.property_market_publication_versions from anon, authenticated;
grant select, insert on public.property_market_publication_versions to service_role;
create policy market_versions_service_read on public.property_market_publication_versions for select to service_role using (true);
create policy market_versions_service_insert on public.property_market_publication_versions for insert to service_role with check (true);
create or replace function public.prevent_market_version_mutation() returns trigger language plpgsql as $$
begin raise exception 'Approved market publication versions are immutable'; end;
$$;
create trigger immutable_market_publication before update or delete on public.property_market_publication_versions
for each row execute function public.prevent_market_version_mutation();
