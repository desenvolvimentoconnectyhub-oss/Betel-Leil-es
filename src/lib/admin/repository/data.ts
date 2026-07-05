import "server-only";

import type { OpportunityRow } from "@/lib/admin/mock-data";
import {
  type CreateAuctionOpportunityInput, type UpdateAuctionOpportunityInput,
  type CreateInvestorProfileInput, type AdvisoryContractMutationInput,
  type AuctionSourceRecord, type SourceSnapshotRecord, type SourceSnapshotFilters,
  type AuctionRoomRecord, type InvestorCommunicationEvent,
  type DataResult, type MutationResult, type ProcessAgentRunOutput,
  type OpportunityDbRow, type InvestorDbRow,
  type InvestorCommunicationEventDbRow,
  type AuctionSourceDbRow, type SourceSnapshotDbRow,
  type AiAnalysisRunDbRow, type AgentRunDbRow,
  type ResourceTone,
  type AuctionOpportunity, type ModuleResource,
  type InvestorProfile, type InvestorOpportunityMatch,
  type CommercialPack, type AdvisoryContractGate, type AdvisoryContractSnapshot,
  type AdvisoryContractForeignKeys, type RiskAppetite,
  asString, asNumber, asBoolean, asArray, asStringList, asRecord,
  mockReason, adminDateTimeFormatter,
  getSupabaseAdminClient,
  normalizeOpportunity, normalizeOpportunityImages, normalizeInvestor, normalizeAdvisoryContract,
  normalizeInvestorCommunicationEvent,
  makeContractCode, resolveAdvisoryContractForeignKeys, getAdvisoryContractSnapshot,
  toDashboardRow, fallbackOpportunities, fallbackInvestors,
  toneForRunStatus, normalizeTone,
  shortCode, formatAdminDateTime, formatCurrency,
  clampAdminText, looksLikeUuid, makePayloadPreview,
  getAdminResource, getOpportunityById,
  auctionOpportunities, investorProfiles,
  createOpportunitiesResource, createKanbanResourceFromOpportunities,
  createInvestorsResource, buildInvestorMatches,
  getMockInvestorById, normalizeRiskAppetite,
  buildCommercialPack, buildAdvisoryContractGate,
} from "./shared";
import { assessRealEstateAsset, isLikelyExactPropertySourceUrl } from "@/lib/scraper/quality";

function hasPortfolioValue(row: OpportunityDbRow) {
  return asNumber(row.initial_bid) > 0 || asNumber(row.appraisal_value) > 0;
}

function hasPortfolioImage(row: OpportunityDbRow) {
  return normalizeOpportunityImages(row.raw_payload).some((image) => Boolean(image.url) && image.status !== "failed");
}

function getPortfolioSourceUrl(row: OpportunityDbRow) {
  const rawPayload = asRecord(row.raw_payload);
  const candidate = asRecord(rawPayload.candidate);
  return asString(rawPayload.sourceUrl, asString(candidate.sourceUrl, asString(rawPayload.targetUrl))).trim();
}

function hasExactPortfolioSourceUrl(row: OpportunityDbRow) {
  const rawPayload = asRecord(row.raw_payload);
  const targetUrl = asString(rawPayload.targetUrl).trim();
  return isLikelyExactPropertySourceUrl(getPortfolioSourceUrl(row), targetUrl);
}

function hasRealEstateAssetIntent(row: OpportunityDbRow) {
  const rawPayload = asRecord(row.raw_payload);
  const candidate = asRecord(rawPayload.candidate);
  return !assessRealEstateAsset({
    title: asString(row.title),
    propertyType: asString(row.property_type),
    address: asString(row.address),
    city: asString(row.city),
    state: asString(row.state),
    summary: asString(row.summary),
    sourceUrl: getPortfolioSourceUrl(row),
    rawData: candidate,
  }).rejected;
}

function shouldShowInPortfolio(row: OpportunityDbRow) {
  const status = [
    asString(row.stage),
    asString(row.ai_status),
    asString(row.legal_status),
  ]
    .join(" ")
    .toLowerCase();

  if (status.includes("descart")) return false;
  if (!hasRealEstateAssetIntent(row)) return false;
  if (!hasExactPortfolioSourceUrl(row)) return false;

  return hasPortfolioValue(row) && hasPortfolioImage(row);
}

export async function listAuctionOpportunities(limit = 50): Promise<DataResult<AuctionOpportunity[]>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return fallbackOpportunities("Supabase admin nao configurado.", limit);

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return fallbackOpportunities(error.message, limit);
  if (!data?.length) return fallbackOpportunities("Tabela auction_opportunities vazia.", limit);

  const visibleRows = ((data || []) as OpportunityDbRow[]).filter(shouldShowInPortfolio);

  return {
    data: visibleRows.map((row) => normalizeOpportunity(row)),
    source: "supabase",
  };
}

export async function getAuctionOpportunityByCode(code: string): Promise<DataResult<AuctionOpportunity | null>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      data: getOpportunityById(code) || null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return {
      data: getOpportunityById(code) || null,
      source: "mock",
      reason: error.message,
    };
  }

  if (!data) {
    return {
      data: getOpportunityById(code) || null,
      source: "mock",
      reason: "Registro nao encontrado no Supabase.",
    };
  }

  return {
    data: normalizeOpportunity(data as OpportunityDbRow),
    source: "supabase",
  };
}


