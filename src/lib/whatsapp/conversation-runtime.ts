import "server-only";

export type WhatsAppRuntimeIntent =
  | "greeting"
  | "qualification_answer"
  | "budget"
  | "region"
  | "property_goal"
  | "auction_question"
  | "objection_or_fear"
  | "legal_risk"
  | "occupied_property"
  | "bid_or_contract_sensitive"
  | "meeting_request"
  | "buying_intent"
  | "human_request"
  | "stop_contact"
  | "identity_question"
  | "prompt_attack"
  | "media_context"
  | "unknown";

export type WhatsAppRuntimeStage = "entrada" | "qualificando" | "quente" | "handoff" | "convertido" | "perdido";

export type WhatsAppRuntimeMessageContext = {
  direction: string;
  authorType: string;
  text: string;
  createdAt: string;
};

export type WhatsAppRuntimeLeadContext = {
  status: string;
  temperature: string;
  qualificationScore: number;
  metadata: Record<string, unknown>;
};

export type WhatsAppRuntimeDecision = {
  primaryIntent: WhatsAppRuntimeIntent;
  intents: WhatsAppRuntimeIntent[];
  confidence: number;
  stage: WhatsAppRuntimeStage;
  classification: string;
  stageReason: string;
  nextAction: string;
  nextActionDueMinutes: number | null;
  qualificationAnswered: string[];
  qualificationMissing: string[];
  shouldHandoff: boolean;
  handoffReason: string;
  alertHuman: boolean;
  followUpCandidate: boolean;
  canAskQualification: boolean;
  riskFlags: string[];
  guidance: string[];
  promptContext: string;
  memoryPatch: Record<string, unknown>;
};

export type WhatsAppPreSendEvaluation = {
  allow: boolean;
  text: string;
  corrections: string[];
  flags: string[];
  blockedReason: string;
  score: number;
};

type DecisionInput = {
  inboundText: string;
  lead: WhatsAppRuntimeLeadContext;
  history: WhatsAppRuntimeMessageContext[];
  config: {
    qualifiedScore: number;
    vipScore: number;
  };
  mediaKind?: string;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function clampText(value: string, limit = 500) {
  const clean = value.trim();
  return clean.length > limit ? `${clean.slice(0, limit - 3)}...` : clean;
}

function uniqueStrings<T extends string>(values: T[]) {
  return [...new Set(values.filter(Boolean))];
}

function matchAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function budgetFromText(text: string) {
  const normalized = normalizeSearchText(text);
  const explicitCurrency = normalized.match(/r\$\s?([\d.,]+)\s?(milhao|milhoes|mi|mil|k)?/i);
  const plainBudget = normalized.match(/\b([\d.,]+)\s?(milhao|milhoes|mi|mil|k)\b/i);
  const match = explicitCurrency || plainBudget;
  if (!match) return 0;

  const raw = match[1].replace(/\./g, "").replace(",", ".");
  const base = Number(raw);
  if (!Number.isFinite(base)) return 0;

  const suffix = cleanString(match[2]).toLowerCase();
  if (["milhao", "milhoes", "mi"].includes(suffix)) return Math.round(base * 1_000_000);
  if (["mil", "k"].includes(suffix)) return Math.round(base * 1_000);
  return Math.round(base);
}

function getQualificationProfile(metadata: Record<string, unknown>) {
  return asRecord(metadata.betel_qualification || metadata.betelQualification || metadata.qualification);
}

function qualificationValue(profile: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = profile[key];
    if (typeof value === "number" && value > 0) return String(value);
    const text = cleanString(value);
    if (text) return text;
  }
  return "";
}

function detectQualification(input: DecisionInput, normalized: string) {
  const profile = getQualificationProfile(input.lead.metadata);
  const budget = budgetFromText(input.inboundText);
  const known = {
    objective:
      qualificationValue(profile, ["objective", "investmentGoal", "investment_goal"]) ||
      (matchAny(normalized, [/\b(morar|moradia|uso proprio|revenda|aluguel|renda|investimento|investir)\b/])
        ? "texto_atual"
        : ""),
    priority:
      qualificationValue(profile, ["priority", "urgency"]) ||
      (matchAny(normalized, [/\b(agora|urgente|essa semana|este mes|sem pressa|futuro|pesquisando)\b/])
        ? "texto_atual"
        : ""),
    blocker:
      qualificationValue(profile, ["blocker", "fear", "objection"]) ||
      (matchAny(normalized, [/\b(medo|receio|risco|juridico|matricula|ocupad|desocup|nao entendo|primeira vez)\b/])
        ? "texto_atual"
        : ""),
    capital: qualificationValue(profile, ["capitalAmount", "capital_amount", "capital"]) || (budget > 0 ? String(budget) : ""),
    meeting:
      qualificationValue(profile, ["meetingInterest", "meeting_interest"]) ||
      (matchAny(normalized, [/\b(reuniao|diretor comercial|consultor|me chama|pode chamar|faz sentido|vamos falar)\b/])
        ? "texto_atual"
        : ""),
  };
  const labels = {
    objective: "objetivo",
    priority: "prioridade",
    blocker: "receio",
    capital: "capital liquido",
    meeting: "proximo passo",
  };
  const answered = Object.entries(known)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => labels[key as keyof typeof labels]);
  const missing = Object.entries(known)
    .filter(([, value]) => !value)
    .map(([key]) => labels[key as keyof typeof labels]);

  return { answered, missing, budget };
}

