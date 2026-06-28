alter table public.investor_profiles
  add column if not exists plan_key text not null default 'free',
  add column if not exists lifecycle_stage text not null default 'lead',
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists email_opt_in boolean not null default true,
  add column if not exists push_opt_in boolean not null default false,
  add column if not exists community_opt_in boolean not null default false,
  add column if not exists communication_frequency text not null default 'normal',
  add column if not exists full_access_until timestamptz;

update public.investor_profiles
set
  plan_key = case
    when lower(coalesce(status, '')) like '%ativo%' then 'premium'
    when lower(coalesce(status, '')) like '%active%' then 'premium'
    when lower(coalesce(status, '')) like '%piloto%' then 'pilot'
    when lower(coalesce(status, '')) like '%pilot%' then 'pilot'
    when lower(coalesce(status, '')) like '%onboarding%' then 'trial'
    else plan_key
  end,
  lifecycle_stage = case
    when lower(coalesce(status, '')) like '%ativo%' then 'client'
    when lower(coalesce(status, '')) like '%active%' then 'client'
    when lower(coalesce(status, '')) like '%piloto%' then 'client'
    when lower(coalesce(status, '')) like '%pilot%' then 'client'
    when lower(coalesce(status, '')) like '%onboarding%' then 'warm_lead'
    else lifecycle_stage
  end
where plan_key = 'free'
  and lower(coalesce(status, '')) similar to '%(ativo|active|piloto|pilot|onboarding)%';

create index if not exists investor_profiles_plan_key_idx
  on public.investor_profiles (plan_key);

create index if not exists investor_profiles_lifecycle_stage_idx
  on public.investor_profiles (lifecycle_stage);

create index if not exists investor_profiles_communication_optins_idx
  on public.investor_profiles (whatsapp_opt_in, email_opt_in, push_opt_in, community_opt_in);
