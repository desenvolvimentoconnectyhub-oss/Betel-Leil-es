-- No historical timestamps are backfilled: continuous observation starts now.
alter table public.whatsapp_instances
  add column if not exists connection_observed_at timestamptz,
  add column if not exists disconnected_since timestamptz,
  add column if not exists lifecycle_archived_at timestamptz,
  add column if not exists lifecycle_archive_reason text,
  add column if not exists lifecycle_daily_checked_on date;

insert into public.app_config(key, value, description, is_secret)
values ('BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY', '{"enabled":true,"runTimeLocal":"00:30","timezone":"America/Sao_Paulo","trialHoldUntil":null,"source":"ConnectyHub production 2026-09-14; Betel scale/active"}',
  'Limpeza diaria local alinhada a ConnectyHub. trialHoldUntil preserva eventual carencia comercial; a Betel verificada esta fora de trial. Ausencia remota e sincronizada independentemente da janela.', false)
on conflict (key) do nothing;

-- Installation does not perform a catch-up deletion during the day.
insert into public.app_config(key,value,description,is_secret)
values ('BETEL_WHATSAPP_INSTANCE_CLEANUP_LAST_DATE', (now() at time zone 'America/Sao_Paulo')::date::text,
  'Ultima janela diaria de limpeza de instancias processada pela Betel.', false)
on conflict (key) do nothing;

create or replace function public.claim_betel_whatsapp_daily_cleanup()
returns boolean language plpgsql security definer set search_path = public as $$
declare v_policy jsonb; v_local timestamp; v_last text;
begin
  perform pg_advisory_xact_lock(hashtext('betel-whatsapp-daily-cleanup'));
  begin
    select value::jsonb into v_policy from app_config where key = 'BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY';
    v_local := now() at time zone (v_policy->>'timezone');
    if not coalesce((v_policy->>'enabled')::boolean,false)
       or v_local is null or v_local::time < (v_policy->>'runTimeLocal')::time
       or (v_policy->>'trialHoldUntil' is not null and now() < (v_policy->>'trialHoldUntil')::timestamptz) then return false; end if;
  exception when others then return false;
  end;
  select value into v_last from app_config where key = 'BETEL_WHATSAPP_INSTANCE_CLEANUP_LAST_DATE';
  if v_last = v_local::date::text then return false; end if;
  insert into app_config(key,value,description,is_secret)
    values ('BETEL_WHATSAPP_INSTANCE_CLEANUP_LAST_DATE',v_local::date::text,'Ultima janela diaria de limpeza de instancias processada pela Betel.',false)
    on conflict (key) do update set value = excluded.value, updated_at = now();
  return true;
end;
$$;
revoke all on function public.claim_betel_whatsapp_daily_cleanup() from public, anon, authenticated;
grant execute on function public.claim_betel_whatsapp_daily_cleanup() to service_role;

