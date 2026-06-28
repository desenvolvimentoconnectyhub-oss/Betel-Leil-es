-- Switch future WhatsApp runtime records to ConnectyHub without migrating legacy provider data.
-- Existing legacy provider rows remain untouched until an operator confirms the instance mapping.

alter table if exists public.whatsapp_instances
  alter column provider set default 'connectyhub';

alter table if exists public.whatsapp_webhook_events
  alter column event_type set default 'connectyhub_event';

create index if not exists whatsapp_instances_provider_instance_id_idx
  on public.whatsapp_instances(provider, provider_instance_id)
  where provider_instance_id is not null;
