export type SdrAppointmentStatus =
  | "pending_confirmation"
  | "scheduled"
  | "notified"
  | "completed"
  | "missed"
  | "cancelled"
  | "rescheduled";

export type WhatsAppSdrAppointmentRecipient = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

export type WhatsAppSdrAppointmentSettings = {
  notificationAdminUserId: string | null;
  notificationAdminUserName: string | null;
  notificationAdminUserPhone: string | null;
  timezone: string;
  businessStartHour: number;
  businessEndHour: number;
  maxBookingsPerHour: number;
  updatedAt: string | null;
};

export type WhatsAppSdrAppointmentSummary = {
  id: string;
  leadId: string;
  conversationId: string | null;
  instanceId: string | null;
  agentKey: string | null;
  assignedAdminUserId: string | null;
  assignedAdminName: string | null;
  assignedAdminPhone: string | null;
  status: SdrAppointmentStatus;
  scheduledFor: string;
  timezone: string;
  hourBucket: string;
  slotPosition: number;
  leadName: string;
  leadPhone: string;
  leadEmail: string | null;
  scheduleLabel: string;
  conversationSummary: string;
  sdrBriefing: string;
  qualificationSnapshot: Record<string, unknown>;
  notificationPayload: Record<string, unknown>;
  notifiedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WhatsAppSdrAppointmentMetrics = {
  today: number;
  upcoming: number;
  active: number;
  fullHours: number;
};

export type WhatsAppSdrAppointmentData = {
  generatedAt: string;
  settings: WhatsAppSdrAppointmentSettings;
  recipients: WhatsAppSdrAppointmentRecipient[];
  appointments: WhatsAppSdrAppointmentSummary[];
  metrics: WhatsAppSdrAppointmentMetrics;
};
