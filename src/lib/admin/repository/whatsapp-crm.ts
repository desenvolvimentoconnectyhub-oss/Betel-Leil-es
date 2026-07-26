import type { ResourceTone } from "../resources";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  getSupabaseAdminClient,
  type DataResult,
} from "./shared";

type DbRow = Record<string, unknown>;

export type WhatsAppCrmMetric = {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
};

export type WhatsAppCrmAgentSummary = {
  agentKey: string;
  name: string;
  status: string;
  phone: string;
  instanceName: string;
  connected: boolean;
  conversations: number;
  openConversations: number;
  handoffs: number;
  averageScore: number;
};

export type WhatsAppCrmQualification = {
  capital: string;
  region: string;
  propertyType: string;
  objective: string;
  experience: string;
  urgency: string;
};

export type WhatsAppCrmStage = "entrada" | "qualificando" | "quente" | "handoff" | "convertido" | "perdido";

export type WhatsAppCrmTimelineItem = {
  id: string;
  direction: string;
  authorType: string;
  authorLabel: string;
  messageType: string;
  text: string;
  transcript: string;
  mediaUrl: string;
  mediaMimeType: string;
  deliveryStatus: string;
  providerMessageId: string;
  createdAt: string;
  tone: ResourceTone;
};

export type WhatsAppCrmLeadCard = {
  id: string;
  leadId: string;
  conversationId: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  crmStage: WhatsAppCrmStage;
  temperature: string;
  score: number;
  source: string;
  agentKey: string;
  agentName: string;
  conversationStatus: string;
  humanInterventionActive: boolean;
  assignedToLabel: string;
  optOut: boolean;
  waitingForReply: boolean;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  lastMessageDirection: string;
  lastMessageAt: string;
  lastInboundAt: string;
  lastOutboundAt: string;
  lastMessagePreview: string;
  slaDueAt: string;
  slaStatus: "ok" | "urgente" | "vencido" | "pausado";
  followUpCount: number;
  nextFollowUpAt: string;
  nextAction: string;
  latestReviewScore: number;
  latestReviewVerdict: string;
  latestReviewAt: string;
  tags: string[];
  internalTags: string[];
  internalNotes: string;
  whatsappUrl: string;
  qualification: WhatsAppCrmQualification;
  timeline: WhatsAppCrmTimelineItem[];
};

export type WhatsAppFollowUpSummary = {
  id: string;
  leadName: string;
  phone: string;
  agentKey: string;
  reason: string;
  status: string;
  scheduledFor: string;
  attemptCount: number;
};

export type WhatsAppAgentReviewSummary = {
  id: string;
  conversationId: string;
  leadName: string;
  phone: string;
  agentKey: string;
  reviewType: string;
  score: number;
  verdict: string;
  flags: string[];
  notes: string;
  createdAt: string;
};

export type WhatsAppCrmData = {
  generatedAt: string;
  metrics: WhatsAppCrmMetric[];
  agents: WhatsAppCrmAgentSummary[];
  leads: WhatsAppCrmLeadCard[];
  followUps: WhatsAppFollowUpSummary[];
  reviews: WhatsAppAgentReviewSummary[];
};

const defaultAgentKey = "multichannel-dispatch";
const whatsappAgentKeys = new Set([defaultAgentKey, "willian", "willian-whatsapp"]);

function timestamp(value: unknown) {
  const text = asString(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function addMinutes(iso: string, minutes: number) {
  const base = timestamp(iso) || Date.now();
  return new Date(base + minutes * 60_000).toISOString();
}

function firstString(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const direct = asString(record[key]);
      if (direct) return direct;
    }
  }
  return "";
}

function arrayField(records: Record<string, unknown>[], keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value.map((item) => asString(item)).filter(Boolean);
      }
      const text = asString(value);
      if (text) {
        return text
          .split(/[;,]/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
  }
  return [];
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => asString(item)).filter(Boolean);
  const text = asString(value);
  if (!text) return [];
  return text.split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values: string[], limit = 8) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = value.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function nestedRecords(...values: unknown[]) {
  const records: Record<string, unknown>[] = [];

  for (const value of values) {
    const record = asRecord(value);
    if (Object.keys(record).length) records.push(record);
    for (const nestedKey of ["crm", "profile", "qualification", "collectedData", "leadData", "siteActivity"]) {
      const nested = asRecord(record[nestedKey]);
      if (Object.keys(nested).length) records.push(nested);
    }
  }

  return records;
}

