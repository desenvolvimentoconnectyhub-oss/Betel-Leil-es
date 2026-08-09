create table if not exists public.property_qualification_feedback (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references public.property_qualification_dossiers(id) on delete cascade,
  opportunity_id uuid references public.auction_opportunities(id) on delete cascade,
  admin_user_id uuid references public.admin_users(id) on delete set null,
  reviewer_name text,
  decision text not null default 'pendente',
  field_key text,
  previous_value jsonb not null default '{}'::jsonb,
  corrected_value jsonb not null default '{}'::jsonb,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint property_qualification_feedback_decision_check
    check (decision in ('confirmado', 'corrigido', 'reprovado', 'pendente'))
);

create index if not exists property_qualification_feedback_dossier_idx
  on public.property_qualification_feedback(dossier_id, created_at desc);

create index if not exists property_qualification_feedback_opportunity_idx
  on public.property_qualification_feedback(opportunity_id, created_at desc);

create index if not exists property_qualification_feedback_decision_idx
  on public.property_qualification_feedback(decision);

alter table public.property_qualification_feedback enable row level security;

drop policy if exists property_qualification_feedback_service_role_all on public.property_qualification_feedback;
create policy property_qualification_feedback_service_role_all
  on public.property_qualification_feedback
  for all
  to service_role
  using (true)
  with check (true);
