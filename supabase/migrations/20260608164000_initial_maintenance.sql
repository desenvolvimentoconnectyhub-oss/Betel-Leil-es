create table if not exists public.app_config (
  key text primary key,
  value text,
  description text,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_config_set_updated_at on public.app_config;

create trigger app_config_set_updated_at
before update on public.app_config
for each row
execute function public.set_updated_at();

alter table public.app_config enable row level security;

drop policy if exists "app_config_service_role_all" on public.app_config;

create policy "app_config_service_role_all"
on public.app_config
for all
to service_role
using (true)
with check (true);

insert into public.app_config (key, value, description, is_secret)
values
  ('ai_provider', 'gemini', 'Provider LLM ativo para os agentes Betel AI.', false),
  ('gemini_model', 'gemini-2.5-flash', 'Modelo Gemini padrao para diagnosticos e agentes.', false)
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  is_secret = excluded.is_secret,
  updated_at = now();