export async function getRuntimeAdminResource(slug: string): Promise<DataResult<ModuleResource | undefined>> {
  if (slug === "investidores") {
    const investors = await listInvestorProfiles();

    return {
      data: createInvestorsResource(investors.data),
      source: investors.source,
      reason: investors.reason,
    };
  }

  if (slug === "fontes") {
    const sources = await listAuctionSources();

    if (sources.source !== "supabase") {
      return {
        data: getAdminResource(slug),
        source: sources.source,
        reason: sources.reason,
      };
    }

    return {
      data: createSourcesResourceFromRecords(sources.data),
      source: sources.source,
      reason: sources.reason,
    };
  }

  if (slug === "kanban") {
    const opportunities = await listAuctionOpportunities();

    return {
      data: createKanbanResourceFromOpportunities(opportunities.data),
      source: opportunities.source,
      reason: opportunities.reason,
    };
  }

  if (slug === "arremate") {
    const records = await listAuctionRoomRecords();

    return {
      data: createAuctionRoomResourceFromRecords(records.data),
      source: records.source,
      reason: records.reason,
    };
  }

  if (slug !== "oportunidades") {
    return {
      data: getAdminResource(slug),
      source: "mock",
      reason: "Recurso ainda usa definicao local.",
    };
  }

  const opportunities = await listAuctionOpportunities();

  return {
    data: createOpportunitiesResource(opportunities.data),
    source: opportunities.source,
    reason: opportunities.reason,
  };
}

export async function listDashboardOpportunityRows(limit = 6): Promise<DataResult<OpportunityRow[]>> {
  const opportunities = await listAuctionOpportunities(limit);

  return {
    data: opportunities.data.slice(0, limit).map(toDashboardRow),
    source: opportunities.source,
    reason: opportunities.reason,
  };
}

function normalizeAuctionSource(row: AuctionSourceDbRow): AuctionSourceRecord {
  return {
    id: asString(row.id),
    name: asString(row.name, "Fonte nao identificada"),
    sourceType: asString(row.source_type, "Manual"),
    url: asString(row.url),
    status: asString(row.status, "monitoring"),
    qualityScore: asNumber(row.quality_score),
    termsStatus: asString(row.terms_status, "Sem politica"),
    lastCollectedAt: asString(row.last_collected_at),
    notes: asString(row.notes, "Sem observacoes."),
  };
}

function createSourcesResourceFromRecords(sources: AuctionSourceRecord[]): ModuleResource {
  const active = sources.filter((source) => source.status.toLowerCase().includes("active")).length;
  const withUrl = sources.filter((source) => source.url).length;
  const avgScore = sources.length
    ? Math.round(sources.reduce((total, source) => total + source.qualityScore, 0) / sources.length)
    : 0;

  return {
    slug: "fontes",
    title: "Fontes monitoradas",
    eyebrow: "origem / qualidade / coleta",
    description: "Controle real das fontes cadastradas pela captura operacional e pela ingestao de oportunidades.",
    kind: "table",
    summary: [
      { label: "Fontes reais", value: String(sources.length), detail: "registradas no Supabase", tone: "cyan" },
      { label: "Ativas", value: String(active), detail: "aptas para coleta", tone: active ? "green" : "yellow" },
      { label: "Score medio", value: String(avgScore), detail: `${withUrl} com URL oficial`, tone: "purple" },
    ],
    columns: [
      { key: "id", label: "ID" },
      { key: "source", label: "Fonte" },
      { key: "type", label: "Tipo" },
      { key: "status", label: "Status" },
      { key: "score", label: "Score", align: "center" },
      { key: "last", label: "Ultima coleta" },
      { key: "notes", label: "Observacao" },
    ],
    rows: sources.map((source) => ({
      id: source.id,
      cells: [
        { label: shortCode(source.id), kind: "text", muted: true },
        {
          label: source.name,
          kind: "text",
          href: `/admin/fontes/capturas?source=${source.id}`,
        },
        { label: source.sourceType, kind: "text" },
        { label: source.status, kind: "status" },
        { label: source.qualityScore, kind: "score" },
        { label: formatAdminDateTime(source.lastCollectedAt), kind: "date" },
        { label: source.notes, kind: "text", muted: true },
      ],
    })),
  };
}

function normalizeRoomText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function auctionRoomTone(status: string, kind: AuctionRoomRecord["kind"]): ResourceTone {
  const text = normalizeRoomText(status);
  if (text.includes("blocked") || text.includes("bloque") || text.includes("cancel")) return "red";
  if (text.includes("signed") || text.includes("approved") || text.includes("won") || text.includes("paid")) return "green";
  if (text.includes("running") || text.includes("scheduled") || text.includes("opened") || text.includes("draft")) {
    return kind === "post" ? "purple" : "yellow";
  }
  return "muted";
}

function createAuctionRoomResourceFromRecords(records: AuctionRoomRecord[]): ModuleResource {
  const strategies = records.filter((record) => record.kind === "strategy").length;
  const sessions = records.filter((record) => record.kind === "session").length;
  const postCases = records.filter((record) => record.kind === "post").length;
  const blocked = records.filter((record) => auctionRoomTone(record.status, record.kind) === "red").length;

  return {
    slug: "arremate",
    title: "Sala de arremate",
    eyebrow: "teto / sessao / pos-arremate",
    description: "Leitura operacional de estrategias, sessoes e casos pos-arremate ja persistidos no Supabase.",
    kind: "table",
    summary: [
      { label: "Estrategias", value: String(strategies), detail: "tetos de lance registrados", tone: "yellow" },
      { label: "Sessoes", value: String(sessions), detail: "agenda e resultado", tone: sessions ? "cyan" : "muted" },
      { label: "Pos-arremate", value: String(postCases), detail: `${blocked} bloqueios ativos`, tone: blocked ? "red" : "green" },
    ],
    columns: [
      { key: "type", label: "Tipo" },
      { key: "opportunity", label: "Oportunidade" },
      { key: "status", label: "Status" },
      { key: "amount", label: "Valor/Teto", align: "right" },
      { key: "owner", label: "Responsavel" },
      { key: "next", label: "Proxima acao" },
      { key: "updated", label: "Atualizado" },
    ],
    rows: records.map((record) => ({
      id: record.id,
      cells: [
        { label: record.label, kind: "text", muted: true },
        {
          label: `${record.opportunityCode} - ${record.opportunityTitle}`,
          kind: "text",
          href: record.opportunityCode ? `/admin/oportunidades/${record.opportunityCode}` : undefined,
        },
        { label: record.status, kind: "status", tone: auctionRoomTone(record.status, record.kind) },
        { label: record.amountLabel, kind: "money" },
        { label: record.owner, kind: "text" },
        { label: record.nextAction, kind: "text", muted: true },
        { label: formatAdminDateTime(record.updatedAt), kind: "date" },
      ],
    })),
  };
}

