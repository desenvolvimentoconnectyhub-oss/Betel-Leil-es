import { formatOpportunityWhatsAppMessage } from '@/lib/domain/opportunity-whatsapp-message';
import "server-only";
import { getBetelPublicOrigin } from "@/lib/public-origin";
import { canonicalReferenceUrl } from "@/lib/domain/market-quality";
import { createHash } from "node:crypto";
import { checkWhatsAppSenderConnection } from "@/lib/communication/connectyhub-client";
import { getApprovedMarketPublication } from "@/lib/market/approved-publication";
import { selectRentalReferences } from "@/lib/domain/rental-references";
import { verifyMarketReference } from "@/lib/market/reference-access";

import { inngest } from "@/inngest/client";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";
import type { PropertyMarketAnalysis } from "@/lib/admin/market-analysis";

import { WILLIAN_AGENT_KEY, type WhatsAppActionButtonInput } from "@/lib/communication/connectyhub-client";
import { listSystemWhatsAppSenderOptions } from "@/lib/communication/system-whatsapp-sender";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { readCurrentWhatsAppGroups, getWhatsAppCommunityData, createWhatsAppCommunityCampaign, processWhatsAppCommunityCampaigns, type WhatsAppCommunityDestination } from "./group-campaigns";

type DbRow = Record<string, unknown>;


const MIN_PUBLICATION_REFERENCE_LINKS = 3;

export type OpportunityWhatsAppPublicationMode =
  | "default_group"
  | "specific_group"
  | "channel"
  | "broadcast_list"
  | "test_number";

export type OpportunityWhatsAppLinkFormat = "source_buttons" | "source_links";

export type OpportunityWhatsAppSourceLink = {
  label: string;
  url: string;
};

export type OpportunityWhatsAppAgentOption = {
  agentKey: string;
  label: string;
  instanceId: string;
  phone: string;
  status: string;
  connected: boolean;
};

export type OpportunityWhatsAppDestinationOption = {
  id: string;
  instanceId: string;
  agentKey: string;
  destinationType: WhatsAppCommunityDestination["destinationType"];
  jid: string;
  name: string;
  status: WhatsAppCommunityDestination["status"];
  participantCount: number;
};

export type OpportunityWhatsAppPublicationOptions = {
  agents: OpportunityWhatsAppAgentOption[];
  destinations: OpportunityWhatsAppDestinationOption[];
  defaultAgentKey: string;
  defaultGroupId: string;
};

export type OpportunityWhatsAppReferenceStatus = {
  candidateCount?: number;
  requiredCount: number;
  validCount: number;
  ready: boolean;
  reason: string;
};

export type OpportunityWhatsAppPost = {
  opportunityCode: string;
  title: string;
  caption: string;
  buttonText: string;
  buttonLabel: string;
  publicUrl: string;
  imageUrl: string;
  linkFormat: OpportunityWhatsAppLinkFormat;
  auctionUrl: string;
  sourceLinks: OpportunityWhatsAppSourceLink[];
  actionButton?: WhatsAppActionButtonInput;
  auctionActionButton?: WhatsAppActionButtonInput;
  auctionButtonText?: string;
};

