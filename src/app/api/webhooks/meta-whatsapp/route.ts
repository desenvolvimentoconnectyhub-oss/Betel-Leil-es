import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getMetaWhatsAppWebhookSecrets } from "@/lib/meta-whatsapp/official";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type DbRow = Record<string, unknown>;

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function verifySignature(rawBody: string, signature: string, appSecret: string) {
  if (!appSecret) return null;
  if (!signature || !signature.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (receivedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function statusTimestamp(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return new Date().toISOString();
  return new Date(numeric * 1000).toISOString();
}

function timestampPatch(status: string, timestamp: string) {
  if (status === "sent") return { sent_at: timestamp };
  if (status === "delivered") return { delivered_at: timestamp };
  if (status === "read") return { read_at: timestamp };
  if (status === "failed") return { failed_at: timestamp };
  return {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const { verifyToken } = await getMetaWhatsAppWebhookSecrets();

  if (mode === "subscribe" && token && verifyToken && token === verifyToken) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return NextResponse.json({ ok: false, message: "Token de verificacao invalido." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  const { appSecret } = await getMetaWhatsAppWebhookSecrets();
  const signatureValid = verifySignature(rawBody, signature, appSecret);

  if (signatureValid === false) {
    return NextResponse.json({ ok: false, message: "Assinatura Meta invalida." }, { status: 403 });
  }

  const payload = JSON.parse(rawBody || "{}") as DbRow;
  const supabase = getSupabaseAdminClient();
  const entries = asArray(payload.entry);
  let statusEvents = 0;

  for (const entry of entries) {
    const entryRecord = asRecord(entry);
    const changes = asArray(entryRecord.changes);
    for (const change of changes) {
      const value = asRecord(asRecord(change).value);
      const metadata = asRecord(value.metadata);
      const phoneNumberId = cleanString(metadata.phone_number_id);
      const wabaId = cleanString(entryRecord.id);
      const statuses = asArray(value.statuses);

      for (const item of statuses) {
        const status = asRecord(item);
        const providerMessageId = cleanString(status.id);
        const providerStatus = cleanString(status.status, "unknown");
        const timestamp = statusTimestamp(status.timestamp);
        const error = asRecord(asArray(status.errors)[0]);
        statusEvents += 1;

        if (supabase) {
          await supabase.from("meta_whatsapp_webhook_events").insert({
            event_type: `message_status.${providerStatus}`,
            provider_message_id: providerMessageId || null,
            phone_number_id: phoneNumberId || null,
            waba_id: wabaId || null,
            payload: status,
            signature_valid: signatureValid,
            processed_at: new Date().toISOString(),
          });

          if (providerMessageId) {
            await supabase
              .from("meta_whatsapp_campaign_recipients")
              .update({
                status: providerStatus,
                provider_status: providerStatus,
                error_code: cleanString(error.code),
                error_message: cleanString(error.message),
                response_payload: status,
                ...timestampPatch(providerStatus, timestamp),
              })
              .eq("provider_message_id", providerMessageId);
          }
        }
      }
    }
  }

  return NextResponse.json({ ok: true, statusEvents });
}
