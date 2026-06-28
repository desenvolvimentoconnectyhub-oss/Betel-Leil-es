-- Admin access control for Betel AI.
-- Supabase Auth remains the source of passwords and sessions.
-- public.admin_users only stores role, status, and the link to auth.users.

alter table public.admin_users
  add column if not exists auth_user_id uuid,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_fkey'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_role_check'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_role_check
      check (role in ('owner', 'admin', 'manager', 'analyst', 'viewer'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_status_check'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_status_check
      check (status in ('active', 'invited', 'suspended', 'disabled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_auth_user_id_unique'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_auth_user_id_unique
      unique (auth_user_id);
  end if;
end $$;

create unique index if not exists admin_users_email_lower_unique
  on public.admin_users(lower(email))
  where email is not null;

create unique index if not exists admin_organizations_name_lower_unique
  on public.admin_organizations(lower(name));

alter table public.admin_users enable row level security;

drop policy if exists admin_users_self_read on public.admin_users;
create policy admin_users_self_read
  on public.admin_users
  for select
  to authenticated
  using (auth.uid() = auth_user_id and status = 'active');

drop policy if exists admin_users_service_role_all on public.admin_users;
create policy admin_users_service_role_all
  on public.admin_users
  for all
  to service_role
  using (true)
  with check (true);

create or replace function public.touch_admin_user_last_seen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.admin_users
  set last_seen_at = now(), updated_at = now()
  where auth_user_id = auth.uid()
    and status = 'active';
end;
$$;

grant execute on function public.touch_admin_user_last_seen() to authenticated;
