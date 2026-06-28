-- Admin invitation flow.
-- Admins can be pre-created in public.admin_users and linked to Supabase Auth
-- automatically on first login when the email matches.

create or replace function public.claim_admin_user_by_email()
returns table (
  admin_user_id uuid,
  display_name text,
  email text,
  role text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or current_email = '' then
    return;
  end if;

  update public.admin_users
  set auth_user_id = auth.uid(),
      updated_at = now()
  where auth_user_id is null
    and status = 'active'
    and lower(public.admin_users.email) = current_email;

  return query
  select
    admin_users.id,
    admin_users.display_name,
    admin_users.email,
    admin_users.role,
    admin_users.status
  from public.admin_users
  where admin_users.auth_user_id = auth.uid()
    and admin_users.status = 'active'
  limit 1;
end;
$$;

revoke all on function public.claim_admin_user_by_email() from public;
grant execute on function public.claim_admin_user_by_email() to authenticated;