function extractQualification(lead: DbRow, conversation: DbRow, profile?: DbRow): WhatsAppCrmQualification {
  const records = nestedRecords(profile?.metadata, profile, lead.metadata, conversation.metadata);
  const preferredRegions = arrayField(records, ["preferred_regions", "preferredRegions", "regions", "cities"]);
  const propertyTypes = arrayField(records, ["property_types", "propertyTypes", "propertyType", "tipo_imovel"]);
  const budgetMin = asNumber(profile?.budget_min, asNumber(firstString(records, ["budgetMin", "budget_min"]), 0));
  const budgetMax = asNumber(profile?.budget_max, asNumber(firstString(records, ["budgetMax", "budget_max", "capital"]), 0));
  const capital = budgetMax
    ? budgetMin
      ? `R$ ${Math.round(budgetMin).toLocaleString("pt-BR")} - R$ ${Math.round(budgetMax).toLocaleString("pt-BR")}`
      : `R$ ${Math.round(budgetMax).toLocaleString("pt-BR")}`
    : firstString(records, ["capital", "investmentRange", "budget", "faixa_investimento"]);

  return {
    capital,
    region: preferredRegions.join(", ") || firstString(records, ["region", "interest_region", "city", "cidade", "estado"]),
    propertyType: propertyTypes.join(", ") || firstString(records, ["propertyType", "property_type", "tipo", "tipo_imovel"]),
    objective: asString(profile?.investment_goal) || firstString(records, ["objective", "investmentGoal", "goal", "finalidade"]),
    experience: asString(profile?.experience_level) || firstString(records, ["experience", "experienceLevel", "experiencia"]),
    urgency: asString(profile?.urgency) || firstString(records, ["urgency", "timeline", "prazo"]),
  };
}

function messageCreatedAt(message: DbRow) {
  return asString(message.occurred_at, asString(message.created_at));
}

function messagePreview(message?: DbRow) {
  if (!message) return "Sem mensagens registradas.";
  const text = asString(message.text, asString(message.transcript));
  if (text) return text.length > 150 ? `${text.slice(0, 147)}...` : text;
  const messageType = asString(message.message_type, "midia");
  return `[${messageType}]`;
}

function messageBody(message: DbRow) {
  const text = asString(message.text, asString(message.transcript));
  if (text) return text.length > 1800 ? `${text.slice(0, 1797)}...` : text;
  const messageType = asString(message.message_type, "midia");
  return `[${messageType}]`;
}

function deliveryStatus(message: DbRow) {
  const payload = asRecord(message.payload);
  const delivery = asRecord(payload.delivery);
  return asString(message.delivery_status, asString(delivery.providerStatus, asString(delivery.status)));
}

function timelineItem(message: DbRow): WhatsAppCrmTimelineItem {
  const direction = asString(message.direction, "system");
  return {
    id: asString(message.id, `${direction}-${messageCreatedAt(message)}`),
    direction,
    authorType: asString(message.author_type, direction === "inbound" ? "lead" : "ai"),
    authorLabel: asString(message.author_label, direction === "inbound" ? "Lead" : "Agente"),
    messageType: asString(message.message_type, "text"),
    text: messageBody(message),
    transcript: asString(message.transcript),
    mediaUrl: asString(message.media_url),
    mediaMimeType: asString(message.media_mime_type),
    deliveryStatus: deliveryStatus(message),
    providerMessageId: asString(message.provider_message_id),
    createdAt: messageCreatedAt(message),
    tone: direction === "inbound" ? "cyan" : direction === "outbound" ? "green" : "muted",
  };
}

function operatorContext(lead: DbRow, conversation: DbRow, profile?: DbRow) {
  const records = nestedRecords(conversation.metadata, lead.metadata, profile?.metadata);
  const internalNotes = firstString(records, [
    "internal_note",
    "internalNote",
    "operator_note",
    "operatorNote",
    "notes",
    "note",
  ]);
  const internalTags = uniqueStrings(
    records.flatMap((record) => stringArray(record.internal_tags || record.internalTags || record.operator_tags || record.operatorTags)),
    10
  );
  const assignedToLabel =
    asString(conversation.assigned_to_label) ||
    firstString(records, ["assigned_to_label", "assignedToLabel", "ownerLabel", "responsavel"]);

  return { assignedToLabel, internalNotes, internalTags };
}

function whatsappUrl(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}

function recentTimeline(messages: DbRow[]) {
  return messages.slice(0, 40).map(timelineItem).reverse();
}

