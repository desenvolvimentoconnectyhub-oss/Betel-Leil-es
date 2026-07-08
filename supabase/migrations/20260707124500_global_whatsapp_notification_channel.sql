-- Promote the currently connected WhatsApp instance to the global system notification channel.
-- Existing BETEL_WILLIAN_* values are kept for compatibility and copied to BETEL_GLOBAL_WHATSAPP_* when present.

with mappings(new_key, old_key, description) as (
  values
    (
      'BETEL_GLOBAL_WHATSAPP_INSTANCE_NAME',
      'BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME',
      'Nome da instancia ConnectyHub usada pelo WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_INSTANCE_ID',
      'BETEL_WILLIAN_CONNECTYHUB_INSTANCE_ID',
      'ID da instancia ConnectyHub usada pelo WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_PHONE_NUMBER',
      'BETEL_WILLIAN_WHATSAPP_PHONE_NUMBER',
      'Numero conectado ao WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME',
      'BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME',
      'Nome de exibicao do WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_PROFILE_IMAGE_URL',
      'BETEL_WILLIAN_WHATSAPP_PROFILE_IMAGE_URL',
      'Foto de perfil do WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_PROFILE_SYNCED_AT',
      'BETEL_WILLIAN_WHATSAPP_PROFILE_SYNCED_AT',
      'Data da ultima sincronizacao da foto do WhatsApp Global da Betel.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBER',
      'BETEL_SCRAPER_REPORT_WHATSAPP_NUMBER',
      'Numero principal que recebe notificacoes operacionais enviadas pelo WhatsApp Global.'
    ),
    (
      'BETEL_GLOBAL_WHATSAPP_NOTIFICATION_NUMBERS',
      'BETEL_SCRAPER_REPORT_WHATSAPP_NUMBERS',
      'Lista de numeros que recebem notificacoes operacionais enviadas pelo WhatsApp Global.'
    )
)
insert into public.app_config (key, value, description, is_secret)
select
  mappings.new_key,
  legacy.value,
  mappings.description,
  coalesce(legacy.is_secret, false)
from mappings
join lateral (
  select value, is_secret
  from public.app_config
  where key in (mappings.old_key, lower(mappings.old_key))
    and coalesce(nullif(trim(value), ''), '') <> ''
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1
) legacy on true
on conflict (key) do nothing;

