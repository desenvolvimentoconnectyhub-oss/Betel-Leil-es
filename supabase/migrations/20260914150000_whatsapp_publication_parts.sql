create table if not exists public.whatsapp_publication_parts (
  id text primary key,
  campaign_id uuid not null references public.whatsapp_group_campaigns(id),
  target_id uuid not null references public.whatsapp_group_campaign_targets(id),
  provider_instance_id text not null,
  kind text not null check (kind in ('media', 'buttons', 'text')),
  content_hash text not null,
  status text not null check (status in ('processing', 'accepted', 'delivered', 'read', 'failed', 'uncertain')),
  attempt_count integer not null default 1,
  provider_message_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, target_id, kind)
);
create index if not exists whatsapp_publication_parts_ack on public.whatsapp_publication_parts(provider_instance_id, provider_message_id);
alter table public.whatsapp_publication_parts enable row level security;
revoke all on public.whatsapp_publication_parts from anon, authenticated;
grant select, insert, update on public.whatsapp_publication_parts to service_role;

create table if not exists public.whatsapp_publication_acknowledgements (
  provider_instance_id text not null,
  provider_message_id text not null,
  ack_level smallint not null check (ack_level in (2, 3)),
  updated_at timestamptz not null default now(),
  primary key (provider_instance_id, provider_message_id)
);
alter table public.whatsapp_publication_acknowledgements enable row level security;
revoke all on public.whatsapp_publication_acknowledgements from anon, authenticated;
grant select, insert, update on public.whatsapp_publication_acknowledgements to service_role;

create or replace function public.record_whatsapp_publication_ack(p_instance text, p_message text, p_level smallint)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_level not in (2, 3) then return; end if;
  insert into whatsapp_publication_acknowledgements(provider_instance_id, provider_message_id, ack_level)
  values(p_instance, p_message, p_level)
  on conflict(provider_instance_id, provider_message_id) do update
    set ack_level = greatest(whatsapp_publication_acknowledgements.ack_level, excluded.ack_level), updated_at = now();
  update whatsapp_publication_parts set status = case when p_level = 3 then 'read' else 'delivered' end, updated_at = now()
    where provider_instance_id = p_instance and provider_message_id = p_message
    and status in ('processing', 'accepted', 'uncertain', 'delivered');
end;
$$;
revoke all on function public.record_whatsapp_publication_ack(text,text,smallint) from public, anon, authenticated;
grant execute on function public.record_whatsapp_publication_ack(text,text,smallint) to service_role;