function computeSla(input: {
  status: string;
  score: number;
  optOut: boolean;
  humanInterventionActive: boolean;
  lastInboundAt: string;
  lastMessageAt: string;
  explicitDueAt: string;
}) {
  if (input.optOut || input.status === "closed" || input.status === "fechado") {
    return { dueAt: "", status: "pausado" as const };
  }

  const dueAt =
    input.explicitDueAt ||
    (input.humanInterventionActive
      ? addMinutes(input.lastInboundAt || input.lastMessageAt, 20)
      : input.score >= 85
        ? addMinutes(input.lastInboundAt || input.lastMessageAt, 30)
        : input.score >= 70
          ? addMinutes(input.lastInboundAt || input.lastMessageAt, 60)
          : addMinutes(input.lastInboundAt || input.lastMessageAt, 24 * 60));
  const remainingMs = timestamp(dueAt) - Date.now();

  if (remainingMs <= 0) return { dueAt, status: "vencido" as const };
  if (remainingMs <= 60 * 60_000) return { dueAt, status: "urgente" as const };
  return { dueAt, status: "ok" as const };
}

function normalizeCrmStage(input: {
  profileStage: string;
  status: string;
  score: number;
  optOut: boolean;
  humanInterventionActive: boolean;
}): WhatsAppCrmStage {
  const raw = `${input.profileStage} ${input.status}`.toLowerCase();
  if (input.optOut || raw.includes("opt_out") || raw.includes("perd")) return "perdido";
  if (input.humanInterventionActive || raw.includes("handoff") || raw.includes("humano")) return "handoff";
  if (raw.includes("convert") || raw.includes("cliente") || raw.includes("fechado")) return "convertido";
  if (raw.includes("quente") || raw.includes("vip") || input.score >= 70) return "quente";
  if (raw.includes("qualific")) return "qualificando";
  return "entrada";
}

function nextAction(input: {
  score: number;
  optOut: boolean;
  humanInterventionActive: boolean;
  lastInboundAt: string;
  lastOutboundAt: string;
  followUpCount: number;
  qualification: WhatsAppCrmQualification;
}) {
  if (input.optOut) return "Respeitar opt-out; nao enviar nova mensagem.";
  if (input.humanInterventionActive) return "Humano assumir a conversa e registrar decisao no CRM.";
  if (input.score >= 85) return "Priorizar atendimento humano e validar oportunidade aderente.";
  if (input.score >= 70) return "Enviar proximo passo consultivo e confirmar capital/regiao.";
  if (timestamp(input.lastInboundAt) > timestamp(input.lastOutboundAt)) {
    return "Responder a ultima mensagem e fazer uma pergunta de qualificacao.";
  }
  if (!input.qualification.capital || !input.qualification.region) {
    return "Coletar capital disponivel e regiao de interesse, uma pergunta por vez.";
  }
  if (input.followUpCount === 0) return "Agendar follow-up leve dentro da janela comercial.";
  return "Manter nutricao e atualizar classificacao apos nova resposta.";
}

function tagsForLead(input: {
  score: number;
  status: string;
  temperature: string;
  optOut: boolean;
  humanInterventionActive: boolean;
  slaStatus: string;
  messageCount: number;
}) {
  const tags: string[] = [];
  if (input.optOut) tags.push("opt-out");
  if (input.humanInterventionActive) tags.push("handoff");
  if (input.score >= 85) tags.push("vip");
  else if (input.score >= 70) tags.push("quente");
  else if (input.score >= 40) tags.push("qualificando");
  else tags.push("entrada");
  if (input.slaStatus === "vencido") tags.push("sla vencido");
  if (input.messageCount <= 1) tags.push("primeiro contato");
  if (input.temperature && input.temperature !== "unknown") tags.push(input.temperature);
  if (input.status && !tags.includes(input.status)) tags.push(input.status);
  return tags.slice(0, 6);
}

function isWhatsappAgent(row: DbRow) {
  const key = asString(row.agent_key);
  const metadata = asRecord(row.metadata);
  return (
    whatsappAgentKeys.has(key) ||
    asString(row.agent_kind).toLowerCase() === "whatsapp" ||
    asString(metadata.channel).toLowerCase() === "whatsapp" ||
    asString(metadata.channelFamily).toLowerCase() === "whatsapp" ||
    asString(metadata.provider).toLowerCase().includes("connectyhub") ||
    Object.keys(asRecord(row.whatsapp_behavior_config)).length > 0
  );
}

