import "server-only";

import {
  asArray,
  asNumber,
  asRecord,
  asString,
  getSupabaseAdminClient,
  type DataResult,
  type MutationResult,
} from "./shared";

export type PropertyQualificationStatus = "shadow" | "auto_candidate" | "human_review" | "blocked";
export type PropertyQualificationReadinessStatus = "auto_candidate" | "human_review" | "blocked";
export type PropertyQualificationEvidenceStatus = "passed" | "warning" | "blocked" | "info";
export type PropertyQualificationFeedbackDecision = "confirmado" | "corrigido" | "reprovado" | "pendente";

export type PropertyQualificationEvidence = {
  id: string;
  dossierId: string;
  opportunityId: string;
  category: string;
  label: string;
  status: PropertyQualificationEvidenceStatus;
  score: number;
  sourceUrl: string;
  details: string;
  sortOrder: number;
  rawPayload: Record<string, unknown>;
  createdAt: string;
};

export type PropertyQualificationFeedback = {
  id: string;
  dossierId: string;
  opportunityId: string;
  adminUserId: string;
  reviewerName: string;
  decision: PropertyQualificationFeedbackDecision;
  fieldKey: string;
  previousValue: Record<string, unknown>;
  correctedValue: Record<string, unknown>;
  notes: string;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PropertyQualificationDossier = {
  id: string;
  opportunityId: string;
  scrapeRunId: string;
  dossierCode: string;
  mode: string;
  version: string;
  status: PropertyQualificationStatus;
  readinessStatus: PropertyQualificationReadinessStatus;
  propertyType: string;
  identityScore: number;
  marketScore: number;
  imageScore: number;
  documentationScore: number;
  complianceScore: number;
  riskScore: number;
  confidenceScore: number;
  overallScore: number;
  blockers: string[];
  recommendations: string[];
  propertyPlaybook: Record<string, unknown>;
  identityEvidence: Record<string, unknown>;
  marketEvidence: Record<string, unknown>;
  imageEvidence: Record<string, unknown>;
  documentEvidence: Record<string, unknown>;
  complianceEvidence: Record<string, unknown>;
  sourceSnapshot: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  evidence: PropertyQualificationEvidence[];
  feedback: PropertyQualificationFeedback[];
};

export type SavePropertyQualificationFeedbackInput = {
  dossierId: string;
  opportunityId: string;
  adminUserId?: string;
  reviewerName?: string;
  decision: string;
  fieldKey?: string;
  previousValue?: Record<string, unknown>;
  correctedValue?: Record<string, unknown>;
  notes?: string;
  rawPayload?: Record<string, unknown>;
};

type DbRow = Record<string, unknown>;

function clampScore(value: unknown) {
  return Math.max(0, Math.min(100, Math.round(asNumber(value))));
}

function normalizeStatus(value: string): PropertyQualificationStatus {
  if (["shadow", "auto_candidate", "human_review", "blocked"].includes(value)) {
    return value as PropertyQualificationStatus;
  }

  return "human_review";
}

function normalizeReadinessStatus(value: string): PropertyQualificationReadinessStatus {
  if (["auto_candidate", "human_review", "blocked"].includes(value)) {
    return value as PropertyQualificationReadinessStatus;
  }

  return "human_review";
}

function normalizeEvidenceStatus(value: string): PropertyQualificationEvidenceStatus {
  if (["passed", "warning", "blocked", "info"].includes(value)) {
    return value as PropertyQualificationEvidenceStatus;
  }

  return "info";
}

function normalizeFeedbackDecision(value: string): PropertyQualificationFeedbackDecision {
  const normalized = value.toLowerCase();
  if (["confirmado", "corrigido", "reprovado", "pendente"].includes(normalized)) {
    return normalized as PropertyQualificationFeedbackDecision;
  }

  return "pendente";
}

function jsonTextList(value: unknown) {
  return asArray<unknown>(value, [])
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = asRecord(item);
      return asString(record.detail) || asString(record.label) || asString(record.title);
    })
    .filter(Boolean);
}

function normalizeEvidence(row: DbRow): PropertyQualificationEvidence {
  return {
    id: asString(row.id),
    dossierId: asString(row.dossier_id),
    opportunityId: asString(row.opportunity_id),
    category: asString(row.category, "source"),
    label: asString(row.label, "Evidencia"),
    status: normalizeEvidenceStatus(asString(row.status, "info")),
    score: clampScore(row.score),
    sourceUrl: asString(row.source_url),
    details: asString(row.details),
    sortOrder: asNumber(row.sort_order),
    rawPayload: asRecord(row.raw_payload),
    createdAt: asString(row.created_at),
  };
}