function opportunitySummaryForRoom(row: Record<string, unknown> | undefined) {
  return {
    code: asString(row?.code, shortCode(asString(row?.id), "OPP")),
    title: asString(row?.title, "Oportunidade sem titulo"),
  };
}


export async function createAuctionOpportunityRecord(
  input: CreateAuctionOpportunityInput
): Promise<MutationResult<{ code: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Cadastros reais exigem NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const financialSummary = [
    { label: "Lance inicial", value: formatCurrency(input.initialBid), detail: "Informado no cadastro" },
    { label: "Valor estimado", value: formatCurrency(input.appraisalValue), detail: "Referencia inicial" },
    { label: "Desconto estimado", value: `${input.discountPct}%`, detail: "Calculado antes da diligencia" },
  ];

  const riskFlags = [
    {
      label: input.riskScore >= 70 ? "Risco critico inicial" : "Risco inicial",
      severity: input.riskScore >= 70 ? "red" : input.riskScore >= 45 ? "yellow" : "green",
      detail: "Classificacao informada no cadastro manual.",
    },
  ];

  const checklist = [
    { label: "Cadastro manual", status: "Concluido", owner: input.owner || "Operacao" },
    { label: "Curadoria IA", status: input.aiStatus, owner: "AI Curator" },
    { label: "Revisao juridica", status: input.legalStatus, owner: "Juridico" },
    { label: "Dossie", status: "Pendente", owner: "Sistema" },
  ];

  const documents = [
    { label: "Edital oficial", status: "Pendente", source: input.sourceName || "Fonte oficial" },
    { label: "Matricula", status: "Pendente", source: "Cartorio" },
    { label: "Comparaveis", status: "Pendente", source: "Big Data mock" },
  ];

  const timeline = [
    {
      time: new Date().toISOString(),
      actor: input.owner || "Operacao",
      action: "Criou oportunidade manualmente no Command Center",
      tone: "cyan",
    },
  ];

  const { data, error } = await supabase
    .from("auction_opportunities")
    .insert({
      code: input.code,
      title: input.title,
      property_type: input.propertyType,
      address: input.address,
      city: input.city,
      state: input.state,
      source_name: input.sourceName,
      source_type: input.sourceType,
      initial_bid: input.initialBid,
      appraisal_value: input.appraisalValue,
      discount_pct: input.discountPct,
      opportunity_score: input.opportunityScore,
      risk_score: input.riskScore,
      compliance_score: input.complianceScore,
      ai_status: input.aiStatus,
      legal_status: input.legalStatus,
      stage: input.stage,
      next_action: input.nextAction,
      owner_name: input.owner,
      auction_date: input.auctionDate || null,
      occupancy: input.occupancy,
      summary: input.summary,
      financial_summary: financialSummary,
      risk_flags: riskFlags,
      checklist,
      documents,
      timeline,
      raw_payload: { created_from: "admin_manual_form" },
    })
    .select("code")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    data: {
      code: asString(data?.code, input.code),
    },
  };
}


export async function updateAuctionOpportunityRecord(
  code: string,
  input: UpdateAuctionOpportunityInput
): Promise<MutationResult<{ code: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Edicoes reais exigem NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const { data: current } = await supabase
    .from("auction_opportunities")
    .select("timeline")
    .eq("code", code)
    .maybeSingle();

  const currentTimeline = asArray<Record<string, unknown>>(
    (current as Record<string, unknown> | null)?.timeline,
    []
  );

  const financialSummary = [
    { label: "Lance inicial", value: formatCurrency(input.initialBid), detail: "Atualizado no admin" },
    { label: "Valor estimado", value: formatCurrency(input.appraisalValue), detail: "Referencia atual" },
    { label: "Desconto estimado", value: `${input.discountPct}%`, detail: "Calculado antes da diligencia" },
  ];

  const riskFlags = [
    {
      label: input.riskScore >= 70 ? "Risco critico atualizado" : "Risco atualizado",
      severity: input.riskScore >= 70 ? "red" : input.riskScore >= 45 ? "yellow" : "green",
      detail: "Classificacao atualizada pela mesa operacional.",
    },
  ];

  const checklist = [
    { label: "Cadastro revisado", status: "Concluido", owner: input.owner || "Operacao" },
    { label: "Curadoria IA", status: input.aiStatus, owner: "AI Curator" },
    { label: "Revisao juridica", status: input.legalStatus, owner: "Juridico" },
    { label: "Dossie", status: input.stage === "Dossie" ? "Em preparo" : "Pendente", owner: "Sistema" },
  ];

  const documents = [
    { label: "Edital oficial", status: "Pendente", source: input.sourceName || "Fonte oficial" },
    { label: "Matricula", status: "Pendente", source: "Cartorio" },
    { label: "Comparaveis", status: "Pendente", source: "Big Data mock" },
  ];

  const timeline = [
    ...currentTimeline,
    {
      time: new Date().toISOString(),
      actor: input.owner || "Operacao",
      action: "Atualizou oportunidade no Command Center",
      tone: "cyan",
    },
  ];

  const { data, error } = await supabase
    .from("auction_opportunities")
    .update({
      title: input.title,
      property_type: input.propertyType,
      address: input.address,
      city: input.city,
      state: input.state,
      source_name: input.sourceName,
      source_type: input.sourceType,
      initial_bid: input.initialBid,
      appraisal_value: input.appraisalValue,
      discount_pct: input.discountPct,
      opportunity_score: input.opportunityScore,
      risk_score: input.riskScore,
      compliance_score: input.complianceScore,
      ai_status: input.aiStatus,
      legal_status: input.legalStatus,
      stage: input.stage,
      next_action: input.nextAction,
      owner_name: input.owner,
      auction_date: input.auctionDate || null,
      occupancy: input.occupancy,
      summary: input.summary,
      financial_summary: financialSummary,
      risk_flags: riskFlags,
      checklist,
      documents,
      timeline,
    })
    .eq("code", code)
    .select("code")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    data: {
      code: asString(data?.code, code),
    },
  };
}


