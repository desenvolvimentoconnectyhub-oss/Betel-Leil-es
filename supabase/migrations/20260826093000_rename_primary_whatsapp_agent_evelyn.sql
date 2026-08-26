-- Rename the primary WhatsApp agent from the old Willian/William identity to Evelyn.
-- Legacy config keys are kept because existing code paths still read them as aliases.

insert into public.app_config (key, value, description, is_secret, updated_at)
values
  (
    'BETEL_GLOBAL_WHATSAPP_INSTANCE_NAME',
    'evelyn-betel',
    'Nome da instancia ConnectyHub usada pela Evelyn no WhatsApp Global da Betel.',
    false,
    now()
  ),
  (
    'BETEL_GLOBAL_CONNECTYHUB_INSTANCE_NAME',
    'evelyn-betel',
    'Nome da instancia ConnectyHub usada pela Evelyn na ConnectyHub.',
    false,
    now()
  ),
  (
    'BETEL_WILLIAN_CONNECTYHUB_INSTANCE_NAME',
    'evelyn-betel',
    'Compatibilidade: nome legado da instancia principal, agora Evelyn.',
    false,
    now()
  )
on conflict (key) do update
set
  value = case
    when lower(coalesce(public.app_config.value, '')) in ('', 'willian', 'william', 'willian-betel', 'william-betel')
      then excluded.value
    else public.app_config.value
  end,
  description = excluded.description,
  is_secret = excluded.is_secret,
  updated_at = now();

update public.app_config
set
  value = 'Evelyn',
  description = case
    when key = 'BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME'
      then 'Nome de exibicao da Evelyn no WhatsApp Global da Betel.'
    else 'Compatibilidade: nome de exibicao do WhatsApp conectado ao antigo agente Willian, agora Evelyn.'
  end,
  updated_at = now()
where key in ('BETEL_GLOBAL_WHATSAPP_DISPLAY_NAME', 'BETEL_WILLIAN_WHATSAPP_DISPLAY_NAME')
  and lower(coalesce(value, '')) ~ '^willia[mn](\s|$|-|_)';

update public.ai_agents
set
  name = 'Evelyn',
  persona_name = case
    when lower(coalesce(persona_name, '')) ~ '^willia[mn](\s|$|-|_)' or coalesce(persona_name, '') = '' then 'Evelyn'
    else persona_name
  end,
  role = case
    when lower(coalesce(role, '')) like '%willian%' or coalesce(role, '') = '' then 'SDR comercial de leiloes imobiliarios'
    else role
  end,
  system_prompt = case
    when system_prompt is null then system_prompt
    else regexp_replace(system_prompt, '\mwillia[mn]\M', 'Evelyn', 'gi')
  end,
  metadata = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(metadata, '{}'::jsonb), '{whatsapp_clone_profile,displayName}', to_jsonb('Evelyn'::text), true),
            '{cloneProfile,displayName}',
            to_jsonb('Evelyn'::text),
            true
          ),
          '{whatsappAgentConfig,agentName}',
          to_jsonb('Evelyn'::text),
          true
        ),
        '{whatsappAgentConfig,cloneProfile,displayName}',
        to_jsonb('Evelyn'::text),
        true
      ),
      '{whatsapp_agent_config,agentName}',
      to_jsonb('Evelyn'::text),
      true
    ),
    '{whatsapp_agent_config,cloneProfile,displayName}',
    to_jsonb('Evelyn'::text),
    true
  ),
  whatsapp_behavior_config = case
    when coalesce(whatsapp_behavior_config, '{}'::jsonb) = '{}'::jsonb then whatsapp_behavior_config
    else jsonb_set(
      coalesce(whatsapp_behavior_config, '{}'::jsonb),
      '{selectedVoiceLabel}',
      to_jsonb(
        case
          when lower(coalesce(whatsapp_behavior_config->>'selectedVoiceLabel', '')) like '%willian%'
            then 'Clone da Evelyn'
          else coalesce(whatsapp_behavior_config->>'selectedVoiceLabel', 'Clone da Evelyn')
        end
      ),
      true
    )
  end,
  updated_at = now()
where agent_key = 'multichannel-dispatch';

do $$
declare
  saved_config jsonb;
  prompt_text text;
  global_prompt_text text;
  voice_label text;
