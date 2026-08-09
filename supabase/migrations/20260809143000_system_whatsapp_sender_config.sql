insert into public.app_config (key, value, description, is_secret)
values
  (
    'BETEL_SYSTEM_WHATSAPP_INSTANCE_ID',
    '',
    'ID local da instancia em whatsapp_instances usada como remetente das mensagens automaticas do sistema.',
    false
  ),
  (
    'BETEL_SYSTEM_WHATSAPP_AGENT_KEY',
    '',
    'Chave do agente WhatsApp responsavel por enviar mensagens automaticas do sistema.',
    false
  )
on conflict (key) do update
set
  description = excluded.description,
  is_secret = excluded.is_secret,
  updated_at = now();
