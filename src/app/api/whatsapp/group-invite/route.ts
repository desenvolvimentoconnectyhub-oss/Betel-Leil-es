import { NextResponse } from "next/server";
import {
  buildBetelGroupInviteClickFromRequest,
  recordBetelGroupInviteClick,
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
  await recordBetelGroupInviteClick({
    payload: {
      ...payload,
      groupUrl: destination,
    },
    click: buildBetelGroupInviteClickFromRequest(request),
  }).catch(() => undefined);

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("cache-control", "no-store");
  return response;
}
