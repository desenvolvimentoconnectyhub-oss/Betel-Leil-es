import "server-only";
import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

export const VISITOR_COOKIE = 'betel_visit';
export const CONSENT_COOKIE = 'betel_visit_choice';
export const journeyDays = () => Math.trunc(Math.max(1, Math.min(365, Number(process.env.BETEL_JOURNEY_RETENTION_DAYS) || 90)));
export const visitorDays = () => Math.trunc(Math.max(1, Math.min(90, Number(process.env.BETEL_VISITOR_RETENTION_DAYS) || 30)));
export const cookieValue = (request: Request, name: string) => request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || '';
export const privacyDenied = (request: Request) => request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1' || cookieValue(request, CONSENT_COOKIE) === 'no';
export const visitorCookie = (name: string, value: string, days: number) => `${name}=${value}; Path=/; Max-Age=${Math.round(days * 86400)}; HttpOnly; Secure; SameSite=Lax`;

export async function getBetelVisitor(request: Request, forRemoval = false) {
  if (!forRemoval && (privacyDenied(request) || cookieValue(request, CONSENT_COOKIE) !== 'yes')) return null;
  const token = cookieValue(request, VISITOR_COOKIE);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = getSupabaseAdminClient();
  if (!db) return null;
  const result = await db.from('betel_visitors').select('id,lead_id,expires_at').eq('token_hash', createHash('sha256').update(token).digest('hex')).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (result.error) throw new Error('Visitante indisponivel.');
  if (!forRemoval && result.data?.lead_id) {
    const lead = await db.from('whatsapp_leads').select('opt_out').eq('id', result.data.lead_id).maybeSingle();
    if (lead.error) throw new Error('Preferencia do contato indisponivel.');
    if (lead.data?.opt_out) return null;
  }
  return result.data;
}

export async function createBetelVisitor() {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error('Visitante indisponivel.');
  const token = randomBytes(32).toString('hex');
  const result = await db.from('betel_visitors').insert({ token_hash: createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + visitorDays() * 86400000).toISOString() }).select('id').single();
  if (result.error) throw new Error('Nao foi possivel salvar a preferencia.');
  return { token, id: result.data.id };
}

export async function recordNativeClick(linkId: string, eventId: string, visitorId?: string | null) {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error('Registro do clique indisponivel.');
  const args = { p_link: linkId, p_event: eventId, p_visitor: visitorId || null, p_days: journeyDays() };
  // A timeout may follow COMMIT. Retry only the same event id, never a new UUID.
  let result = await db.rpc('record_betel_link_click', args);
  if (result.error) result = await db.rpc('record_betel_link_click', args);
  if (result.error) throw new Error('Registro do clique indisponivel.');
}