export async function listInvestorProfiles(limit = 50): Promise<DataResult<InvestorProfile[]>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return fallbackInvestors("Supabase admin nao configurado.", limit);

  const { data, error } = await supabase
    .from("investor_profiles")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return fallbackInvestors(error.message, limit);
  if (!data?.length) return fallbackInvestors("Tabela investor_profiles vazia.", limit);

  return {
    data: data.map((row) => normalizeInvestor(row as InvestorDbRow)),
    source: "supabase",
  };
}

export async function getInvestorProfileById(id: string): Promise<DataResult<InvestorProfile | null>> {
  const supabase = getSupabaseAdminClient();
  const mockInvestor = getMockInvestorById(id);

  if (!supabase) {
    return {
      data: mockInvestor || null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  if (!looksLikeUuid(id) && mockInvestor) {
    return {
      data: mockInvestor,
      source: "mock",
      reason: "Registro local de demonstracao.",
    };
  }

  const { data, error } = await supabase.from("investor_profiles").select("*").eq("id", id).maybeSingle();

  if (error) {
    return {
      data: mockInvestor || null,
      source: "mock",
      reason: error.message,
    };
  }

  if (!data) {
    return {
      data: mockInvestor || null,
      source: "mock",
      reason: "Registro nao encontrado no Supabase.",
    };
  }

  return {
    data: normalizeInvestor(data as InvestorDbRow),
    source: "supabase",
  };
}

export async function listInvestorCommunicationEvents(
  investorId: string,
  limit = 20
): Promise<DataResult<InvestorCommunicationEvent[]>> {
  const supabase = getSupabaseAdminClient();
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit || 20), 50));

  if (!supabase) {
    return {
      data: [],
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  if (!looksLikeUuid(investorId)) {
    return {
      data: [],
      source: "mock",
      reason: "Historico real exige investidor persistido no Supabase.",
    };
  }

  const { data, error } = await supabase
    .from("investor_communication_events")
    .select("*")
    .eq("investor_id", investorId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) {
    return {
      data: [],
      source: "mock",
      reason: error.message,
    };
  }

  return {
    data: ((data || []) as InvestorCommunicationEventDbRow[]).map(normalizeInvestorCommunicationEvent),
    source: "supabase",
  };
}

export async function listInvestorMatchesForInvestor(
  investorId: string
): Promise<DataResult<InvestorOpportunityMatch[]>> {
  const [investorResult, opportunitiesResult] = await Promise.all([
    getInvestorProfileById(investorId),
    listAuctionOpportunities(),
  ]);

  if (!investorResult.data) {
    return {
      data: [],
      source: investorResult.source,
      reason: investorResult.reason || "Investidor nao encontrado.",
    };
  }

  return {
    data: buildInvestorMatches(investorResult.data, opportunitiesResult.data),
    source: investorResult.source === "supabase" || opportunitiesResult.source === "supabase" ? "supabase" : "mock",
    reason: investorResult.reason || opportunitiesResult.reason,
  };
}

export async function getInvestorCommercialPack(
  investorId: string,
  opportunityId: string
): Promise<DataResult<CommercialPack | null>> {
  const [investorResult, opportunitiesResult] = await Promise.all([
    getInvestorProfileById(investorId),
    listAuctionOpportunities(),
  ]);

  if (!investorResult.data) {
    return {
      data: null,
      source: investorResult.source,
      reason: investorResult.reason || "Investidor nao encontrado.",
    };
  }

  const matches = buildInvestorMatches(investorResult.data, opportunitiesResult.data);
  const match =
    matches.find((item) => item.opportunityId.toLowerCase() === opportunityId.toLowerCase()) ||
    buildInvestorMatches(
      investorResult.data,
      opportunitiesResult.data.filter((item) => item.id.toLowerCase() === opportunityId.toLowerCase())
    )[0];

  if (!match) {
    return {
      data: null,
      source: investorResult.source,
      reason: "Oportunidade nao encontrada para o pacote comercial.",
    };
  }

  return {
    data: buildCommercialPack(investorResult.data, match),
    source: investorResult.source === "supabase" || opportunitiesResult.source === "supabase" ? "supabase" : "mock",
    reason: investorResult.reason || opportunitiesResult.reason,
  };
}

export async function getAdvisoryContractGate(
  investorId: string,
  opportunityId: string
): Promise<DataResult<AdvisoryContractGate | null>> {
  const packResult = await getInvestorCommercialPack(investorId, opportunityId);

  if (!packResult.data) {
    return {
      data: null,
      source: packResult.source,
      reason: packResult.reason || "Pacote comercial nao encontrado para o gate de contrato.",
    };
  }

  const contractResult = await getAdvisoryContractSnapshot(investorId, opportunityId);

  return {
    data: buildAdvisoryContractGate(packResult.data, contractResult.data),
    source: packResult.source === "supabase" || contractResult.source === "supabase" ? "supabase" : "mock",
    reason: contractResult.data ? packResult.reason : packResult.reason || contractResult.reason,
  };
}

export async function issueAdvisoryContractRecord(
  input: AdvisoryContractMutationInput
): Promise<MutationResult<{ id: string; contractCode: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Emissao real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const [packResult, keys] = await Promise.all([
    getInvestorCommercialPack(input.investorId, input.opportunityId),
    resolveAdvisoryContractForeignKeys(supabase, input.investorId, input.opportunityId),
  ]);

  if (!packResult.data) {
    return {
      ok: false,
      error: packResult.reason || "Pacote comercial nao encontrado.",
    };
  }

  if (!keys.ok || !keys.data) {
    return {
      ok: false,
      error: keys.error || "Nao foi possivel resolver investidor e oportunidade reais.",
    };
  }

  const existing = await getAdvisoryContractSnapshot(input.investorId, input.opportunityId);
  if (existing.data) {
    return {
      ok: true,
      data: {
        id: existing.data.id,
        contractCode: existing.data.contractCode,
      },
    };
  }

  const gate = buildAdvisoryContractGate(packResult.data);
  if (!gate.preconditionsReady) {
    return {
      ok: false,
      error: "Gate bloqueado. Resolva dossie, parecer, fonte oficial e aderencia antes de emitir a minuta.",
    };
  }

  const now = new Date().toISOString();
  const maxAuthorizedBid = gate.authorization.maxAuthorizedBid;
  const contractCode = makeContractCode(input.opportunityId);

  const { data, error } = await supabase
    .from("advisory_contracts")
    .insert({
      investor_id: keys.data.investorUuid,
      opportunity_id: keys.data.opportunityUuid,
      contract_code: contractCode,
      status: "pending_signature",
      contract_type: "advisory_authorization",
      signer_name: packResult.data.investor.name,
      signer_email: packResult.data.investor.email,
      max_authorized_bid: maxAuthorizedBid,
      reviewed_by: input.reviewedBy || "Juridico + Operacao",
      reviewed_at: now,
      notes: input.notes || "Minuta emitida pelo gate de contrato.",
      raw_payload: {
        generated_from: "admin_contract_gate",
        commercial_pack_id: packResult.data.id,
        match_score: packResult.data.match.matchScore,
        opportunity_code: packResult.data.opportunity.id,
        preconditions_ready: gate.preconditionsReady,
      },
    })
    .select("id, contract_code")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    data: {
      id: asString(data?.id),
      contractCode: asString(data?.contract_code, contractCode),
    },
  };
}

