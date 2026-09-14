-- Betel is a single-account deployment: leads have a globally unique phone,
-- not an organization_id. Bind destructive access to its existing internal account.
create table public.whatsapp_reset_account (
 singleton boolean primary key default true check(singleton),
 organization_id uuid not null references public.admin_organizations(id)
);
do $$ begin
 if (select count(*) from public.admin_organizations where organization_type='internal' and status='active')<>1 then
  raise exception 'RESET_ACCOUNT_AMBIGUOUS';
 end if;
 insert into public.whatsapp_reset_account(organization_id)
 select id from public.admin_organizations where organization_type='internal' and status='active';
end $$;

create table public.whatsapp_lead_reset_jobs (
 id uuid primary key default gen_random_uuid(),
 target_lead_id uuid not null unique,
 target_conversation_id uuid not null,
 organization_id uuid not null,
 requested_by uuid not null,
 contact_hash text not null,
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 assets jsonb not null default '[]',
 counts jsonb not null default '{}'
);
create table public.whatsapp_lead_reset_fences (
 contact_hash text primary key,
 reset_at timestamptz not null,
 reopened_at timestamptz
);
create table public.whatsapp_lead_reset_message_ids (
 contact_hash text not null,
 message_hash text not null,
 primary key(contact_hash,message_hash)
);
create table public.whatsapp_lead_work_leases (
 id uuid primary key default gen_random_uuid(), contact_hash text not null,
 expires_at timestamptz not null default (clock_timestamp()+interval '1 hour')
);
create index on public.whatsapp_lead_work_leases(contact_hash);
do $$ declare t text; begin
 foreach t in array array['whatsapp_reset_account','whatsapp_lead_reset_jobs','whatsapp_lead_reset_fences','whatsapp_lead_reset_message_ids','whatsapp_lead_work_leases'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create function public.can_reset_betel_lead(p_actor uuid) returns boolean
language sql security definer set search_path=public as $$
 select exists(select 1 from admin_users u join whatsapp_reset_account a on a.organization_id=u.organization_id
 join admin_organizations o on o.id=a.organization_id
 where u.id=p_actor and u.role='owner' and u.status='active' and o.status='active');
$$;

-- All intake and work paths acquire a lease before reading/modifying a lead.
-- Reset and lease acquisition share a per-contact transaction lock.
create function public.begin_betel_lead_work(p_phone text default null,p_lead uuid default null,
 p_conversation uuid default null,p_provider_instance text default null,p_mode text default 'work',
 p_occurred_at timestamptz default null,p_message_id text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare phone text; h text; f whatsapp_lead_reset_fences; token uuid;
begin
 if p_mode not in ('work','inbound','outbound','history') then raise exception 'RESET_INVALID_MODE'; end if;
 if p_mode='work' then
  select l.phone into phone from whatsapp_leads l where l.id=p_lead
   and (p_conversation is null or exists(select 1 from whatsapp_conversations c where c.id=p_conversation and c.lead_id=l.id));
  if phone is null then raise exception 'RESET_STALE_WORK'; end if;
 else
  if not exists(select 1 from whatsapp_instances where provider_instance_id=p_provider_instance) then raise exception 'RESET_INSTANCE_SCOPE'; end if;
  phone:=regexp_replace(coalesce(p_phone,''),'[^0-9]','','g');
  if length(phone)<10 then raise exception 'RESET_PHONE_REQUIRED'; end if;
 end if;
 h:=md5(regexp_replace(phone,'[^0-9]','','g'));
 perform pg_advisory_xact_lock(hashtextextended(h,914));
 if p_mode='work' and not exists(select 1 from whatsapp_leads where id=p_lead) then raise exception 'RESET_STALE_WORK'; end if;
 select * into f from whatsapp_lead_reset_fences where contact_hash=h;
 if found and p_mode<>'work' then
  if p_occurred_at is null or p_occurred_at<=f.reset_at
    or exists(select 1 from whatsapp_lead_reset_message_ids where contact_hash=h and message_hash=md5(regexp_replace(coalesce(p_message_id,''),'^.*:',''))) then
   raise exception 'RESET_OLD_MESSAGE';
  end if;
  if f.reopened_at is null then
   if p_mode<>'inbound' or nullif(p_message_id,'') is null then raise exception 'RESET_WAIT_NEW_CONTACT'; end if;
   update whatsapp_lead_reset_fences set reopened_at=clock_timestamp() where contact_hash=h;
  end if;
 end if;
 insert into whatsapp_lead_work_leases(contact_hash) values(h) returning id into token;
 return token;
end $$;

create function public.betel_reset_json_references(p_value jsonb,p_ids text[]) returns boolean
language sql immutable set search_path=public as $$
 select exists(select 1 from jsonb_path_query(coalesce(p_value,'{}'),'strict $.** ? (@.type() == "string")') v
 where v#>>'{}'=any(p_ids));
$$;

create function public.reset_betel_whatsapp_lead(p_actor uuid,p_lead uuid,p_conversation uuid,p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare l whatsapp_leads; job whatsapp_lead_reset_jobs; h text; cids uuid[]; mids uuid[]; eids uuid[]; rids uuid[];
 refs text[]; v_assets jsonb; t record; n integer; v_counts jsonb:='{}'; reset_at timestamptz:=clock_timestamp();
begin
 if not public.can_reset_betel_lead(p_actor) then raise exception 'RESET_MASTER_REQUIRED'; end if;
 if p_confirm is distinct from true or p_lead is null or p_conversation is null then raise exception 'RESET_CONFIRM_REQUIRED'; end if;
 select * into job from whatsapp_lead_reset_jobs where target_lead_id=p_lead;
 if found then
  if job.target_conversation_id<>p_conversation then raise exception 'RESET_SCOPE_MISMATCH'; end if;
  return jsonb_build_object('jobId',job.id,'deleted',true,'complete',job.completed_at is not null);
 end if;
 select * into l from whatsapp_leads where id=p_lead;
 if not found then raise exception 'RESET_LEAD_NOT_FOUND'; end if;
 h:=md5(regexp_replace(l.phone,'[^0-9]','','g'));
 perform pg_advisory_xact_lock(hashtextextended(h,914));
 if not exists(select 1 from whatsapp_conversations c join whatsapp_instances i on i.id=c.instance_id
   where c.id=p_conversation and c.lead_id=p_lead) then raise exception 'RESET_SCOPE_MISMATCH'; end if;
 if exists(select 1 from whatsapp_lead_work_leases where contact_hash=h and expires_at>clock_timestamp()) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
 -- Defensive checks also cover older queue consumers during a rolling deployment.
 if exists(select 1 from whatsapp_follow_ups where lead_id=p_lead and status='running')
 or exists(select 1 from agent_runs where whatsapp_lead_id=p_lead and status in ('running','processing','sending')) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
 select coalesce(array_agg(id),'{}') into cids from whatsapp_conversations where lead_id=p_lead;
 select coalesce(array_agg(id),'{}'),coalesce(array_agg(webhook_event_id) filter(where webhook_event_id is not null),'{}') into mids,eids
 from whatsapp_conversation_messages where lead_id=p_lead or conversation_id=any(cids);
 select coalesce(array_agg(id),'{}') into rids from agent_runs where whatsapp_lead_id=p_lead or whatsapp_conversation_id=any(cids);
 refs:=array[p_lead::text]||cids::text[]||mids::text[]||eids::text[]||rids::text[];
 if exists(select 1 from communication_outbox where status in ('running','processing','sending') and betel_reset_json_references(payload,refs)) then raise exception 'RESET_ATTENDANCE_BUSY'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('key',storage_key,'done',false)),'[]') into v_assets from (
  select storage_key from whatsapp_lead_files where lead_id=p_lead or conversation_id=any(cids)
  union select storage_key from generated_media where lead_id=p_lead or conversation_id=any(cids) or message_id=any(mids)
 ) a where nullif(storage_key,'') is not null and storage_key not like 'whatsapp/group-invite/%';
 -- A referenced object is shared only if another lead still owns it: never delete it.
 select coalesce(jsonb_agg(a),'[]') into v_assets from jsonb_array_elements(v_assets) a
 where not exists(select 1 from whatsapp_lead_files f where f.storage_key=a->>'key' and f.lead_id<>p_lead)
 and not exists(select 1 from generated_media g where g.storage_key=a->>'key' and g.lead_id<>p_lead);
 insert into whatsapp_lead_reset_jobs(target_lead_id,target_conversation_id,organization_id,requested_by,contact_hash,assets)
 select p_lead,p_conversation,organization_id,p_actor,h,v_assets from whatsapp_reset_account returning * into job;
 insert into whatsapp_lead_reset_fences(contact_hash,reset_at) values(h,reset_at)
 on conflict(contact_hash) do update set reset_at=excluded.reset_at,reopened_at=null;
 insert into whatsapp_lead_reset_message_ids(contact_hash,message_hash)
 select h,md5(regexp_replace(provider_message_id,'^.*:','')) from whatsapp_conversation_messages
 where (lead_id=p_lead or conversation_id=any(cids)) and provider_message_id is not null on conflict do nothing;
 -- Explicit JSON-only associations; preserve company configuration, shared assets,
 -- financial totals and the WhatsApp sessions themselves.
 delete from communication_outbox where run_id=any(rids) or betel_reset_json_references(payload,refs);
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('outbox',n);
 delete from agent_runtime_events where run_id=any(rids) or betel_reset_json_references(payload,refs)
   or (event_type='connectyhub_webhook' and coalesce(payload#>>'{data,message,chatid}',payload#>>'{data,chat,wa_chatid}')=l.phone||'@s.whatsapp.net');
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('runtimeEvents',n);
 delete from intelligence_memory where scope_id=any(refs||array[l.phone,l.phone||'@s.whatsapp.net']) or betel_reset_json_references(value,refs);
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('memory',n);
 -- Include all live/archived conversations and current schema's direct dependents,
 -- including SET NULL foreign keys. This never follows shared parent records.
 for t in select table_name,string_agg(format('%I=any(%L::uuid[])',column_name,
   case when column_name='lead_id' then array[p_lead] when column_name='conversation_id' then cids else mids end),' or ') cond
  from information_schema.columns where table_schema='public' and column_name in ('lead_id','conversation_id','message_id')
  and data_type='uuid' and table_name not in ('whatsapp_conversations','whatsapp_conversation_messages')
  group by table_name
 loop
  execute format('delete from public.%I where %s',t.table_name,t.cond);
  get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object(t.table_name,n);
 end loop;
 -- Run cost records retain their numerical accounting, but lose conversational data.
 update agent_runs set whatsapp_lead_id=null,whatsapp_conversation_id=null,webhook_event_id=null,
  input_payload='{}',output_payload='{}',metadata='{}',error_message=null,
  status=case when status in ('queued','scheduled','pending') then 'cancelled' else status end where id=any(rids);
 delete from whatsapp_conversation_messages where lead_id=p_lead or conversation_id=any(cids);
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('messages',n);
 delete from whatsapp_conversations where id=any(cids);
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('conversations',n);
 delete from whatsapp_webhook_events where id=any(eids) or from_phone=l.phone
   or coalesce(payload#>>'{data,message,chatid}',payload#>>'{data,chat,wa_chatid}')=l.phone||'@s.whatsapp.net';
 get diagnostics n=row_count; v_counts:=v_counts||jsonb_build_object('webhookEvents',n);
 delete from whatsapp_leads where id=p_lead;
 update whatsapp_lead_reset_jobs set counts=v_counts,
  completed_at=case when jsonb_array_length(v_assets)=0 then clock_timestamp() else null end where id=job.id;
 return jsonb_build_object('jobId',job.id,'deleted',true,'complete',jsonb_array_length(v_assets)=0);
end $$;

revoke all on function public.can_reset_betel_lead(uuid),public.begin_betel_lead_work(text,uuid,uuid,text,text,timestamptz,text),public.betel_reset_json_references(jsonb,text[]),public.reset_betel_whatsapp_lead(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.can_reset_betel_lead(uuid),public.begin_betel_lead_work(text,uuid,uuid,text,text,timestamptz,text),public.reset_betel_whatsapp_lead(uuid,uuid,uuid,boolean) to service_role;

create function public.begin_betel_outbox_work(p_code text) returns uuid
language plpgsql security definer set search_path=public as $$
declare o communication_outbox; target uuid;
begin
 select * into o from communication_outbox where message_code=p_code;
 if not found then raise exception 'RESET_STALE_OUTBOX'; end if;
 select l.id into target from whatsapp_leads l where betel_reset_json_references(o.payload,array[l.id::text])
 or exists(select 1 from whatsapp_conversations c where c.lead_id=l.id and betel_reset_json_references(o.payload,array[c.id::text]))
 or exists(select 1 from agent_runs r where r.id=o.run_id and r.whatsapp_lead_id=l.id) limit 1;
 if target is null then return null; end if;
 return begin_betel_lead_work(p_lead=>target);
end $$;
revoke all on function public.begin_betel_outbox_work(text) from public,anon,authenticated;
grant execute on function public.begin_betel_outbox_work(text) to service_role;