function fallbackData(): WhatsAppCrmData {
  const now = new Date();
  const inboundAt = new Date(now.getTime() - 18 * 60_000).toISOString();
  const outboundAt = new Date(now.getTime() - 16 * 60_000).toISOString();

  return {
    generatedAt: now.toISOString(),
    metrics: [
      { label: "Conversas abertas", value: "3", detail: "fila de atendimento", tone: "cyan" },
      { label: "Handoff humano", value: "1", detail: "precisa assumir", tone: "yellow" },
      { label: "Leads quentes", value: "2", detail: "score 70+", tone: "green" },
      { label: "Sem resposta", value: "1", detail: "ultima mensagem do lead", tone: "red" },
      { label: "SLA vencido", value: "0", detail: "sem estouro critico", tone: "purple" },
      { label: "Qualidade IA", value: "88", detail: "auditoria das conversas", tone: "green" },
    ],
    agents: [
      {
        agentKey: defaultAgentKey,
        name: "Agente de WhatsApp",
        status: "planned",
        phone: "",
        instanceName: "",
        connected: false,
        conversations: 3,
        openConversations: 3,
        handoffs: 1,
        averageScore: 71,
      },
    ],
    leads: [
      {
        id: "mock-1",
        leadId: "mock-lead-1",
        conversationId: "mock-conv-1",
        name: "Lead exemplo",
        phone: "5547999999999",
        email: "",
        status: "qualificando",
        crmStage: "quente",
        temperature: "quente",
        score: 78,
        source: "whatsapp",
        agentKey: defaultAgentKey,
        agentName: "Agente de WhatsApp",
        conversationStatus: "open",
        humanInterventionActive: false,
        assignedToLabel: "",
        optOut: false,
        waitingForReply: true,
        messageCount: 4,
        inboundCount: 2,
        outboundCount: 2,
        lastMessageDirection: "inbound",
        lastMessageAt: inboundAt,
        lastInboundAt: inboundAt,
        lastOutboundAt: outboundAt,
        lastMessagePreview: "Tenho interesse em leilao residencial ate 400 mil em SC.",
        slaDueAt: addMinutes(inboundAt, 60),
        slaStatus: "urgente",
        followUpCount: 0,
        nextFollowUpAt: "",
        nextAction: "Confirmar capital disponivel e experiencia com leilao.",
        latestReviewScore: 88,
        latestReviewVerdict: "aprovado",
        latestReviewAt: outboundAt,
        tags: ["quente", "primeiro contato"],
        internalTags: ["alto interesse"],
        internalNotes: "Lead quer residencial em SC; confirmar se ja tem edital escolhido.",
        whatsappUrl: "https://wa.me/5547999999999",
        qualification: {
          capital: "R$ 400.000",
          region: "Santa Catarina",
          propertyType: "Residencial",
          objective: "Investimento",
          experience: "Iniciante",
          urgency: "Esta semana",
        },
        timeline: [
          {
            id: "mock-msg-1",
            direction: "inbound",
            authorType: "lead",
            authorLabel: "Lead",
            messageType: "text",
            text: "Tenho interesse em leilao residencial ate 400 mil em SC.",
            transcript: "",
            mediaUrl: "",
            mediaMimeType: "",
            deliveryStatus: "",
            providerMessageId: "",
            createdAt: inboundAt,
            tone: "cyan",
          },
          {
            id: "mock-msg-2",
            direction: "outbound",
            authorType: "ai",
            authorLabel: "Agente",
            messageType: "text",
            text: "Boa. Vou olhar oportunidades dentro desse perfil e te fazer uma pergunta por vez.",
            transcript: "",
            mediaUrl: "",
            mediaMimeType: "",
            deliveryStatus: "sent",
            providerMessageId: "",
            createdAt: outboundAt,
            tone: "green",
          },
        ],
      },
    ],
    followUps: [],
    reviews: [
      {
        id: "mock-review-1",
        conversationId: "mock-conv-1",
        leadName: "Lead exemplo",
        phone: "5547999999999",
        agentKey: defaultAgentKey,
        reviewType: "turing_benchmark",
        score: 88,
        verdict: "aprovado",
        flags: ["util"],
        notes: "Atendimento natural, objetivo e com boa proxima pergunta.",
        createdAt: outboundAt,
      },
    ],
  };
}

function normalizeAgentName(agentRows: DbRow[], agentKey: string) {
  const row = agentRows.find((item) => asString(item.agent_key) === agentKey);
  return asString(row?.name, agentKey === defaultAgentKey ? "Agente de WhatsApp" : agentKey || "WhatsApp");
}

