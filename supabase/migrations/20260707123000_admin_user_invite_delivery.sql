-- Admin-created users receive a Supabase Auth invite and the admin panel tracks delivery.

alter table public.admin_users
  add column if not exists phone text,
  add column if not exists invite_status text not null default 'not_sent',
  add column if not exists invite_error text,
  add column if not exists invited_at timestamptz,
  add column if not exists invited_by_admin_user_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_invite_status_check'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_invite_status_check
      check (invite_status in ('not_sent', 'sent', 'failed', 'linked_existing'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_invited_by_admin_user_id_fkey'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_invited_by_admin_user_id_fkey
      foreign key (invited_by_admin_user_id)
      references public.admin_users(id)
      on delete set null;
  end if;
end $$;

create index if not exists admin_users_invite_status_idx
  on public.admin_users(invite_status);

