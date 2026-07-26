import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getWhatsAppAgentConfig, saveWhatsAppAgentConfig } from "@/lib/communication/willian-agent-config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

type DbRow = Record<string, unknown>;

type ReviewVerdict = "aprovado" | "monitorar" | "handoff" | "bloquear";

export type WhatsAppQualityReviewItem = {
  conversationId: string;
  leadId: string;
  agentKey: string;
  leadName: string;
  score: number;
  verdict: ReviewVerdict;
  flags: string[];
  notes: string;
  reviewed: boolean;
  handoff: boolean;
  learned: boolean;
  error?: string;
};

export type WhatsAppQualityReviewResult = {
  ok: boolean;
  dryRun: boolean;
  requested: number;
  reviewedCount: number;
  handoffCount: number;
  learnedCount: number;
  skippedCount: number;
  reviewed: WhatsAppQualityReviewItem[];
  skipped: WhatsAppQualityReviewItem[];
  failed: WhatsAppQualityReviewItem[];
  errors: string[];
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isPresentString(value: string | undefined): value is string {
  return Boolean(value);
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function timestamp(value: unknown) {
  const text = cleanString(value);
  if (!text) return 0;
  const parsed = new Date(text).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageCreatedAt(message: DbRow) {
  return cleanString(message.occurred_at, cleanString(message.created_at));
}

function messageText(message: DbRow) {
  return cleanString(message.text, cleanString(message.transcript));
}

function clampText(value: string, maxLength = 1800) {
  const clean = value.trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength - 3)}...`;
}

function orderedMessages(messages: DbRow[]) {
  return [...messages].sort((left, right) => timestamp(messageCreatedAt(left)) - timestamp(messageCreatedAt(right)));
}

function reviewConversationText(messages: DbRow[]) {
  const lines = orderedMessages(messages)
    .slice(-18)
    .map((message) => {
      const direction = cleanString(message.direction);
      const authorType = cleanString(message.author_type);
      const messageType = cleanString(message.message_type, "text");
      const side = direction === "outbound" ? "Atendente" : "Lead";
      const text = messageText(message);
      if (!text) return `${side} [${messageType} sem texto]`;
      return `${side}${authorType === "human" ? " humano" : ""}: ${text}`;
    })
    .join("\n");

  return lines || "Sem historico textual suficiente.";
}

function latestOutboundAt(messages: DbRow[]) {
  const outbound = orderedMessages(messages)
    .filter((message) => cleanString(message.direction) === "outbound" && cleanString(message.author_type, "ai") === "ai")
    .at(-1);
  return messageCreatedAt(outbound || {});
}

function lastInboundAfterLastOutbound(messages: DbRow[]) {
  const ordered = orderedMessages(messages);
  const lastOutbound = [...ordered].reverse().find((message) => cleanString(message.direction) === "outbound");
  const lastInbound = [...ordered].reverse().find((message) => cleanString(message.direction) === "inbound");
  return timestamp(messageCreatedAt(lastInbound || {})) > timestamp(messageCreatedAt(lastOutbound || {}));
}

function extractJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced || value;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return {};

  try {
    return asRecord(JSON.parse(source.slice(start, end + 1)));
  } catch {
    return {};
  }
}

function normalizeFlags(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => cleanString(item)).filter(Boolean).slice(0, 8);
  const text = cleanString(value);
  if (!text) return [];
  return text.split(/[;,]/).map((item) => item.trim()).filter(Boolean).slice(0, 8);
}

function appendUnique(values: string[], nextValues: string[], limit = 30) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...nextValues, ...values]) {
    const text = cleanString(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function avoidPatternsFromFlags(flags: string[]) {
  const patterns: Record<string, string> = {
    lead_sem_resposta: "Nao deixar a ultima mensagem do lead sem resposta; retomar com utilidade e uma pergunta clara.",
    perguntas_demais: "Evitar sequencia de perguntas; fazer uma pergunta por vez e entregar contexto antes.",
    promessa_financeira: "Nunca prometer lucro, ganho certo, ausencia de risco ou resultado financeiro.",
    risco_juridico: "Nao dar parecer juridico definitivo; acionar humano para edital, matricula, ocupacao ou contrato.",
    risco_transparencia: "Nao fingir ser humano; se o lead perguntar, explicar em uma frase curta que e IA da Betel e voltar a ajudar.",
    revisar_prompt: "Evitar resposta com cara de template; responder ao contexto real do lead.",
  };
  return appendUnique([], flags.map((flag) => patterns[flag] || `Evitar padrao sinalizado pela auditoria: ${flag}.`), 12);
}

function normalizeVerdict(value: unknown, score: number): ReviewVerdict {
  const verdict = cleanString(value).toLowerCase();
  if (["aprovado", "monitorar", "handoff", "bloquear"].includes(verdict)) return verdict as ReviewVerdict;
  if (score >= 82) return "aprovado";
  if (score >= 62) return "monitorar";
  if (score >= 45) return "handoff";
  return "bloquear";
}

function normalizeMetrics(value: unknown, score: number) {
  const record = asRecord(value);
  const fallback = Math.max(1, Math.min(10, Math.round(score / 10)));
  return {
    naturalidade: asNumber(record.naturalidade, fallback),
    utilidade: asNumber(record.utilidade, fallback),
    contexto: asNumber(record.contexto, fallback),
    qualificacao: asNumber(record.qualificacao, fallback),
    transparencia: asNumber(record.transparencia, fallback),
    seguranca_comercial: asNumber(record.seguranca_comercial, fallback),
  };
}

function heuristicReview(input: { messages: DbRow[]; leadName: string }) {
  const history = reviewConversationText(input.messages).toLowerCase();
  let score = 72;
  const flags: string[] = [];

  if (history.includes("sou humano") || history.includes("nao sou robo")) {
    score -= 25;
    flags.push("risco_transparencia");
  }
  if (/(lucro garantido|sem risco|certeza de ganho|garantia de lucro)/i.test(history)) {
    score -= 35;
    flags.push("promessa_financeira");
  }
  if (/(procure um advogado|analise juridica|parecer juridico)/i.test(history)) {
    score += 6;
  }
  if ((history.match(/\?/g) || []).length > 3) {
    score -= 8;
    flags.push("perguntas_demais");
  }
  if (lastInboundAfterLastOutbound(input.messages)) {
    score -= 12;
    flags.push("lead_sem_resposta");
  }

  const finalScore = Math.max(0, Math.min(100, score));
  return {
    score: finalScore,
    verdict: normalizeVerdict("", finalScore),
    metrics: normalizeMetrics({}, finalScore),
    flags,
    notes: flags.length
      ? `Auditoria heuristica encontrou: ${flags.join(", ")}.`
      : "Auditoria heuristica sem alerta critico.",
  };
}

async function generateReview(input: {
  lead: DbRow;
  conversation: DbRow;
  messages: DbRow[];
  profile: DbRow;
}) {
  const apiKey = await getGeminiApiKey();
  const modelName = await getGeminiModel();
  const fallback = heuristicReview({
    messages: input.messages,
    leadName: cleanString(input.lead.name, "Lead WhatsApp"),
  });

  if (!apiKey) return { ...fallback, model: "heuristic-fallback" };

  try {
    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: modelName });
    const prompt = [
      "Voce e auditor de qualidade de atendimento WhatsApp da Betel Leiloes.",
      "Avalie se o atendimento foi natural, util, contextual, transparente e comercialmente seguro.",
      "Nao avalie por capacidade de enganar. O atendente pode ser IA; o criterio e se o lead continuaria porque recebeu ajuda boa.",
      "Penalize: resposta pronta/generica, promessa de lucro, parecer juridico definitivo, fingir ser humano, perguntas demais, ignorar contexto, nao respeitar opt-out ou empurrar atendimento.",
      "Destaque handoff quando houver risco juridico/comercial, lead irritado, pedido humano, erro grave ou oportunidade muito quente.",
      "",
      "Retorne somente JSON valido neste formato:",
      '{"score":0,"verdict":"aprovado|monitorar|handoff|bloquear","metrics":{"naturalidade":0,"utilidade":0,"contexto":0,"qualificacao":0,"transparencia":0,"seguranca_comercial":0},"review_flags":["flag"],"notes":"curto","operator_next_action":"curto"}',
      "",
      `Lead: ${cleanString(input.lead.name, "Lead WhatsApp")}`,
      `Telefone: ${cleanString(input.lead.phone)}`,
      `Score CRM: ${asNumber(input.profile.lead_score, asNumber(input.lead.qualification_score, 0))}`,
      `Classificacao CRM: ${cleanString(input.profile.classification, cleanString(input.lead.status))}`,
      "",
      "Historico recente:",
      reviewConversationText(input.messages),
    ].join("\n");

    const result = await model.generateContent(prompt);
    const parsed = extractJsonObject(result.response.text());
    const score = Math.max(0, Math.min(100, Math.round(asNumber(parsed.score, fallback.score))));
    return {
      score,
      verdict: normalizeVerdict(parsed.verdict, score),
      metrics: normalizeMetrics(parsed.metrics, score),
      flags: normalizeFlags(parsed.review_flags || parsed.flags),
      notes: clampText(cleanString(parsed.notes, fallback.notes), 900),
      nextAction: clampText(cleanString(parsed.operator_next_action), 500),
      model: modelName,
    };
  } catch {
    return { ...fallback, model: "heuristic-fallback" };
  }
}

function emptyItem(input: {
  conversation: DbRow;
  lead?: DbRow;
  status?: Partial<WhatsAppQualityReviewItem>;
}): WhatsAppQualityReviewItem {
  return {
    conversationId: cleanString(input.conversation.id),
    leadId: cleanString(input.conversation.lead_id, cleanString(input.lead?.id)),
    agentKey: cleanString(input.conversation.agent_key, "multichannel-dispatch"),
    leadName: cleanString(input.lead?.name, "Lead WhatsApp"),
    score: 0,
    verdict: "monitorar",
    flags: [],
    notes: "",
    reviewed: false,
    handoff: false,
    learned: false,
    ...input.status,
  };
}

async function applyQualityLearning(input: {
  agentKey: string;
  conversationId: string;
  leadId: string;
  score: number;
  verdict: ReviewVerdict;
  flags: string[];
  notes: string;
  nextAction?: string;
}) {
  const config = await getWhatsAppAgentConfig(input.agentKey);
  if (!config.behavior.continuousLearning) return false;

  const now = new Date().toISOString();
  const notePrefix = `${input.verdict}/${input.score}`;
  const learningNote = `${notePrefix}: ${input.notes || input.nextAction || "Auditoria registrada."}`;
  const positivePattern = input.score >= 82 && input.verdict === "aprovado" ? `Manter padrao aprovado: ${input.notes}` : "";
  const correctionNote =
    input.score < 82 || input.verdict !== "aprovado"
      ? `Corrigir conversa ${input.conversationId}: ${input.notes || input.nextAction || input.verdict}.`
      : "";

  const nextConfig = {
    ...config,
    updatedAt: now,
    cloneMemory: {
      ...config.cloneMemory,
      stylePatterns: positivePattern
        ? appendUnique(config.cloneMemory.stylePatterns, [positivePattern], 24)
        : config.cloneMemory.stylePatterns,
      correctionNotes: correctionNote
        ? appendUnique(config.cloneMemory.correctionNotes, [correctionNote], 30)
        : config.cloneMemory.correctionNotes,
      avoidPatterns: appendUnique(config.cloneMemory.avoidPatterns, avoidPatternsFromFlags(input.flags), 30),
      updatedAt: now,
    },
    memory: {
      ...config.memory,
      importantEvents: appendUnique(
        config.memory.importantEvents,
        [`Auditoria ${learningNote}`],
        30
      ),
    },
  };

  const result = await saveWhatsAppAgentConfig(nextConfig);
  if (!result.ok) return false;

  const supabase = getSupabaseAdminClient();
  await supabase?.from("agent_runtime_events").insert({
    run_id: null,
    run_code: `WA-LEARN-${Date.now().toString(36).toUpperCase()}`,
    agent_key: input.agentKey || null,
    event_type: "whatsapp_quality_learning_applied",
    status: "ok",
    provider: "gemini",
    model: "quality-reviewer",
    attempt: 1,
    message: "Auditoria aplicada na memoria do agente WhatsApp.",
    payload: {
      conversationId: input.conversationId,
      leadId: input.leadId,
      score: input.score,
      verdict: input.verdict,
      flags: input.flags,
      notes: input.notes,
    },
  });

  return true;
}

async function markHandoff(input: {
  conversationId: string;
  leadId: string;
  agentKey: string;
  reason: string;
  conversationMetadata?: DbRow;
}) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return false;

  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .update({
        human_intervention_active: true,
        assigned_to_label: "humano",
        metadata: {
          ...asRecord(input.conversationMetadata),
          quality_review_handoff: {
            source: "whatsapp_quality_reviewer",
            reason: input.reason,
            at: now,
          },
        },
        updated_at: now,
      })
      .eq("id", input.conversationId),
    supabase
      .from("whatsapp_leads")
      .update({
        human_intervention_active: true,
        status: "human_handoff",
        updated_at: now,
      })
      .eq("id", input.leadId),
    supabase.from("agent_runtime_events").insert({
      run_id: null,
      run_code: `WA-QUALITY-${Date.now().toString(36).toUpperCase()}`,
      agent_key: input.agentKey || null,
      event_type: "whatsapp_quality_handoff",
      status: "handoff",
      provider: "gemini",
      model: "quality-reviewer",
      attempt: 1,
      message: "Auditoria automatica colocou conversa WhatsApp em handoff humano.",
      payload: input,
    }),
  ]);

  return true;
}

export async function reviewWhatsAppConversations(input: {
  dryRun?: boolean;
  limit?: number;
  agentKey?: string;
  autoHandoff?: boolean;
} = {}): Promise<WhatsAppQualityReviewResult> {
  const supabase = getSupabaseAdminClient();
  const dryRun = input.dryRun === true;
  const limit = Math.max(1, Math.min(Math.trunc(input.limit || 12), 40));
  const autoHandoff = input.autoHandoff !== false;

  if (!supabase) {
    return {
      ok: false,
      dryRun,
      requested: limit,
      reviewedCount: 0,
      handoffCount: 0,
      learnedCount: 0,
      skippedCount: 0,
      reviewed: [],
      skipped: [],
      failed: [],
      errors: ["Supabase admin nao configurado."],
    };
  }

  let conversationsQuery = supabase
    .from("whatsapp_conversations")
    .select("*")
    .neq("status", "closed")
    .order("last_message_at", { ascending: false })
    .limit(limit * 4);

  if (input.agentKey) conversationsQuery = conversationsQuery.eq("agent_key", input.agentKey);

  const { data: conversationData, error: conversationError } = await conversationsQuery;
  if (conversationError) {
    return {
      ok: false,
      dryRun,
      requested: limit,
      reviewedCount: 0,
      handoffCount: 0,
      learnedCount: 0,
      skippedCount: 0,
      reviewed: [],
      skipped: [],
      failed: [],
      errors: [conversationError.message],
    };
  }

  const conversations = ((conversationData || []) as DbRow[]).filter((row) => cleanString(row.id));
  const conversationIds = conversations.map((row) => cleanString(row.id));
  const leadIds = [...new Set(conversations.map((row) => cleanString(row.lead_id)).filter(Boolean))];

  if (!conversationIds.length || !leadIds.length) {
    return {
      ok: true,
      dryRun,
      requested: 0,
      reviewedCount: 0,
      handoffCount: 0,
      learnedCount: 0,
      skippedCount: 0,
      reviewed: [],
      skipped: [],
      failed: [],
      errors: [],
    };
  }

  const [messagesResult, leadsResult, profilesResult, reviewsResult] = await Promise.all([
    supabase
      .from("whatsapp_conversation_messages")
      .select("*")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(limit * 24),
    supabase.from("whatsapp_leads").select("*").in("id", leadIds),
    supabase.from("whatsapp_lead_profiles").select("*").in("lead_id", leadIds),
    supabase
      .from("whatsapp_agent_reviews")
      .select("conversation_id,created_at,review_type")
      .in("conversation_id", conversationIds)
      .in("review_type", ["turing_benchmark", "ai_quality_auto"])
      .order("created_at", { ascending: false }),
  ]);

  const errors = [messagesResult.error, leadsResult.error, profilesResult.error, reviewsResult.error]
    .map((error) => error?.message)
    .filter(isPresentString);

  if (messagesResult.error || leadsResult.error) {
    return {
      ok: false,
      dryRun,
      requested: limit,
      reviewedCount: 0,
      handoffCount: 0,
      learnedCount: 0,
      skippedCount: conversations.length,
      reviewed: [],
      skipped: [],
      failed: [],
      errors,
    };
  }

  const messagesByConversation = new Map<string, DbRow[]>();
  for (const message of ((messagesResult.data || []) as DbRow[])) {
    const conversationId = cleanString(message.conversation_id);
    if (!conversationId) continue;
    messagesByConversation.set(conversationId, [...(messagesByConversation.get(conversationId) || []), message]);
  }

  const leadsById = new Map(((leadsResult.data || []) as DbRow[]).map((lead) => [cleanString(lead.id), lead]));
  const profilesByLeadId = new Map(((profilesResult.data || []) as DbRow[]).map((profile) => [cleanString(profile.lead_id), profile]));
  const latestReviewByConversation = new Map<string, DbRow>();
  for (const review of ((reviewsResult.data || []) as DbRow[])) {
    const conversationId = cleanString(review.conversation_id);
    if (conversationId && !latestReviewByConversation.has(conversationId)) latestReviewByConversation.set(conversationId, review);
  }

  const reviewed: WhatsAppQualityReviewItem[] = [];
  const skipped: WhatsAppQualityReviewItem[] = [];
  const failed: WhatsAppQualityReviewItem[] = [];

  for (const conversation of conversations) {
    if (reviewed.length >= limit) break;

    const conversationId = cleanString(conversation.id);
    const leadId = cleanString(conversation.lead_id);
    const messages = messagesByConversation.get(conversationId) || [];
    const lead = leadsById.get(leadId);
    const profile = profilesByLeadId.get(leadId) || {};
    const lastOutbound = latestOutboundAt(messages);
    const latestReview = latestReviewByConversation.get(conversationId);

    if (!lead || !messages.length) {
      skipped.push(emptyItem({ conversation, lead, status: { notes: "missing_lead_or_messages" } }));
      continue;
    }

    if (!lastOutbound) {
      skipped.push(emptyItem({ conversation, lead, status: { notes: "no_ai_outbound" } }));
      continue;
    }

    if (timestamp(latestReview?.created_at) >= timestamp(lastOutbound)) {
      skipped.push(emptyItem({ conversation, lead, status: { notes: "already_reviewed_latest_reply" } }));
      continue;
    }

    try {
      const result = await generateReview({ conversation, lead, messages, profile });
      const shouldHandoff =
        autoHandoff &&
        (result.verdict === "handoff" ||
          result.verdict === "bloquear" ||
          result.score < 55 ||
          result.flags.some((flag) => ["promessa_financeira", "risco_transparencia", "risco_juridico"].includes(flag)));
      const item: WhatsAppQualityReviewItem = {
        conversationId,
        leadId,
        agentKey: cleanString(conversation.agent_key, "multichannel-dispatch"),
        leadName: cleanString(lead.name, "Lead WhatsApp"),
        score: result.score,
        verdict: result.verdict,
        flags: result.flags,
        notes: result.notes,
        reviewed: !dryRun,
        handoff: false,
        learned: false,
      };

      if (!dryRun) {
        const { error } = await supabase.from("whatsapp_agent_reviews").insert({
          conversation_id: conversationId,
          lead_id: leadId,
          agent_key: item.agentKey || null,
          review_type: "turing_benchmark",
          score: result.score,
          verdict: result.verdict,
          metrics: {
            ...result.metrics,
            model: result.model,
            operator_next_action: result.nextAction || null,
          },
          review_flags: result.flags,
          notes: result.notes,
          reviewed_by_label: "Auditoria IA Betel",
        });
        if (error) throw new Error(error.message);

        item.learned = await applyQualityLearning({
          agentKey: item.agentKey,
          conversationId,
          leadId,
          score: result.score,
          verdict: result.verdict,
          flags: result.flags,
          notes: result.notes,
          nextAction: result.nextAction,
        });

        if (shouldHandoff) {
          item.handoff = await markHandoff({
            conversationId,
            leadId,
            agentKey: item.agentKey,
            reason: result.notes || result.verdict,
            conversationMetadata: asRecord(conversation.metadata),
          });
        }
      }

      reviewed.push(item);
    } catch (error) {
      failed.push(emptyItem({
        conversation,
        lead,
        status: {
          notes: "review_failed",
          error: error instanceof Error ? error.message : "review_failed",
        },
      }));
    }
  }

  return {
    ok: failed.length === 0,
    dryRun,
    requested: Math.min(limit, conversations.length),
    reviewedCount: reviewed.length,
    handoffCount: reviewed.filter((item) => item.handoff).length,
    learnedCount: reviewed.filter((item) => item.learned).length,
    skippedCount: skipped.length,
    reviewed,
    skipped,
    failed,
    errors,
  };
}
