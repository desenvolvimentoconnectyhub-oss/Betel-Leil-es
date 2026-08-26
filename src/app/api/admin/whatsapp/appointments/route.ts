import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import {
  getWhatsAppSdrAgendaData,
  saveWhatsAppSdrAppointmentSettings,
  updateWhatsAppSdrAppointmentStatus,
} from "@/lib/whatsapp/sdr-appointments";
import type {
  SdrAppointmentStatus,
  WhatsAppSdrAppointmentMessageTemplates,
  WhatsAppSdrGroupInviteSettings,
} from "@/lib/whatsapp/sdr-appointment-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUS_OPTIONS = new Set<SdrAppointmentStatus>(["scheduled", "notified", "completed", "missed", "cancelled"]);

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return undefined;
}

function cleanMessageTemplates(value: unknown): Partial<WhatsAppSdrAppointmentMessageTemplates> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<WhatsAppSdrAppointmentMessageTemplates>;
}

function cleanGroupInvite(value: unknown): Partial<WhatsAppSdrGroupInviteSettings> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Partial<WhatsAppSdrGroupInviteSettings>;
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
    const businessStartHour = cleanInteger(body.businessStartHour);
    const businessEndHour = cleanInteger(body.businessEndHour);
    const maxBookingsPerHour = cleanInteger(body.maxBookingsPerHour);
    const leadConfirmationMinutesBefore = cleanInteger(body.leadConfirmationMinutesBefore);
    const adminUnconfirmedNoticeMinutesBefore = cleanInteger(body.adminUnconfirmedNoticeMinutesBefore);

    if (
      businessStartHour !== undefined &&
      businessEndHour !== undefined &&
      (businessStartHour < 0 || businessStartHour > 23 || businessEndHour < 1 || businessEndHour > 24 || businessStartHour >= businessEndHour)
    ) {
      return NextResponse.json({ success: false, error: "Informe uma janela de atendimento valida." }, { status: 400 });
    }

    if (maxBookingsPerHour !== undefined && (maxBookingsPerHour < 1 || maxBookingsPerHour > 10)) {
      return NextResponse.json({ success: false, error: "O limite por hora deve ficar entre 1 e 10." }, { status: 400 });
    }

    if (
      leadConfirmationMinutesBefore !== undefined &&
      adminUnconfirmedNoticeMinutesBefore !== undefined &&
      adminUnconfirmedNoticeMinutesBefore >= leadConfirmationMinutesBefore
    ) {
      return NextResponse.json(
        { success: false, error: "O aviso ao admin sem confirmacao deve acontecer depois da pergunta ao lead." },
        { status: 400 },
      );
    }

    const settings = await saveWhatsAppSdrAppointmentSettings({
      notificationAdminUserId: cleanString(body.notificationAdminUserId) || null,
      businessStartHour,
      businessEndHour,
      maxBookingsPerHour,
      leadConfirmationMinutesBefore,
      adminUnconfirmedNoticeMinutesBefore,
      messageTemplates: cleanMessageTemplates(body.messageTemplates),
      groupInvite: cleanGroupInvite(body.groupInvite),
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