function lastMessageTime(history: WhatsAppRuntimeMessageContext[], direction: string) {
  return history
    .filter((message) => message.direction === direction)
    .map((message) => new Date(message.createdAt).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0] || 0;
}

function detectIntents(input: DecisionInput): WhatsAppRuntimeIntent[] {
  const normalized = normalizeSearchText(input.inboundText);
  const intents: WhatsAppRuntimeIntent[] = [];

  if (!normalized && input.mediaKind) intents.push("media_context");
  if (matchAny(normalized, [/\b(ignore|ignora|desconsidere).*\b(instrucoes|regras|sistema|prompt)\b/, /\b(prompt|system prompt|developer|codigo fonte|api key|token|segredo)\b/])) {
    intents.push("prompt_attack");
  }
  if (matchAny(normalized, [/\b(parar|sair|remover|cancelar mensagens|nao quero receber|pare de mandar)\b/])) intents.push("stop_contact");
  if (matchAny(normalized, [/\b(humano|pessoa|atendente|consultor|corretor|vendedor|falar com alguem|me liga|ligacao)\b/])) {
    intents.push("human_request");
  }
  if (matchAny(normalized, [/\b(voce|vc|tu)\s+(e|eh|e)\s+(ia|bot|robo|inteligencia artificial|humano|pessoa)\b/])) {
    intents.push("identity_question");
  }
  if (matchAny(normalized, [/\b(advogado|juridico|processo|acao judicial|procon|fraude|golpe|denuncia|matricula|edital|documentacao)\b/])) {
    intents.push("legal_risk");
  }
  if (matchAny(normalized, [/\b(ocupad|desocup|posse|morador|inquilino|imissao|mandado)\b/])) intents.push("occupied_property");
  if (matchAny(normalized, [/\b(contrato|assinar|pix|deposito|sinal|boleto|pagamento|dados bancarios|lance|arrematar|proposta)\b/])) {
    intents.push("bid_or_contract_sensitive");
  }
  if (budgetFromText(input.inboundText) > 0 || matchAny(normalized, [/\b(capital|orcamento|budget|tenho para investir|posso investir)\b/])) {
    intents.push("budget");
  }
  if (matchAny(normalized, [/\b(regiao|cidade|bairro|estado|sao paulo|rio|curitiba|sc|sp|rj|pr|rs|itajai|joinville|florianopolis)\b/])) {
    intents.push("region");
  }
  if (matchAny(normalized, [/\b(morar|moradia|uso proprio|revenda|renda|aluguel|investir|investimento|patrimonio)\b/])) {
    intents.push("property_goal");
  }
  if (matchAny(normalized, [/\b(como funciona|leilao|leilao judicial|extrajudicial|caixa|desconto|avaliacao|risco|oportunidade)\b/])) {
    intents.push("auction_question");
  }
  if (matchAny(normalized, [/\b(medo|receio|inseguro|nao entendo|primeira vez|duvida|travado|problema)\b/])) {
    intents.push("objection_or_fear");
  }
  if (matchAny(normalized, [/\b(reuniao|diretor comercial|me chama|pode chamar|agenda|marcar|ligar|whatsapp do consultor)\b/])) {
    intents.push("meeting_request");
  }
  if (matchAny(normalized, [/\b(quero|tenho interesse|manda|envia|ver oportunidade|vamos|fechar|contratar|começar|comecar)\b/])) {
    intents.push("buying_intent");
  }
  if (input.mediaKind) intents.push("media_context");
  if (!intents.length && /^(oi|ola|opa|bom dia|boa tarde|boa noite|e ai|blz|beleza|tudo bem)[!.?\s]*$/.test(normalized)) {
    intents.push("greeting");
  }

  return uniqueStrings(intents.length ? intents : ["unknown"]);
}

