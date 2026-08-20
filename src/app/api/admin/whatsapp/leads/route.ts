import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { runWhatsAppLeadAction, type WhatsAppLeadAction } from "@/lib/whatsapp/lead-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedActions = new Set<WhatsAppLeadAction>([
  "pause_ai",
  "resume_ai",
  "opt_out",
  "clear_opt_out",
  "cancel_followups",
  "schedule_followup",
  "review_good",
  "review_bad",
  "update_internal_context",
  "update_crm_stage",
]);

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function cleanStringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  return cleanString(value)
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isWhatsAppLeadAction(value: string): value is WhatsAppLeadAction {
  return allowedActions.has(value as WhatsAppLeadAction);
}

function revalidateWhatsAppPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/whatsapp");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/whatsapp/crm");
  revalidatePath("/api/admin/whatsapp/leads");
  revalidatePath("/api/admin/whatsapp/followups");
  revalidatePath("/api/admin/whatsapp/health");
}

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = cleanString(body.action);

  if (!isWhatsAppLeadAction(action)) {
    return NextResponse.json({ success: false, error: "Acao de lead WhatsApp invalida." }, { status: 400 });
  }

  const result = await runWhatsAppLeadAction({
    action,
    leadId: cleanString(body.leadId),
    conversationId: cleanString(body.conversationId),
    agentKey: cleanString(body.agentKey),
    note: cleanString(body.note),
    internalNote: cleanString(body.internalNote),
    internalTags: cleanStringList(body.internalTags),
    assignedToLabel: cleanString(body.assignedToLabel),
    crmStage: cleanString(body.crmStage),
    reviewedByLabel: cleanString(body.reviewedByLabel, authorization.admin?.name || "Painel WhatsApp"),
    scheduledFor: cleanString(body.scheduledFor),
  });

  revalidateWhatsAppPaths();

  return NextResponse.json(
    {
      success: result.ok,
      data: result,
      error: result.error,
    },
    { status: result.ok ? 200 : 400 }
  );
}
