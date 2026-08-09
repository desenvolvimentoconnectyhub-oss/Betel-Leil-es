alter table public.admin_users
  add column if not exists password_ready_status text not null default 'not_sent',
  add column if not exists password_ready_error text,
  add column if not exists password_ready_sent_at timestamptz,
  add column if not exists password_ready_last_attempt_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_users_password_ready_status_check'
      and conrelid = 'public.admin_users'::regclass
  ) then
    alter table public.admin_users
      add constraint admin_users_password_ready_status_check
      check (password_ready_status in ('not_sent', 'sent', 'failed'));
  end if;
end $$;

insert into public.message_templates
  (
    template_key,
    channel,
    audience_key,
    name,
    description,
    subject_template,
    body_template,
    guardrail_template,
    button_label_template,
    button_url_template,
    variables,
    status,
    version,
    created_by_label,
    updated_by_label
  )
values
  (
    'admin.password_ready',
    'whatsapp',
    'admin',
    'Senha administrativa cadastrada',
    'Mensagem enviada depois que o usuario administrativo define a senha.',
    'Oi, {{recipient_first_name}}. Seu acesso ao painel Betel esta pronto.',
    'Sua senha foi cadastrada com sucesso.' || E'\n\n' ||
    'Use seu email {{recipient_email}} e a senha que voce acabou de criar para entrar no painel.' || E'\n\n' ||
    'Toque no botao abaixo para acessar.',
    'Link interno e pessoal. Nunca compartilhe sua senha.',
    'Abrir painel',
    '{{panel_url}}',
    '["recipient_first_name","recipient_email","panel_url"]'::jsonb,
    'active',
    1,
    'migration:admin_password_ready_whatsapp',
    'migration:admin_password_ready_whatsapp'
  )
on conflict (template_key, channel, audience_key, version) do update set
  name = excluded.name,
  description = excluded.description,
  subject_template = excluded.subject_template,
  body_template = excluded.body_template,
  guardrail_template = excluded.guardrail_template,
  button_label_template = excluded.button_label_template,
  button_url_template = excluded.button_url_template,
  variables = excluded.variables,
  status = excluded.status,
  updated_by_label = excluded.updated_by_label,
  updated_at = now();