type ImmediateWhatsAppProcessingResult = {
  ok: boolean;
  processed: number;
  sent: number;
  failed: number;
  timestamp?: string;
  error?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appUrl() {
  return getBetelPublicOrigin();
}

function publicOpportunityUrl(code: string) {
  return `${appUrl()}/oportunidades/${encodeURIComponent(code)}`;
}

async function requestImmediateWhatsAppCampaignProcessing(campaignId: string) {
  const cleanId = cleanString(campaignId);
  if (!cleanId) return false;

  try {
    await inngest.send({
      name: "whatsapp-group/campaign.process",
      data: { campaignId: cleanId },
    });
    return true;
  } catch {
    return false;
  }
}

async function processOpportunityWhatsAppCampaignNow(campaignId: string): Promise<ImmediateWhatsAppProcessingResult> {
  const cleanId = cleanString(campaignId);
  if (!cleanId) return { ok: false, processed: 0, sent: 0, failed: 1, error: "Campanha WhatsApp ausente." };

  try {
    return await processWhatsAppCommunityCampaigns({
      campaignId: cleanId,
      dryRun: false,
      limit: 1,
    });
  } catch (error) {
    return {
      ok: false,
      processed: 0,
      sent: 0,
      failed: 1,
      error: error instanceof Error ? error.message : "Nao foi possivel processar a campanha WhatsApp agora.",
    };
  }
}

function shouldProcessImmediately(mode: OpportunityWhatsAppPublicationMode) {
  return mode !== "broadcast_list";
}

function normalizePublicationLinkFormat(value: unknown): OpportunityWhatsAppLinkFormat {
  if (value === "source_links") return value;
  return "source_buttons";
}

function buildPublicationReferenceLinks(analysis: PropertyMarketAnalysis | null, publicUrl: string, auctionUrl: string) {
  return analysis ? selectRentalReferences(analysis).filter(link => link.url !== publicUrl && link.url !== auctionUrl) : [];
}

export function getOpportunityWhatsAppReferenceStatus(
  analysis: PropertyMarketAnalysis | null,
  publicUrl = "",
  auctionUrl = ""
): OpportunityWhatsAppReferenceStatus {
  const candidateCount = buildPublicationReferenceLinks(analysis, publicUrl, auctionUrl).length;
  const approved = Boolean(analysis && ["approved","approved_with_notes"].includes(analysis.status) && analysis.rawPayload?.approvedPublicationId);
  const approvedUrls = analysis?.rawPayload?.approvedReferenceUrls;
  const validCount = approved && Array.isArray(approvedUrls) ? new Set(approvedUrls.filter((url): url is string => typeof url === "string").map(canonicalReferenceUrl).filter(Boolean)).size : 0;
  const ready = approved && validCount === MIN_PUBLICATION_REFERENCE_LINKS;
  return {
    candidateCount,
    requiredCount: MIN_PUBLICATION_REFERENCE_LINKS,
    validCount,
    ready,
    reason: ready
      ? ""
      : `${candidateCount}/3 candidatos de aluguel. Verificacao de acesso e aprovacao humana pendentes.`,
  };
}

export async function buildOpportunityWhatsAppPost(
  opportunityCode: string,
  options: { linkFormat?: OpportunityWhatsAppLinkFormat } = {}
): Promise<DataResult<OpportunityWhatsAppPost | null>> {
  const code = cleanString(opportunityCode);
  if (!code) return { data: null, source: "supabase", reason: "Oportunidade nao informada." };

  const publication = await getApprovedMarketPublication(code);
  if (!publication) return { data: null, source: "supabase", reason: "A publicacao exige uma versao aprovada com tres referencias verificadas. Revise e aprove a analise." };
  const { opportunity, analysis, references: sourceLinks } = publication;
  return { data: formatOpportunityWhatsAppMessage(opportunity, analysis, sourceLinks, publicOpportunityUrl(opportunity.id || code), options.linkFormat, code), source: "supabase" };
}

function normalizeAgentOption(row: Awaited<ReturnType<typeof listSystemWhatsAppSenderOptions>>[number]): OpportunityWhatsAppAgentOption {
  const label = [row.instanceName || row.agentKey, row.phone].filter(Boolean).join(" - ");
  return {
    agentKey: cleanString(row.agentKey, WILLIAN_AGENT_KEY),
    label: cleanString(label, row.agentKey || "Agente WhatsApp"),
    instanceId: row.id,
    phone: row.phone,
    status: row.status,
    connected: row.connected,
  };
}

function normalizeDestinationOption(row: DbRow): OpportunityWhatsAppDestinationOption {
  return {
    id: cleanString(row.id),
    instanceId: cleanString(row.instance_id),
    agentKey: cleanString(row.agent_key, WILLIAN_AGENT_KEY),
    destinationType: cleanString(row.destination_type, "group") as OpportunityWhatsAppDestinationOption["destinationType"],
    jid: cleanString(row.jid),
    name: cleanString(row.name, "Destino WhatsApp"),
    status: cleanString(row.status, "paused") as OpportunityWhatsAppDestinationOption["status"],
    participantCount: asNumber(row.participant_count),
  };
}

function canUseDestinationForManualPublication(destination: OpportunityWhatsAppDestinationOption) {
  return destination.status === "active" || destination.status === "paused";
}

export async function getOpportunityWhatsAppPublicationOptions(): Promise<OpportunityWhatsAppPublicationOptions> {
  const agents = (await listSystemWhatsAppSenderOptions()).map(normalizeAgentOption);
  // Membership is loaded fresh when opening the modal; never seed it with historical rows.
  return { agents, destinations: [], defaultAgentKey: agents[0]?.agentKey || WILLIAN_AGENT_KEY, defaultGroupId: "" };
}

function normalizeBroadcastTarget(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (clean.includes("@") && !clean.includes("@g.us") && !clean.includes("@newsletter")) return clean;
  const digits = clean.replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

async function loadDestinationById(id: string, agentKey: string): Promise<OpportunityWhatsAppDestinationOption | null> {
  const supabase = getSupabaseAdminClient();
  const destinationId = cleanString(id);
  if (!supabase || !destinationId) return null;

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,instance_id,destination_type,jid,name,status,participant_count")
    .eq("id", destinationId)
    .maybeSingle();

  if (error || !data) return null;
  const destination = normalizeDestinationOption(data as DbRow);
  if (destination.agentKey !== agentKey) return null;
  const current = await readCurrentWhatsAppGroups(agentKey);
  return destination.instanceId === current.instanceId && current.jids.includes(destination.jid) ? destination : null;
}

async function defaultGroupForAgent(agentKey: string) {
  const data = await getWhatsAppCommunityData(agentKey);
  return data.ok ? data.destinations.find(item => item.destinationType === "group" && canUseDestinationForManualPublication(item)) || null : null;
}

async function broadcastTargetsFromGroup(destinationId: string) {
  const supabase = getSupabaseAdminClient();
  const cleanId = cleanString(destinationId);
  if (!supabase || !cleanId) return [];

  const { data, error } = await supabase
    .from("whatsapp_group_participants")
    .select("participant_jid,phone")
    .eq("destination_id", cleanId)
    .limit(1000);

  if (error) return [];
  return ((data || []) as DbRow[])
    .map((row) => normalizeBroadcastTarget(row.phone || row.participant_jid))
    .filter(Boolean);
}

async function rawOpportunityId(code: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return "";
  const { data } = await supabase
    .from("auction_opportunities")
    .select("id")
    .eq("code", cleanString(code))
    .maybeSingle();
  return cleanString((data as DbRow | null)?.id);
}

async function recordOpportunityWhatsAppPublicationAudit(input: {
  opportunityCode: string;
  actorName?: string;
  eventType: string;
  status: string;
  payload: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return;

  const opportunityId = await rawOpportunityId(input.opportunityCode);
  if (!opportunityId) return;

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: cleanString(input.actorName, "Analise de mercado"),
    event_type: input.eventType,
    status: input.status,
    payload: {
      opportunityCode: input.opportunityCode,
      ...input.payload,
    },
  });
}

export async function scheduleOpportunityWhatsAppPublication(input: {
  opportunityCode: string;
  mode: OpportunityWhatsAppPublicationMode;
  linkFormat?: OpportunityWhatsAppLinkFormat;
  agentKey?: string;
  destinationId?: string;
  broadcastSourceDestinationId?: string;
  broadcastTargets?: string[];
  approvedByAdminUserId?: string;
  approvedByName?: string;
}): Promise<
  MutationResult<{
    campaignId: string;
    targets: number;
    publicUrl: string;
    skipped?: boolean;
    immediateDispatchRequested?: boolean;
    immediateProcessing?: ImmediateWhatsAppProcessingResult;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const linkFormat = normalizePublicationLinkFormat(input.linkFormat);
  const postResult = await buildOpportunityWhatsAppPost(input.opportunityCode, { linkFormat });
  const post = postResult.data;
  if (!post) {
    const reason = postResult.reason || "Nao foi possivel gerar a publicacao WhatsApp.";
    await recordOpportunityWhatsAppPublicationAudit({
      opportunityCode: input.opportunityCode,
      actorName: input.approvedByName,
      eventType: "opportunity_whatsapp_publication_blocked",
      status: "blocked",
      payload: {
        reason,
        publicationMode: input.mode,
        linkFormat,
        approvedByAdminUserId: cleanString(input.approvedByAdminUserId),
        source: postResult.source,
      },
    });
    return { ok: false, error: reason };
  }

  const referenceChecks = await Promise.all(post.sourceLinks.map(link => verifyMarketReference(link.url)));
  if (referenceChecks.some(check => !check.ok)) return { ok: false, error: "Uma referencia aprovada esta indisponivel. Revise a analise antes de enviar." };

  let agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  let destinationIds: string[] = [];
  let destinationJids: string[] = [];
  let destinationType: OpportunityWhatsAppDestinationOption["destinationType"] | undefined;
  let targetKey: string = input.mode;

  if (input.mode === "default_group") {
    const explicitDestination = await loadDestinationById(cleanString(input.destinationId), agentKey);
    const destination = input.destinationId ? explicitDestination : await defaultGroupForAgent(agentKey);
    if (!destination || destination.destinationType !== "group") {
      return { ok: false, error: "Nenhum grupo padrao ativo encontrado para este agente." };
    }
    if (!canUseDestinationForManualPublication(destination)) return { ok: false, error: "O grupo selecionado nao esta disponivel para envio." };
    agentKey = cleanString(destination.agentKey, agentKey);
    destinationIds = [destination.id];
    targetKey = destination.id;
  }

  if (input.mode === "specific_group" || input.mode === "channel") {
    const destination = await loadDestinationById(cleanString(input.destinationId), agentKey);
    const expectedType = input.mode === "channel" ? "channel" : "group";
    if (!destination || destination.destinationType !== expectedType) {
      return { ok: false, error: input.mode === "channel" ? "Canal WhatsApp invalido." : "Grupo WhatsApp invalido." };
    }
    if (!canUseDestinationForManualPublication(destination)) return { ok: false, error: "O destino selecionado nao esta disponivel para envio." };
    if (agentKey && destination.agentKey !== agentKey) {
      return { ok: false, error: "O destino selecionado pertence a outro agente WhatsApp." };
    }
    agentKey = cleanString(destination.agentKey, agentKey);
    destinationIds = [destination.id];
    targetKey = destination.id;
  }

  if (input.mode === "broadcast_list" || input.mode === "test_number") {
    const sourceDestination = await loadDestinationById(cleanString(input.broadcastSourceDestinationId), agentKey);
    if (input.broadcastSourceDestinationId && !sourceDestination) return { ok: false, error: "O grupo de origem não pertence à conexão atual." };
    if (input.mode === "broadcast_list" && sourceDestination) {
      if (sourceDestination.destinationType !== "group") return { ok: false, error: "A lista so pode ser montada a partir de um grupo." };
      if (!canUseDestinationForManualPublication(sourceDestination)) return { ok: false, error: "O grupo de origem da lista nao esta disponivel para envio." };
      if (agentKey && sourceDestination.agentKey !== agentKey) {
        return { ok: false, error: "O grupo de origem pertence a outro agente WhatsApp." };
      }
      agentKey = cleanString(sourceDestination.agentKey, agentKey);
      destinationJids.push(...(await broadcastTargetsFromGroup(sourceDestination.id)));
      targetKey = sourceDestination.id;
    }

    destinationJids.push(...(input.broadcastTargets || []).map(normalizeBroadcastTarget).filter(Boolean));
    destinationJids = [...new Set(destinationJids)].slice(0, input.mode === "test_number" ? 1 : 500);
    destinationType = "contact_list";

    if (!destinationJids.length) {
      return {
        ok: false,
        error:
          input.mode === "test_number"
            ? "Informe um numero de teste para envio WhatsApp."
            : "Informe uma lista de contatos ou escolha um grupo sincronizado como origem.",
      };
    }

    if (input.mode === "test_number") targetKey = destinationJids[0] || "test_number";
  }

  const senderConnection = await checkWhatsAppSenderConnection(agentKey);
  if (!senderConnection.connected) return { ok: false, error: senderConnection.error || "Conexao WhatsApp nao confirmada." };
  const publicationKey = [
    createHash("sha256").update(JSON.stringify(post)).digest("hex"),
    post.opportunityCode,
    agentKey,
    input.mode,
    post.linkFormat,
    targetKey,
    ...destinationIds,
    ...destinationJids.slice(0, 20),
  ].join(":");

  if (input.mode !== "test_number") {
    const existing = await supabase
      .from("whatsapp_group_campaigns")
      .select("id")
      .eq("agent_key", agentKey)
      .eq("product_ref", post.opportunityCode)
      .in("status", ["draft", "scheduled", "running", "paused", "failed", "completed"])
      .contains("metadata", { publicationKey })
      .maybeSingle();

    if (existing.data) {
      const campaignId = cleanString((existing.data as DbRow).id);
      const immediateProcessing = shouldProcessImmediately(input.mode)
        ? await processOpportunityWhatsAppCampaignNow(campaignId)
        : undefined;
      if (shouldProcessImmediately(input.mode) && immediateProcessing && immediateProcessing.failed > 0 && !immediateProcessing.sent) {
        const reason =
          immediateProcessing.error ||
          "A campanha existente foi localizada, mas a ConnectyHub nao confirmou o envio para o destino selecionado. Confira o agente e tente novamente.";
        await recordOpportunityWhatsAppPublicationAudit({
          opportunityCode: post.opportunityCode,
          actorName: input.approvedByName,
          eventType: "opportunity_whatsapp_publication_failed",
          status: "failed",
          payload: {
            campaignId,
            reason,
            publicationMode: input.mode,
            agentKey,
            targetKey,
            linkFormat: post.linkFormat,
            immediateProcessing,
          },
        });
        return {
          ok: false,
          error: reason,
        };
      }
      return {
        ok: true,
        data: {
          campaignId,
          targets: 0,
          publicUrl: post.publicUrl,
          skipped: true,
          immediateProcessing,
          immediateDispatchRequested: immediateProcessing?.sent ? false : await requestImmediateWhatsAppCampaignProcessing(campaignId),
        },
      };
    }
  }

  const campaign = await createWhatsAppCommunityCampaign({
    agentKey,
    name: `Divulgacao ${post.opportunityCode}`,
    subject: post.title,
    bodyText: post.caption,
    mediaUrl: post.imageUrl,
    mediaType: post.imageUrl ? "image" : "",
    actionButton: post.actionButton,
    buttonText: post.buttonText,
    destinationIds,
    destinationJids,
    destinationType,
    campaignType: "product",
    approvalMode: "manual",
    scheduledFor: new Date().toISOString(),
    dailyLimit: input.mode === "broadcast_list" ? 80 : 20,
    productRef: post.opportunityCode,
    metadata: {
      createdFrom: "market_approval",
      publicationKey,
      senderProviderInstanceId: senderConnection.instanceId,
      publicationMode: input.mode,
      opportunityCode: post.opportunityCode,
      publicUrl: post.publicUrl,
      imageUrl: post.imageUrl,
      linkFormat: post.linkFormat,
      auctionUrl: post.auctionUrl,
      auctionActionButton: post.auctionActionButton,
      auctionButtonText: post.auctionButtonText,
      sourceLinks: post.sourceLinks,
      approvedByAdminUserId: cleanString(input.approvedByAdminUserId),
      approvedByName: cleanString(input.approvedByName),
    },
  });

  const campaignId = cleanString(campaign.campaignId);
  const immediateProcessing = shouldProcessImmediately(input.mode)
    ? await processOpportunityWhatsAppCampaignNow(campaignId)
    : undefined;
  const immediateDispatchRequested = immediateProcessing?.sent ? false : await requestImmediateWhatsAppCampaignProcessing(campaignId);
  if (shouldProcessImmediately(input.mode) && immediateProcessing && immediateProcessing.failed > 0 && !immediateProcessing.sent) {
    const reason =
      immediateProcessing.error ||
      "Campanha criada, mas a ConnectyHub nao confirmou o envio para o destino selecionado. Confira o agente e tente novamente.";
    await recordOpportunityWhatsAppPublicationAudit({
      opportunityCode: post.opportunityCode,
      actorName: input.approvedByName,
      eventType: "opportunity_whatsapp_publication_failed",
      status: "failed",
      payload: {
        campaignId,
        reason,
        publicationMode: input.mode,
        agentKey,
        destinationIds,
        destinationJids: destinationJids.slice(0, 50),
        linkFormat: post.linkFormat,
        auctionUrl: post.auctionUrl,
        sourceLinks: post.sourceLinks,
        immediateDispatchRequested,
        immediateProcessing,
      },
    });
    return {
      ok: false,
      error: reason,
    };
  }

  const opportunityId = await rawOpportunityId(post.opportunityCode);
  if (opportunityId) {
    await supabase.from("audit_logs").insert({
      opportunity_id: opportunityId,
      actor_name: cleanString(input.approvedByName, "Analise de mercado"),
      event_type: "opportunity_whatsapp_publication_scheduled",
      status: "scheduled",
      payload: {
        campaignId,
        opportunityCode: post.opportunityCode,
        publicationMode: input.mode,
        agentKey,
        destinationIds,
        destinationJids: destinationJids.slice(0, 50),
        publicUrl: post.publicUrl,
        linkFormat: post.linkFormat,
        auctionUrl: post.auctionUrl,
        sourceLinks: post.sourceLinks,
        immediateDispatchRequested,
        immediateProcessing,
      },
    });
  }

  return {
    ok: true,
    data: {
      campaignId,
      targets: campaign.targets,
      publicUrl: post.publicUrl,
      immediateDispatchRequested,
      immediateProcessing,
    },
  };
}
