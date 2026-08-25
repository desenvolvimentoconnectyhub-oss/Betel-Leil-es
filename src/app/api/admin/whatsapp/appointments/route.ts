import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  getWhatsAppSdrAgendaData,
  saveWhatsAppSdrAppointmentSettings,
  updateWhatsAppSdrAppointmentStatus,
} from "@/lib/whatsapp/sdr-appointments";
import type { SdrAppointmentStatus } from "@/lib/whatsapp/sdr-appointment-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_OPTIONS = new Set<SdrAppointmentStatus>(["scheduled", "notified", "completed", "missed", "cancelled"]);

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function revalidateAgendaPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/whatsapp/agenda");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/appointments");
}

export async function GET() {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const data = await getWhatsAppSdrAgendaData();
  return NextResponse.json({ success: true, data });
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = cleanString(body.action);

  if (action === "save_settings") {
    const settings = await saveWhatsAppSdrAppointmentSettings({
      notificationAdminUserId: cleanString(body.notificationAdminUserId) || null,
    });

    revalidateAgendaPaths();
    return NextResponse.json({ success: true, data: { settings } });
  }

  if (action === "update_status") {
    const appointmentId = cleanString(body.appointmentId);
    const status = cleanString(body.status) as SdrAppointmentStatus;

    if (!appointmentId || !STATUS_OPTIONS.has(status)) {
      return NextResponse.json(
        {
          success: false,
          error: "Informe appointmentId e um status valido.",
        },
        { status: 400 },
      );
    }

    const appointment = await updateWhatsAppSdrAppointmentStatus({
      appointmentId,
      status,
      cancellationReason: cleanString(body.cancellationReason) || undefined,
    });

    revalidateAgendaPaths();
    return NextResponse.json({ success: Boolean(appointment), data: { appointment } }, { status: appointment ? 200 : 400 });
  }

  return NextResponse.json({ success: false, error: "Acao de agenda nao reconhecida." }, { status: 400 });
}