function makeBidStrategyCode(opportunityUuid: string, contractCode: string) {
  const base = contractCode || opportunityUuid;
  return `BID-${base.replace(/[^a-zA-Z0-9]/g, "").slice(-16).toUpperCase() || Date.now().toString(36).toUpperCase()}`;
}

async function ensureAuctionExecutionAfterContract(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  input: AdvisoryContractMutationInput,
  keys: AdvisoryContractForeignKeys,
  contract: AdvisoryContractSnapshot
): Promise<MutationResult<{ strategyCode: string; sessionId: string }>> {
  const now = new Date().toISOString();
  const ceilingBid = contract.maxAuthorizedBid || 0;
  const strategyCode = makeBidStrategyCode(keys.opportunityUuid, contract.contractCode);
  const existingStrategy = await supabase
    .from("bid_strategies")
    .select("id, strategy_code")
    .eq("opportunity_id", keys.opportunityUuid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingStrategy.error) return { ok: false, error: existingStrategy.error.message };

  const strategy =
    existingStrategy.data ||
    (
      await supabase
        .from("bid_strategies")
        .insert({
          opportunity_id: keys.opportunityUuid,
          strategy_code: strategyCode,
          ceiling_bid: ceilingBid,
          reserve_cost: Math.round(ceilingBid * 0.06),
          expected_roi_pct: null,
          status: "approved",
          approved_by: input.reviewedBy || contract.reviewedBy || "Juridico + Operacao",
          approved_at: now,
          notes:
            input.notes ||
            `Estrategia criada apos assinatura do contrato ${contract.contractCode}. Lance acima do teto permanece bloqueado.`,
        })
        .select("id, strategy_code")
        .single()
    ).data;

  if (!strategy) return { ok: false, error: "Nao foi possivel criar ou localizar estrategia de lance." };

  const strategyId = asString(strategy.id);
  const finalStrategyCode = asString(strategy.strategy_code, strategyCode);
  const existingSession = await supabase
    .from("auction_sessions")
    .select("id")
    .eq("opportunity_id", keys.opportunityUuid)
    .eq("bid_strategy_id", strategyId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSession.error) return { ok: false, error: existingSession.error.message };

  const session =
    existingSession.data ||
    (
      await supabase
        .from("auction_sessions")
        .insert({
          opportunity_id: keys.opportunityUuid,
          bid_strategy_id: strategyId,
          status: "scheduled",
          starts_at: null,
          final_bid: null,
          result: null,
          operator_name: input.reviewedBy || "Operacao",
          notes: `Sala aberta pelo contrato ${contract.contractCode}. Conferir edital, horario e teto antes da disputa.`,
        })
        .select("id")
        .single()
    ).data;

  if (!session) return { ok: false, error: "Nao foi possivel criar ou localizar sessao de arremate." };

  await supabase.from("audit_logs").insert({
    opportunity_id: keys.opportunityUuid,
    actor_name: input.reviewedBy || "Operacao",
    event_type: "auction_room_opened",
    status: "scheduled",
    payload: {
      contractCode: contract.contractCode,
      strategyCode: finalStrategyCode,
      sessionId: asString(session.id),
      ceilingBid,
    },
  });

  return {
    ok: true,
    data: {
      strategyCode: finalStrategyCode,
      sessionId: asString(session.id),
    },
  };
}