export async function getWhatsAppCrmData(): Promise<DataResult<WhatsAppCrmData>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      data: fallbackData(),
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const [leadsResult, conversationsResult, messagesResult, instancesResult, agentsResult, profilesResult, followUpsResult, reviewsResult] =
    await Promise.all([
      supabase.from("whatsapp_leads").select("*").order("updated_at", { ascending: false }).limit(120),
      supabase.from("whatsapp_conversations").select("*").order("updated_at", { ascending: false }).limit(160),
      supabase.from("whatsapp_conversation_messages").select("*").order("created_at", { ascending: false }).limit(600),
      supabase.from("whatsapp_instances").select("*").order("updated_at", { ascending: false }).limit(80),
      supabase.from("ai_agents").select("*").order("updated_at", { ascending: false }).limit(120),
      supabase.from("whatsapp_lead_profiles").select("*").order("updated_at", { ascending: false }).limit(120),
      supabase.from("whatsapp_follow_ups").select("*").order("scheduled_for", { ascending: true }).limit(80),
      supabase.from("whatsapp_agent_reviews").select("*").order("created_at", { ascending: false }).limit(120),
    ]);

  const criticalErrors = [leadsResult.error, conversationsResult.error, messagesResult.error]
    .map((error) => error?.message)
    .filter(Boolean);

  if (criticalErrors.length === 3) {
    return {
      data: fallbackData(),
      source: "mock",
      reason: criticalErrors.join(" | "),
    };
  }

  const leadRows = ((leadsResult.data || []) as DbRow[]).filter((row) => asString(row.id));
  const conversationRows = ((conversationsResult.data || []) as DbRow[]).filter((row) => asString(row.id));
  const messageRows = ((messagesResult.data || []) as DbRow[]).filter((row) => asString(row.id));
  const instanceRows = ((instancesResult.data || []) as DbRow[]).filter((row) => asString(row.id) || asString(row.agent_key));
  const agentRows = ((agentsResult.data || []) as DbRow[]).filter(isWhatsappAgent);
  const profileRows = profilesResult.error ? [] : ((profilesResult.data || []) as DbRow[]);
  const followUpRows = followUpsResult.error ? [] : ((followUpsResult.data || []) as DbRow[]);
  const reviewRows = reviewsResult.error ? [] : ((reviewsResult.data || []) as DbRow[]);

  const leadsById = new Map(leadRows.map((row) => [asString(row.id), row]));
  const profilesByLead = new Map(profileRows.map((row) => [asString(row.lead_id), row]));
  const messagesByConversation = new Map<string, DbRow[]>();
  const messagesByLead = new Map<string, DbRow[]>();
  const followUpsByConversation = new Map<string, DbRow[]>();
  const reviewsByConversation = new Map<string, DbRow[]>();

  for (const message of messageRows) {
    const conversationId = asString(message.conversation_id);
    const leadId = asString(message.lead_id);
    if (conversationId) messagesByConversation.set(conversationId, [...(messagesByConversation.get(conversationId) || []), message]);
    if (leadId) messagesByLead.set(leadId, [...(messagesByLead.get(leadId) || []), message]);
  }

  for (const followUp of followUpRows) {
    const conversationId = asString(followUp.conversation_id);
    if (conversationId) followUpsByConversation.set(conversationId, [...(followUpsByConversation.get(conversationId) || []), followUp]);
  }

  for (const review of reviewRows) {
    const conversationId = asString(review.conversation_id);
    if (conversationId) reviewsByConversation.set(conversationId, [...(reviewsByConversation.get(conversationId) || []), review]);
  }

  const conversationLeadIds = new Set<string>();
  const leadCards: WhatsAppCrmLeadCard[] = [];

  for (const conversation of conversationRows) {
    const leadId = asString(conversation.lead_id);
    const lead = leadsById.get(leadId);
    if (!lead) continue;
    conversationLeadIds.add(leadId);

    const conversationId = asString(conversation.id);
    const messages = (messagesByConversation.get(conversationId) || messagesByLead.get(leadId) || []).sort(
      (left, right) => timestamp(messageCreatedAt(right)) - timestamp(messageCreatedAt(left))
    );
    const inbound = messages.filter((message) => asString(message.direction) === "inbound");
    const outbound = messages.filter((message) => asString(message.direction) === "outbound");
    const profile = profilesByLead.get(leadId);
    const score = Math.round(asNumber(profile?.lead_score, asNumber(lead.qualification_score, 0)));
    const qualification = extractQualification(lead, conversation, profile);
    const lastInboundAt = messageCreatedAt(inbound[0]) || asString(lead.last_message_at);
    const lastOutboundAt = messageCreatedAt(outbound[0]);
    const lastMessageAt = asString(conversation.last_message_at, asString(lead.last_message_at, messageCreatedAt(messages[0])));
    const status = asString(profile?.classification, asString(lead.status, "new"));
    const humanInterventionActive =
      asBoolean(conversation.human_intervention_active) || asBoolean(lead.human_intervention_active);
    const optOut = asBoolean(lead.opt_out);
    const crmStage = normalizeCrmStage({
      profileStage: asString(profile?.crm_stage),
      status,
      score,
      optOut,
      humanInterventionActive,
    });
    const followUps = followUpsByConversation.get(conversationId) || [];
    const latestReview = (reviewsByConversation.get(conversationId) || []).sort(
      (left, right) => timestamp(right.created_at) - timestamp(left.created_at)
    )[0];
    const context = operatorContext(lead, conversation, profile);
    const lastMessageDirection = asString(messages[0]?.direction);
    const waitingForReply = timestamp(lastInboundAt) > timestamp(lastOutboundAt) && !optOut;
    const phone = asString(lead.phone);
    const explicitDueAt = asString(conversation.sla_due_at, asString(profile?.next_action_due_at));
    const sla = computeSla({
      status: asString(conversation.status),
      score,
      optOut,
      humanInterventionActive,
      lastInboundAt,
      lastMessageAt,
      explicitDueAt,
    });
    const followUpCount = Math.max(
      asNumber(conversation.follow_up_count, 0),
      followUps.filter((item) => ["sent", "queued", "scheduled"].includes(asString(item.status))).length
    );
    const action = asString(profile?.next_action) || nextAction({
      score,
      optOut,
      humanInterventionActive,
      lastInboundAt,
      lastOutboundAt,
      followUpCount,
      qualification,
    });

    leadCards.push({
      id: conversationId,
      leadId,
      conversationId,
      name: asString(lead.name, "Lead WhatsApp"),
      phone,
      email: asString(lead.email),
      status,
      crmStage,
      temperature: asString(lead.temperature, score >= 70 ? "quente" : score >= 40 ? "morno" : "unknown"),
      score,
      source: asString(profile?.source, asString(lead.source, "whatsapp")),
      agentKey: asString(conversation.agent_key, asString(lead.owner_agent_key, defaultAgentKey)),
      agentName: normalizeAgentName(agentRows, asString(conversation.agent_key, asString(lead.owner_agent_key, defaultAgentKey))),
      conversationStatus: asString(conversation.status, "open"),
      humanInterventionActive,
      assignedToLabel: context.assignedToLabel,
      optOut,
      waitingForReply,
      messageCount: messages.length,
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      lastMessageDirection,
      lastMessageAt,
      lastInboundAt,
      lastOutboundAt,
      lastMessagePreview: asString(conversation.last_message_preview) || messagePreview(messages[0]),
      slaDueAt: sla.dueAt,
      slaStatus: sla.status,
      followUpCount,
      nextFollowUpAt: asString(followUps.find((item) => ["queued", "scheduled"].includes(asString(item.status)))?.scheduled_for),
      nextAction: action,
      latestReviewScore: Math.round(asNumber(latestReview?.score, 0)),
      latestReviewVerdict: asString(latestReview?.verdict),
      latestReviewAt: asString(latestReview?.created_at),
      tags: uniqueStrings([
        ...tagsForLead({
          score,
          status,
          temperature: asString(lead.temperature),
          optOut,
          humanInterventionActive,
          slaStatus: sla.status,
          messageCount: messages.length,
        }),
        ...context.internalTags,
      ]),
      internalTags: context.internalTags,
      internalNotes: context.internalNotes,
      whatsappUrl: whatsappUrl(phone),
      qualification,
      timeline: recentTimeline(messages),
    });
  }

  for (const lead of leadRows) {
    const leadId = asString(lead.id);
    if (conversationLeadIds.has(leadId)) continue;
    const profile = profilesByLead.get(leadId);
    const messages = (messagesByLead.get(leadId) || []).sort(
      (left, right) => timestamp(messageCreatedAt(right)) - timestamp(messageCreatedAt(left))
    );
    const inbound = messages.filter((message) => asString(message.direction) === "inbound");
    const outbound = messages.filter((message) => asString(message.direction) === "outbound");
    const score = Math.round(asNumber(profile?.lead_score, asNumber(lead.qualification_score, 0)));
    const qualification = extractQualification(lead, {}, profile);
    const lastInboundAt = messageCreatedAt(inbound[0]) || asString(lead.last_message_at);
    const lastOutboundAt = messageCreatedAt(outbound[0]);
    const lastMessageAt = asString(lead.last_message_at, messageCreatedAt(messages[0]));
    const humanInterventionActive = asBoolean(lead.human_intervention_active);
    const optOut = asBoolean(lead.opt_out);
    const status = asString(profile?.classification, asString(lead.status, "new"));
    const crmStage = normalizeCrmStage({
      profileStage: asString(profile?.crm_stage),
      status,
      score,
      optOut,
      humanInterventionActive,
    });
    const context = operatorContext(lead, {}, profile);
    const lastMessageDirection = asString(messages[0]?.direction);
    const waitingForReply = timestamp(lastInboundAt) > timestamp(lastOutboundAt) && !optOut;
    const phone = asString(lead.phone);
    const sla = computeSla({
      status,
      score,
      optOut,
      humanInterventionActive,
      lastInboundAt,
      lastMessageAt,
      explicitDueAt: asString(profile?.next_action_due_at),
    });

    leadCards.push({
      id: `lead-${leadId}`,
      leadId,
      conversationId: "",
      name: asString(lead.name, "Lead WhatsApp"),
      phone,
      email: asString(lead.email),
      status,
      crmStage,
      temperature: asString(lead.temperature, score >= 70 ? "quente" : score >= 40 ? "morno" : "unknown"),
      score,
      source: asString(profile?.source, asString(lead.source, "whatsapp")),
      agentKey: asString(lead.owner_agent_key, defaultAgentKey),
      agentName: normalizeAgentName(agentRows, asString(lead.owner_agent_key, defaultAgentKey)),
      conversationStatus: "lead_only",
      humanInterventionActive,
      assignedToLabel: context.assignedToLabel,
      optOut,
      waitingForReply,
      messageCount: messages.length,
      inboundCount: inbound.length,
      outboundCount: outbound.length,
      lastMessageDirection,
      lastMessageAt,
      lastInboundAt,
      lastOutboundAt,
      lastMessagePreview: messagePreview(messages[0]),
      slaDueAt: sla.dueAt,
      slaStatus: sla.status,
      followUpCount: 0,
      nextFollowUpAt: "",
      nextAction: asString(profile?.next_action) || nextAction({
        score,
        optOut,
        humanInterventionActive,
        lastInboundAt,
        lastOutboundAt,
        followUpCount: 0,
        qualification,
      }),
      latestReviewScore: 0,
      latestReviewVerdict: "",
      latestReviewAt: "",
      tags: uniqueStrings([
        ...tagsForLead({
          score,
          status,
          temperature: asString(lead.temperature),
          optOut,
          humanInterventionActive,
          slaStatus: sla.status,
          messageCount: messages.length,
        }),
        ...context.internalTags,
      ]),
      internalTags: context.internalTags,
      internalNotes: context.internalNotes,
      whatsappUrl: whatsappUrl(phone),
      qualification,
      timeline: recentTimeline(messages),
    });
  }

  leadCards.sort((left, right) => {
    const priority = (item: WhatsAppCrmLeadCard) =>
      (item.slaStatus === "vencido" ? 300 : item.slaStatus === "urgente" ? 200 : 0) +
      (item.humanInterventionActive ? 120 : 0) +
      item.score;
    return priority(right) - priority(left) || timestamp(right.lastMessageAt) - timestamp(left.lastMessageAt);
  });

  const agentConversations = new Map<string, WhatsAppCrmLeadCard[]>();
  for (const card of leadCards) {
    agentConversations.set(card.agentKey, [...(agentConversations.get(card.agentKey) || []), card]);
  }

  const instanceByAgent = new Map<string, DbRow>();
  for (const instance of instanceRows) {
    const agentKey = asString(instance.agent_key, defaultAgentKey);
    if (!instanceByAgent.has(agentKey)) instanceByAgent.set(agentKey, instance);
  }

  const agentKeys = new Set<string>([
    ...agentRows.map((row) => asString(row.agent_key)).filter(Boolean),
    ...instanceRows.map((row) => asString(row.agent_key)).filter(Boolean),
    ...leadCards.map((card) => card.agentKey).filter(Boolean),
  ]);
  if (!agentKeys.size) agentKeys.add(defaultAgentKey);

  const agents = [...agentKeys].map((agentKey) => {
    const agent = agentRows.find((row) => asString(row.agent_key) === agentKey);
    const instance = instanceByAgent.get(agentKey);
    const cards = agentConversations.get(agentKey) || [];
    const connected = ["connected", "open", "online"].includes(asString(instance?.status).toLowerCase()) || Boolean(instance?.connected_at);
    const averageScore = cards.length
      ? Math.round(cards.reduce((sum, card) => sum + card.score, 0) / cards.length)
      : 0;

    return {
      agentKey,
      name: asString(agent?.name, agentKey === defaultAgentKey ? "Agente de WhatsApp" : agentKey),
      status: asString(agent?.status, asString(instance?.status, "draft")),
      phone: asString(instance?.phone),
      instanceName: asString(instance?.instance_name),
      connected,
      conversations: cards.length,
      openConversations: cards.filter((card) => ["open", "lead_only"].includes(card.conversationStatus)).length,
      handoffs: cards.filter((card) => card.humanInterventionActive).length,
      averageScore,
    } satisfies WhatsAppCrmAgentSummary;
  });

  const followUps = followUpRows.map((followUp) => {
    const lead = leadsById.get(asString(followUp.lead_id));
    return {
      id: asString(followUp.id),
      leadName: asString(lead?.name, "Lead WhatsApp"),
      phone: asString(lead?.phone),
      agentKey: asString(followUp.agent_key, defaultAgentKey),
      reason: asString(followUp.reason, "follow_up"),
      status: asString(followUp.status, "queued"),
      scheduledFor: asString(followUp.scheduled_for),
      attemptCount: asNumber(followUp.attempt_count, 0),
    } satisfies WhatsAppFollowUpSummary;
  });

  const reviews = reviewRows.map((review) => {
    const lead = leadsById.get(asString(review.lead_id));
    return {
      id: asString(review.id),
      conversationId: asString(review.conversation_id),
      leadName: asString(lead?.name, "Lead WhatsApp"),
      phone: asString(lead?.phone),
      agentKey: asString(review.agent_key, defaultAgentKey),
      reviewType: asString(review.review_type, "turing_benchmark"),
      score: Math.round(asNumber(review.score, 0)),
      verdict: asString(review.verdict, "monitorar"),
      flags: stringArray(review.review_flags),
      notes: asString(review.notes),
      createdAt: asString(review.created_at),
    } satisfies WhatsAppAgentReviewSummary;
  });

  const openConversations = leadCards.filter((card) => ["open", "lead_only"].includes(card.conversationStatus)).length;
  const handoffs = leadCards.filter((card) => card.humanInterventionActive).length;
  const hotLeads = leadCards.filter((card) => card.score >= 70).length;
  const waitingReplies = leadCards.filter((card) => card.waitingForReply).length;
  const overdue = leadCards.filter((card) => card.slaStatus === "vencido").length;
  const scoredReviews = reviews.filter((review) => review.score > 0);
  const averageQuality = scoredReviews.length
    ? Math.round(scoredReviews.reduce((sum, review) => sum + review.score, 0) / scoredReviews.length)
    : 0;
  const qualityAlerts = reviews.filter((review) => review.score > 0 && review.score < 62).length;

  const data: WhatsAppCrmData = {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: "Conversas abertas", value: String(openConversations), detail: "leads em atendimento", tone: "cyan" },
      { label: "Handoff humano", value: String(handoffs), detail: "pedem humano ou revisao", tone: handoffs ? "yellow" : "green" },
      { label: "Leads quentes", value: String(hotLeads), detail: "score 70+", tone: "green" },
      {
        label: "Sem resposta",
        value: String(waitingReplies),
        detail: "ultima mensagem foi do lead",
        tone: waitingReplies ? "red" : "muted",
      },
      { label: "SLA vencido", value: String(overdue), detail: "precisam resposta", tone: overdue ? "red" : "purple" },
      {
        label: "Qualidade IA",
        value: averageQuality ? String(averageQuality) : "-",
        detail: qualityAlerts ? `${qualityAlerts} revisoes criticas` : "auditoria das conversas",
        tone: averageQuality >= 82 ? "green" : averageQuality >= 62 ? "yellow" : averageQuality ? "red" : "muted",
      },
    ],
    agents,
    leads: leadCards,
    followUps,
    reviews,
  };

  const nonCriticalErrors = [profilesResult.error, followUpsResult.error, reviewsResult.error, instancesResult.error, agentsResult.error]
    .map((error) => error?.message)
    .filter(Boolean);

  return {
    data,
    source: "supabase",
    reason: [...criticalErrors, ...nonCriticalErrors].join(" | ") || undefined,
  };
}
