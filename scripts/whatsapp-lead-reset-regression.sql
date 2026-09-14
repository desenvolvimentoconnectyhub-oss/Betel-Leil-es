-- Run inside a transaction and always roll it back. No external sends or storage operations.
do $test$
declare actor uuid; outsider uuid:=gen_random_uuid(); inst uuid:=gen_random_uuid(); lid uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); cid2 uuid:=gen_random_uuid(); othercid uuid:=gen_random_uuid(); tok uuid; result jsonb;
begin
 select u.id into actor from admin_users u join whatsapp_reset_account a on a.organization_id=u.organization_id where u.role='owner' and u.status='active' limit 1;
 if actor is null then raise exception 'TEST_MASTER_MISSING'; end if;
 if public.can_reset_betel_lead(outsider) then raise exception 'TEST_UNKNOWN_ACTOR_ALLOWED'; end if;
 if has_function_privilege('authenticated','public.reset_betel_whatsapp_lead(uuid,uuid,uuid,boolean)','execute') or has_function_privilege('anon','public.reset_betel_whatsapp_lead(uuid,uuid,uuid,boolean)','execute') then raise exception 'TEST_PUBLIC_RESET_ACCESS'; end if;
 insert into whatsapp_instances(id,provider_instance_id,instance_name,status) values(inst,'codex-reset-sql-fixture','Reset SQL fixture','connected');
 insert into whatsapp_leads(id,phone,name) values(lid,'5500000000914','RESET SQL FIXTURE'),(other,'5500000000915','OTHER SQL FIXTURE');
 insert into whatsapp_conversations(id,lead_id,instance_id) values(cid,lid,inst),(cid2,lid,inst),(othercid,other,inst);
 insert into whatsapp_conversation_messages(conversation_id,lead_id,instance_id,direction,text,provider_message_id) values(cid,lid,inst,'inbound','fixture only','fixture-reset-old');
 insert into whatsapp_lead_profiles(lead_id) values(lid);
 insert into whatsapp_follow_ups(lead_id,conversation_id,instance_id) values(lid,cid,inst);
 tok:=begin_betel_lead_work(p_lead=>lid,p_conversation=>cid);
 begin perform reset_betel_whatsapp_lead(actor,lid,cid,true); raise exception 'TEST_BUSY_NOT_BLOCKED'; exception when others then if sqlerrm not like '%RESET_ATTENDANCE_BUSY%' then raise; end if; end;
 delete from whatsapp_lead_work_leases where id=tok;
 begin perform reset_betel_whatsapp_lead(actor,lid,othercid,true); raise exception 'TEST_SCOPE_NOT_BLOCKED'; exception when others then if sqlerrm not like '%RESET_SCOPE_MISMATCH%' then raise; end if; end;
 result:=reset_betel_whatsapp_lead(actor,lid,cid,true);
 if not (result->>'complete')::boolean then raise exception 'TEST_RESET_INCOMPLETE'; end if;
 if exists(select 1 from whatsapp_leads where id=lid) or exists(select 1 from whatsapp_conversations where lead_id=lid) or exists(select 1 from whatsapp_follow_ups where lead_id=lid) or exists(select 1 from whatsapp_lead_profiles where lead_id=lid) then raise exception 'TEST_RESIDUE'; end if;
 if not exists(select 1 from whatsapp_leads where id=other) or not exists(select 1 from whatsapp_instances where id=inst and status='connected') then raise exception 'TEST_ISOLATION'; end if;
 begin perform begin_betel_lead_work(p_phone=>'5500000000914',p_provider_instance=>'codex-reset-sql-fixture',p_mode=>'history',p_occurred_at=>clock_timestamp()+interval '1 second',p_message_id=>'new-fixture'); raise exception 'TEST_HISTORY_RECREATION'; exception when others then if sqlerrm not like '%RESET_WAIT_NEW_CONTACT%' then raise; end if; end;
 begin perform begin_betel_lead_work(p_phone=>'5500000000914',p_provider_instance=>'codex-reset-sql-fixture',p_mode=>'inbound',p_occurred_at=>clock_timestamp()+interval '1 second',p_message_id=>'fixture-reset-old'); raise exception 'TEST_REPLAY_ALLOWED'; exception when others then if sqlerrm not like '%RESET_OLD_MESSAGE%' then raise; end if; end;
 tok:=begin_betel_lead_work(p_phone=>'5500000000914',p_provider_instance=>'codex-reset-sql-fixture',p_mode=>'inbound',p_occurred_at=>clock_timestamp()+interval '1 second',p_message_id=>'new-fixture');
 if tok is null then raise exception 'TEST_NEW_CONTACT_BLOCKED'; end if;
end $test$;