export async function signAdvisoryContractRecord(
  input: AdvisoryContractMutationInput
): Promise<MutationResult<{ id: string; status: string; strategyCode?: string; sessionId?: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Assinatura real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const keys = await resolveAdvisoryContractForeignKeys(supabase, input.investorId, input.opportunityId);
  if (!keys.ok || !keys.data) {
    return {
      ok: false,
      error: keys.error || "Nao foi possivel resolver investidor e oportunidade reais.",
    };
  }

  const current = await getAdvisoryContractSnapshot(input.investorId, input.opportunityId);
  if (!current.data) {
    return {
      ok: false,
      error: current.reason || "Gere a minuta antes de registrar a assinatura.",
    };
  }

  if (current.data.status.toLowerCase() === "signed") {
    return {
      ok: true,
      data: {
        id: current.data.id,
        status: current.data.status,
      },
    };
  }

  const gateResult = await getAdvisoryContractGate(input.investorId, input.opportunityId);
  if (!gateResult.data?.preconditionsReady) {
    return {
      ok: false,
      error: "Gate bloqueado. Resolva as precondicoes antes de registrar assinatura.",
    };
  }

  const now = new Date().toISOString();
  const mergedNotes = [current.data.notes, input.notes || "Assinatura registrada pelo gate de contrato."]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabase
    .from("advisory_contracts")
    .update({
      status: "signed",
      signed_at: now,
      reviewed_by: input.reviewedBy || current.data.reviewedBy || "Juridico + Operacao",
      reviewed_at: now,
      notes: mergedNotes,
      raw_payload: {
        signed_from: "admin_contract_gate",
        previous_status: current.data.status,
      },
    })
    .eq("id", current.data.id)
    .select("id, status")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  const auctionRoom = await ensureAuctionExecutionAfterContract(supabase, input, keys.data, {
    ...current.data,
    status: asString(data?.status, "signed"),
    signedAt: now,
    reviewedAt: now,
    reviewedBy: input.reviewedBy || current.data.reviewedBy || "Juridico + Operacao",
    notes: mergedNotes,
  });

  if (!auctionRoom.ok || !auctionRoom.data) {
    return {
      ok: false,
      error: `Contrato assinado, mas a sala de arremate nao abriu: ${auctionRoom.error || "falha desconhecida"}`,
    };
  }

  return {
    ok: true,
    data: {
      id: asString(data?.id, current.data.id),
      status: asString(data?.status, "signed"),
      strategyCode: auctionRoom.data.strategyCode,
      sessionId: auctionRoom.data.sessionId,
    },
  };
}


export async function createInvestorProfileRecord(
  input: CreateInvestorProfileInput
): Promise<MutationResult<{ id: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Cadastros reais exigem NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const { data, error } = await supabase
    .from("investor_profiles")
    .insert({
      name: input.name,
      email: input.email,
      phone: input.phone,
      organization_name: input.organization,
      city_focus: input.cityFocus,
      max_budget: input.maxBudget,
      target_roi_pct: input.targetRoiPct,
      risk_appetite: input.riskAppetite,
      preferred_property_types: input.preferredPropertyTypes,
      status: input.status,
      plan_key: input.planKey,
      lifecycle_stage: input.lifecycleStage,
      whatsapp_opt_in: input.whatsappOptIn,
      email_opt_in: input.emailOptIn,
      push_opt_in: input.pushOptIn,
      community_opt_in: input.communityOptIn,
      communication_frequency: input.communicationFrequency,
      full_access_until: input.fullAccessUntil || null,
      notes: input.notes,
      owner_name: input.owner,
    })
    .select("id")
    .single();

  if (error) {
    return {
      ok: false,
      error: error.message,
    };
  }

  return {
    ok: true,
    data: {
      id: asString(data?.id, ""),
    },
  };
}


export async function listAuctionRoomRecords(limit = 80): Promise<DataResult<AuctionRoomRecord[]>> {
  const supabase = getSupabaseAdminClient();
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit || 80), 120));

  if (!supabase) {
    return {
      data: [],
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const [strategyResult, sessionResult, postResult] = await Promise.all([
    supabase.from("bid_strategies").select("*").order("updated_at", { ascending: false }).limit(safeLimit),
    supabase.from("auction_sessions").select("*").order("updated_at", { ascending: false }).limit(safeLimit),
    supabase.from("post_auction_cases").select("*").order("updated_at", { ascending: false }).limit(safeLimit),
  ]);
  const firstError = strategyResult.error || sessionResult.error || postResult.error;

  if (firstError) {
    return {
      data: [],
      source: "mock",
      reason: firstError.message,
    };
  }

  const strategyRows = (strategyResult.data || []) as Record<string, unknown>[];
  const sessionRows = (sessionResult.data || []) as Record<string, unknown>[];
  const postRows = (postResult.data || []) as Record<string, unknown>[];
  const opportunityIds = Array.from(
    new Set(
      [...strategyRows, ...sessionRows, ...postRows]
        .map((row) => asString(row.opportunity_id))
        .filter(Boolean)
    )
  );
  const opportunityMap = new Map<string, Record<string, unknown>>();

  if (opportunityIds.length) {
    const { data } = await supabase.from("auction_opportunities").select("id,code,title").in("id", opportunityIds);
    for (const opportunity of (data || []) as Record<string, unknown>[]) {
      opportunityMap.set(asString(opportunity.id), opportunity);
    }
  }

  const records: AuctionRoomRecord[] = [
    ...strategyRows.map((row) => {
      const opportunityId = asString(row.opportunity_id);
      const opportunity = opportunitySummaryForRoom(opportunityMap.get(opportunityId));

      return {
        id: asString(row.id, asString(row.strategy_code)),
        kind: "strategy" as const,
        label: "Estrategia",
        opportunityId,
        opportunityCode: opportunity.code,
        opportunityTitle: opportunity.title,
        status: asString(row.status, "draft"),
        amountLabel: formatCurrency(asNumber(row.ceiling_bid)),
        owner: asString(row.approved_by, "Operacao"),
        nextAction: asString(row.notes, asString(row.approved_at) ? "Agendar sessao de arremate." : "Validar teto e aprovar estrategia."),
        updatedAt: asString(row.updated_at, asString(row.created_at)),
      };
    }),
    ...sessionRows.map((row) => {
      const opportunityId = asString(row.opportunity_id);
      const opportunity = opportunitySummaryForRoom(opportunityMap.get(opportunityId));

      return {
        id: asString(row.id),
        kind: "session" as const,
        label: "Sessao",
        opportunityId,
        opportunityCode: opportunity.code,
        opportunityTitle: opportunity.title,
        status: asString(row.status, "scheduled"),
        amountLabel: asNumber(row.final_bid) > 0 ? formatCurrency(asNumber(row.final_bid)) : "Aguardando",
        owner: asString(row.operator_name, "Operador"),
        nextAction: asString(row.result, asString(row.notes, "Registrar lances e decisao final.")),
        updatedAt: asString(row.updated_at, asString(row.starts_at, asString(row.created_at))),
      };
    }),
    ...postRows.map((row) => {
      const opportunityId = asString(row.opportunity_id);
      const opportunity = opportunitySummaryForRoom(opportunityMap.get(opportunityId));

      return {
        id: asString(row.id),
        kind: "post" as const,
        label: "Pos-arremate",
        opportunityId,
        opportunityCode: opportunity.code,
        opportunityTitle: opportunity.title,
        status: asString(row.status, "opened"),
        amountLabel: asString(row.payment_status, "Pagamento pendente"),
        owner: asString(row.owner_name, "Backoffice"),
        nextAction: asString(row.next_action, "Organizar pagamento, registro, posse e chaves."),
        updatedAt: asString(row.updated_at, asString(row.created_at)),
      };
    }),
  ].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return {
    data: records,
    source: "supabase",
  };
}


export async function listAuctionSources(limit = 50): Promise<DataResult<AuctionSourceRecord[]>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      data: [],
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data, error } = await supabase
    .from("auction_sources")
    .select("*")
    .order("last_collected_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    return {
      data: [],
      source: "mock",
      reason: error.message,
    };
  }

  return {
    data: (data || []).map((row) => normalizeAuctionSource(row as AuctionSourceDbRow)),
    source: "supabase",
    reason: data?.length ? undefined : "Tabela auction_sources vazia.",
  };
}

