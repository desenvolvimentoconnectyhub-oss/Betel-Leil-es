update public.whatsapp_sdr_appointments
set
  confirmation_due_at = scheduled_for - interval '30 minutes',
  reminder_due_at = scheduled_for - interval '10 minutes'
where status in ('pending_confirmation', 'scheduled', 'notified')
  and lead_confirmation_status = 'pending'
  and confirmation_sent_at is null
  and admin_reminder_sent_at is null;