function choosePrimaryIntent(intents: WhatsAppRuntimeIntent[]) {
  const priority: WhatsAppRuntimeIntent[] = [
    "stop_contact",
    "human_request",
    "prompt_attack",
    "legal_risk",
    "occupied_property",
    "bid_or_contract_sensitive",
    "meeting_request",
    "buying_intent",
    "budget",
    "region",
    "property_goal",
    "objection_or_fear",
    "auction_question",
    "identity_question",
    "media_context",
    "qualification_answer",
    "greeting",
    "unknown",
  ];
  return priority.find((intent) => intents.includes(intent)) || "unknown";
}

function inferStage(input: DecisionInput, intents: WhatsAppRuntimeIntent[], qualification: ReturnType<typeof detectQualification>) {
  const normalized = normalizeSearchText(input.inboundText);
  const score = input.lead.qualificationScore || 0;
  const status = normalizeSearchText(`${input.lead.status} ${input.lead.temperature}`);

  if (intents.includes("stop_contact") || /\b(perdido|nao tenho interesse|desisti)\b/.test(normalized)) return "perdido";
  if (intents.some((intent) => ["human_request", "legal_risk", "occupied_property", "bid_or_contract_sensitive"].includes(intent))) {
    return "handoff";
  }
  if (/\b(ja assinei|contratei|paguei|sou cliente|fechado)\b/.test(normalized) || /\b(convertido|cliente)\b/.test(status)) {
    return "convertido";
  }
  if (
    score >= input.config.vipScore ||
    intents.includes("meeting_request") ||
    intents.includes("buying_intent") ||
    qualification.answered.length >= 4 ||
    (qualification.budget >= 200_000 && qualification.answered.length >= 2)
  ) {
    return "quente";
  }
  if (qualification.answered.length || score >= 30 || intents.some((intent) => ["budget", "region", "property_goal", "objection_or_fear", "auction_question"].includes(intent))) {
    return "qualificando";
  }
  return "entrada";
}

function nextActionForStage(input: {
  stage: WhatsAppRuntimeStage;
  primaryIntent: WhatsAppRuntimeIntent;
  missing: string[];
  budget: number;
}) {
  if (input.stage === "handoff") return "Acionar humano e responder sem prometer validacao juridica, posse, lance ou contrato.";
  if (input.stage === "perdido") return "Respeitar opt-out/desinteresse e parar automacao.";
  if (input.stage === "convertido") return "Confirmar contexto com humano e registrar conversao no CRM.";
  if (input.stage === "quente") return "Conduzir para consultor ou oportunidade validada pela equipe Betel.";
  if (input.primaryIntent === "greeting") return "Responder curto e deixar o lead dizer o assunto antes de qualificar.";
  if (input.missing.length) return `Coletar ${input.missing[0]} com uma pergunta natural depois de entregar valor.`;
  if (input.budget > 0) return "Confirmar regiao/tipo de imovel e encaminhar proximo passo.";
  return "Entender a duvida principal e avancar uma pergunta por vez.";
}

function stageClassification(stage: WhatsAppRuntimeStage) {
  if (stage === "entrada") return "entrada";
  if (stage === "qualificando") return "qualificando";
  if (stage === "quente") return "lead_quente";
  if (stage === "handoff") return "handoff_humano";
  if (stage === "convertido") return "convertido";
  return "perdido";
}

function handoffReason(intents: WhatsAppRuntimeIntent[]) {
  if (intents.includes("human_request")) return "lead_requested_human";
  if (intents.includes("legal_risk")) return "legal_risk";
  if (intents.includes("occupied_property")) return "occupied_property";
  if (intents.includes("bid_or_contract_sensitive")) return "financial_or_contract_sensitive";
  return "";
}

