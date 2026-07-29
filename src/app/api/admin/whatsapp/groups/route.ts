import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  createWhatsAppCommunityCampaign,
  getWhatsAppCommunityData,
  syncWhatsAppCommunityDestinations,
  updateWhatsAppCommunityDestination,
} from "@/lib/whatsapp/group-campaigns";
import { WILLIAN_AGENT_KEY } from "@/lib/communication/connectyhub-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringList(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean);
  return cleanString(value)
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function revalidateWhatsAppGroups() {
  revalidatePath("/admin/whatsapp");
  revalidatePath("/api/admin/whatsapp/groups");
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const agentKey = cleanString(url.searchParams.get("agentKey"), WILLIAN_AGENT_KEY);
  const data = await getWhatsAppCommunityData(agentKey);
  return NextResponse.json({ success: data.ok || data.migrationRequired, data });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;

  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "JSON invalido." }, { status: 400 });
  }

  const action = cleanString(body.action);
  const agentKey = cleanString(body.agentKey, WILLIAN_AGENT_KEY);

  try {
    let result: unknown;

    if (action === "sync") {
      result = await syncWhatsAppCommunityDestinations({
        agentKey,
        force: body.force === true,
        noParticipants: body.noParticipants === true,
      });
    } else if (action === "updateDestination") {
      result = await updateWhatsAppCommunityDestination({
        id: cleanString(body.id),
        status: cleanString(body.status) || undefined,
        replyMode: cleanString(body.replyMode) || undefined,
        respondWithMention: typeof body.respondWithMention === "boolean" ? body.respondWithMention : undefined,
        mentionAllAllowed: typeof body.mentionAllAllowed === "boolean" ? body.mentionAllAllowed : undefined,
        humanApprovalRequired: typeof body.humanApprovalRequired === "boolean" ? body.humanApprovalRequired : undefined,
        dailyMessageLimit: typeof body.dailyMessageLimit === "number" ? body.dailyMessageLimit : undefined,
        cooldownMinutes: typeof body.cooldownMinutes === "number" ? body.cooldownMinutes : undefined,
      });
    } else if (action === "createCampaign") {
      result = await createWhatsAppCommunityCampaign({
        agentKey,
        name: cleanString(body.name),
        bodyText: cleanString(body.bodyText),
        destinationIds: stringList(body.destinationIds),
        destinationJids: stringList(body.destinationJids),
        campaignType: cleanString(body.campaignType, "single"),
        approvalMode: cleanString(body.approvalMode, "manual"),
        scheduledFor: cleanString(body.scheduledFor),
        dailyLimit: typeof body.dailyLimit === "number" ? body.dailyLimit : undefined,
        mentionAllRequested: body.mentionAllRequested === true,
        mentionAllConfirmed: body.mentionAllConfirmed === true,
        aiEnabled: body.aiEnabled === true,
        voiceEnabled: body.voiceEnabled === true,
        voiceId: cleanString(body.voiceId),
        productRef: cleanString(body.productRef),
        subject: cleanString(body.subject),
        prompt: cleanString(body.prompt),
      });
    } else {
      return NextResponse.json({ success: false, error: "Acao invalida para grupos WhatsApp." }, { status: 400 });
    }

    revalidateWhatsAppGroups();
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Falha na operacao de grupos WhatsApp." },
      { status: 400 }
    );
  }
}