function normalizeFeedback(row: DbRow): PropertyQualificationFeedback {
  return {
    id: asString(row.id),
    dossierId: asString(row.dossier_id),
    opportunityId: asString(row.opportunity_id),
    adminUserId: asString(row.admin_user_id),
    reviewerName: asString(row.reviewer_name, "Operador"),
    decision: normalizeFeedbackDecision(asString(row.decision)),
    fieldKey: asString(row.field_key),
    previousValue: asRecord(row.previous_value),
    correctedValue: asRecord(row.corrected_value),
    notes: asString(row.notes),
    rawPayload: asRecord(row.raw_payload),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

function normalizeDossier(
  row: DbRow,
  evidence: PropertyQualificationEvidence[],
  feedback: PropertyQualificationFeedback[]
): PropertyQualificationDossier {
  return {
    id: asString(row.id),
    opportunityId: asString(row.opportunity_id),
    scrapeRunId: asString(row.scrape_run_id),
    dossierCode: asString(row.dossier_code),
    mode: asString(row.mode, "shadow"),
    version: asString(row.version),
    status: normalizeStatus(asString(row.status, "human_review")),
    readinessStatus: normalizeReadinessStatus(asString(row.readiness_status, "human_review")),
    propertyType: asString(row.property_type),
    identityScore: clampScore(row.identity_score),
    marketScore: clampScore(row.market_score),
    imageScore: clampScore(row.image_score),
    documentationScore: clampScore(row.documentation_score),
    complianceScore: clampScore(row.compliance_score),
    riskScore: clampScore(row.risk_score),
    confidenceScore: clampScore(row.confidence_score),
    overallScore: clampScore(row.overall_score),
    blockers: jsonTextList(row.blockers),
    recommendations: jsonTextList(row.recommendations),
    propertyPlaybook: asRecord(row.property_playbook),
    identityEvidence: asRecord(row.identity_evidence),
    marketEvidence: asRecord(row.market_evidence),
    imageEvidence: asRecord(row.image_evidence),
    documentEvidence: asRecord(row.document_evidence),
    complianceEvidence: asRecord(row.compliance_evidence),
    sourceSnapshot: asRecord(row.source_snapshot),
    rawPayload: asRecord(row.raw_payload),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
    evidence,
    feedback,
  };
}

export async function getPropertyQualificationDossierByOpportunityId(
  opportunityId: string
): Promise<DataResult<PropertyQualificationDossier | null>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      data: null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data, error } = await supabase
    .from("property_qualification_dossiers")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) {
    return {
      data: null,
      source: "supabase",
      reason: error.message,
    };
  }

  const row = (data || [])[0] as DbRow | undefined;
  if (!row) {
    return {
      data: null,
      source: "supabase",
      reason: "Dossie profundo ainda nao gerado para este imovel.",
    };
  }

  const dossierId = asString(row.id);
  const [evidenceResult, feedbackResult] = await Promise.all([
    supabase
      .from("property_qualification_evidence")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("property_qualification_feedback")
      .select("*")
      .eq("dossier_id", dossierId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const evidence = evidenceResult.error
    ? []
    : ((evidenceResult.data || []) as DbRow[]).map(normalizeEvidence);
  const feedback = feedbackResult.error
    ? []
    : ((feedbackResult.data || []) as DbRow[]).map(normalizeFeedback);

  return {
    data: normalizeDossier(row, evidence, feedback),
    source: "supabase",
    reason: evidenceResult.error?.message || feedbackResult.error?.message,
  };
}

export async function getPropertyQualificationDossierByOpportunityCode(
  opportunityCode: string
): Promise<DataResult<PropertyQualificationDossier | null>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      data: null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const code = opportunityCode.trim();
  if (!code) {
    return {
      data: null,
      source: "supabase",
      reason: "Codigo da oportunidade nao informado.",
    };
  }

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("id")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      source: "supabase",
      reason: error.message,
    };
  }

  const opportunityId = asString((data as DbRow | null)?.id);
  if (!opportunityId) {
    return {
      data: null,
      source: "supabase",
      reason: "Oportunidade nao encontrada para carregar o dossie.",
    };
  }

  return getPropertyQualificationDossierByOpportunityId(opportunityId);
}

export async function savePropertyQualificationFeedbackRecord(
  input: SavePropertyQualificationFeedbackInput
): Promise<MutationResult<PropertyQualificationFeedback>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const dossierId = input.dossierId.trim();
  const opportunityId = input.opportunityId.trim();
  if (!dossierId || !opportunityId) {
    return { ok: false, error: "Dossie ou oportunidade nao informados." };
  }

  const payload = {
    dossier_id: dossierId,
    opportunity_id: opportunityId,
    admin_user_id: input.adminUserId || null,
    reviewer_name: input.reviewerName || "Operador",
    decision: normalizeFeedbackDecision(input.decision),
    field_key: input.fieldKey || null,
    previous_value: input.previousValue || {},
    corrected_value: input.correctedValue || {},
    notes: input.notes || null,
    raw_payload: input.rawPayload || {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("property_qualification_feedback")
    .insert(payload)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: normalizeFeedback((data || {}) as DbRow) };
}
