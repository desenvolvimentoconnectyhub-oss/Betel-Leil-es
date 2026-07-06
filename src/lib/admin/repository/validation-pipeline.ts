import "server-only";

import {
  asNumber,
  asRecord,
  asString,
  getSupabaseAdminClient,
  type DataResult,
  type MutationResult,
  type OpportunityDbRow,
  type SourceSnapshotDbRow,
} from "./shared";

export type ValidationStepStatus = "passed" | "warning" | "pending" | "blocked" | "skipped";
export type ValidationOverallStatus = "completed" | "in_review" | "blocked" | "discarded";

export type OpportunityValidationStep = {
  stepKey: string;
  stepLabel: string;
  stepOrder: number;
  status: ValidationStepStatus;
  score: number;
  summary: string;
  provider: string;
  evidence: Record<string, unknown>;
  errorMessage: string;
  finishedAt: string;
};

export type OpportunityValidationRun = {
  id: string;
  opportunityId: string;
  snapshotId: string;
  opportunityCode: string;
  opportunityTitle: string;
  runCode: string;
  overallStatus: ValidationOverallStatus;
  currentStepKey: string;
  currentStepLabel: string;
  progressPct: number;
  finalScore: number;
  blockedReason: string;
  completedAt: string;
  updatedAt: string;
  persisted: boolean;
  steps: OpportunityValidationStep[];
};

export type RefreshOpportunityValidationOutput = {
  processed: number;
  completed: number;
  inReview: number;
  blocked: number;
  discarded: number;
  persisted: boolean;
  pipelines: OpportunityValidationRun[];
};

type StepDraft = Omit<OpportunityValidationStep, "finishedAt"> & {
  finishedAt?: string;
};

type ValidationBuildResult = Omit<OpportunityValidationRun, "id" | "persisted" | "updatedAt"> & {
  rawPayload: Record<string, unknown>;
};

const VALIDATION_STEPS = [
  ["capture", "Captura"],
  ["normalization", "Dados basicos"],
  ["dedupe", "Duplicidade"],
  ["address", "Endereco"],
  ["public_data", "Bases publicas"],
  ["legal", "Juridico"],
  ["market", "Mercado"],
  ["human_review", "Revisao humana"],
] as const;

function clampScore(value: unknown, fallback = 0) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value, fallback))));
}

