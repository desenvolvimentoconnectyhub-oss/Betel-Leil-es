create table if not exists public.advisory_contracts (
  id uuid primary key default gen_random_uuid(),
  investor_id uuid references public.investor_profiles(id) on delete set null,
  opportunity_id uuid references public.auction_opportunities(id) on delete set null,
  contract_code text unique,
  status text not null default 'draft',
  contract_type text not null default 'advisory_authorization',
  signer_name text,
  signer_email text,
  max_authorized_bid numeric(14, 2),
  authorized_until timestamptz,
  signed_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists advisory_contracts_investor_id_idx
  on public.advisory_contracts(investor_id);

create index if not exists advisory_contracts_opportunity_id_idx
  on public.advisory_contracts(opportunity_id);

create index if not exists advisory_contracts_status_idx
  on public.advisory_contracts(status);

drop trigger if exists advisory_contracts_set_updated_at on public.advisory_contracts;

create trigger advisory_contracts_set_updated_at
  before update on public.advisory_contracts
  for each row execute function public.set_updated_at();

alter table public.advisory_contracts enable row level security;

drop policy if exists advisory_contracts_service_role_all on public.advisory_contracts;

create policy advisory_contracts_service_role_all
  on public.advisory_contracts
  for all
  to service_role
  using (true)
  with check (true);
