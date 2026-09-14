import "server-only";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBetelPublicOrigin } from "@/lib/public-origin";
import type { WhatsAppActionButtonInput } from "@/lib/communication/connectyhub-client";

export function safeNativeTarget(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(host) || !host.includes('.') || /\.(local|internal|localhost)$/i.test(host)) return null;
    return url.toString();
  } catch { return null; }
}

export function isLinkPreview(request: Request) {
  return request.method === 'HEAD' || /bot|crawler|spider|facebookexternalhit|whatsapp|preview/i.test(request.headers.get('user-agent') || '') || /prefetch|preview/i.test(`${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''}`);
}

/** Runs before transport. Stable slot+target keys preserve links across send retries. */
export async function prepareBetelNativeLinks<T extends { instanceId: string; number: string; trackId: string; text?: string; actionButton?: WhatsAppActionButtonInput }>(input: T): Promise<T> {
  const urls = [...(input.text || '').matchAll(/https?:\/\/[^\s<>"']+/gi)].map(match => match[0].replace(/[.,;!?)\]]+$/, ''));
  if (!urls.length && !input.actionButton?.url && !input.actionButton?.choices?.length) return input;
  if (!input.trackId || !input.instanceId) throw new Error('Mensagem sem identificador de rastreio estavel.');
  const client = getSupabaseAdminClient();
  if (!client) throw new Error('Registro de links Betel indisponivel.');
  const db = client;
  const origin = getBetelPublicOrigin();
  const recipientKind = input.number.endsWith('@g.us') ? 'group' : input.number.includes('@newsletter') ? 'channel' : /^\+?\d{10,15}(?:@s\.whatsapp\.net)?$/.test(input.number) ? 'direct' : 'unknown';
  const phone = input.number.split('@')[0].replace(/\D/g, '');
  const lead = recipientKind === 'direct' ? await db.from('whatsapp_leads').select('id').eq('phone', phone).maybeSingle() : null;
  if (lead?.error) throw new Error('Vinculo do destinatario indisponivel.');
  const context: Record<string, unknown> = { trackId: input.trackId, providerInstanceId: input.instanceId };
  // Publication parts carry the local campaign/target, including media and button parts.
  const partId = input.trackId.match(/^betel-pub-([a-f0-9]{64})$/)?.[1];
  if (partId) {
    const part = await db.from('whatsapp_publication_parts').select('campaign_id,target_id,kind').eq('id', partId).maybeSingle();
    if (part.error) throw new Error('Contexto da publicacao indisponivel.');
    if (part.data) {
      Object.assign(context, { campaignId: part.data.campaign_id, targetId: part.data.target_id, partId, partKind: part.data.kind });
      const campaign = await db.from('whatsapp_group_campaigns').select('metadata').eq('id', part.data.campaign_id).maybeSingle();
      if (campaign.error) throw new Error('Contexto do imovel indisponivel.');
      context.opportunityCode = campaign.data?.metadata?.opportunityCode || null;
      context.publicationKey = campaign.data?.metadata?.publicationKey || null;
    }
  }
  async function wrap(raw: string, label: string, slot: string) {
    const target = safeNativeTarget(raw);
    if (!target) throw new Error('Destino de link invalido.');
    const url = new URL(target);
    // Authentication/recovery URLs may contain one-time credentials. They must
    // never become behavioral records or appear in another lead's archive.
    if (url.origin === origin && /^\/(?:login|cadastro|definir-senha|api\/auth)(?:\/|$)/.test(url.pathname)) return target;
    // Existing native URLs are already durable and must never be double wrapped.
    if (url.origin === origin && /^\/l\/[a-f0-9-]{36}$/.test(url.pathname)) return target;
    const key = createHash('sha256').update(JSON.stringify([input.instanceId, input.number, input.trackId, slot, target])).digest('hex');
    const inserted = await db.from('betel_tracked_links').upsert({ dedup_key: key, target_url: target, label, source: 'whatsapp', intended_lead_id: lead?.data?.id || null, recipient_kind: recipientKind, context: { ...context, slot } }, { onConflict: 'dedup_key', ignoreDuplicates: true });
    if (inserted.error) throw new Error('Nao foi possivel registrar o link Betel.');
    const saved = await db.from('betel_tracked_links').select('id').eq('dedup_key', key).single();
    if (saved.error || !saved.data) throw new Error('Link Betel indisponivel.');
    return `${origin}/l/${saved.data.id}`;
  }
  const replacements = new Map<string, string>();
  for (const [index, url] of [...new Set(urls)].entries()) {
    const tracked = await wrap(url, `Link no texto ${index + 1}`, `text:${index}`);
    replacements.set(url, tracked);
  }
  const text = input.text?.replace(/https?:\/\/[^\s<>"']+/gi, match => {
    const url = match.replace(/[.,;!?)\]]+$/, '');
    return (replacements.get(url) || url) + match.slice(url.length);
  });
  let actionButton = input.actionButton;
  if (actionButton) {
    actionButton = { ...actionButton };
    if (actionButton.url) actionButton.url = await wrap(actionButton.url, actionButton.label || 'Abrir link', 'button');
    if (actionButton.choices) {
      const choices = [];
      for (const [index, choice] of actionButton.choices.entries()) choices.push({ ...choice, url: await wrap(choice.url, choice.label || `Botao ${index + 1}`, `choice:${index}`) });
      actionButton.choices = choices;
    }
  }
  return { ...input, ...(text !== undefined ? { text } : {}), ...(actionButton ? { actionButton } : {}) };
}
