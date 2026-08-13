import "server-only";

import { getAuctionOpportunityByCode, getPropertyMarketAnalysisByOpportunityCode } from "@/lib/admin/repository";
import type { DataResult, MutationResult } from "@/lib/admin/repository/shared";
import type { PropertyMarketAnalysis } from "@/lib/admin/market-analysis";
import type { AuctionOpportunity, PropertyImageAsset } from "@/lib/admin/resources";
import { WILLIAN_AGENT_KEY } from "@/lib/communication/connectyhub-client";
import { listSystemWhatsAppSenderOptions } from "@/lib/communication/system-whatsapp-sender";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createWhatsAppCommunityCampaign, type WhatsAppCommunityDestination } from "./group-campaigns";

type DbRow = Record<string, unknown>;
const WHATSAPP_TEASER_MAX_LENGTH = 850;

export type OpportunityWhatsAppPublicationMode =
  | "default_group"
  | "specific_group"
  | "channel"
  | "broadcast_list"
  | "test_number";

export type OpportunityWhatsAppAgentOption = {
  agentKey: string;
  label: string;
  instanceId: string;
  phone: string;
};

export type OpportunityWhatsAppDestinationOption = {
  id: string;
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

export type OpportunityWhatsAppPost = {
  opportunityCode: string;
  title: string;
  caption: string;
  buttonText: string;
  buttonLabel: string;
  publicUrl: string;
  imageUrl: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

function appUrl() {
  const vercelUrl = process.env.VERCEL_URL?.trim();
  const fallbackVercel = vercelUrl ? `https://${vercelUrl.replace(/^https?:\/\//i, "")}` : "";
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    fallbackVercel ||
    "http://localhost:3000"
  ).replace(/\/+$/g, "");
}

function publicOpportunityUrl(code: string) {
  return `${appUrl()}/oportunidades/${encodeURIComponent(code)}`;
}

function formatCurrency(value: number) {
  if (!value) return "";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPct(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatArea(value: number) {
  if (!value) return "";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2`;
}

function formatDate(value: string) {
  if (!value) return "";
  const parsed = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function compactTitle(opportunity: AuctionOpportunity) {
  const prefix = cleanString(opportunity.propertyType, "Imovel");
  const title = cleanString(opportunity.title, prefix);
  return title.toLowerCase().includes(prefix.toLowerCase()) ? title : `${prefix} - ${title}`;
}

function truncateSingleLine(value: string, maxLength: number) {
  const cleaned = cleanString(value).replace(/\s+/g, " ");
  if (!cleaned || cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function publicDecisionLabel(analysis: PropertyMarketAnalysis | null) {
  const labels: Record<PropertyMarketAnalysis["decision"], string> = {
    excellent: "🟢 oportunidade forte",
    good: "🟢 boa oportunidade",
    caution: "🟡 exige cautela",
    review: "🟡 em validacao",
    reject: "🟡 requer analise cuidadosa",
  };

  return analysis?.decision ? labels[analysis.decision] : "🔎 analise disponivel";
}

function analysisArea(analysis?: PropertyMarketAnalysis | null) {
  const subject = analysis?.subject;
  return subject?.privateAreaM2 || subject?.builtAreaM2 || subject?.landAreaM2 || 0;
}

function primaryImageUrl(images?: PropertyImageAsset[]) {
  const usable = (images || []).filter((image) => image.url && image.status !== "failed");
  return (
    usable.find((image) => image.status === "mirrored")?.url ||
    usable.find((image) => /^https?:\/\//i.test(image.url))?.url ||
    ""
  );
}

function line(label: string, value: string) {
  return value ? `${label}: ${value}` : "";
}

function compactCaption(lines: string[]) {
  const caption = lines
    .filter((item, index, items) => item || (index > 0 && items[index - 1]))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (caption.length <= WHATSAPP_TEASER_MAX_LENGTH) return caption;

  const suffix = "\n\n🔎 Analise completa, fotos e pontos de atencao na ficha Betel.";
  const available = Math.max(0, WHATSAPP_TEASER_MAX_LENGTH - suffix.length);
  return `${caption.slice(0, available).replace(/\s+\S*$/g, "").trim()}${suffix}`;
}

export async function buildOpportunityWhatsAppPost(opportunityCode: string): Promise<DataResult<OpportunityWhatsAppPost | null>> {
  const code = cleanString(opportunityCode);
  if (!code) return { data: null, source: "supabase", reason: "Oportunidade nao informada." };

  const [opportunityResult, analysisResult] = await Promise.all([
    getAuctionOpportunityByCode(code),
    getPropertyMarketAnalysisByOpportunityCode(code),
  ]);

  const opportunity = opportunityResult.data;
  if (!opportunity) {
    return { data: null, source: opportunityResult.source, reason: opportunityResult.reason || "Oportunidade nao encontrada." };
  }

  const analysis = analysisResult.data;
  const title = compactTitle(opportunity);
  const location = [opportunity.city, opportunity.state].filter(Boolean).join("/");
  const area = formatArea(analysisArea(analysis));
  const marketValue = formatCurrency(analysis?.marketValueBase || opportunity.appraisalValue);
  const bid = formatCurrency(analysis?.initialBid || opportunity.initialBid);
  const discount = formatPct(analysis?.realDiscountPct || opportunity.discountPct);
  const rent = formatCurrency(analysis?.rentalEstimate.monthlyRent || 0);
  const ceilingTargets = (analysis?.ceilingTargets || [])
    .slice(0, 2)
    .map((target) => `${target.label} -> ${formatCurrency(target.value)}`)
    .filter(Boolean);
  const publicUrl = publicOpportunityUrl(opportunity.id || code);
  const publicSignal = publicDecisionLabel(analysis);

  const caption = compactCaption([
    `🏠 *${truncateSingleLine(title, 110)}*`,
    location ? `📍 ${location}` : "",
    line("📅 Leilao", formatDate(opportunity.auctionDate)),
    line("📐 Area", area),
    "",
    line("💰 Mercado ajustado", marketValue),
    line("🏷️ Lance", bid),
    line("📉 Desconto", discount),
    ceilingTargets.length ? line("🎯 Teto Betel", ceilingTargets.join(" | ")) : "",
    rent ? "" : "",
    line("🔑 Aluguel estimado", rent),
    "",
    `Sinal Betel: ${publicSignal}.`,
    "🔎 Analise completa, fotos e pontos de atencao na ficha Betel.",
  ]);

  return {
    data: {
      opportunityCode: opportunity.id || code,
      title,
      caption,
      buttonText: "👇 Veja fotos, riscos e analise completa na ficha Betel.",
      buttonLabel: "Ver imovel",
      publicUrl,
      imageUrl: primaryImageUrl(opportunity.images),
    },
    source: opportunityResult.source === "supabase" || analysisResult.source === "supabase" ? "supabase" : "mock",
    reason: analysisResult.reason,
  };
}

function normalizeAgentOption(row: Awaited<ReturnType<typeof listSystemWhatsAppSenderOptions>>[number]): OpportunityWhatsAppAgentOption {
  const label = [row.instanceName || row.agentKey, row.phone].filter(Boolean).join(" - ");
  return {
    agentKey: cleanString(row.agentKey, WILLIAN_AGENT_KEY),
    label: cleanString(label, row.agentKey || "Agente WhatsApp"),
    instanceId: row.id,
    phone: row.phone,
  };
}

function normalizeDestinationOption(row: DbRow): OpportunityWhatsAppDestinationOption {
  return {
    id: cleanString(row.id),
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
  const supabase = getSupabaseAdminClient();
  const agents = (await listSystemWhatsAppSenderOptions()).map(normalizeAgentOption);
  const agentKeys = [...new Set(agents.map((agent) => agent.agentKey).filter(Boolean))];

  if (!supabase) {
    return {
      agents,
      destinations: [],
      defaultAgentKey: agents[0]?.agentKey || WILLIAN_AGENT_KEY,
      defaultGroupId: "",
    };
  }

  let query = supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count,updated_at")
    .neq("status", "archived")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (agentKeys.length) query = query.in("agent_key", agentKeys);

  const { data, error } = await query;
  const destinations = error ? [] : ((data || []) as DbRow[]).map(normalizeDestinationOption).filter((item) => item.id && item.jid);
  const activeGroup = destinations.find(
    (destination) => canUseDestinationForManualPublication(destination) && destination.destinationType === "group"
  );

  return {
    agents,
    destinations,
    defaultAgentKey: activeGroup?.agentKey || agents[0]?.agentKey || WILLIAN_AGENT_KEY,
    defaultGroupId: activeGroup?.id || "",
  };
}

function normalizeBroadcastTarget(value: unknown) {
  const clean = cleanString(value);
  if (!clean) return "";
  if (clean.includes("@") && !clean.includes("@g.us") && !clean.includes("@newsletter")) return clean;
  const digits = clean.replace(/\D/g, "");
  return digits.length >= 10 ? digits : "";
}

async function loadDestinationById(id: string): Promise<OpportunityWhatsAppDestinationOption | null> {
  const supabase = getSupabaseAdminClient();
  const destinationId = cleanString(id);
  if (!supabase || !destinationId) return null;

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count")
    .eq("id", destinationId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeDestinationOption(data as DbRow);
}

async function defaultGroupForAgent(agentKey: string) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("whatsapp_group_destinations")
    .select("id,agent_key,destination_type,jid,name,status,participant_count")
    .eq("agent_key", cleanString(agentKey, WILLIAN_AGENT_KEY))
    .eq("destination_type", "group")
    .in("status", ["active", "paused"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeDestinationOption(data as DbRow);
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

export async function scheduleOpportunityWhatsAppPublication(input: {
  opportunityCode: string;
  mode: OpportunityWhatsAppPublicationMode;
  agentKey?: string;
  destinationId?: string;
  broadcastSourceDestinationId?: string;
  broadcastTargets?: string[];
  approvedByAdminUserId?: string;
  approvedByName?: string;
}): Promise<MutationResult<{ campaignId: string; targets: number; publicUrl: string; skipped?: boolean }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const postResult = await buildOpportunityWhatsAppPost(input.opportunityCode);
  const post = postResult.data;
  if (!post) return { ok: false, error: postResult.reason || "Nao foi possivel gerar a publicacao WhatsApp." };

  let agentKey = cleanString(input.agentKey, WILLIAN_AGENT_KEY);
  let destinationIds: string[] = [];
  let destinationJids: string[] = [];
  let destinationType: OpportunityWhatsAppDestinationOption["destinationType"] | undefined;
  let targetKey: string = input.mode;

  if (input.mode === "default_group") {
    const explicitDestination = await loadDestinationById(cleanString(input.destinationId));
    const destination = explicitDestination || (await defaultGroupForAgent(agentKey));
    if (!destination || destination.destinationType !== "group") {
      return { ok: false, error: "Nenhum grupo padrao ativo encontrado para este agente." };
    }
    if (!canUseDestinationForManualPublication(destination)) return { ok: false, error: "O grupo selecionado nao esta disponivel para envio." };
    agentKey = cleanString(destination.agentKey, agentKey);
    destinationIds = [destination.id];
    targetKey = destination.id;
  }

  if (input.mode === "specific_group" || input.mode === "channel") {
    const destination = await loadDestinationById(cleanString(input.destinationId));
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
    const sourceDestination = await loadDestinationById(cleanString(input.broadcastSourceDestinationId));
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

  const publicationKey = [
    post.opportunityCode,
    agentKey,
    input.mode,
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
      .contains("metadata", { publicationKey })
      .maybeSingle();

    if (existing.data) {
      return {
        ok: true,
        data: {
          campaignId: cleanString((existing.data as DbRow).id),
          targets: 0,
          publicUrl: post.publicUrl,
          skipped: true,
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
    actionButton: {
      label: post.buttonLabel,
      url: post.publicUrl,
      footerText: "Betel Leiloes",
    },
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
      publicationMode: input.mode,
      opportunityCode: post.opportunityCode,
      publicUrl: post.publicUrl,
      imageUrl: post.imageUrl,
      approvedByAdminUserId: cleanString(input.approvedByAdminUserId),
      approvedByName: cleanString(input.approvedByName),
    },
  });

  const campaignId = cleanString(campaign.campaignId);
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
      },
    });
  }

  return {
    ok: true,
    data: {
      campaignId,
      targets: campaign.targets,
      publicUrl: post.publicUrl,
    },
  };
}
