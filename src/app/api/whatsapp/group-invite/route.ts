import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getBetelVisitor, recordNativeClick } from "@/lib/whatsapp/visitor-journey";
import { isLinkPreview } from "@/lib/whatsapp/native-links";
import {
  safeBetelGroupDestination,
  verifyBetelGroupInvitePayload,
} from "@/lib/whatsapp/group-invite-tracking";
import { DEFAULT_BETEL_GROUP_URL } from "@/lib/whatsapp/sdr-appointments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function htmlResponse(input: { title: string; body: string; tone?: "success" | "info" | "error" }, status = 200) {
  const color = input.tone === "error" ? "#b42318" : input.tone === "info" ? "#087f8c" : "#047857";
  return new NextResponse(
    `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${input.title}</title>
  <style>
    body { margin: 0; font-family: Inter, Arial, sans-serif; background: #f6faf9; color: #17212b; }
    main { min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box; }
    section { max-width: 440px; width: 100%; border: 1px solid #d8e5e1; border-radius: 22px; background: #fff; padding: 28px; box-shadow: 0 18px 60px rgba(15, 23, 42, 0.10); }
    .dot { width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; background: rgba(4, 120, 87, 0.10); color: ${color}; font-weight: 800; font-size: 24px; }
    h1 { margin: 18px 0 8px; font-size: 22px; line-height: 1.25; color: ${color}; }
    p { margin: 0; font-size: 15px; line-height: 1.6; color: #475569; }
  </style>
</head>
<body>
  <main>
    <section>
      <div class="dot">!</div>
      <h1>${input.title}</h1>
      <p>${input.body}</p>
    </section>
  </main>
</body>
</html>`,
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const payload = verifyBetelGroupInvitePayload(url.searchParams.get("t") || "", url.searchParams.get("s") || "");

  if (!payload) {
    return htmlResponse(
      {
        title: "Link invalido",
        body: "Nao conseguimos validar esse convite. Volte ao WhatsApp e peca para a Evelyn enviar o link novamente.",
        tone: "error",
      },
      401,
    );
  }

  const destination = safeBetelGroupDestination(payload.groupUrl) || DEFAULT_BETEL_GROUP_URL;
  if (!isLinkPreview(request)) {
    try {
      const db = getSupabaseAdminClient();
      if (!db) throw new Error("Unavailable");
      const key = createHash("sha256").update(`legacy-invite:${payload.trackId}`).digest("hex");
      const saved = await db.from("betel_tracked_links").upsert({ dedup_key: key, target_url: destination, label: "Convite para grupo", source: "legacy_group_invite", intended_lead_id: payload.leadId, conversation_id: payload.conversationId, recipient_kind: "direct", context: { trackId: payload.trackId, appointmentId: payload.appointmentId, agentKey: payload.agentKey } }, { onConflict: "dedup_key", ignoreDuplicates: true });
      if (saved.error) throw new Error("Unavailable");
      const link = await db.from("betel_tracked_links").select("id").eq("dedup_key", key).single();
      if (link.error) throw new Error("Unavailable");
      const visitor = await getBetelVisitor(request);
      await recordNativeClick(link.data.id, randomUUID(), visitor?.id);
    } catch { return htmlResponse({ title: "Link temporariamente indisponivel", body: "Tente abrir o convite novamente em instantes.", tone: "error" }, 503); }
  }

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "no-store");
  return response;
}
export const HEAD = GET;