export function buildWhatsAppRuntimeDecision(input: DecisionInput): WhatsAppRuntimeDecision {
  const normalized = normalizeSearchText(input.inboundText);
  const baseIntents = detectIntents(input);
  const qualification = detectQualification(input, normalized);
  const intents = uniqueStrings(
    qualification.answered.some((item) => ["objetivo", "prioridade", "receio", "capital liquido", "proximo passo"].includes(item))
      ? [...baseIntents, "qualification_answer"]
      : baseIntents
  );
  const primaryIntent = choosePrimaryIntent(intents);
  const stage = inferStage(input, intents, qualification);
  const reason = handoffReason(intents);
  const riskFlags = intents.filter((intent) =>
    ["prompt_attack", "legal_risk", "occupied_property", "bid_or_contract_sensitive", "stop_contact"].includes(intent)
  );
  const lastInboundAt = lastMessageTime(input.history, "inbound");
  const lastOutboundAt = lastMessageTime(input.history, "outbound");
  const followUpCandidate = Boolean(lastOutboundAt && lastOutboundAt > lastInboundAt && Date.now() - lastOutboundAt > 6 * 60 * 60 * 1000);
  const canAskQualification = stage !== "handoff" && stage !== "perdido" && primaryIntent !== "greeting" && qualification.missing.length > 0;
  const nextAction = nextActionForStage({
    stage,
    primaryIntent,
    missing: qualification.missing,
    budget: qualification.budget,
  });
  const guidance = [
    stage === "entrada" ? "Nao puxe formulario nem capital logo de cara; responda curto e abra espaco." : "",
    canAskQualification ? `Proxima pergunta permitida: ${qualification.missing[0]}.` : "",
    stage === "quente" ? "Sinalizar proximo passo comercial sem promessa de resultado." : "",
    stage === "handoff" ? "Manter resposta breve e encaminhar para humano." : "",
    riskFlags.length ? "Nao dar parecer juridico, nao validar matricula/ocupacao/lance e nao prometer prazo." : "",
    intents.includes("identity_question") ? "Se perguntarem se e IA, responder com transparencia curta." : "",
    "Uma pergunta por resposta e sem markdown.",
  ].filter(Boolean);
  const confidence = Math.min(0.98, 0.38 + Math.min(intents.length, 5) * 0.1 + qualification.answered.length * 0.06 + (riskFlags.length ? 0.12 : 0));
  const nextActionDueMinutes = stage === "handoff" ? 15 : stage === "quente" ? 60 : followUpCandidate ? 120 : null;
  const promptContext = [
    `Intencao principal: ${primaryIntent}.`,
    `Intencoes secundarias: ${intents.join(", ")}.`,
    `Estagio CRM sugerido: ${stage}.`,
    `Proxima acao: ${nextAction}`,
    qualification.answered.length ? `Campos ja respondidos: ${qualification.answered.join(", ")}.` : "Campos respondidos: nenhum claro ainda.",
    qualification.missing.length ? `Campos faltantes: ${qualification.missing.join(", ")}.` : "Campos principais completos.",
    guidance.length ? `Guia de atendimento: ${guidance.join(" ")}` : "",
  ].filter(Boolean).join("\n");

  return {
    primaryIntent,
    intents,
    confidence,
    stage,
    classification: stageClassification(stage),
    stageReason: `intent:${primaryIntent}`,
    nextAction,
    nextActionDueMinutes,
    qualificationAnswered: qualification.answered,
    qualificationMissing: qualification.missing,
    shouldHandoff: stage === "handoff" && Boolean(reason),
    handoffReason: reason,
    alertHuman: stage === "quente" || stage === "handoff",
    followUpCandidate,
    canAskQualification,
    riskFlags,
    guidance,
    promptContext,
    memoryPatch: {
      whatsapp_runtime_decision: {
        primaryIntent,
        intents,
        confidence,
        stage,
        classification: stageClassification(stage),
        stageReason: `intent:${primaryIntent}`,
        nextAction,
        nextActionDueMinutes,
        qualificationAnswered: qualification.answered,
        qualificationMissing: qualification.missing,
        shouldHandoff: stage === "handoff" && Boolean(reason),
        handoffReason: reason || null,
        alertHuman: stage === "quente" || stage === "handoff",
        followUpCandidate,
        riskFlags,
        textPreview: clampText(input.inboundText, 180),
        updatedAt: new Date().toISOString(),
      },
      whatsappRuntimeDecision: {
        primaryIntent,
        intents,
        stage,
        nextAction,
        qualificationMissing: qualification.missing,
        updatedAt: new Date().toISOString(),
      },
      crm_stage: stage,
      crmStage: stage,
      next_action: nextAction,
      nextAction,
    },
  };
}

function countQuestions(text: string) {
  return (text.match(/\?/g) || []).length;
}

function trimToOneQuestion(text: string) {
  const index = text.indexOf("?");
  if (index === -1) return text;
  return text.slice(0, index + 1).trim();
}

function hasUnsafeAuctionPromise(text: string) {
  const normalized = normalizeSearchText(text);
  return matchAny(normalized, [
    /\b(retorno garantido|lucro certo|sem risco|garantido|certeza absoluta)\b/,
    /\b(matricula esta ok|edital esta ok|ocupacao resolvida|posse garantida|desocupacao garantida)\b/,
    /\b(pode dar lance|de o lance|feche agora|assina agora|manda pix|faz o deposito)\b/,
  ]);
}