begin
  select value::jsonb
  into saved_config
  from public.app_config
  where key = 'BETEL_WILLIAN_AGENT_CONFIG'
    and coalesce(value, '') <> ''
  limit 1;

  if saved_config is not null then
    prompt_text := regexp_replace(coalesce(saved_config #>> '{prompt,agentPrompt}', ''), '\mwillia[mn]\M', 'Evelyn', 'gi');
    global_prompt_text := regexp_replace(coalesce(saved_config->>'globalPrompt', ''), '\mwillia[mn]\M', 'Evelyn', 'gi');
    voice_label := case
      when lower(coalesce(saved_config #>> '{behavior,selectedVoiceLabel}', '')) like '%willian%'
        then 'Clone da Evelyn'
      else coalesce(saved_config #>> '{behavior,selectedVoiceLabel}', 'Clone da Evelyn')
    end;

    saved_config := jsonb_set(saved_config, '{agentName}', to_jsonb('Evelyn'::text), true);
    saved_config := jsonb_set(saved_config, '{cloneProfile,displayName}', to_jsonb('Evelyn'::text), true);
    saved_config := jsonb_set(saved_config, '{behavior,selectedVoiceLabel}', to_jsonb(voice_label), true);

    if prompt_text <> '' then
      saved_config := jsonb_set(saved_config, '{prompt,agentPrompt}', to_jsonb(prompt_text), true);
    end if;

    if global_prompt_text <> '' then
      saved_config := jsonb_set(saved_config, '{globalPrompt}', to_jsonb(global_prompt_text), true);
    end if;

    update public.app_config
    set
      value = saved_config::text,
      description = 'Configuracao operacional da Evelyn para WhatsApp.',
      is_secret = false,
      updated_at = now()
    where key = 'BETEL_WILLIAN_AGENT_CONFIG';
  end if;
exception
  when others then
    null;
end $$;

do $$
declare
  legacy_instance record;
  evelyn_instance record;
begin
  select *
  into legacy_instance
  from public.whatsapp_instances
  where provider = 'connectyhub'
    and agent_key = 'multichannel-dispatch'
    and lower(instance_name) in ('willian', 'william', 'willian-betel', 'william-betel')
  order by updated_at desc
  limit 1;

  if found then
    select *
    into evelyn_instance
    from public.whatsapp_instances
    where provider = 'connectyhub'
      and instance_name = 'evelyn-betel'
    limit 1;

    if not found then
      update public.whatsapp_instances
      set
        instance_name = 'evelyn-betel',
        metadata = jsonb_set(
          jsonb_set(coalesce(metadata, '{}'::jsonb), '{agentName}', to_jsonb('Evelyn'::text), true),
          '{displayName}',
          to_jsonb('Evelyn'::text),
          true
        ),
        updated_at = now()
      where id = legacy_instance.id;
    else
      update public.whatsapp_instances
      set
        agent_key = 'multichannel-dispatch',
        provider_instance_id = coalesce(evelyn_instance.provider_instance_id, legacy_instance.provider_instance_id),
        phone = coalesce(evelyn_instance.phone, legacy_instance.phone),
        status = coalesce(evelyn_instance.status, legacy_instance.status),
        webhook_url = coalesce(evelyn_instance.webhook_url, legacy_instance.webhook_url),
        metadata = jsonb_set(
          jsonb_set(coalesce(evelyn_instance.metadata, '{}'::jsonb) || coalesce(legacy_instance.metadata, '{}'::jsonb), '{agentName}', to_jsonb('Evelyn'::text), true),
          '{displayName}',
          to_jsonb('Evelyn'::text),
          true
        ),
        connected_at = coalesce(evelyn_instance.connected_at, legacy_instance.connected_at),
        last_seen_at = nullif(
          greatest(
            coalesce(evelyn_instance.last_seen_at, '-infinity'::timestamptz),
            coalesce(legacy_instance.last_seen_at, '-infinity'::timestamptz)
          ),
          '-infinity'::timestamptz
        ),
        updated_at = now()
      where id = evelyn_instance.id;

      update public.whatsapp_conversations
      set instance_id = evelyn_instance.id
      where instance_id = legacy_instance.id;

      update public.whatsapp_conversation_messages
      set instance_id = evelyn_instance.id
      where instance_id = legacy_instance.id;

      update public.whatsapp_webhook_events
      set instance_id = evelyn_instance.id
      where instance_id = legacy_instance.id;

      update public.whatsapp_sdr_appointments
      set instance_id = evelyn_instance.id
      where instance_id = legacy_instance.id;

      update public.whatsapp_instances
      set
        status = 'archived',
        provider_instance_id = null,
        connected_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('mergedInto', 'evelyn-betel'),
        updated_at = now()
      where id = legacy_instance.id;
    end if;
  end if;
end $$;