function normalizeSourceSnapshot(
  row: SourceSnapshotDbRow,
  sourceMap: Map<string, AuctionSourceDbRow>,
  opportunityMap: Map<string, OpportunityDbRow>,
  runMap: Map<string, AiAnalysisRunDbRow>,
  agentRunMap: Map<string, AgentRunDbRow>,
  hiddenRiskByCuratorRun: Map<string, AgentRunDbRow>,
  humanHandoffByHiddenRiskRun: Map<string, AgentRunDbRow>,
  complianceByHumanHandoffRun: Map<string, AgentRunDbRow>,
  legalReviewMap: Map<string, Record<string, unknown>>
): SourceSnapshotRecord {
  const sourceId = asString(row.source_id);
  const opportunityId = asString(row.opportunity_id);
  const source = sourceMap.get(sourceId) || {};
  const opportunity = opportunityMap.get(opportunityId) || {};
  const snapshotCode = asString(row.snapshot_code, shortCode(asString(row.id), "SRC"));
  const run = runMap.get(snapshotCode) || runMap.get(opportunityId) || {};
  const runOutput = asRecord(run.output_json);
  const curatorRunCode = asString(runOutput.curatorRunCode);
  const curatorRun = agentRunMap.get(curatorRunCode) || {};
  const hiddenRiskRun = hiddenRiskByCuratorRun.get(curatorRunCode) || {};
  const hiddenRiskRunCode = asString(hiddenRiskRun.run_code);
  const humanHandoffRun = humanHandoffByHiddenRiskRun.get(hiddenRiskRunCode) || {};
  const humanHandoffRunCode = asString(humanHandoffRun.run_code);
  const complianceRun = complianceByHumanHandoffRun.get(humanHandoffRunCode) || {};
  const legalReview = legalReviewMap.get(opportunityId) || {};
  const city = asString(opportunity.city);
  const state = asString(opportunity.state);
  const extractedPayload = asRecord(row.extracted_payload);
  const rawPayload = asRecord(row.raw_payload);
  const communication = asRecord(extractedPayload.communication);

  return {
    id: asString(row.id),
    snapshotCode,
    externalId: asString(row.external_id),
    snapshotType: asString(row.snapshot_type, "manual_intake"),
    sourceUrl: asString(row.source_url),
    title: asString(row.title, asString(opportunity.title, "Captura sem titulo")),
    status: asString(row.status, "captured"),
    collectedBy: asString(row.collected_by, "Operacao"),
    collectedAt: asString(row.collected_at),
    contentHash: asString(row.content_hash),
    sourceId,
    sourceName: asString(source.name, "Fonte nao localizada"),
    sourceType: asString(source.source_type, "Manual"),
    opportunityId,
    opportunityCode: asString(opportunity.code),
    opportunityTitle: asString(opportunity.title, asString(row.title, "Oportunidade sem titulo")),
    location: city && state ? `${city}/${state}` : "Sem localidade",
    aiStatus: asString(opportunity.ai_status, "Fila IA"),
    legalStatus: asString(opportunity.legal_status, "Pendente"),
    stage: asString(opportunity.stage, "Entrada"),
    runCode: asString(run.run_code),
    runStatus: asString(run.status, "Sem run"),
    curationStatus: asString(runOutput.curationStatus),
    curatorRunCode,
    curatorRunStatus: asString(curatorRun.status),
    hiddenRiskRunCode,
    hiddenRiskStatus: asString(hiddenRiskRun.status),
    humanHandoffRunCode,
    humanHandoffStatus: asString(humanHandoffRun.status),
    legalReviewCode: asString(legalReview.review_code),
    legalReviewStatus: asString(legalReview.status),
    legalReviewDecision: asString(legalReview.decision),
    complianceRunCode: asString(complianceRun.run_code),
    complianceRunStatus: asString(complianceRun.status),
    complianceReviewStatus: asString(complianceRun.human_review_status),
    communicationStatus: asString(communication.status, asString(extractedPayload.communicationStatus)),
    communicationOutboxCount: asNumber(communication.outboxCount, asNumber(extractedPayload.communicationOutboxCount)),
    communicationDispatchedAt: asString(communication.dispatchedAt, asString(extractedPayload.communicationDispatchedAt)),
    payloadPreview: makePayloadPreview(Object.keys(extractedPayload).length ? extractedPayload : rawPayload),
  };
}