function hasFakeHumanClaim(text: string) {
  return matchAny(normalizeSearchText(text), [/\b(sou humano|sou uma pessoa real|nao sou ia|nao sou robo|nao sou bot)\b/]);
}

function hasInternalLeak(text: string) {
  return matchAny(normalizeSearchText(text), [/\b(prompt|system|developer|instrucoes internas|regras internas|codigo fonte|api key|token|segredo)\b/]);
}

function naturalFallbackForDecision(decision: WhatsAppRuntimeDecision) {
  if (decision.stage === "handoff") {
    return "Esse ponto precisa ser validado com o pessoal da Betel. Vou deixar encaminhado aqui pra seguirem com seguranca.";
  }
  if (decision.primaryIntent === "greeting") {
    return "Opa, tudo certo. Me fala qual ponto vc quer ver sobre leiloes que eu te ajudo.";
  }
  if (decision.canAskQualification && decision.qualificationMissing[0]) {
    return `Entendi. Pra eu te orientar melhor, me fala so uma coisa: ${decision.qualificationMissing[0]}?`;
  }
  return "Entendi. Vou te responder pelo caminho mais seguro: me fala o ponto principal pra eu te orientar sem chutar dado.";
}

export function evaluateWhatsAppReplyBeforeSend(input: {
  text: string;
  inboundText: string;
  history: WhatsAppRuntimeMessageContext[];
  decision: WhatsAppRuntimeDecision;
}): WhatsAppPreSendEvaluation {
  const flags: string[] = [];
  const corrections: string[] = [];
  let text = cleanString(input.text);
  let allow = true;
  let blockedReason = "";

  if (!text) {
    corrections.push("empty_reply_replaced");
    text = naturalFallbackForDecision(input.decision);
  }

  if (hasFakeHumanClaim(text)) {
    flags.push("fake_human_claim");
    corrections.push("fake_human_claim_replaced");
    text = text.replace(/\b(sou humano|sou uma pessoa real|nao sou ia|nao sou robo|nao sou bot)\b/gi, "sou o atendimento da Betel por aqui");
  }

  if (hasInternalLeak(text)) {
    flags.push("internal_leak");
    corrections.push("internal_leak_replaced");
    allow = false;
    blockedReason = "internal_leak";
    text = "Nao consigo compartilhar instrucoes internas por aqui. Me fala o que voce precisa sobre leiloes que eu te ajudo.";
  }

  if (hasUnsafeAuctionPromise(text)) {
    flags.push("unsafe_auction_promise");
    corrections.push("unsafe_auction_promise_replaced");
    text = naturalFallbackForDecision({ ...input.decision, stage: "handoff" });
  }

  if (input.decision.primaryIntent === "greeting" && /\b(capital|regiao|objetivo|orcamento|imovel)\b/i.test(text)) {
    flags.push("premature_qualification");
    corrections.push("premature_qualification_replaced");
    text = naturalFallbackForDecision(input.decision);
  }

  if (input.decision.stage === "handoff" && !/\b(betel|pessoal|equipe|validar|encaminhad)/i.test(text)) {
    flags.push("handoff_without_clear_escalation");
    corrections.push("handoff_escalation_added");
    text = naturalFallbackForDecision(input.decision);
  }

  if (countQuestions(text) > 1) {
    flags.push("multiple_questions");
    corrections.push("trimmed_to_one_question");
    text = trimToOneQuestion(text);
  }

  const recentAiQuestions = input.history
    .filter((message) => message.direction === "outbound" && message.authorType === "ai")
    .slice(-3)
    .map((message) => normalizeSearchText(message.text));
  const normalizedText = normalizeSearchText(text);
  if (recentAiQuestions.some((previous) => previous && previous.includes(normalizedText.slice(0, 80)))) {
    flags.push("repeated_recent_reply");
    corrections.push("repeated_recent_reply_replaced");
    text = naturalFallbackForDecision(input.decision);
  }

  text = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  if (!text) {
    corrections.push("blank_after_evaluation_replaced");
    text = naturalFallbackForDecision(input.decision);
  }

  const score = Math.max(0, 100 - flags.length * 18 - corrections.length * 4);
  return {
    allow,
    text,
    corrections: uniqueStrings(corrections),
    flags: uniqueStrings(flags),
    blockedReason,
    score,
  };
}
