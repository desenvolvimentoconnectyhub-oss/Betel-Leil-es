-- Run inside a transaction after the migration, then ROLLBACK all fixtures.
do $$
declare
  v_id uuid := gen_random_uuid();
  v_other uuid := gen_random_uuid();
  v_provider text := 'lifecycle-fixture-' || gen_random_uuid()::text;
  v_keep text;
  v_result jsonb;
begin
  assert not has_function_privilege('anon','public.observe_betel_whatsapp_instance(text,text,timestamptz,boolean)','execute'), 'anonymous mutation permission';
  assert not has_function_privilege('authenticated','public.claim_betel_whatsapp_daily_cleanup()','execute'), 'authenticated cleanup permission';
  insert into whatsapp_instances(id,provider,instance_name,provider_instance_id,status)
    values (v_id,'connectyhub',v_provider,v_provider,'draft'),
           (v_other,'other-provider',v_provider,v_provider,'connected');
  perform observe_betel_whatsapp_instance(v_provider,'disconnected','2026-09-10 03:29:59Z',true);
  assert (select status = 'disconnected' from whatsapp_instances where id=v_id), 'before 00:30 must preserve';
  assert (select disconnected_since is not null from whatsapp_instances where id=v_id), 'disconnect observation tracked';
  perform observe_betel_whatsapp_instance(v_provider,'connected','2026-09-10 03:30:00Z',true);
  assert (select status = 'connected' and disconnected_since is null from whatsapp_instances where id=v_id), 'connected must survive and reset timer';
  perform observe_betel_whatsapp_instance(v_provider,'disconnected','2026-09-10 04:00:00Z',true);
  assert (select status = 'disconnected' from whatsapp_instances where id=v_id), 'daily sweep cannot run twice for same row';
  perform observe_betel_whatsapp_instance(v_provider,'unknown','2026-09-10 04:01:00Z',true);
  assert (select status = 'unknown' and disconnected_since is null from whatsapp_instances where id=v_id), 'unknown is not disconnect continuity';
  perform observe_betel_whatsapp_instance(v_provider,'connected','2026-09-11 03:29:00Z',false);
  perform observe_betel_whatsapp_instance(v_provider,'missing','2026-09-11 03:28:00Z',false);
  assert (select status = 'connected' from whatsapp_instances where id=v_id), 'stale missing response must lose to newer connection';

  select value into v_keep from app_config where key='BETEL_GLOBAL_WHATSAPP_INSTANCE_ID';
  update app_config set value=v_id::text where key='BETEL_SYSTEM_WHATSAPP_INSTANCE_ID';
  perform observe_betel_whatsapp_instance(v_provider,'disconnected','2026-09-11 03:30:00Z',true);
  assert (select status = 'archived' and lifecycle_archive_reason='daily_confirmed_disconnection' from whatsapp_instances where id=v_id), 'daily boundary must archive confirmed disconnected';
  assert (select value = '' from app_config where key='BETEL_SYSTEM_WHATSAPP_INSTANCE_ID'), 'obsolete system pointer must clear';
  assert (select value is not distinct from v_keep from app_config where key='BETEL_GLOBAL_WHATSAPP_INSTANCE_ID'), 'unrelated/new global pointer must survive';
  assert (select status = 'connected' from whatsapp_instances where id=v_other), 'other provider must survive';
  update whatsapp_instances set status='connected' where id=v_id;
  assert (select status = 'archived' from whatsapp_instances where id=v_id), 'late webhook must not resurrect';
  v_result := observe_betel_whatsapp_instance(v_provider,'missing','2026-09-12 03:30:00Z',true);
  assert (v_result->>'observed')::int=0 and (v_result->>'archived')::boolean, 'repeat archive must be idempotent';

  update whatsapp_instances set provider_instance_id=v_provider || '-new',status='draft' where id=v_id;
  assert (select lifecycle_archived_at is null and lifecycle_daily_checked_on is null from whatsapp_instances where id=v_id), 'explicit new provider identity must reset lifecycle';
  v_provider := v_provider || '-new';
  update app_config set value=jsonb_set(value::jsonb,'{trialHoldUntil}',to_jsonb('2026-10-01T00:00:00Z'::text))::text where key='BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY';
  perform observe_betel_whatsapp_instance(v_provider,'disconnected','2026-09-12 03:30:00Z',true);
  assert (select status = 'disconnected' from whatsapp_instances where id=v_id), 'commercial grace must preserve disconnected';
  perform observe_betel_whatsapp_instance(v_provider,'missing','2026-09-12 03:31:00Z',false);
  assert (select status = 'archived' from whatsapp_instances where id=v_id), 'authoritative absence independent of grace and daily window';

  update app_config set value='{"enabled":true,"timezone":"America/Sao_Paulo","runTimeLocal":"00:00","trialHoldUntil":null}' where key='BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY';
  update app_config set value='2000-01-01' where key='BETEL_WHATSAPP_INSTANCE_CLEANUP_LAST_DATE';
  assert claim_betel_whatsapp_daily_cleanup(), 'first daily claim';
  assert not claim_betel_whatsapp_daily_cleanup(), 'daily claim must be idempotent';
end;
$$;
select 'PASS: daily boundary, connected/unknown, ordering, ownership, pointer CAS, grace, idempotency and late webhook' as lifecycle_regressions;
