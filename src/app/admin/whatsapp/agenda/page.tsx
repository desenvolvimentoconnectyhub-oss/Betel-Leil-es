import { WhatsAppSdrAgendaPage } from "@/components/admin/WhatsAppSdrAgendaPage";
import { getWhatsAppSdrAgendaData } from "@/lib/whatsapp/sdr-appointments";
import type { WhatsAppSdrAppointmentData } from "@/lib/whatsapp/sdr-appointment-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fallbackAgendaData(): WhatsAppSdrAppointmentData {
  return {
    generatedAt: new Date().toISOString(),
    settings: {
      notificationAdminUserId: null,
      notificationAdminUserName: null,
      notificationAdminUserPhone: null,
      timezone: "America/Sao_Paulo",
      businessStartHour: 8,
      businessEndHour: 19,
      maxBookingsPerHour: 2,
      updatedAt: null,
    },
    recipients: [],
    appointments: [],
    metrics: {
      today: 0,
      upcoming: 0,
      active: 0,
      fullHours: 0,
    },
  };
}

export default async function WhatsAppSdrAgendaAdminPage() {
  const data = await getWhatsAppSdrAgendaData().catch(fallbackAgendaData);
  return <WhatsAppSdrAgendaPage initialData={data} />;
}
