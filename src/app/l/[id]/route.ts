import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isLinkPreview, safeNativeTarget } from '@/lib/whatsapp/native-links';
import { CONSENT_COOKIE, VISITOR_COOKIE, cookieValue, createBetelVisitor, getBetelVisitor, privacyDenied, recordNativeClick, visitorCookie, visitorDays } from '@/lib/whatsapp/visitor-journey';
import { getBetelPublicOrigin } from '@/lib/public-origin';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id)) return new Response('Link nao encontrado.', { status: 404, headers });
  try {
    const db = getSupabaseAdminClient();
    if (!db) throw new Error('Unavailable');
    const result = await db.from('betel_tracked_links').select('target_url').eq('id', id).maybeSingle();
    if (result.error) throw new Error('Unavailable');
    if (!result.data) return new Response('Link nao encontrado.', { status: 404, headers });
    const target = safeNativeTarget(result.data.target_url);
    if (!target || new URL(target).pathname === `/l/${id}`) throw new Error('Invalid destination');
    const responseHeaders = new Headers(headers);
    if (!isLinkPreview(request)) {
      let visitor = await getBetelVisitor(request);
      if (request.method === 'POST') {
        if (request.headers.get('origin') !== new URL(request.url).origin) return new Response('Origem invalida.', { status: 403, headers });
        const form = await request.formData();
        const remember = form.get('remember') === 'yes' && !privacyDenied(request);
        if (!remember) {
          visitor = null;
          responseHeaders.append('Set-Cookie', visitorCookie(VISITOR_COOKIE, '', 0));
        }
        if (remember && !visitor) {
          const created = await createBetelVisitor();
          visitor = { id: created.id, lead_id: null, expires_at: '' };
          responseHeaders.append('Set-Cookie', visitorCookie(VISITOR_COOKIE, created.token, visitorDays()));
        }
        responseHeaders.append('Set-Cookie', visitorCookie(CONSENT_COOKIE, remember ? 'yes' : 'no', visitorDays()));
      } else if (!visitor && !cookieValue(request, CONSENT_COOKIE) && !privacyDenied(request)) {
        // First visit asks before keeping a reusable browser identifier. No auto-consent.
        const host = new URL(target).hostname.replace(/[&<>"']/g, '');
        return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Abrir link | Betel Leilões</title><style>body{font:16px system-ui;background:#101317;color:#f4f1e9;margin:0;display:grid;min-height:100vh;place-items:center}main{max-width:440px;padding:32px}h1{font-size:28px}p{line-height:1.6;color:#c4c8ce}label{display:flex;gap:12px;line-height:1.5;margin:24px 0}input{width:20px;flex-shrink:0}button{background:#d8ad58;color:#16120a;border:0;border-radius:8px;padding:14px 24px;font-weight:700;font-size:16px}a{color:#d8ad58}</style><main><p>BETEL LEILÕES</p><h1>Seu link está pronto</h1><p>Destino: ${host}. Registramos a abertura deste link no histórico da Betel, sem presumir quem clicou.</p><form method="post"><label><input type="checkbox" name="remember" value="yes">Reconhecer minhas próximas visitas neste navegador por ${visitorDays()} dias. A identificação com meu atendimento exige confirmação.</label><button type="submit">Continuar para o site</button></form><p><a href="${getBetelPublicOrigin()}/privacidade">Preferências e privacidade</a></p></main></html>`, { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'" } });
      }
      await recordNativeClick(id, randomUUID(), visitor?.id);
    }
    responseHeaders.set('Location', target);
    return new Response(null, { status: 302, headers: responseHeaders });
  } catch {
    return new Response('Nao foi possivel abrir o link. Tente novamente.', { status: 503, headers });
  }
}
export const HEAD = GET;
export const POST = GET;
