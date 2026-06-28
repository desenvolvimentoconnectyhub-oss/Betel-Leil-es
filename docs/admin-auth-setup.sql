-- Betel AI - primeiro admin
-- Rode este arquivo no SQL Editor do Supabase depois de criar o usuario em Authentication > Users.
--
-- 1. Supabase Dashboard > Authentication > Users > Add user
-- 2. Use o mesmo email abaixo e defina uma senha temporaria.
-- 3. Volte aqui, ajuste admin_email/admin_name e execute.

do $$
declare
  admin_email text := 'connectyhub01@gmail.com';
  admin_name text := 'Magno Macedo';
  admin_auth_id uuid;
  org_id uuid;
begin
  select id
    into admin_auth_id
  from auth.users
  where lower(email) = lower(admin_email)
  order by created_at desc
  limit 1;

  if admin_auth_id is null then
    raise exception 'Crie primeiro o usuario % em Authentication > Users.', admin_email;
  end if;

  select id
    into org_id
  from public.admin_organizations
  where name = 'Betel Leiloes'
  order by created_at asc
  limit 1;

  if org_id is null then
    insert into public.admin_organizations (name, organization_type, status, plan_key, notes)
    values ('Betel Leiloes', 'internal', 'active', 'internal', 'Organizacao administrativa principal da Betel AI.')
    returning id into org_id;
  end if;

  insert into public.admin_users (
    organization_id,
    auth_user_id,
    display_name,
    email,
    role,
    status,
    permissions
  )
  values (
    org_id,
    admin_auth_id,
    admin_name,
    admin_email,
    'owner',
    'active',
    jsonb_build_object('all', true)
  )
  on conflict (auth_user_id) do update
  set
    organization_id = excluded.organization_id,
    display_name = excluded.display_name,
    email = excluded.email,
    role = 'owner',
    status = 'active',
    permissions = excluded.permissions,
    updated_at = now();
end $$;