-- Serialize observations and pointer invalidation. Only this Betel database's
-- ConnectyHub rows are eligible. Provider resources and conversations are untouched.
create or replace function public.observe_betel_whatsapp_instance(
  p_provider_instance_id text, p_observation text, p_observed_at timestamptz, p_daily_cleanup boolean default false
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r public.whatsapp_instances%rowtype;
  v_since timestamptz;
  v_reason text;
  v_raw text;
  v_policy jsonb;
  v_local timestamp;
  v_daily_due boolean := false;
  v_archived boolean := false;
  v_count integer := 0;
  v_system_cleared integer;
  v_global_cleared integer;
begin
  if p_observation not in ('connected','disconnected','unknown','missing')
     or p_observed_at is null or p_observed_at > now() + interval '1 minute' then
    raise exception 'Invalid instance observation';
  end if;
  select value into v_raw from app_config where key = 'BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY';
  begin
    v_policy := v_raw::jsonb;
    v_local := p_observed_at at time zone (v_policy->>'timezone');
    v_daily_due := p_daily_cleanup and coalesce((v_policy->>'enabled')::boolean,false)
      and v_local::time >= (v_policy->>'runTimeLocal')::time
      and (v_policy->>'trialHoldUntil' is null or p_observed_at >= (v_policy->>'trialHoldUntil')::timestamptz);
  exception when others then v_daily_due := false;
  end;
  for r in select * from whatsapp_instances
    where provider = 'connectyhub' and provider_instance_id = p_provider_instance_id
    for update
  loop
    if r.status in ('archived','deleted') then
      v_archived := true;
      continue;
    end if;
    if r.connection_observed_at is not null and p_observed_at <= r.connection_observed_at then continue; end if;
    v_count := v_count + 1;
    v_reason := null;
    v_since := null;
    if p_observation = 'missing' then v_reason := 'provider_instance_missing'; end if;
    if p_observation = 'disconnected' then
      v_since := case when r.status = 'disconnected'
        and r.connection_observed_at >= p_observed_at - interval '45 minutes'
        then coalesce(r.disconnected_since, p_observed_at) else p_observed_at end;
      if v_daily_due and (r.lifecycle_daily_checked_on is null or r.lifecycle_daily_checked_on < v_local::date) then
        v_reason := 'daily_confirmed_disconnection';
      end if;
    end if;
    update whatsapp_instances set
      status = case when v_reason is not null then 'archived' else p_observation end,
      connection_observed_at = p_observed_at,
      last_seen_at = p_observed_at,
      disconnected_since = v_since,
      lifecycle_daily_checked_on = case when v_daily_due and p_observation in ('connected','disconnected') then v_local::date else lifecycle_daily_checked_on end,
      connected_at = case when p_observation = 'connected' then coalesce(connected_at,p_observed_at) else null end,
      lifecycle_archived_at = case when v_reason is not null then p_observed_at else null end,
      lifecycle_archive_reason = v_reason
    where id = r.id;
    if v_reason is not null then
      v_archived := true;
      update app_config set value = '', updated_at = now()
        where lower(key) = 'betel_system_whatsapp_instance_id'
        and value in (r.id::text, r.provider_instance_id);
      get diagnostics v_system_cleared = row_count;
      if v_system_cleared > 0 then
        update app_config set value = '', updated_at = now()
          where lower(key) = 'betel_system_whatsapp_agent_key' and value = r.agent_key;
      end if;
      update app_config set value = '', updated_at = now()
        where lower(key) in ('betel_global_whatsapp_instance_id','betel_global_connectyhub_instance_id','betel_willian_connectyhub_instance_id')
        and value in (r.id::text,r.provider_instance_id);
      get diagnostics v_global_cleared = row_count;
      if v_global_cleared > 0 then
        update app_config set value = '', updated_at = now()
          where lower(key) in ('betel_global_whatsapp_instance_name','betel_global_connectyhub_instance_name','betel_willian_connectyhub_instance_name')
          and value = r.instance_name;
      end if;
    end if;
  end loop;
  return jsonb_build_object('archived',v_archived,'observed',v_count);
end;
$$;
revoke all on function public.observe_betel_whatsapp_instance(text,text,timestamptz,boolean) from public, anon, authenticated;
grant execute on function public.observe_betel_whatsapp_instance(text,text,timestamptz,boolean) to service_role;

-- Late webhooks/status writes cannot resurrect an archived provider identity.
create or replace function public.guard_betel_whatsapp_instance_lifecycle()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.provider_instance_id is distinct from old.provider_instance_id then
    new.connection_observed_at := null;
    new.disconnected_since := null;
    new.lifecycle_archived_at := null;
    new.lifecycle_archive_reason := null;
    new.lifecycle_daily_checked_on := null;
  elsif new.status is distinct from old.status
    and new.connection_observed_at is not distinct from old.connection_observed_at then
    -- A webhook transition received while a poll is in flight wins over that poll.
    new.connection_observed_at := clock_timestamp();
  end if;
  if old.provider = 'connectyhub' and old.status in ('archived','deleted')
     and new.provider_instance_id is not distinct from old.provider_instance_id then
    new.status := old.status;
    new.connected_at := null;
    new.lifecycle_archived_at := old.lifecycle_archived_at;
    new.lifecycle_archive_reason := old.lifecycle_archive_reason;
  end if;
  if new.status <> 'disconnected' then new.disconnected_since := null; end if;
  return new;
end;
$$;
drop trigger if exists guard_betel_whatsapp_instance_lifecycle on public.whatsapp_instances;
create trigger guard_betel_whatsapp_instance_lifecycle before update on public.whatsapp_instances
for each row execute function public.guard_betel_whatsapp_instance_lifecycle();
