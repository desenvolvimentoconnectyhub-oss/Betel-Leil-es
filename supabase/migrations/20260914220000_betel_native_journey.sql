-- Betel owns its links and journey; no ConnectyHub CRM tables or identifiers.
create table public.betel_visitors (
 id uuid primary key default gen_random_uuid(), token_hash text not null unique,
 lead_id uuid references public.whatsapp_leads(id) on delete set null,
 consented_at timestamptz not null default now(), expires_at timestamptz not null,
 verified_at timestamptz, created_at timestamptz not null default now()
);
create table public.betel_tracked_links (
 id uuid primary key default gen_random_uuid(), dedup_key text not null unique,
 target_url text not null, label text not null, source text not null,
 intended_lead_id uuid references public.whatsapp_leads(id) on delete set null,
 conversation_id uuid references public.whatsapp_conversations(id) on delete set null,
 recipient_kind text not null check (recipient_kind in ('direct','group','channel','unknown')),
 context jsonb not null default '{}', created_at timestamptz not null default now()
);
alter table public.whatsapp_lead_files
 add column journey_event_id uuid unique,
 add column visitor_id uuid references public.betel_visitors(id) on delete set null,
 add column intended_lead_id uuid references public.whatsapp_leads(id) on delete set null,
 add column expires_at timestamptz;
