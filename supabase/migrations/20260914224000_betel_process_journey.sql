-- Preserve future process transitions in the existing lead file, without
-- backfilling old events or describing system decisions as actions by a person.
create function public.record_betel_process_transition() returns trigger
language plpgsql security definer set search_path=public as $$
declare current_row jsonb:=to_jsonb(new); previous_row jsonb;
 lead uuid; current_state jsonb; previous_state jsonb; process_label text;
begin
 if TG_OP='UPDATE' then previous_row:=to_jsonb(old); else previous_row:='{}'::jsonb; end if;
 lead := nullif(current_row->>'lead_id','')::uuid;
 if lead is null then return new; end if;
 if TG_TABLE_NAME='whatsapp_sdr_appointments' then
  process_label:='Agendamento';
  current_state:=jsonb_build_object('status',current_row->>'status','confirmacao',current_row->>'lead_confirmation_status','horario',current_row->>'scheduled_for');
  previous_state:=jsonb_build_object('status',previous_row->>'status','confirmacao',previous_row->>'lead_confirmation_status','horario',previous_row->>'scheduled_for');
 else
  process_label:='Qualificacao';
  current_state:=jsonb_build_object('etapa',current_row->>'crm_stage','classificacao',current_row->>'classification');
  previous_state:=jsonb_build_object('etapa',previous_row->>'crm_stage','classificacao',previous_row->>'classification');
 end if;
 if TG_OP='UPDATE' and current_state=previous_state then return new; end if;
 insert into whatsapp_lead_files(journey_event_id,lead_id,source,mime_type,metadata,expires_at)
 values(gen_random_uuid(),lead,'betel_process_stage','application/json',jsonb_build_object(
  'process',process_label,'recordId',new.id,'operation',lower(TG_OP),'before',case when TG_OP='INSERT' then null else previous_state end,
  'after',current_state,'origin','betel_process','actorConfirmed',false),now()+interval '90 days');
 return new;
end $$;
create trigger betel_appointment_journey after insert or update on public.whatsapp_sdr_appointments
 for each row execute function public.record_betel_process_transition();
create trigger betel_qualification_journey after insert or update on public.whatsapp_lead_profiles
 for each row execute function public.record_betel_process_transition();
revoke all on function public.record_betel_process_transition() from public,anon,authenticated;

create or replace function public.betel_recent_journey(p_leads uuid[],p_limit integer default 40)
returns setof public.whatsapp_lead_files language sql stable security definer set search_path=public as $$
 select f.* from whatsapp_lead_files f where f.id in (
  select recent.id from unnest(p_leads) requested(lead_id)
  cross join lateral (
   select id from whatsapp_lead_files
   where (lead_id=requested.lead_id or intended_lead_id=requested.lead_id)
    and source in ('betel_link_click','betel_page_view','betel_process_stage') and expires_at>now()
   order by created_at desc,id desc limit greatest(1,least(p_limit,100))
  ) recent
 ) order by f.created_at desc,f.id desc;
$$;
create or replace function public.prune_betel_journey() returns void language plpgsql security definer set search_path=public as $$
begin
 delete from whatsapp_lead_files where expires_at<now() and source in ('betel_link_click','betel_page_view','betel_process_stage');
 delete from betel_visitor_claims where expires_at<now();
 delete from betel_visitors where expires_at<now();
end $$;