function normalizeText(value: unknown) {
  return asString(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasPositiveNumber(value: unknown) {
  return asNumber(value) > 0;
}

function makeRunCode(opportunityId: string, opportunityCode: string) {
  const seed = asString(opportunityId, opportunityCode).replace(/[^a-z0-9]/gi, "").slice(0, 10).toUpperCase();
  return `VAL-${seed || Date.now().toString(36).toUpperCase()}`;
}

function latestSnapshotForOpportunity(snapshots: SourceSnapshotDbRow[], opportunityId: string) {
  return snapshots
    .filter((snapshot) => asString(snapshot.opportunity_id) === opportunityId)
    .sort((a, b) => Date.parse(asString(b.collected_at)) - Date.parse(asString(a.collected_at)))[0];
}

function sourceUrlFrom(opportunity: OpportunityDbRow, snapshot?: SourceSnapshotDbRow) {
  const rawPayload = asRecord(opportunity.raw_payload);
  const candidate = asRecord(rawPayload.candidate);
  return (
    asString(snapshot?.source_url) ||
    asString(rawPayload.sourceUrl) ||
    asString(candidate.sourceUrl) ||
    asString(rawPayload.targetUrl)
  );
}

function step(
  stepKey: (typeof VALIDATION_STEPS)[number][0],
  status: ValidationStepStatus,
  score: number,
  summary: string,
  provider: string,
  evidence: Record<string, unknown> = {},
  errorMessage = ""
): StepDraft {
  const index = VALIDATION_STEPS.findIndex(([key]) => key === stepKey);
  return {
    stepKey,
    stepLabel: VALIDATION_STEPS[index]?.[1] || stepKey,
    stepOrder: index + 1,
    status,
    score: clampScore(score),
    summary,
    provider,
    evidence,
    errorMessage,
    finishedAt: status === "pending" ? "" : new Date().toISOString(),
  };
}

function buildSteps(opportunity: OpportunityDbRow, snapshot?: SourceSnapshotDbRow): OpportunityValidationStep[] {
  const title = asString(opportunity.title);
  const propertyType = asString(opportunity.property_type);
  const address = asString(opportunity.address);
  const city = asString(opportunity.city);
  const state = asString(opportunity.state);
  const stageText = normalizeText(`${opportunity.stage} ${opportunity.ai_status} ${opportunity.legal_status}`);
  const sourceUrl = sourceUrlFrom(opportunity, snapshot);
  const hasSource = Boolean(snapshot || sourceUrl || asString(opportunity.source_name));
  const hasCoreData = Boolean(title && propertyType && (city || state) && (hasPositiveNumber(opportunity.initial_bid) || hasPositiveNumber(opportunity.appraisal_value)));
  const hasAddress = Boolean(address && !normalizeText(address).includes("nao informado") && (city || state));
  const hasMarketValues = hasPositiveNumber(opportunity.initial_bid) && hasPositiveNumber(opportunity.appraisal_value);
  const isDiscarded = stageText.includes("descart");
  const riskScore = clampScore(opportunity.risk_score, 50);
  const complianceScore = clampScore(opportunity.compliance_score, 60);
  const publicSourceText = normalizeText(`${opportunity.source_name} ${opportunity.source_type} ${sourceUrl}`);
  const hasPublicEvidence =
    publicSourceText.includes("dados.gov") ||
    publicSourceText.includes("spu") ||
    publicSourceText.includes("uniao") ||
    publicSourceText.includes("gov.br");
  const legalApproved = stageText.includes("aprov") || stageText.includes("validado") || stageText.includes("liberado");

  return [
    step(
      "capture",
      hasSource ? "passed" : "blocked",
      hasSource ? 100 : 15,
      hasSource ? "Fonte, snapshot ou URL de origem registrada." : "Sem evidencia de fonte para auditar a captura.",
      asString(opportunity.source_name, "Captura"),
      { snapshotCode: asString(snapshot?.snapshot_code), sourceUrl }
    ),
    step(
      "normalization",
      hasCoreData ? "passed" : "warning",
      hasCoreData ? 90 : 45,
      hasCoreData ? "Titulo, tipo, localidade e valor minimo foram normalizados." : "Dados minimos ainda incompletos para analise segura.",
      "Renata",
      { title: Boolean(title), propertyType: Boolean(propertyType), city, state }
    ),
    step(
      "dedupe",
      isDiscarded ? "blocked" : "passed",
      isDiscarded ? 20 : 88,
      isDiscarded ? "Registro marcado como descartado ou duplicado." : "Nenhum bloqueio de duplicidade marcado no cadastro atual.",
      "Sistema",
      { stage: asString(opportunity.stage), code: asString(opportunity.code) }
    ),
    step(
      "address",
      hasAddress ? "passed" : city || state ? "warning" : "pending",
      hasAddress ? 85 : city || state ? 55 : 20,
      hasAddress ? "Endereco tem localidade suficiente para cruzamento." : "Endereco precisa de CEP, bairro ou complemento para validar com seguranca.",
      "ViaCEP / BrasilAPI",
      { address, city, state }
    ),
    step(
      "public_data",
      hasPublicEvidence ? "passed" : "pending",
      hasPublicEvidence ? 78 : 35,
      hasPublicEvidence ? "Fonte publica ou governamental identificada." : "Ainda sem cruzamento publico especifico para este imovel.",
      "Dados.gov.br / SPU",
      { sourceName: asString(opportunity.source_name), sourceUrl }
    ),
    step(
      "legal",
      riskScore >= 70 ? "blocked" : legalApproved || riskScore <= 45 ? "passed" : "warning",
      riskScore >= 70 ? 25 : legalApproved || riskScore <= 45 ? 78 : 52,
      riskScore >= 70 ? "Risco juridico alto exige revisao antes de avancar." : legalApproved ? "Juridico sinaliza liberacao ou validacao." : "Risco juridico inicial precisa de confirmacao.",
      "Igor / Juridico",
      { riskScore, legalStatus: asString(opportunity.legal_status) }
    ),
    step(
      "market",
      hasMarketValues ? "passed" : "warning",
      hasMarketValues ? clampScore(opportunity.opportunity_score, 70) : 45,
      hasMarketValues ? "Lance e avaliacao permitem estimar desconto e atratividade." : "Faltam lance ou avaliacao para validar preco real.",
      "Mercado",
      { initialBid: asNumber(opportunity.initial_bid), appraisalValue: asNumber(opportunity.appraisal_value), discountPct: asNumber(opportunity.discount_pct) }
    ),
    step(
      "human_review",
      legalApproved && complianceScore >= 70 ? "passed" : complianceScore < 50 ? "blocked" : "pending",
      legalApproved && complianceScore >= 70 ? 90 : complianceScore < 50 ? 30 : 45,
      legalApproved && complianceScore >= 70 ? "Revisao humana/compliance indica que o imovel pode avancar." : "Aguardando decisao humana ou checklist de compliance.",
      "Patricia / Compliance",
      { complianceScore, legalStatus: asString(opportunity.legal_status), aiStatus: asString(opportunity.ai_status) }
    ),
  ].map((item) => ({ ...item, finishedAt: item.finishedAt || "" }));
}

function summarizePipeline(opportunity: OpportunityDbRow, snapshot?: SourceSnapshotDbRow): ValidationBuildResult {
  const steps = buildSteps(opportunity, snapshot);
  const blocking = steps.find((item) => item.status === "blocked");
  const pending = steps.find((item) => item.status === "pending" || item.status === "warning");
  const passed = steps.filter((item) => item.status === "passed").length;
  const progressPct = Math.round((passed / steps.length) * 100);
  const finalScore = clampScore(steps.reduce((total, item) => total + item.score, 0) / steps.length);
  const stageText = normalizeText(opportunity.stage);
  const overallStatus: ValidationOverallStatus = stageText.includes("descart")
    ? "discarded"
    : blocking
      ? "blocked"
      : progressPct >= 100
        ? "completed"
        : "in_review";
  const current = blocking || pending || steps[steps.length - 1];

  return {
    opportunityId: asString(opportunity.id),
    snapshotId: asString(snapshot?.id),
    opportunityCode: asString(opportunity.code),
    opportunityTitle: asString(opportunity.title),
    runCode: makeRunCode(asString(opportunity.id), asString(opportunity.code)),
    overallStatus,
    currentStepKey: current?.stepKey || "completed",
    currentStepLabel: current?.stepLabel || "Concluido",
    progressPct,
    finalScore,
    blockedReason: blocking?.summary || "",
    completedAt: overallStatus === "completed" ? new Date().toISOString() : "",
    steps,
    rawPayload: {
      sourceUrl: sourceUrlFrom(opportunity, snapshot),
      stage: asString(opportunity.stage),
      aiStatus: asString(opportunity.ai_status),
      legalStatus: asString(opportunity.legal_status),
    },
  };
}

async function fetchOpportunityRows(limit: number) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { opportunities: [] as OpportunityDbRow[], snapshots: [] as SourceSnapshotDbRow[], error: "Supabase admin nao configurado." };

  const [opportunitiesResult, snapshotsResult] = await Promise.all([
    supabase.from("auction_opportunities").select("*").order("updated_at", { ascending: false }).limit(limit),
    supabase.from("source_snapshots").select("*").order("collected_at", { ascending: false }).limit(Math.max(limit * 3, 100)),
  ]);

  if (opportunitiesResult.error) {
    return { opportunities: [] as OpportunityDbRow[], snapshots: [] as SourceSnapshotDbRow[], error: opportunitiesResult.error.message };
  }

  return {
    opportunities: (opportunitiesResult.data || []) as OpportunityDbRow[],
    snapshots: snapshotsResult.error ? [] : ((snapshotsResult.data || []) as SourceSnapshotDbRow[]),
    error: snapshotsResult.error?.message,
  };
}

function buildPipelines(opportunities: OpportunityDbRow[], snapshots: SourceSnapshotDbRow[], persisted: boolean): OpportunityValidationRun[] {
  return opportunities.map((opportunity) => {
    const snapshot = latestSnapshotForOpportunity(snapshots, asString(opportunity.id));
    const built = summarizePipeline(opportunity, snapshot);
    return {
      ...built,
      id: "",
      updatedAt: new Date().toISOString(),
      persisted,
    };
  });
}

function normalizePersistedRun(row: Record<string, unknown>): OpportunityValidationRun {
  const steps = Array.isArray(row.opportunity_validation_steps)
    ? (row.opportunity_validation_steps as Record<string, unknown>[])
    : [];

  return {
    id: asString(row.id),
    opportunityId: asString(row.opportunity_id),
    snapshotId: asString(row.snapshot_id),
    opportunityCode: asString(row.opportunity_code),
    opportunityTitle: asString(row.opportunity_title),
    runCode: asString(row.run_code),
    overallStatus: asString(row.overall_status, "in_review") as ValidationOverallStatus,
    currentStepKey: asString(row.current_step_key),
    currentStepLabel: asString(row.current_step_label),
    progressPct: clampScore(row.progress_pct),
    finalScore: clampScore(row.final_score),
    blockedReason: asString(row.blocked_reason),
    completedAt: asString(row.completed_at),
    updatedAt: asString(row.updated_at),
    persisted: true,
    steps: steps
      .map((stepRow) => ({
        stepKey: asString(stepRow.step_key),
        stepLabel: asString(stepRow.step_label),
        stepOrder: asNumber(stepRow.step_order),
        status: asString(stepRow.status, "pending") as ValidationStepStatus,
        score: clampScore(stepRow.score),
        summary: asString(stepRow.summary),
        provider: asString(stepRow.provider),
        evidence: asRecord(stepRow.evidence),
        errorMessage: asString(stepRow.error_message),
        finishedAt: asString(stepRow.finished_at),
      }))
      .sort((a, b) => a.stepOrder - b.stepOrder),
  };
}

export async function listOpportunityValidationPipelines(limit = 100): Promise<DataResult<OpportunityValidationRun[]>> {
  const supabase = getSupabaseAdminClient();
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  if (!supabase) return { data: [], source: "mock", reason: "Supabase admin nao configurado." };

  const { data, error } = await supabase
    .from("opportunity_validation_runs")
    .select("*, opportunity_validation_steps(*)")
    .order("updated_at", { ascending: false })
    .limit(safeLimit);

  if (!error && data?.length) {
    return { data: (data as Record<string, unknown>[]).map(normalizePersistedRun), source: "supabase" };
  }

  const fetched = await fetchOpportunityRows(safeLimit);
  const pipelines = buildPipelines(fetched.opportunities, fetched.snapshots, false);
  return {
    data: pipelines,
    source: "supabase",
    reason: error?.message || fetched.error || "Pipeline gerado em memoria ate a migration ser aplicada.",
  };
}

export async function refreshOpportunityValidationPipelinesRecord(
  input: { limit?: number } = {}
): Promise<MutationResult<RefreshOpportunityValidationOutput>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const safeLimit = Math.min(Math.max(input.limit || 100, 1), 250);
  const fetched = await fetchOpportunityRows(safeLimit);
  if (!fetched.opportunities.length) return { ok: false, error: fetched.error || "Nenhuma oportunidade encontrada." };

  const builtPipelines = buildPipelines(fetched.opportunities, fetched.snapshots, true);
  const persistedPipelines: OpportunityValidationRun[] = [];
  let persisted = true;

  for (const pipeline of builtPipelines) {
    const { data: runRow, error: runError } = await supabase
      .from("opportunity_validation_runs")
      .upsert(
        {
          opportunity_id: pipeline.opportunityId,
          snapshot_id: pipeline.snapshotId || null,
          opportunity_code: pipeline.opportunityCode,
          opportunity_title: pipeline.opportunityTitle,
          run_code: pipeline.runCode,
          overall_status: pipeline.overallStatus,
          current_step_key: pipeline.currentStepKey,
          current_step_label: pipeline.currentStepLabel,
          progress_pct: pipeline.progressPct,
          final_score: pipeline.finalScore,
          blocked_reason: pipeline.blockedReason || null,
          completed_at: pipeline.completedAt || null,
          raw_payload: { generatedBy: "betel-validation-v1" },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "opportunity_id" }
      )
      .select("id, updated_at")
      .single();

    if (runError || !runRow) {
      persisted = false;
      break;
    }

    const runId = asString((runRow as Record<string, unknown>).id);
    const stepRows = pipeline.steps.map((item) => ({
      run_id: runId,
      opportunity_id: pipeline.opportunityId,
      snapshot_id: pipeline.snapshotId || null,
      step_key: item.stepKey,
      step_label: item.stepLabel,
      step_order: item.stepOrder,
      status: item.status,
      score: item.score,
      summary: item.summary,
      evidence: item.evidence,
      provider: item.provider || null,
      error_message: item.errorMessage || null,
      started_at: item.finishedAt || new Date().toISOString(),
      finished_at: item.finishedAt || null,
      raw_payload: {},
      updated_at: new Date().toISOString(),
    }));

    const { error: stepsError } = await supabase
      .from("opportunity_validation_steps")
      .upsert(stepRows, { onConflict: "run_id,step_key" });

    if (stepsError) {
      persisted = false;
      break;
    }

    persistedPipelines.push({
      ...pipeline,
      id: runId,
      updatedAt: asString((runRow as Record<string, unknown>).updated_at),
      persisted: true,
    });
  }

  const pipelines = persisted ? persistedPipelines : builtPipelines.map((item) => ({ ...item, persisted: false }));
  const completed = pipelines.filter((item) => item.overallStatus === "completed").length;
  const blocked = pipelines.filter((item) => item.overallStatus === "blocked").length;
  const discarded = pipelines.filter((item) => item.overallStatus === "discarded").length;
  const inReview = pipelines.filter((item) => item.overallStatus === "in_review").length;

  return {
    ok: true,
    data: {
      processed: pipelines.length,
      completed,
      blocked,
      discarded,
      inReview,
      persisted,
      pipelines,
    },
  };
}
