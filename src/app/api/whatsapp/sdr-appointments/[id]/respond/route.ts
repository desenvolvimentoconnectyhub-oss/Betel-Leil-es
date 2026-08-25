import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  respondToSdrAppointmentLeadAction,
  verifySdrAppointmentActionToken,
  type SdrAppointmentLeadAction,
} from "@/lib/whatsapp/sdr-appointments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ACTIONS = new Set<SdrAppointmentLeadAction>(["confirm", "reschedule"]);

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
      <div class="dot">OK</div>
      <h1>${input.title}</h1>
      <p>${input.body}</p>
    </section>
  </main>
</body>
</html>`,
    {
      status,
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const params = await context.params;
  const appointmentId = params.id || "";
  const url = new URL(request.url);
  const action = url.searchParams.get("action") as SdrAppointmentLeadAction | null;
  const token = url.searchParams.get("token") || "";

  if (!appointmentId || !action || !ACTIONS.has(action) || !verifySdrAppointmentActionToken(appointmentId, action, token)) {
    return htmlResponse(
      {
        title: "Link invalido",
        body: "Nao conseguimos validar esse link de agenda. Volte para o WhatsApp e responda diretamente para a Evelyn.",
        tone: "error",
      },
      401,
    );
  }

  const result = await respondToSdrAppointmentLeadAction({
    appointmentId,
    action,
    source: "confirmation_link",
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/agenda");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/appointments");

  if (!result.ok) {
    return htmlResponse(
      {
        title: "Nao foi possivel atualizar",
        body: result.message || "Tente responder pelo WhatsApp para que a Evelyn continue o atendimento.",
        tone: "error",
      },
      400,
    );
  }

  if (action === "reschedule") {
    return htmlResponse({
      title: "Vamos remarcar",
      body: "Volte ao WhatsApp e envie o novo dia e horario que fica melhor. A Evelyn vai conferir a agenda e avisar a equipe.",
      tone: "info",
    });
  }

  return htmlResponse({
    title: "Horario confirmado",
    body: "Perfeito. A equipe da Betel foi avisada e a ligacao continua registrada na agenda.",
    tone: "success",
  });
}
