alter table public.investor_profiles
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists organization_name text,
  add column if not exists preferred_property_types text[] not null default '{}',
  add column if not exists owner_name text;

create index if not exists investor_profiles_status_idx
  on public.investor_profiles (status);

create index if not exists investor_profiles_risk_appetite_idx
  on public.investor_profiles (risk_appetite);