create index whatsapp_lead_files_visitor on public.whatsapp_lead_files(visitor_id) where visitor_id is not null;
create index whatsapp_lead_files_intended on public.whatsapp_lead_files(intended_lead_id,created_at desc) where intended_lead_id is not null;
create index whatsapp_lead_files_expiry on public.whatsapp_lead_files(expires_at) where expires_at is not null;
create table public.betel_visitor_claims (
 id uuid primary key default gen_random_uuid(), visitor_id uuid not null references public.betel_visitors(id) on delete cascade,
 code text not null unique, lead_id uuid references public.whatsapp_leads(id) on delete cascade,
 message_id uuid references public.whatsapp_conversation_messages(id) on delete cascade,
 expires_at timestamptz not null default now() + interval '15 minutes', consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.betel_visitors enable row level security;
alter table public.betel_tracked_links enable row level security;
alter table public.betel_visitor_claims enable row level security;
revoke all on public.betel_visitors,public.betel_tracked_links,public.betel_visitor_claims from anon,authenticated;
grant all on public.betel_visitors,public.betel_tracked_links,public.betel_visitor_claims to service_role;

-- Called by server only, with one event UUID retained across database retries.
create function public.record_betel_link_click(p_link uuid,p_event uuid,p_visitor uuid default null,p_days integer default 90)
returns uuid language plpgsql security definer set search_path=public as $$
declare l betel_tracked_links; v betel_visitors; existing whatsapp_lead_files;
begin
 select * into l from betel_tracked_links where id=p_link;
 if not found then raise exception 'LINK_NOT_FOUND'; end if;
 select * into existing from whatsapp_lead_files where journey_event_id=p_event;
 if found then
  if existing.metadata->>'linkId' <> p_link::text then raise exception 'EVENT_SCOPE_MISMATCH'; end if;
  return existing.id;
 end if;
 select * into v from betel_visitors where id=p_visitor and expires_at>now()
  and not exists(select 1 from whatsapp_leads where id=betel_visitors.lead_id and opt_out=true);
 insert into whatsapp_lead_files(journey_event_id,lead_id,intended_lead_id,visitor_id,source,file_url,mime_type,metadata,expires_at)
 values(p_event,v.lead_id,l.intended_lead_id,v.id,'betel_link_click',l.target_url,'application/json',
   l.context || jsonb_build_object('linkId',l.id,'label',l.label,'origin',l.source,'recipientKind',l.recipient_kind,
    'actorConfirmed',v.lead_id is not null,'attribution',case when v.lead_id is null then 'anonymous' else 'verified_browser' end),
   now()+make_interval(days=>greatest(1,least(p_days,365))))
 on conflict(journey_event_id) do nothing;
 return (select id from whatsapp_lead_files where journey_event_id=p_event);
end $$;

create function public.betel_recent_journey(p_leads uuid[],p_limit integer default 40)
returns setof public.whatsapp_lead_files language sql stable security definer set search_path=public as $$
 select f.* from whatsapp_lead_files f where f.id in (
  select recent.id from unnest(p_leads) requested(lead_id)
  cross join lateral (
   select id from whatsapp_lead_files
   where (lead_id=requested.lead_id or intended_lead_id=requested.lead_id)
    and source in ('betel_link_click','betel_page_view') and expires_at>now()
   order by created_at desc,id desc limit greatest(1,least(p_limit,100))
  ) recent
 ) order by f.created_at desc,f.id desc;
$$;
revoke all on function public.betel_recent_journey(uuid[],integer) from public,anon,authenticated;
grant execute on function public.betel_recent_journey(uuid[],integer) to service_role;

-- Proof comes from an authenticated inbound WhatsApp message and then explicit
-- confirmation by the browser that requested the code. Recipient URLs are not proof.
create function public.capture_betel_visitor_claim() returns trigger language plpgsql security definer set search_path=public as $$
declare claim_code text;
begin
 if new.direction <> 'inbound' or new.author_type <> 'lead' or new.lead_id is null
  or new.payload #>> '{betel_identity,identityReliable}' is distinct from 'true'
  or coalesce(new.payload #>> '{betel_identity,chatId}','') like '%@g.us' then return new; end if;
 claim_code := substring(coalesce(new.text,'') from 'BETEL-([a-f0-9]{32})');
 if claim_code is not null then
  update betel_visitor_claims set lead_id=new.lead_id,message_id=new.id
  where code=claim_code and expires_at>now() and consumed_at is null and lead_id is null;
 end if;
 return new;
end $$;
create trigger capture_betel_visitor_claim after insert on public.whatsapp_conversation_messages
 for each row execute function public.capture_betel_visitor_claim();

create function public.confirm_betel_visitor(p_visitor uuid,p_claim uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare c betel_visitor_claims; v betel_visitors;
begin
 select * into v from betel_visitors where id=p_visitor and expires_at>now() for update;
 if not found then return false; end if;
 select * into c from betel_visitor_claims where id=p_claim and visitor_id=v.id and expires_at>now() for update;
 if not found or c.lead_id is null or c.message_id is null then return false; end if;
 if v.lead_id is not null and v.lead_id<>c.lead_id then raise exception 'IDENTITY_CONFLICT'; end if;
 if exists(select 1 from whatsapp_leads where id=c.lead_id and opt_out=true) then return false; end if;
 update betel_visitors set lead_id=c.lead_id,verified_at=now() where id=v.id;
 update betel_visitor_claims set consumed_at=coalesce(consumed_at,now()) where id=c.id;
 update whatsapp_lead_files set lead_id=c.lead_id,
  metadata=metadata||jsonb_build_object('actorConfirmed',true,'attribution','verified_browser','identityConfirmedAt',now(),'proofMessageId',c.message_id)
 where visitor_id=v.id and lead_id is null and expires_at>now();
 return true;
end $$;

create function public.prune_betel_journey() returns void language plpgsql security definer set search_path=public as $$
begin
 delete from whatsapp_lead_files where expires_at<now() and source in ('betel_link_click','betel_page_view');
 delete from betel_visitor_claims where expires_at<now();
 delete from betel_visitors where expires_at<now();
end $$;
revoke all on function public.record_betel_link_click(uuid,uuid,uuid,integer), public.confirm_betel_visitor(uuid,uuid),public.prune_betel_journey(),public.capture_betel_visitor_claim() from public,anon,authenticated;
grant execute on function public.record_betel_link_click(uuid,uuid,uuid,integer), public.confirm_betel_visitor(uuid,uuid),public.prune_betel_journey() to service_role;
