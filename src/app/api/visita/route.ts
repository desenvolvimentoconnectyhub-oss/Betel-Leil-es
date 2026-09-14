import { createHash, randomBytes } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { CONSENT_COOKIE, VISITOR_COOKIE, createBetelVisitor, getBetelVisitor, journeyDays, privacyDenied, visitorCookie, visitorDays } from '@/lib/whatsapp/visitor-journey';
import { isLinkPreview } from '@/lib/whatsapp/native-links';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  try {
    const visitor = await getBetelVisitor(request);
    return Response.json({ remembered: Boolean(visitor), identified: Boolean(visitor?.lead_id), denied: privacyDenied(request), days: visitorDays() }, { headers });
  } catch { return Response.json({ error: 'Preferencias indisponiveis.' }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || isLinkPreview(request)) return Response.json({ error: 'Origem invalida.' }, { status: 403, headers });
  try {
    const db = getSupabaseAdminClient();
    if (!db) throw new Error('Unavailable');
    const body = await request.json();
    const visitor = await getBetelVisitor(request, body.action === 'forget');
    if (body.action === 'forget') {
      if (visitor) {
        // Remove browser association; original business events/messages remain within their retention.
        const removed = await db.from('betel_visitors').delete().eq('id', visitor.id);
        if (removed.error) throw new Error('Unavailable');
      }
      const response = Response.json({ ok: true }, { headers });
      response.headers.append('Set-Cookie', visitorCookie(VISITOR_COOKIE, '', 0));
      response.headers.append('Set-Cookie', visitorCookie(CONSENT_COOKIE, 'no', visitorDays()));
      return response;
    }
    if (body.action === 'remember') {
      if (request.headers.get('sec-gpc') === '1' || request.headers.get('dnt') === '1') return Response.json({ error: 'A preferencia de privacidade do navegador esta ativa.' }, { status: 409, headers });
      const response = Response.json({ ok: true }, { headers });
      if (!visitor) {
        const created = await createBetelVisitor();
        response.headers.append('Set-Cookie', visitorCookie(VISITOR_COOKIE, created.token, visitorDays()));
      }
      response.headers.append('Set-Cookie', visitorCookie(CONSENT_COOKIE, 'yes', visitorDays()));
      return response;
    }
    if (!visitor) return Response.json({ error: 'Ative o reconhecimento deste navegador primeiro.' }, { status: 409, headers });
    if (body.action === 'claim') {
      const recent = await db.from('betel_visitor_claims').select('id,code').eq('visitor_id', visitor.id).gt('expires_at', new Date().toISOString()).is('consumed_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (recent.error) throw new Error('Unavailable');
      const saved = recent.data ? recent : await db.from('betel_visitor_claims').insert({ visitor_id: visitor.id, code: randomBytes(16).toString('hex') }).select('id,code').single();
      if (saved.error || !saved.data) throw new Error('Unavailable');
      return Response.json({ claimId: saved.data.id, code: `BETEL-${saved.data.code}` }, { headers });
    }
    if (body.action === 'claim_status' || body.action === 'confirm') {
      if (typeof body.claimId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.claimId)) return Response.json({ error: 'Confirmacao invalida.' }, { status: 400, headers });
      const claim = await db.from('betel_visitor_claims').select('id,lead_id,message_id').eq('id', body.claimId).eq('visitor_id', visitor.id).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (claim.error) throw new Error('Unavailable');
      if (!claim.data?.lead_id || !claim.data.message_id) return Response.json({ ready: false }, { headers });
      if (body.action === 'confirm') {
        const result = await db.rpc('confirm_betel_visitor', { p_visitor: visitor.id, p_claim: claim.data.id });
        if (result.error || result.data !== true) return Response.json({ error: 'Nao foi possivel confirmar esse vinculo.' }, { status: 409, headers });
        return Response.json({ ok: true }, { headers });
      }
      const lead = await db.from('whatsapp_leads').select('phone').eq('id', claim.data.lead_id).single();
      if (lead.error) throw new Error('Unavailable');
      return Response.json({ ready: true, phoneSuffix: String(lead.data.phone).slice(-4) }, { headers });
    }
    if (body.action === 'page') {
      // Only first-party public routes; never collect query strings, forms, IP or fingerprints.
      const path = typeof body.path === 'string' ? body.path : '';
      if (!/^\/(?:oportunidades(?:\/[a-zA-Z0-9_-]+)?|blog(?:\/[a-zA-Z0-9_-]+)?|planos)?$/.test(path) || !/^[a-f0-9-]{36}$/.test(body.eventId || '')) return new Response(null, { status: 400, headers });
      const eventKey = createHash('sha256').update(`${visitor.id}:${body.eventId}`).digest('hex');
      const eventId = `${eventKey.slice(0,8)}-${eventKey.slice(8,12)}-4${eventKey.slice(13,16)}-8${eventKey.slice(17,20)}-${eventKey.slice(20,32)}`;
      const saved = await db.from('whatsapp_lead_files').upsert({ journey_event_id: eventId, visitor_id: visitor.id, lead_id: visitor.lead_id, source: 'betel_page_view', mime_type: 'application/json', metadata: { path, actorConfirmed: Boolean(visitor.lead_id), attribution: visitor.lead_id ? 'verified_browser' : 'anonymous' }, expires_at: new Date(Date.now() + journeyDays() * 86400000).toISOString() }, { onConflict: 'journey_event_id', ignoreDuplicates: true });
      if (saved.error) throw new Error('Unavailable');
      return Response.json({ ok: true }, { headers });
    }
    return new Response(null, { status: 400, headers });
  } catch { return Response.json({ error: 'Nao foi possivel salvar. Tente novamente.' }, { status: 503, headers }); }
}
