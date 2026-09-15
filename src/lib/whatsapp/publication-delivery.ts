import "server-only";
import { whatsappPublicationParts } from "@/lib/domain/whatsapp-publication-parts";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { checkWhatsAppSenderConnection, sendWhatsAppDestinationMedia, sendWhatsAppDestinationText, type WhatsAppActionButtonInput, type ConnectyHubDeliveryResult } from "@/lib/communication/connectyhub-client";

export async function dispatchMarketPublication(input: {
  campaignId: string; targetId: string; agentKey: string; instanceId: string;
  destinationJid: string; caption: string; mediaUrl: string; mediaType: string;
  buttonText: string; actionButton?: WhatsAppActionButtonInput;
  auctionButtonText?: string; auctionActionButton?: WhatsAppActionButtonInput;
}) {
  const db = getSupabaseAdminClient();
  if (!db) return { ok: false, errorMessage: "Registro de entrega indisponivel." };
  if (!input.instanceId) return { ok: false, errorMessage: "Campanha sem instancia verificada; revise a publicacao." };
  // New templates explicitly own the auction block. Legacy campaigns lack
  // auctionActionButton and retain their original part plan and content hash.
  const parts = whatsappPublicationParts(input);
  const results: Record<string, unknown> = {};
  for (const part of parts) {
    const { kind } = part;
    const id = createHash("sha256").update(`${input.campaignId}:${input.targetId}:${kind}`).digest("hex");
    const contentHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const existing = await db.from("whatsapp_publication_parts").select("*").eq("id", id).maybeSingle();
    if (existing.error) return { ok: false, errorMessage: "Registro de partes indisponivel. Aplique a migracao antes do envio." };
    if (existing.data && existing.data.content_hash !== contentHash) return { ok: false, errorMessage: "Conteudo alterado depois do inicio do envio; revise a campanha." };
    if (existing.data && ["accepted", "delivered", "read"].includes(existing.data.status)) { results[kind] = { status: existing.data.status, externalDeliveryId: existing.data.provider_message_id }; continue; }
    if (existing.data && ["processing", "uncertain"].includes(existing.data.status)) return { ok: false, deliveryUnconfirmed: true, errorMessage: "Parte " + kind + " aguarda conciliacao. Nao reenviada.", parts: results };
    const connection = await checkWhatsAppSenderConnection(input.agentKey, input.instanceId);
    if (!connection.connected) return { ok: false, errorMessage: connection.error };
    const attempts = Number(existing.data?.attempt_count || 0);
    if (attempts >= 3) return { ok: false, errorMessage: "Limite de tentativas atingido; revise a entrega." };
    const fields = { status: "processing", attempt_count: attempts + 1, updated_at: new Date().toISOString() };
    const claim = existing.data
      ? await db.from("whatsapp_publication_parts").update(fields).eq("id", id).eq("status", "failed").eq("attempt_count", attempts).select("id").maybeSingle()
      : await db.from("whatsapp_publication_parts").insert({ ...fields, id, campaign_id: input.campaignId, target_id: input.targetId, provider_instance_id: input.instanceId, kind, content_hash: contentHash }).select("id").maybeSingle();
    if (claim.error || !claim.data) return { ok: false, errorMessage: "Parte ja em processamento ou registro indisponivel." };
    let delivery: ConnectyHubDeliveryResult;
    try {
      const base = { agentKey: input.agentKey, instanceId: input.instanceId, destinationJid: input.destinationJid, trackId: `betel-pub-${id}`, sendOptions: { readChat: true } };
      delivery = kind === "media"
        ? await sendWhatsAppDestinationMedia({ ...base, fileUrl: input.mediaUrl, mediaType: input.mediaType, text: input.caption })
        : await sendWhatsAppDestinationText({ ...base,
            text: part.text,
            actionButton: part.actionButton, inferActionButtonFromText: false });
    } catch {
      await db.from("whatsapp_publication_parts").update({ status: "uncertain" }).eq("id", id);
      return { ok: false, deliveryUnconfirmed: true, errorMessage: "Resposta de envio desconhecida; parte preservada para conciliacao." };
    }
    // Network/server failures may follow provider acceptance. Only explicit
    // client rejection is eligible for a bounded retry with the SAME key.
    const definiteRejection = !delivery.ok && /HTTP (400|401|402|403|404|422)\b/.test(delivery.errorMessage || "");
    const status = delivery.ok && delivery.externalDeliveryId ? "accepted" : definiteRejection ? "failed" : "uncertain";
    const saved = await db.from("whatsapp_publication_parts").update({ status, provider_message_id: delivery.externalDeliveryId || null, error_message: delivery.errorMessage || null, updated_at: new Date().toISOString() }).eq("id", id).eq("status", "processing");
    if (!saved.error && delivery.externalDeliveryId) {
      const ack = await db.from("whatsapp_publication_acknowledgements").select("ack_level").eq("provider_instance_id", input.instanceId).eq("provider_message_id", delivery.externalDeliveryId).maybeSingle();
      if (ack.data?.ack_level) await db.rpc("record_whatsapp_publication_ack", { p_instance: input.instanceId, p_message: delivery.externalDeliveryId, p_level: ack.data.ack_level });
    }
    results[kind] = { status, externalDeliveryId: delivery.externalDeliveryId };
    if (saved.error || status !== "accepted") return { ok: false, deliveryUnconfirmed: status === "uncertain" || Boolean(saved.error), errorMessage: delivery.errorMessage || "Entrega aguarda conciliacao.", parts: results };
  }
  return { ok: true, transportState: "accepted", parts: results };
}