export async function listSourceSnapshots(
  filters: SourceSnapshotFilters = {}
): Promise<DataResult<SourceSnapshotRecord[]>> {
  const supabase = getSupabaseAdminClient();
  const limit = Math.min(Math.max(filters.limit || 50, 1), 100);

  if (!supabase) {
    return {
      data: [],
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  let query = supabase
    .from("source_snapshots")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(limit);

  if (filters.sourceId) query = query.eq("source_id", filters.sourceId);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;

  if (error) {
    return {
      data: [],
      source: "mock",
      reason: error.message,
    };
  }

  const snapshots = (data || []) as SourceSnapshotDbRow[];
  if (!snapshots.length) {
    return {
      data: [],
      source: "supabase",
      reason: "Nenhuma captura registrada ainda.",
    };
  }

  const sourceIds = Array.from(new Set(snapshots.map((row) => asString(row.source_id)).filter(Boolean)));
  const opportunityIds = Array.from(new Set(snapshots.map((row) => asString(row.opportunity_id)).filter(Boolean)));

  const sourceRows: AuctionSourceDbRow[] = [];
  const opportunityRows: OpportunityDbRow[] = [];
  const runRows: AiAnalysisRunDbRow[] = [];
  const agentRunRows: AgentRunDbRow[] = [];
  const legalReviewRows: Record<string, unknown>[] = [];

  if (sourceIds.length) {
    const { data: sources } = await supabase.from("auction_sources").select("*").in("id", sourceIds);
    sourceRows.push(...((sources || []) as AuctionSourceDbRow[]));
  }

  if (opportunityIds.length) {
    const { data: opportunities } = await supabase.from("auction_opportunities").select("*").in("id", opportunityIds);
    opportunityRows.push(...((opportunities || []) as OpportunityDbRow[]));

    const { data: runs } = await supabase
      .from("ai_analysis_runs")
      .select("run_code, opportunity_id, status, output_json, created_at")
      .eq("run_type", "source_intake")
      .in("opportunity_id", opportunityIds)
      .order("created_at", { ascending: false });
    runRows.push(...((runs || []) as AiAnalysisRunDbRow[]));

    const { data: agentRuns } = await supabase
      .from("agent_runs")
      .select("*, ai_agents(agent_key, name)")
      .in("opportunity_id", opportunityIds)
      .order("created_at", { ascending: false })
      .limit(120);
    agentRunRows.push(...((agentRuns || []) as AgentRunDbRow[]));

    const { data: legalReviews } = await supabase
      .from("legal_reviews")
      .select("*")
      .in("opportunity_id", opportunityIds)
      .order("created_at", { ascending: false });
    legalReviewRows.push(...((legalReviews || []) as Record<string, unknown>[]));
  }

  const sourceMap = new Map(sourceRows.map((row) => [asString(row.id), row]));
  const opportunityMap = new Map(opportunityRows.map((row) => [asString(row.id), row]));
  const runMap = new Map<string, AiAnalysisRunDbRow>();
  const agentRunMap = new Map<string, AgentRunDbRow>();
  const hiddenRiskByCuratorRun = new Map<string, AgentRunDbRow>();
  const humanHandoffByHiddenRiskRun = new Map<string, AgentRunDbRow>();
  const complianceByHumanHandoffRun = new Map<string, AgentRunDbRow>();
  const legalReviewMap = new Map<string, Record<string, unknown>>();

  for (const run of runRows) {
    const output = asRecord(run.output_json);
    const snapshotCode = asString(output.snapshotCode);
    const opportunityId = asString(run.opportunity_id);
    if (snapshotCode && !runMap.has(snapshotCode)) runMap.set(snapshotCode, run);
    if (opportunityId && !runMap.has(opportunityId)) runMap.set(opportunityId, run);
  }

  for (const run of agentRunRows) {
    const runCode = asString(run.run_code);
    const inputPayload = asRecord(run.input_payload);
    const agentRow = asRecord(Array.isArray(run.ai_agents) ? run.ai_agents[0] : run.ai_agents);
    const agentKey = asString(agentRow.agent_key);
    const previousRunCode = asString(inputPayload.previousRunCode);

    if (runCode && !agentRunMap.has(runCode)) agentRunMap.set(runCode, run);
    if (agentKey === "hidden-risk" && previousRunCode && !hiddenRiskByCuratorRun.has(previousRunCode)) {
      hiddenRiskByCuratorRun.set(previousRunCode, run);
    }
    if (agentKey === "human-handoff" && previousRunCode && !humanHandoffByHiddenRiskRun.has(previousRunCode)) {
      humanHandoffByHiddenRiskRun.set(previousRunCode, run);
    }
    if (agentKey === "compliance-guard" && previousRunCode && !complianceByHumanHandoffRun.has(previousRunCode)) {
      complianceByHumanHandoffRun.set(previousRunCode, run);
    }
  }

  for (const review of legalReviewRows) {
    const opportunityId = asString(review.opportunity_id);
    if (opportunityId && !legalReviewMap.has(opportunityId)) legalReviewMap.set(opportunityId, review);
  }

  return {
    data: snapshots.map((row) =>
      normalizeSourceSnapshot(
        row,
        sourceMap,
        opportunityMap,
        runMap,
        agentRunMap,
        hiddenRiskByCuratorRun,
        humanHandoffByHiddenRiskRun,
        complianceByHumanHandoffRun,
        legalReviewMap
      )
    ),
    source: "supabase",
  };
}
