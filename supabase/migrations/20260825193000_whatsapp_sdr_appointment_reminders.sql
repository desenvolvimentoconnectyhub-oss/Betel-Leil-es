alter table public.whatsapp_sdr_appointments
  add column if not exists lead_confirmation_status text not null default 'pending',
  add column if not exists lead_confirmation_requested_at timestamptz,
  add column if not exists lead_confirmed_at timestamptz,
  add column if not exists lead_reschedule_requested_at timestamptz,
  add column if not exists confirmation_due_at timestamptz,
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists admin_confirmation_notified_at timestamptz,
  add column if not exists lead_reminder_sent_at timestamptz,
  add column if not exists admin_reminder_sent_at timestamptz,
  add column if not exists reminder_due_at timestamptz,
  add column if not exists reschedule_note text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'whatsapp_sdr_appointments_lead_confirmation_status_check'
  ) then
    alter table public.whatsapp_sdr_appointments
      add constraint whatsapp_sdr_appointments_lead_confirmation_status_check
      check (lead_confirmation_status in ('pending', 'confirmed', 'reschedule_requested'));
  end if;
end $$;

update public.whatsapp_sdr_appointments
set
  reminder_due_at = coalesce(reminder_due_at, scheduled_for - interval '5 minutes'),
  confirmation_due_at = coalesce(
    confirmation_due_at,
    case
      when (
        (date_trunc('day', scheduled_for at time zone timezone) + interval '12 hours 30 minutes') at time zone timezone
      ) < scheduled_for - interval '30 minutes'
        then (date_trunc('day', scheduled_for at time zone timezone) + interval '12 hours 30 minutes') at time zone timezone
      else scheduled_for - interval '2 hours'
    end
  )
where status in ('pending_confirmation', 'scheduled', 'notified');

create index if not exists idx_whatsapp_sdr_appointments_confirmation_due
  on public.whatsapp_sdr_appointments (confirmation_due_at)
  where confirmation_sent_at is null
    and status in ('pending_confirmation', 'scheduled', 'notified');

create index if not exists idx_whatsapp_sdr_appointments_lead_reminder_due
  on public.whatsapp_sdr_appointments (reminder_due_at)
  where lead_reminder_sent_at is null
    and status in ('pending_confirmation', 'scheduled', 'notified');

create index if not exists idx_whatsapp_sdr_appointments_admin_reminder_due
  on public.whatsapp_sdr_appointments (reminder_due_at)
  where admin_reminder_sent_at is null
    and status in ('pending_confirmation', 'scheduled', 'notified');

create index if not exists idx_whatsapp_sdr_appointments_lead_confirmation_status
  on public.whatsapp_sdr_appointments (lead_confirmation_status, scheduled_for);
