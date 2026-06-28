import "server-only";

export { createHash } from "node:crypto";
import { createHash } from "node:crypto";
import type { OpportunityRow } from "@/lib/admin/mock-data";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { buildCommercialPack, type CommercialPack } from "../commercial";
import {
  buildAdvisoryContractGate,
  type AdvisoryContractGate,
  type AdvisoryContractSnapshot,
} from "../contracts";
import {
  executeAgentRuntime,
  type AgentRuntimeProviderResult,
} from "@/lib/ai/agent-runtime";
import {
  executeCommunicationDeliveryAdapter,
  getCommunicationProviderHealth,
  type CommunicationProviderHealth,
} from "@/lib/communication/delivery-adapters";
import { DEFAULT_WILLIAN_AGENT_CONFIG, type WillianAgentConfig, type WillianInstanceState } from "@/lib/communication/willian-types";
import {
  executeSourceProviderPull,
  type SourceProviderCandidate,
  type SourceProviderPullInput,
  type SourceProviderPullResult,
} from "@/lib/sources/provider-adapters";
import {
  agentDirectory,
  agentGroups,
  agentMaintenanceQueue,
  agentOfficeRooms,
  agentPromptRegistry,
  agentRunSamples,
  agentRuntimeEvents,
  agentWorkflowEdges,
  agentWorkflowStages,
  agentWorkforceMetrics,
  communicationOutbox,
  communicationSegments,
  type AgentDirectoryEntry,
  type AgentGroup,
  type AgentMaintenanceItem,
  type AgentOfficeRoom,
  type CommunicationOutboxItem,
  type AgentPromptRegistryItem,
  type AgentRuntimeEvent,
  type AgentRunSample,
  type AgentStatus,
  type AgentWorkflowEdge,
} from "../agent-workforce";
import {
  buildInvestorMatches,
  createInvestorsResource,
  getMockInvestorById,
  investorProfiles,
  normalizeRiskAppetite,
  type InvestorOpportunityMatch,
  type InvestorProfile,
  type RiskAppetite,
} from "../investors";
import {
  auctionOpportunities,
  createKanbanResourceFromOpportunities,
  createOpportunitiesResource,
  formatCurrency,
  getAdminResource,
  getOpportunityById,
  type AuctionOpportunity,
  type ModuleResource,
  type ResourceTone,
} from "../resources";

export { getSupabaseAdminClient } from "@/lib/supabase/admin";
export { executeAgentRuntime, type AgentRuntimeProviderResult } from "@/lib/ai/agent-runtime";
export {
  executeCommunicationDeliveryAdapter,
  getCommunicationProviderHealth,
  type CommunicationProviderHealth,
} from "@/lib/communication/delivery-adapters";
export {
  executeSourceProviderPull,
  type SourceProviderCandidate,
  type SourceProviderPullInput,
  type SourceProviderPullResult,
} from "@/lib/sources/provider-adapters";
export type { OpportunityRow } from "@/lib/admin/mock-data";
export type { CommercialPack } from "../commercial";
export type { AdvisoryContractGate, AdvisoryContractSnapshot } from "../contracts";
export type {
  AgentDirectoryEntry,
  AgentGroup,
  AgentMaintenanceItem,
  AgentOfficeRoom,
  CommunicationOutboxItem,
  AgentPromptRegistryItem,
  AgentRuntimeEvent,
  AgentRunSample,
  AgentStatus,
  AgentWorkflowEdge,
} from "../agent-workforce";
export type { InvestorProfile, InvestorOpportunityMatch, RiskAppetite } from "../investors";
export type { AuctionOpportunity, ModuleResource, ResourceTone } from "../resources";
export { formatCurrency, getAdminResource, createOpportunitiesResource, createKanbanResourceFromOpportunities, getOpportunityById, auctionOpportunities } from "../resources";
export { investorProfiles, buildInvestorMatches, createInvestorsResource, getMockInvestorById, normalizeRiskAppetite } from "../investors";
export { buildCommercialPack } from "../commercial";
export { buildAdvisoryContractGate } from "../contracts";
export {
  agentDirectory,
  agentGroups,
  agentMaintenanceQueue,
  agentOfficeRooms,
  agentPromptRegistry,
  agentRunSamples,
  agentRuntimeEvents,
  agentWorkflowEdges,
  agentWorkflowStages,
  agentWorkforceMetrics,
  communicationOutbox,
  communicationSegments,
} from "../agent-workforce";

type DataSource = "supabase" | "mock";

export type DataResult<T> = {
  data: T;
  source: DataSource;
  reason?: string;
};

export type MutationResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

export type CreateAuctionOpportunityInput = {
  code: string;
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  sourceName: string;
  sourceType: string;
  initialBid: number;
  appraisalValue: number;
  discountPct: number;
  opportunityScore: number;
  riskScore: number;
  complianceScore: number;
  aiStatus: string;
  legalStatus: string;
  stage: string;
  nextAction: string;
  owner: string;
  auctionDate: string;
  occupancy: string;
  summary: string;
};

export type UpdateAuctionOpportunityInput = CreateAuctionOpportunityInput;

export type SourceIntakeInput = CreateAuctionOpportunityInput & {
  sourceUrl?: string;
  externalId?: string;
  collectionMode?: string;
  evidenceNotes?: string;
  rawPayload?: Record<string, unknown>;
};

export type SourceIntakeOutput = {
  code: string;
  sourceId: string;
  opportunityId: string;
  snapshotId: string;
  snapshotCode: string;
  analysisRunCode: string;
};

export type PullSourceProviderOpportunitiesInput = SourceProviderPullInput & {
  ingest?: boolean;
  processAfterIngest?: boolean;
  curationRuntimeMode?: string;
  curationProvider?: string;
  curationModel?: string;
  curationProcessNow?: boolean;
  openHumanReviewAfterIngest?: boolean;
};

export type PullSourceProviderOpportunitiesOutput = {
  providerPull: SourceProviderPullResult;
  candidates: SourceProviderCandidate[];
  ingested: SourceIntakeOutput[];
  failed: { code: string; title: string; error: string }[];
  processed: ProcessSourceSnapshotOutput[];
  processFailed: { code: string; title: string; snapshotCode: string; error: string }[];
  hiddenRisk: EnqueueHiddenRiskOutput[];
  humanReviews: EnqueueHumanReviewOutput[];
  pipelineFailed: { code: string; title: string; snapshotCode: string; stage: string; error: string }[];
  dryRun: boolean;
  ingestRequested: boolean;
};

export type AuctionSourceRecord = {
  id: string;
  name: string;
  sourceType: string;
  url: string;
  status: string;
  qualityScore: number;
  termsStatus: string;
  lastCollectedAt: string;
  notes: string;
};

export type SourceSnapshotRecord = {
  id: string;
  snapshotCode: string;
  externalId: string;
  snapshotType: string;
  sourceUrl: string;
  title: string;
  status: string;
  collectedBy: string;
  collectedAt: string;
  contentHash: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  opportunityId: string;
  opportunityCode: string;
  opportunityTitle: string;
  location: string;
  aiStatus: string;
  legalStatus: string;
  stage: string;
  runCode: string;
  runStatus: string;
  curationStatus: string;
  curatorRunCode: string;
  curatorRunStatus: string;
  hiddenRiskRunCode: string;
  hiddenRiskStatus: string;
  humanHandoffRunCode: string;
  humanHandoffStatus: string;
  legalReviewCode: string;
  legalReviewStatus: string;
  legalReviewDecision: string;
  complianceRunCode: string;
  complianceRunStatus: string;
  complianceReviewStatus: string;
  communicationStatus: string;
  communicationOutboxCount: number;
  communicationDispatchedAt: string;
  payloadPreview: string;
};

export type AuctionRoomRecord = {
  id: string;
  kind: "strategy" | "session" | "post";
  label: string;
  opportunityId: string;
  opportunityCode: string;
  opportunityTitle: string;
  status: string;
  amountLabel: string;
  owner: string;
  nextAction: string;
  updatedAt: string;
};

export type SourceSnapshotFilters = {
  sourceId?: string;
  status?: string;
  limit?: number;
};

export type ProcessSourceSnapshotInput = {
  snapshotId?: string;
  snapshotCode?: string;
  runtimeMode?: string;
  provider?: string;
  model?: string;
  operatorLabel?: string;
  processNow?: boolean;
};

export type ProcessSourceSnapshotOutput = {
  snapshotCode: string;
  opportunityCode: string;
  agentRunCode: string;
  analysisRunCode: string;
  snapshotStatus: string;
  agentRunStatus: string;
  nextAction: string;
};

export type EnqueueHiddenRiskInput = {
  snapshotId?: string;
  snapshotCode?: string;
  curatorRunCode?: string;
  runtimeMode?: string;
  provider?: string;
  model?: string;
  operatorLabel?: string;
  processNow?: boolean;
};

export type EnqueueHiddenRiskOutput = {
  snapshotCode: string;
  opportunityCode: string;
  curatorRunCode: string;
  hiddenRiskRunCode: string;
  hiddenRiskStatus: string;
  nextAction: string;
};

export type EnqueueHumanReviewInput = {
  snapshotId?: string;
  snapshotCode?: string;
  hiddenRiskRunCode?: string;
  runtimeMode?: string;
  provider?: string;
  model?: string;
  operatorLabel?: string;
  reviewerLabel?: string;
  processNow?: boolean;
};

export type EnqueueHumanReviewOutput = {
  snapshotCode: string;
  opportunityCode: string;
  hiddenRiskRunCode: string;
  humanHandoffRunCode: string;
  humanHandoffStatus: string;
  legalReviewCode: string;
  alertCode: string;
  nextAction: string;
};

export type ResolveHumanReviewInput = {
  snapshotId?: string;
  snapshotCode?: string;
  humanHandoffRunCode?: string;
  decision: string;
  reviewerLabel?: string;
  notes?: string;
};

export type ResolveHumanReviewOutput = {
  snapshotCode: string;
  opportunityCode: string;
  humanHandoffRunCode: string;
  decision: string;
  legalReviewCode: string;
  alertCode: string;
  complianceRunCode?: string;
  stoppedReason: string;
};

export type ProcessComplianceFromSnapshotInput = {
  snapshotId?: string;
  snapshotCode?: string;
  complianceRunCode?: string;
  runtimeMode?: string;
  provider?: string;
  model?: string;
  operatorLabel?: string;
};

export type ProcessComplianceFromSnapshotOutput = {
  snapshotCode: string;
  opportunityCode: string;
  complianceRunCode: string;
  complianceRunStatus: string;
  complianceReviewStatus: string;
  nextAction: string;
};

export type ReleaseCommunicationFromSnapshotInput = {
  snapshotId?: string;
  snapshotCode?: string;
  complianceRunCode?: string;
  audienceScope?: string;
  channels?: string[];
  messageIntent?: string;
  operatorLabel?: string;
  reviewerLabel?: string;
  notes?: string;
};

export type ReleaseCommunicationFromSnapshotOutput = {
  snapshotCode: string;
  opportunityCode: string;
  complianceRunCode: string;
  communicationStatus: string;
  outboxCount: number;
  createdRuns: DispatchCommunicationOutput["createdRuns"];
  stoppedReason: string;
};

export type CreateInvestorProfileInput = {
  name: string;
  email: string;
  phone: string;
  organization: string;
  cityFocus: string[];
  maxBudget: number;
  targetRoiPct: number;
  riskAppetite: RiskAppetite;
  preferredPropertyTypes: string[];
  status: string;
  planKey: string;
  lifecycleStage: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  pushOptIn: boolean;
  communityOptIn: boolean;
  communicationFrequency: string;
  fullAccessUntil: string;
  notes: string;
  owner: string;
};

export type AgentOfficeData = {
  metrics: Array<{ label: string; value: string; detail: string; tone: ResourceTone }>;
  officeRooms: AgentOfficeRoom[];
  directory: AgentDirectoryEntry[];
  promptRegistry: AgentPromptRegistryItem[];
  maintenanceQueue: AgentMaintenanceItem[];
  stages: typeof agentWorkflowStages;
  workflowEdges: AgentWorkflowEdge[];
  groups: AgentGroup[];
  communicationSegments: typeof communicationSegments;
  communicationOutbox: CommunicationOutboxItem[];
  providerHealth: CommunicationProviderHealth[];
  willianInstance?: WillianInstanceState;
  willianAgentConfig?: WillianAgentConfig;
  recentRuns: AgentRunSample[];
  runtimeEvents: AgentRuntimeEvent[];
};

export type CreateAgentInput = {
  groupKey: string;
  agentKey: string;
  name: string;
  role: string;
  status: AgentStatus;
  promptName: string;
  promptVersion: string;
  systemPrompt: string;
  triggerType: string;
  inputs: string[];
  outputs: string[];
  guardrails: string[];
};

export type CreateAgentPromptInput = {
  promptKey: string;
  agentKey: string;
  departmentKey: string;
  promptName: string;
  promptVersion: string;
  purpose: string;
  systemPrompt: string;
  inputContract: string[];
  outputContract: string[];
  guardrails: string[];
  status: AgentStatus;
  ownerLabel: string;
  changeNotes: string;
};

export type CreateAgentMaintenanceTaskInput = {
  taskCode: string;
  roomKey: string;
  agentKey: string;
  area: string;
  severity: string;
  status: string;
  checkDescription: string;
  nextAction: string;
  ownerLabel: string;
  dueAt: string;
};

export type CreateAgentRunInput = {
  agentKey: string;
  opportunityCode: string;
  investorId: string;
  runCode: string;
  status: string;
  triggerSource: string;
  inputSummary: string;
  outputSummary: string;
  humanReviewStatus: string;
  handoffTo: string;
  errorMessage: string;
  costEstimate: number;
  startedAt: string;
  completedAt: string;
};

export type UpdateAgentRunStatusInput = {
  runCode: string;
  status: string;
  outputSummary: string;
  humanReviewStatus: string;
  handoffTo: string;
  errorMessage: string;
  costEstimate: number;
  completedAt: string;
};

export type UpdateAgentProfileInput = {
  status?: AgentStatus;
  description?: string;
  avatarIcon?: string;
  systemPrompt?: string;
  runtimeMode?: string;
  preferredProvider?: string;
  preferredModel?: string;
  maxCostPerRun?: number;
  dailyRunLimit?: number;
};

export type AgentProfileData = {
  key: string;
  name: string;
  role: string;
  description: string;
  avatarIcon: string;
  status: AgentStatus;
  tone: ResourceTone;
  group: { key: string; name: string; eyebrow: string };
  department: string;
  promptName: string;
  promptVersion: string;
  systemPrompt: string;
  triggerType: string;
  inputs: string[];
  outputs: string[];
  guardrails: string[];
  runtimeMode: string;
  preferredProvider: string;
  preferredModel: string;
  maxCostPerRun: number;
  dailyRunLimit: number;
  runsToday: number;
  lastRunAt: string;
  lastRunStatus: string;
  reportsTo: string;
  recentRuns: AgentRunSample[];
  runtimeEvents: AgentRuntimeEvent[];
  prompts: AgentPromptRegistryItem[];
};

export type EnqueueAgentHandoffInput = {
  currentRunCode: string;
  targetAgentKey: string;
  transitionKey: string;
  inputSummary: string;
};

export type ProcessAgentRunInput = {
  runCode: string;
  runtimeMode: string;
  operatorLabel: string;
  provider: string;
  model: string;
};

export type ProcessAgentRunOutput = {
  runCode: string;
  agentKey: string;
  status: string;
  summary: string;
  nextAction: string;
  handoffTo: string;
  costEstimate: number;
  humanReviewStatus: string;
  runtimeMode: string;
  provider: string;
  model: string;
  providerStatus: string;
  attempt: number;
  durationMs: number;
};

export type RunAgentPipelineInput = {
  startRunCode: string;
  opportunityCode: string;
  inputSummary: string;
  runtimeMode: string;
  provider: string;
  model: string;
  operatorLabel: string;
  maxSteps: number;
};

export type RunAgentPipelineOutput = {
  startRunCode: string;
  finalRunCode: string;
  processedRuns: ProcessAgentRunOutput[];
  createdRuns: string[];
  stoppedReason: string;
};

export type ResolveHumanGateInput = {
  runCode: string;
  decision: string;
  reviewerLabel: string;
  notes: string;
  transitionKey: string;
  targetAgentKey: string;
};

export type ResolveHumanGateOutput = {
  runCode: string;
  decision: string;
  humanReviewStatus: string;
  stoppedReason: string;
  nextRunCode?: string;
  targetAgentKey?: string;
};

export type DispatchCommunicationInput = {
  sourceRunCode: string;
  opportunityCode: string;
  investorId: string;
  audienceScope: string;
  channels: string[];
  messageIntent: string;
  operatorLabel: string;
};

export type DispatchCommunicationOutput = {
  sourceRunCode: string;
  createdRuns: Array<{
    runCode: string;
    agentKey: string;
    audience: string;
    detailLevel: string;
    channels: string[];
    recipientCount?: number;
  }>;
  outboxCount: number;
  outboxWarnings: string[];
  stoppedReason: string;
};

export type ProcessCommunicationOutboxInput = {
  messageCode: string;
  processNext?: boolean;
  adapterMode: string;
  provider: string;
  operatorLabel: string;
  allowExternal?: boolean;
  providerReleaseConfirmed?: boolean;
  forceFail?: boolean;
  maxAttempts?: number;
};

export type ProcessCommunicationOutboxOutput = {
  messageCode: string;
  runCode: string;
  agentKey: string;
  channel: string;
  audience: string;
  status: string;
  providerStatus: string;
  attempt: number;
  latencyMs: number;
  adapterLabel: string;
  externalDeliveryId?: string;
  sentAt?: string;
  errorMessage?: string;
};

export type ProcessCommunicationOutboxBatchInput = {
  processBatch?: boolean;
  batchSize: number;
  adapterMode: string;
  provider: string;
  operatorLabel: string;
  allowExternal?: boolean;
  providerReleaseConfirmed?: boolean;
  forceFail?: boolean;
  maxAttempts?: number;
};

export type ProcessCommunicationOutboxBatchOutput = {
  requested: number;
  processed: ProcessCommunicationOutboxOutput[];
  failed: Array<{ messageCode: string; error: string }>;
  pendingAfter: number;
  stoppedReason: string;
};

export type CommunicationSchedulerInput = {
  dryRun?: boolean;
  batchSize?: number;
  adapterMode?: string;
  provider?: string;
  operatorLabel?: string;
  allowExternal?: boolean;
  providerReleaseConfirmed?: boolean;
  forceFail?: boolean;
  maxAttempts?: number;
  triggerSource?: string;
};

export type CommunicationSchedulerOutput = {
  dryRun: boolean;
  triggerSource: string;
  requested: number;
  eligibleCount: number;
  pendingBefore: number;
  pendingAfter: number;
  adapterMode: string;
  provider: string;
  allowExternal: boolean;
  providerReleaseConfirmed: boolean;
  eligible: CommunicationOutboxItem[];
  skippedReason?: string;
  batch?: ProcessCommunicationOutboxBatchOutput;
};

export type CommunicationAuditFilters = {
  channel?: string;
  status?: string;
  eventType?: string;
  limit?: number;
};

export type CommunicationAuditData = {
  filters: Required<CommunicationAuditFilters>;
  events: AgentRuntimeEvent[];
  stats: {
    total: number;
    cycles: number;
    sent: number;
    retry: number;
    failed: number;
    avgLatencyMs: number;
  };
};

export type InvestorCommunicationEvent = {
  id: string;
  investorId: string;
  messageCode: string;
  runCode: string;
  agentKey: string;
  opportunityCode: string;
  audience: string;
  channel: string;
  detailLevel: string;
  eventType: string;
  status: string;
  recipientLabel: string;
  provider: string;
  providerStatus: string;
  adapterLabel: string;
  attempt: number;
  scheduledFor: string;
  processedAt: string;
  createdAt: string;
  tone: ResourceTone;
};

export type OpportunityDbRow = Record<string, unknown>;
export type InvestorDbRow = Record<string, unknown>;
export type AdvisoryContractDbRow = Record<string, unknown>;
export type AgentDbRow = Record<string, unknown>;
export type AgentOfficeRoomDbRow = Record<string, unknown>;
export type AgentPromptRegistryDbRow = Record<string, unknown>;
export type AgentMaintenanceTaskDbRow = Record<string, unknown>;
export type AgentRunDbRow = Record<string, unknown>;
export type AgentRuntimeEventDbRow = Record<string, unknown>;
export type AgentWorkflowEdgeDbRow = Record<string, unknown>;
export type CommunicationOutboxDbRow = Record<string, unknown>;
export type InvestorCommunicationEventDbRow = Record<string, unknown>;
export type AuctionSourceDbRow = Record<string, unknown>;
export type SourceSnapshotDbRow = Record<string, unknown>;
export type AiAnalysisRunDbRow = Record<string, unknown>;

export type AdvisoryContractForeignKeys = {
  investorUuid: string;
  opportunityUuid: string;
};

export type AdvisoryContractMutationInput = {
  investorId: string;
  opportunityId: string;
  reviewedBy: string;
  notes: string;
};

export const mockReason = "Supabase nao configurado, tabela ausente ou sem registros.";
export const adminDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "sim", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "nao", "off"].includes(normalized)) return false;
  }

  return fallback;
}

export function asArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

export function asStringList(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    const items = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0
    );
    return items.length ? items : fallback;
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return fallback;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function formatAdminDateTime(value: string, fallback = "Sem coleta") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return adminDateTimeFormatter.format(date);
}

export function shortCode(value: string, fallback = "N/A") {
  if (!value) return fallback;
  return value.length > 12 ? value.slice(0, 8).toUpperCase() : value.toUpperCase();
}

export function makePayloadPreview(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  if (!serialized || serialized === "{}") return "Sem payload";
  return serialized.length > 150 ? `${serialized.slice(0, 147)}...` : serialized;
}

export function clampAdminText(value: string, maxLength = 2400) {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 3)}...`;
}

export function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function normalizeTone(value: unknown): ResourceTone {
  const text = asString(value, "muted");
  if (["cyan", "green", "yellow", "red", "purple", "muted"].includes(text)) {
    return text as ResourceTone;
  }
  return "muted";
}

export function normalizeAgentStatus(value: unknown): AgentStatus {
  const text = asString(value, "planned").toLowerCase();
  if (["active", "supervised", "paused", "planned"].includes(text)) {
    return text as AgentStatus;
  }
  return "planned";
}

export function toneForAgentStatus(status: AgentStatus): ResourceTone {
  if (status === "active") return "green";
  if (status === "supervised") return "cyan";
  if (status === "paused") return "yellow";
  return "purple";
}

export function toneForRunStatus(status: string): ResourceTone {
  const text = status.toLowerCase();
  if (["completed", "concluido", "done", "success", "sent", "delivered", "enviado"].some((item) => text.includes(item))) {
    return "green";
  }
  if (["failed", "erro", "error", "blocked", "bloqueado"].some((item) => text.includes(item))) return "red";
  if (["running", "processando", "processing"].some((item) => text.includes(item))) return "cyan";
  if (["waiting", "human", "review", "juridico", "aguardando", "retry"].some((item) => text.includes(item))) {
    return "yellow";
  }
  return "purple";
}

export function makeAgentOfficeMetrics(data: Pick<AgentOfficeData, "officeRooms" | "directory" | "promptRegistry" | "maintenanceQueue">) {
  return [
    { label: "Setores", value: String(data.officeRooms.length), detail: "empresa virtual", tone: "cyan" as ResourceTone },
    { label: "Agentes", value: String(data.directory.length), detail: "prompts especializados", tone: "purple" as ResourceTone },
    { label: "Prompts", value: String(data.promptRegistry.length), detail: "registro operacional", tone: "yellow" as ResourceTone },
    { label: "Manutencao", value: String(data.maintenanceQueue.length), detail: "checks criticos", tone: "green" as ResourceTone },
  ];
}

export function staticAgentOfficeData(): AgentOfficeData {
  return {
    metrics: agentWorkforceMetrics,
    officeRooms: agentOfficeRooms,
    directory: agentDirectory,
    promptRegistry: agentPromptRegistry,
    maintenanceQueue: agentMaintenanceQueue,
    stages: agentWorkflowStages,
    workflowEdges: agentWorkflowEdges,
    groups: agentGroups,
    communicationSegments,
    communicationOutbox,
    providerHealth: getCommunicationProviderHealth(),
    willianAgentConfig: DEFAULT_WILLIAN_AGENT_CONFIG,
    recentRuns: agentRunSamples,
    runtimeEvents: agentRuntimeEvents,
  };
}

export function mergeByKey<T extends { key: string }>(baseItems: T[], overrideItems: T[]) {
  const overrides = new Map(overrideItems.map((item) => [item.key, item]));
  const seen = new Set<string>();
  const merged = baseItems.map((item) => {
    seen.add(item.key);
    return overrides.get(item.key) || item;
  });
  const additions = overrideItems.filter((item) => !seen.has(item.key));
  return [...merged, ...additions];
}

export function findStaticAgent(agentKey: string) {
  for (const group of agentGroups) {
    const agent = group.agents.find((item) => item.key === agentKey);
    if (agent) return { agent, group };
  }
  return null;
}

export function findStaticWorkflowEdge(edgeKey: string, fromAgentKey = "", toAgentKey = "") {
  return agentWorkflowEdges.find(
    (edge) =>
      (edgeKey && edge.key === edgeKey) ||
      (!!fromAgentKey && !!toAgentKey && edge.fromAgentKey === fromAgentKey && edge.toAgentKey === toAgentKey)
  );
}

export function normalizeOfficeRoom(row: AgentOfficeRoomDbRow): AgentOfficeRoom {
  const key = asString(row.room_key, asString(row.key));
  const fallback = agentOfficeRooms.find((room) => room.key === key);

  return {
    key,
    name: asString(row.name, fallback?.name || "Sala de agentes"),
    sector: asString(row.sector, fallback?.sector || "Operacao IA"),
    purpose: asString(row.purpose, fallback?.purpose || "Setor operacional de agentes."),
    lead: asString(row.lead_label, fallback?.lead || "Admin Betel"),
    operatingMode: asString(row.operating_mode, fallback?.operatingMode || "Supervisionado"),
    status: asString(row.status, fallback?.status || "Planejado"),
    tone: normalizeTone(row.tone || fallback?.tone || "muted"),
    agents: asStringList(row.agent_keys, fallback?.agents || []),
    systems: asStringList(row.systems, fallback?.systems || []),
    rituals: asStringList(row.rituals, fallback?.rituals || []),
    maintenanceFocus: asString(row.maintenance_focus, fallback?.maintenanceFocus || "Manter agentes auditaveis."),
  };
}

export function normalizeAgentDirectoryEntry(row: AgentDbRow): AgentDirectoryEntry {
  const key = asString(row.agent_key, asString(row.key));
  const staticMatch = findStaticAgent(key);
  const groupRow = (row.agent_groups || row.group) as Record<string, unknown> | null;
  const groupKey = asString(groupRow?.group_key, staticMatch?.group.key || "");
  const status = normalizeAgentStatus(row.status || staticMatch?.agent.status);
  const tone = toneForAgentStatus(status);
  const department = agentOfficeRooms.find((room) => room.agents.includes(asString(row.name)))?.name;

  return {
    key,
    name: asString(row.name, staticMatch?.agent.name || "Agente IA"),
    department:
      department ||
      (groupKey === "captacao"
        ? "Sala de Captacao"
        : groupKey === "curadoria"
          ? "Sala de Curadoria"
          : groupKey === "revisao"
            ? "Sala Juridica e Compliance"
            : groupKey === "comunicacao"
              ? "Sala de Comunicacao e Growth"
              : groupKey === "execucao"
                ? "Sala de Arremate e Pos-Arremate"
                : "Escritorio IA"),
    group: asString(groupRow?.name, staticMatch?.group.name || "Grupo operacional"),
    jobTitle: asString(row.role, staticMatch?.agent.role || "Agente especializado").split(".")[0],
    functionSummary: asString(row.role, staticMatch?.agent.role || "Agente especializado da operacao Betel."),
    promptName: asString(row.prompt_name, staticMatch?.agent.promptName || "agent_prompt"),
    promptVersion: asString(row.prompt_version, staticMatch?.agent.promptVersion || "v0.1"),
    status,
    tone,
    reportsTo: asString(row.owner_label, "Admin Betel"),
    currentDesk: asString(groupRow?.group_key, staticMatch?.group.eyebrow || groupKey || "operacao"),
    currentShift:
      status === "active"
        ? "Plantao ativo"
        : status === "supervised"
          ? "Copilot supervisionado"
          : status === "paused"
            ? "Pausado para ajuste"
            : "Contratacao planejada",
    avatarIcon: asString(row.avatar_icon, ""),
  };
}

export function normalizePromptRegistry(row: AgentPromptRegistryDbRow): AgentPromptRegistryItem {
  const status = normalizeAgentStatus(row.status);
  const agentKey = asString(row.agent_key);
  const staticMatch = findStaticAgent(agentKey);
  const promptName = asString(row.prompt_name, staticMatch?.agent.promptName || "agent_prompt");
  const promptVersion = asString(row.prompt_version, staticMatch?.agent.promptVersion || "v0.1");

  return {
    key: asString(row.prompt_key, `${promptName}-${promptVersion}`),
    promptName,
    promptVersion,
    agent: staticMatch?.agent.name || agentKey || "Agente IA",
    department: asString(row.department_key, staticMatch?.group.name || "Escritorio IA"),
    objective: asString(row.purpose, staticMatch?.agent.role || "Prompt operacional versionado."),
    updatePolicy:
      status === "active"
        ? "Mudanca exige QA, log e aprovacao de compliance."
        : "Pode evoluir em ambiente supervisionado antes de publicar.",
    owner: asString(row.owner_label, "Produto IA"),
    status,
    tone: toneForAgentStatus(status),
  };
}

export function normalizeMaintenanceTask(row: AgentMaintenanceTaskDbRow): AgentMaintenanceItem {
  const severity = asString(row.severity, "Media");
  const tone =
    severity.toLowerCase().includes("crit") || severity.toLowerCase().includes("alta")
      ? "red"
      : severity.toLowerCase().includes("media")
        ? "yellow"
        : "cyan";

  return {
    code: asString(row.task_code, "TASK"),
    area: asString(row.area, "Manutencao"),
    owner: asString(row.owner_label, "Produto IA"),
    severity,
    status: asString(row.status, "Aberto"),
    check: asString(row.check_description, "Revisar item operacional."),
    nextAction: asString(row.next_action, "Definir proxima acao."),
    tone,
  };
}

export function normalizeWorkflowEdge(
  row: AgentWorkflowEdgeDbRow,
  agentRowsById: Map<string, AgentDbRow>
): AgentWorkflowEdge {
  const edgeKey = asString(row.edge_key, asString(row.key));
  const fromAgentRow = agentRowsById.get(asString(row.from_agent_id)) || {};
  const toAgentRow = agentRowsById.get(asString(row.to_agent_id)) || {};
  const fromAgentKey = asString(fromAgentRow.agent_key);
  const toAgentKey = asString(toAgentRow.agent_key);
  const fallback = findStaticWorkflowEdge(edgeKey, fromAgentKey, toAgentKey);
  const requiresHumanApproval =
    typeof row.requires_human_approval === "boolean"
      ? row.requires_human_approval
      : fallback?.requiresHumanApproval || false;

  return {
    key: edgeKey,
    fromAgentKey: fromAgentKey || fallback?.fromAgentKey || "",
    fromAgent: asString(fromAgentRow.name, fallback?.fromAgent || "Agente origem"),
    toAgentKey: toAgentKey || fallback?.toAgentKey || "",
    toAgent: asString(toAgentRow.name, fallback?.toAgent || "Agente destino"),
    condition: asString(row.condition_label, fallback?.condition || "Transicao operacional configurada."),
    trigger: fallback?.trigger || "Enfileirar proximo agente com base na saida do run anterior.",
    output: fallback?.output || "Novo run na fila de execucao.",
    requiresHumanApproval,
    tone: fallback?.tone || (requiresHumanApproval ? "yellow" : "cyan"),
  };
}

export function normalizeAgentRun(row: AgentRunDbRow): AgentRunSample {
  const agentRow = asRecord(Array.isArray(row.ai_agents) ? row.ai_agents[0] : row.ai_agents);
  const opportunityRow = asRecord(
    Array.isArray(row.auction_opportunities) ? row.auction_opportunities[0] : row.auction_opportunities
  );
  const inputPayload = asRecord(row.input_payload);
  const outputPayload = asRecord(row.output_payload);
  const status = asString(row.status, "queued");
  const opportunityCode = asString(
    inputPayload.opportunityCode,
    asString(opportunityRow.code, asString(row.opportunity_id, "Sem oportunidade"))
  );
  const outputSummary = asString(outputPayload.summary);
  const errorMessage = asString(row.error_message);

  return {
    id: asString(row.run_code, asString(row.id, "RUN")),
    agentKey: asString(agentRow.agent_key),
    agent: asString(agentRow.name, "Agente IA"),
    opportunity: opportunityCode,
    status,
    triggerSource: asString(row.trigger_source, "manual"),
    inputSummary: asString(inputPayload.summary),
    outputSummary,
    humanReviewStatus: asString(row.human_review_status, "pendente"),
    handoff: asString(row.handoff_to, "Sem handoff"),
    nextAction: asString(
      outputPayload.nextAction,
      errorMessage || outputSummary || "Acompanhar processamento e registrar proxima acao."
    ),
    errorMessage,
    costEstimate: row.cost_estimate == null ? undefined : asNumber(row.cost_estimate, 0),
    attemptCount: asNumber(row.attempt_count),
    maxAttempts: asNumber(row.max_attempts, 3),
    provider: asString(row.provider),
    model: asString(row.model),
    durationMs: asNumber(outputPayload.durationMs),
    startedAt: asString(row.started_at),
    completedAt: asString(row.completed_at),
    tone: toneForRunStatus(status),
  };
}

export function normalizeRuntimeEvent(row: AgentRuntimeEventDbRow): AgentRuntimeEvent {
  const status = asString(row.status, "registered");
  const eventType = asString(row.event_type, "runtime_event");

  return {
    id: asString(row.id, `${asString(row.run_code, "RUN")}-${eventType}`),
    runCode: asString(row.run_code, "RUN"),
    agentKey: asString(row.agent_key, "agent"),
    eventType,
    status,
    provider: asString(row.provider, "mock"),
    model: asString(row.model, "betel-deterministic-v0"),
    attempt: asNumber(row.attempt, 1),
    durationMs: row.duration_ms == null ? undefined : asNumber(row.duration_ms),
    costEstimate: row.cost_estimate == null ? undefined : asNumber(row.cost_estimate),
    message: asString(row.message, "Evento registrado no runtime."),
    payload: asRecord(row.payload),
    createdAt: asString(row.created_at),
    tone: toneForRunStatus(status),
  };
}

export function normalizeCommunicationAuditFilter(value: string | undefined, fallback = "all") {
  return asString(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function communicationAuditEventChannel(event: AgentRuntimeEvent) {
  const payload = event.payload || {};
  const channel = asString(payload.channel, asString(payload.channelKey));
  const eventType = event.eventType.toLowerCase();

  if (channel) {
    const normalized = normalizeCommunicationAuditFilter(channel);
    if (normalized.includes("whatsapp") || normalized.includes("wpp")) return "whatsapp";
    if (normalized.includes("email") || normalized.includes("mail")) return "email";
    if (normalized.includes("push")) return "push";
    if (normalized.includes("comunidade") || normalized.includes("community") || normalized.includes("grupo")) {
      return "community";
    }
    return normalized;
  }

  if (eventType.includes("worker")) return "worker";
  if (eventType.includes("dispatch")) return "dispatch";
  return "generic";
}

export function communicationAuditEventBucket(event: AgentRuntimeEvent) {
  const text = `${event.eventType} ${event.status}`.toLowerCase();
  if (text.includes("worker_cycle")) return "cycle";
  if (text.includes("delivery_sent") || text.includes("sent")) return "sent";
  if (text.includes("retry")) return "retry";
  if (text.includes("failed") || text.includes("error")) return "failed";
  if (text.includes("dispatch")) return "dispatch";
  return "other";
}

export function communicationAuditEventTypeBucket(event: AgentRuntimeEvent) {
  const text = event.eventType.toLowerCase();
  if (text.includes("worker")) return "worker";
  if (text.includes("delivery")) return "delivery";
  if (text.includes("dispatch")) return "dispatch";
  return "other";
}

export function filterCommunicationAuditEvents(events: AgentRuntimeEvent[], filters: Required<CommunicationAuditFilters>) {
  return events
    .filter((event) => event.eventType.startsWith("communication_"))
    .filter((event) => filters.channel === "all" || communicationAuditEventChannel(event) === filters.channel)
    .filter((event) => filters.status === "all" || communicationAuditEventBucket(event) === filters.status)
    .filter((event) => filters.eventType === "all" || communicationAuditEventTypeBucket(event) === filters.eventType)
    .slice(0, filters.limit);
}

export function makeCommunicationAuditStats(events: AgentRuntimeEvent[]): CommunicationAuditData["stats"] {
  const stats = events.reduce(
    (current, event) => {
      const bucket = communicationAuditEventBucket(event);
      current.total += 1;
      if (bucket === "cycle") current.cycles += 1;
      if (bucket === "sent") current.sent += 1;
      if (bucket === "retry") current.retry += 1;
      if (bucket === "failed") current.failed += 1;
      current.latency += event.durationMs || asNumber(event.payload?.latencyMs);
      return current;
    },
    { total: 0, cycles: 0, sent: 0, retry: 0, failed: 0, latency: 0 }
  );

  return {
    total: stats.total,
    cycles: stats.cycles,
    sent: stats.sent,
    retry: stats.retry,
    failed: stats.failed,
    avgLatencyMs: stats.total ? Math.round(stats.latency / stats.total) : 0,
  };
}

export function normalizeCommunicationOutbox(row: CommunicationOutboxDbRow): CommunicationOutboxItem {
  const status = asString(row.status, "draft");
  const agentKey = asString(row.agent_key);
  const staticMatch = findStaticAgent(agentKey);
  const opportunityRow = asRecord(
    Array.isArray(row.auction_opportunities) ? row.auction_opportunities[0] : row.auction_opportunities
  );
  const payload = asRecord(row.payload);
  const lastDelivery = asRecord(payload.lastDelivery);
  const recipient = asRecord(payload.recipient);
  const cadence = asRecord(payload.cadence);
  const scheduledFor = asString(row.scheduled_for);
  const scheduledForMs = scheduledFor ? Date.parse(scheduledFor) : NaN;

  return {
    id: asString(row.id, asString(row.message_code, "OUT")),
    messageCode: asString(row.message_code, asString(row.id, "OUT")),
    runCode: asString(row.run_code),
    agentKey,
    agent: staticMatch?.agent.name || agentKey || "Agente de comunicacao",
    audience: asString(row.audience_label, asString(row.audience_key, "Publico")),
    channel: asString(row.channel, "Canal"),
    detailLevel: asString(row.detail_level, "seguro"),
    status,
    opportunity: asString(row.opportunity_code, asString(opportunityRow.code, "Sem oportunidade")),
    recipientLabel: asString(row.recipient_label, asString(payload.recipientLabel, "Segmento")),
    recipientPlan: asString(recipient.planKey),
    recipientLifecycle: asString(recipient.lifecycleStage),
    recipientMatchScore: asNumber(recipient.matchScore),
    fullAccess: asBoolean(recipient.fullAccess),
    cadenceLabel: asString(cadence.label, asString(payload.cadenceLabel)),
    preview: asString(row.message_preview, "Mensagem aguardando composicao."),
    guardrail: asString(row.guardrail_summary, "Aplicar plano, opt-in e revisao humana antes de envio."),
    createdAt: asString(row.created_at),
    scheduledFor,
    isDue: !Number.isFinite(scheduledForMs) || scheduledForMs <= Date.now(),
    sentAt: asString(row.sent_at),
    errorMessage: asString(row.error_message),
    deliveryAttempt: asNumber(payload.deliveryAttempt),
    nextRetryAt: asString(payload.nextRetryAt),
    adapterLabel: asString(lastDelivery.adapterLabel),
    providerStatus: asString(lastDelivery.providerStatus),
    tone: toneForRunStatus(status),
  };
}

export function normalizeInvestorCommunicationEvent(row: InvestorCommunicationEventDbRow): InvestorCommunicationEvent {
  const eventType = asString(row.event_type, "communication_event");
  const status = asString(row.status, "registered");

  return {
    id: asString(row.id, `${asString(row.message_code, "OUT")}-${eventType}`),
    investorId: asString(row.investor_id),
    messageCode: asString(row.message_code),
    runCode: asString(row.run_code),
    agentKey: asString(row.agent_key),
    opportunityCode: asString(row.opportunity_code),
    audience: asString(row.audience_label, asString(row.audience_key)),
    channel: asString(row.channel, "Canal"),
    detailLevel: asString(row.detail_level),
    eventType,
    status,
    recipientLabel: asString(row.recipient_label),
    provider: asString(row.provider),
    providerStatus: asString(row.provider_status),
    adapterLabel: asString(row.adapter_label),
    attempt: asNumber(row.attempt),
    scheduledFor: asString(row.scheduled_for),
    processedAt: asString(row.processed_at),
    createdAt: asString(row.created_at),
    tone: toneForRunStatus(status),
  };
}

export function normalizeRiskFlags(
  value: unknown,
  fallback: AuctionOpportunity["riskFlags"]
): AuctionOpportunity["riskFlags"] {
  const flags = asArray<Record<string, unknown>>(value, []).map((item) => ({
    label: asString(item.label, "Risco"),
    severity: normalizeTone(item.severity),
    detail: asString(item.detail),
  }));

  return flags.some((item) => item.label || item.detail) ? flags : fallback;
}

export function normalizeOpportunity(row: OpportunityDbRow): AuctionOpportunity {
  const code = asString(row.code, asString(row.id, "OPP"));
  const fallback = getOpportunityById(code) || auctionOpportunities[0];

  return {
    id: code,
    title: asString(row.title, fallback.title),
    propertyType: asString(row.property_type, fallback.propertyType),
    address: asString(row.address, fallback.address),
    city: asString(row.city, fallback.city),
    state: asString(row.state, fallback.state),
    sourceName: asString(row.source_name, fallback.sourceName),
    sourceType: asString(row.source_type, fallback.sourceType),
    initialBid: asNumber(row.initial_bid, fallback.initialBid),
    appraisalValue: asNumber(row.appraisal_value, fallback.appraisalValue),
    discountPct: asNumber(row.discount_pct, fallback.discountPct),
    opportunityScore: asNumber(row.opportunity_score, fallback.opportunityScore),
    riskScore: asNumber(row.risk_score, fallback.riskScore),
    complianceScore: asNumber(row.compliance_score, fallback.complianceScore),
    aiStatus: asString(row.ai_status, fallback.aiStatus),
    legalStatus: asString(row.legal_status, fallback.legalStatus),
    stage: asString(row.stage, fallback.stage),
    nextAction: asString(row.next_action, fallback.nextAction),
    owner: asString(row.owner_name, fallback.owner),
    auctionDate: asString(row.auction_date, fallback.auctionDate),
    occupancy: asString(row.occupancy, fallback.occupancy),
    summary: asString(row.summary, fallback.summary),
    financialSummary: asArray<AuctionOpportunity["financialSummary"][number]>(
      row.financial_summary,
      fallback.financialSummary
    ),
    riskFlags: normalizeRiskFlags(row.risk_flags, fallback.riskFlags),
    checklist: asArray<AuctionOpportunity["checklist"][number]>(row.checklist, fallback.checklist),
    documents: asArray<AuctionOpportunity["documents"][number]>(row.documents, fallback.documents),
    timeline: asArray<AuctionOpportunity["timeline"][number]>(row.timeline, fallback.timeline),
  };
}

export function normalizeInvestor(row: InvestorDbRow): InvestorProfile {
  const id = asString(row.id, "INV");
  const fallback = getMockInvestorById(id) || investorProfiles[0];

  return {
    id,
    name: asString(row.name, fallback.name),
    email: asString(row.email, fallback.email),
    phone: asString(row.phone, fallback.phone),
    organization: asString(row.organization_name, fallback.organization),
    cityFocus: asStringList(row.city_focus, fallback.cityFocus),
    maxBudget: asNumber(row.max_budget, fallback.maxBudget),
    targetRoiPct: asNumber(row.target_roi_pct, fallback.targetRoiPct),
    riskAppetite: normalizeRiskAppetite(asString(row.risk_appetite, fallback.riskAppetite)),
    preferredPropertyTypes: asStringList(row.preferred_property_types, fallback.preferredPropertyTypes),
    status: asString(row.status, fallback.status),
    planKey: asString(row.plan_key, fallback.planKey),
    lifecycleStage: asString(row.lifecycle_stage, fallback.lifecycleStage),
    whatsappOptIn: asBoolean(row.whatsapp_opt_in, fallback.whatsappOptIn),
    emailOptIn: asBoolean(row.email_opt_in, fallback.emailOptIn),
    pushOptIn: asBoolean(row.push_opt_in, fallback.pushOptIn),
    communityOptIn: asBoolean(row.community_opt_in, fallback.communityOptIn),
    communicationFrequency: asString(row.communication_frequency, fallback.communicationFrequency),
    fullAccessUntil: asString(row.full_access_until, fallback.fullAccessUntil),
    notes: asString(row.notes, fallback.notes),
    owner: asString(row.owner_name, fallback.owner),
  };
}

export function normalizeAdvisoryContract(row: AdvisoryContractDbRow): AdvisoryContractSnapshot {
  return {
    id: asString(row.id),
    contractCode: asString(row.contract_code, "Contrato sem codigo"),
    status: asString(row.status, "draft"),
    signerName: asString(row.signer_name),
    signerEmail: asString(row.signer_email),
    maxAuthorizedBid: row.max_authorized_bid == null ? null : asNumber(row.max_authorized_bid, 0),
    authorizedUntil: asString(row.authorized_until),
    signedAt: asString(row.signed_at),
    reviewedBy: asString(row.reviewed_by),
    reviewedAt: asString(row.reviewed_at),
    notes: asString(row.notes),
  };
}

export function makeContractCode(opportunityId: string) {
  const cleanOpportunity = opportunityId
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();
  const suffix = Date.now().toString(36).slice(-6).toUpperCase();

  return `BETEL-AUT-${cleanOpportunity || "OPP"}-${suffix}`;
}

export async function resolveAdvisoryContractForeignKeys(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  investorId: string,
  opportunityId: string
): Promise<MutationResult<AdvisoryContractForeignKeys>> {
  if (!looksLikeUuid(investorId)) {
    return {
      ok: false,
      error: "Investidor precisa ser um registro real do Supabase para emitir contrato.",
    };
  }

  const opportunityQuery = looksLikeUuid(opportunityId)
    ? supabase.from("auction_opportunities").select("id").eq("id", opportunityId).maybeSingle()
    : supabase.from("auction_opportunities").select("id").eq("code", opportunityId).maybeSingle();

  const [{ data: investor, error: investorError }, { data: opportunity, error: opportunityError }] =
    await Promise.all([
      supabase.from("investor_profiles").select("id").eq("id", investorId).maybeSingle(),
      opportunityQuery,
    ]);

  if (investorError) {
    return { ok: false, error: investorError.message };
  }

  if (opportunityError) {
    return { ok: false, error: opportunityError.message };
  }

  const investorUuid = asString((investor as Record<string, unknown> | null)?.id);
  const opportunityUuid = asString((opportunity as Record<string, unknown> | null)?.id);

  if (!investorUuid) {
    return { ok: false, error: "Investidor real nao encontrado no Supabase." };
  }

  if (!opportunityUuid) {
    return { ok: false, error: "Oportunidade real nao encontrada no Supabase." };
  }

  return {
    ok: true,
    data: {
      investorUuid,
      opportunityUuid,
    },
  };
}

export async function getAdvisoryContractSnapshot(
  investorId: string,
  opportunityId: string
): Promise<DataResult<AdvisoryContractSnapshot | null>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      data: null,
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const keys = await resolveAdvisoryContractForeignKeys(supabase, investorId, opportunityId);
  if (!keys.ok || !keys.data) {
    return {
      data: null,
      source: "mock",
      reason: keys.error,
    };
  }

  const { data, error } = await supabase
    .from("advisory_contracts")
    .select("*")
    .eq("investor_id", keys.data.investorUuid)
    .eq("opportunity_id", keys.data.opportunityUuid)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      data: null,
      source: "supabase",
      reason: error.message,
    };
  }

  return {
    data: data ? normalizeAdvisoryContract(data as AdvisoryContractDbRow) : null,
    source: "supabase",
    reason: data ? undefined : "Contrato ainda nao emitido.",
  };
}

export function toDashboardRow(item: AuctionOpportunity): OpportunityRow {
  return {
    id: item.id,
    property: item.title,
    location: `${item.city}/${item.state}`,
    source: item.sourceName,
    initialBid: formatCurrency(item.initialBid),
    discount: `${item.discountPct}%`,
    opportunityScore: item.opportunityScore,
    riskScore: item.riskScore,
    aiStatus: item.aiStatus,
    legalStatus: item.legalStatus,
    nextAction: item.nextAction,
  };
}

export function fallbackOpportunities(reason = mockReason, limit = 50): DataResult<AuctionOpportunity[]> {
  return {
    data: auctionOpportunities.slice(0, limit),
    source: "mock",
    reason,
  };
}

export function fallbackInvestors(reason = mockReason, limit = 50): DataResult<InvestorProfile[]> {
  return {
    data: investorProfiles.slice(0, limit),
    source: "mock",
    reason,
  };
}

export function fallbackAgentOffice(reason = mockReason): DataResult<AgentOfficeData> {
  return {
    data: staticAgentOfficeData(),
    source: "mock",
    reason,
  };
}

export async function ensureAgentGroupRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  groupKey: string
): Promise<MutationResult<{ id: string }>> {
  const fallback = agentGroups.find((group) => group.key === groupKey);
  const { data, error } = await supabase
    .from("agent_groups")
    .upsert(
      {
        group_key: groupKey,
        name: fallback?.name || groupKey,
        purpose: fallback?.purpose || "Grupo operacional de agentes.",
        status: fallback?.status || "planned",
        execution_order: Math.max(agentGroups.findIndex((group) => group.key === groupKey), 0),
        trigger_description: fallback?.trigger || null,
        human_gate: fallback?.humanGate || null,
        api_dependencies: fallback?.apiDependencies || [],
        guardrails: fallback?.agents.flatMap((agent) => agent.guardrails).slice(0, 8) || [],
      },
      { onConflict: "group_key" }
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: asString(data?.id) } };
}

export async function ensureOfficeRoomRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  roomKey: string
): Promise<MutationResult<{ roomKey: string }>> {
  if (!roomKey) return { ok: true, data: { roomKey } };

  const fallback = agentOfficeRooms.find((room) => room.key === roomKey);
  const { error } = await supabase.from("agent_office_rooms").upsert(
    {
      room_key: roomKey,
      name: fallback?.name || roomKey,
      sector: fallback?.sector || "Operacao IA",
      purpose: fallback?.purpose || "Sala operacional de agentes.",
      lead_label: fallback?.lead || "Admin Betel",
      operating_mode: fallback?.operatingMode || "Supervisionado",
      status: fallback?.status || "planned",
      agent_keys: fallback?.agents || [],
      systems: fallback?.systems || [],
      rituals: fallback?.rituals || [],
      maintenance_focus: fallback?.maintenanceFocus || null,
      execution_order: Math.max(agentOfficeRooms.findIndex((room) => room.key === roomKey), 0),
    },
    { onConflict: "room_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { roomKey } };
}

export async function ensureAgentRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  agentKey: string
): Promise<MutationResult<{ id: string }>> {
  if (!agentKey) return { ok: false, error: "Agente nao informado." };

  const { data: existing, error: existingError } = await supabase
    .from("ai_agents")
    .select("id")
    .eq("agent_key", agentKey)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };
  if (existing?.id) return { ok: true, data: { id: asString(existing.id) } };

  const staticMatch = findStaticAgent(agentKey);
  const groupKey = staticMatch?.group.key || "captacao";
  const groupResult = await ensureAgentGroupRecord(supabase, groupKey);

  if (!groupResult.ok || !groupResult.data?.id) {
    return { ok: false, error: groupResult.error || "Nao foi possivel preparar o grupo do agente." };
  }

  const staticAgent = staticMatch?.agent;
  const { data, error } = await supabase
    .from("ai_agents")
    .upsert(
      {
        group_id: groupResult.data.id,
        agent_key: agentKey,
        name: staticAgent?.name || agentKey,
        role: staticAgent?.role || "Agente operacional da empresa virtual.",
        status: staticAgent?.status || "planned",
        prompt_name: staticAgent?.promptName || `${agentKey}_prompt`,
        prompt_version: staticAgent?.promptVersion || "v0.1",
        system_prompt: null,
        trigger_type: staticAgent?.trigger || null,
        input_schema: { fields: staticAgent?.inputs || [] },
        output_schema: { fields: staticAgent?.outputs || [] },
        guardrails: staticAgent?.guardrails || [],
      },
      { onConflict: "agent_key" }
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: asString(data?.id) } };
}

export async function resolveRunOpportunityId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  opportunityCode: string
): Promise<MutationResult<{ id: string | null }>> {
  if (!opportunityCode) return { ok: true, data: { id: null } };

  const query = looksLikeUuid(opportunityCode)
    ? supabase.from("auction_opportunities").select("id").eq("id", opportunityCode).maybeSingle()
    : supabase.from("auction_opportunities").select("id").eq("code", opportunityCode).maybeSingle();
  const { data, error } = await query;

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: asString((data as Record<string, unknown> | null)?.id) || null } };
}

export async function resolveRunInvestorId(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  investorId: string
): Promise<MutationResult<{ id: string | null }>> {
  if (!investorId || !looksLikeUuid(investorId)) return { ok: true, data: { id: null } };

  const { data, error } = await supabase.from("investor_profiles").select("id").eq("id", investorId).maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: asString((data as Record<string, unknown> | null)?.id) || null } };
}

export function statusCompletesRun(status: string) {
  const text = status.toLowerCase();
  return ["completed", "concluido", "done", "failed", "error", "erro", "blocked", "bloqueado"].some((item) =>
    text.includes(item)
  );
}

export function reviewApprovesHandoff(value: unknown) {
  const text = asString(value).toLowerCase();
  return ["aprov", "approved", "liber", "ok"].some((item) => text.includes(item));
}

export function runAgentKey(row: AgentRunDbRow) {
  const agentRow = asRecord(Array.isArray(row.ai_agents) ? row.ai_agents[0] : row.ai_agents);
  return asString(agentRow.agent_key, asString(row.agent_key));
}

export function runBlocksCommunication(row: AgentRunDbRow) {
  const statusText = asString(row.status).toLowerCase();
  const reviewText = asString(row.human_review_status).toLowerCase();
  const outputPayload = asRecord(row.output_payload);
  const humanDecision = asRecord(outputPayload.humanDecision);
  const decision = asString(humanDecision.decision).toLowerCase();

  return (
    statusText.includes("blocked") ||
    statusText.includes("bloque") ||
    statusText.includes("failed") ||
    statusText.includes("erro") ||
    reviewText.includes("bloque") ||
    decision === "blocked"
  );
}

export function communicationReleaseError(row: AgentRunDbRow) {
  const agentKey = runAgentKey(row);
  const status = asString(row.status);
  const reviewStatus = asString(row.human_review_status);
  const statusText = status.toLowerCase();

  if (agentKey !== "compliance-guard") {
    return "Comunicacao externa deve nascer do Agente Guardrail Compliance, apos curadoria, risco oculto e decisao humana.";
  }

  if (runBlocksCommunication(row)) {
    return "Comunicacao bloqueada: compliance ou gate humano marcou esta oportunidade como bloqueada/falha.";
  }

  if (!statusCompletesRun(status) || statusText.includes("waiting") || statusText.includes("pendente")) {
    return "Comunicacao externa exige compliance concluido antes do despacho.";
  }

  if (!reviewApprovesHandoff(reviewStatus)) {
    return "Comunicacao externa exige compliance liberado por revisao humana.";
  }

  return "";
}

export function isCommunicationReleaseRun(row: AgentRunDbRow) {
  return !communicationReleaseError(row);
}

export function findNextStaticWorkflowEdge(agentKey: string) {
  return agentWorkflowEdges.find((edge) => edge.fromAgentKey === agentKey);
}

export function getCommunicationDispatchTargets(scope: string) {
  const targets = [
    {
      key: "paid_clients",
      label: "Clientes pagantes",
      agentKey: "paid-lead-alert",
      detailLevel: "completo",
      rule: "Pode receber dossie e dados completos somente com plano/acesso compativel.",
    },
    {
      key: "cold_leads",
      label: "Leads frios",
      agentKey: "cold-lead-teaser",
      detailLevel: "teaser",
      rule: "Recebe chamada parcial sem endereco completo, tese sensivel ou orientacao de lance.",
    },
    {
      key: "community",
      label: "Comunidade",
      agentKey: "community-broadcaster",
      detailLevel: "educacional",
      rule: "Recebe publicacao resumida, educativa e sem recomendacao individual.",
    },
    {
      key: "multichannel",
      label: "Push e email",
      agentKey: "multichannel-dispatch",
      detailLevel: "preferencia_de_canal",
      rule: "Respeita opt-in, frequencia, plano e logs por canal.",
    },
  ];
  const normalizedScope = normalizeCommunicationToken(scope || "all");

  if (["all", "todos", "both"].includes(normalizedScope)) return targets;
  if (["paid", "paid_clients", "clientes_pagantes"].includes(normalizedScope)) {
    return targets.filter((target) => target.key === "paid_clients");
  }
  if (["cold", "cold_leads", "leads_frios"].includes(normalizedScope)) {
    return targets.filter((target) => target.key === "cold_leads");
  }
  return targets.filter((target) => target.key === normalizedScope);
}

export type CommunicationDispatchTarget = ReturnType<typeof getCommunicationDispatchTargets>[number];

export type CommunicationMatchRow = {
  investor_id?: unknown;
  match_score?: unknown;
  status?: unknown;
  rationale?: unknown;
};

export type CommunicationRecipient = {
  recipientKey: string;
  label: string;
  investorId: string;
  email: string;
  phone: string;
  planKey: string;
  lifecycleStage: string;
  communicationFrequency: string;
  matchScore: number;
  fullAccess: boolean;
  channels: string[];
  detailLevel: string;
  optInSource: string;
  guardrail: string;
};

export function normalizeCommunicationToken(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeCommunicationChannelKey(value: string) {
  const normalized = normalizeCommunicationToken(value);
  if (normalized.includes("whatsapp") || normalized.includes("wpp")) return "whatsapp";
  if (normalized.includes("email") || normalized.includes("mail")) return "email";
  if (normalized.includes("push")) return "push";
  if (normalized.includes("comunidade") || normalized.includes("community") || normalized.includes("grupo")) {
    return "community";
  }
  return normalized.replace(/[^a-z0-9]/g, "") || "canal";
}

export function uniqueCommunicationChannels(channels: string[]) {
  const seen = new Set<string>();
  return channels.filter((channel) => {
    const key = normalizeCommunicationChannelKey(channel);
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(key);
  });
}

export function channelsForCommunicationTarget(target: CommunicationDispatchTarget, channels: string[]) {
  if (target.key === "community") return ["Comunidade"];
  return uniqueCommunicationChannels(channels.length ? channels : ["WhatsApp", "Email"]);
}

export function inferCommunicationPlanKey(investor: InvestorProfile) {
  if (investor.planKey) return investor.planKey;

  const status = normalizeCommunicationToken(investor.status);
  if (status.includes("ativo") || status.includes("active")) return "premium";
  if (status.includes("piloto") || status.includes("pilot")) return "pilot";
  if (status.includes("onboarding") || status.includes("trial")) return "trial";
  return "free";
}

export function investorHasFullCommunicationAccess(investor: InvestorProfile) {
  const plan = normalizeCommunicationToken(inferCommunicationPlanKey(investor));
  const stage = normalizeCommunicationToken(investor.lifecycleStage);
  const status = normalizeCommunicationToken(investor.status);
  const paidPlans = new Set(["premium", "pro", "professional", "enterprise", "paid", "cliente", "client", "pilot"]);
  const clientStages = new Set(["client", "cliente", "customer", "member", "membro"]);
  const accessUntil = investor.fullAccessUntil ? Date.parse(investor.fullAccessUntil) : NaN;

  return (
    paidPlans.has(plan) ||
    clientStages.has(stage) ||
    status.includes("ativo") ||
    status.includes("active") ||
    status.includes("piloto") ||
    status.includes("pilot") ||
    (Number.isFinite(accessUntil) && accessUntil > Date.now())
  );
}

export function investorCommunicationPaused(investor: InvestorProfile) {
  const status = normalizeCommunicationToken(investor.status);
  const frequency = normalizeCommunicationToken(investor.communicationFrequency);
  return (
    status.includes("paus") ||
    status.includes("blocked") ||
    status.includes("bloque") ||
    status.includes("descadastr") ||
    frequency.includes("paus") ||
    frequency.includes("silent")
  );
}

export function communicationOptInForChannel(investor: InvestorProfile, channel: string) {
  const channelKey = normalizeCommunicationChannelKey(channel);
  if (channelKey === "whatsapp") return investor.whatsappOptIn && Boolean(investor.phone);
  if (channelKey === "email") return investor.emailOptIn && Boolean(investor.email);
  if (channelKey === "push") return investor.pushOptIn;
  if (channelKey === "community") return investor.communityOptIn;
  return true;
}

export function scoreCommunicationInvestor(
  opportunity: AuctionOpportunity | null,
  investor: InvestorProfile,
  matchRows: CommunicationMatchRow[]
) {
  const dbMatch = matchRows.find((row) => asString(row.investor_id) === investor.id);
  if (dbMatch) return Math.max(0, Math.min(100, Math.round(asNumber(dbMatch.match_score))));
  if (!opportunity) return 50;
  return buildInvestorMatches(investor, [opportunity])[0]?.matchScore || 50;
}

export function investorRecipientGuardrail(target: CommunicationDispatchTarget, recipient: CommunicationRecipient) {
  if (target.key === "paid_clients") return "Liberado para mensagem completa por plano/acesso ativo.";
  if (target.key === "cold_leads") return "Enviar apenas teaser sem endereco completo, dossie integral ou tese sensivel.";
  if (target.key === "community") return "Publicacao educativa, sem recomendacao individual ou dados completos.";
  if (recipient.fullAccess) return "Multicanal com dados completos apenas porque o destinatario tem acesso ativo.";
  return "Multicanal limitado a teaser por ausencia de plano completo.";
}

export function messagePreviewForDetail(detailLevel: string) {
  if (detailLevel === "completo") {
    return "Mensagem completa com dossie, score, risco e proximos passos supervisionados para cliente com acesso ativo.";
  }
  if (detailLevel === "teaser") {
    return "Teaser seguro sem endereco completo, tese sensivel ou orientacao de lance. CTA para contratar plano.";
  }
  if (detailLevel === "educacional") {
    return "Resumo educativo para comunidade, sem recomendacao individual ou dados sensiveis da oportunidade.";
  }
  return "Resumo seguro por canal, limitado conforme plano, opt-in e guardrails de compliance.";
}

export function buildCommunicationRecipientsForTarget(
  target: CommunicationDispatchTarget,
  investors: InvestorProfile[],
  opportunity: AuctionOpportunity | null,
  matchRows: CommunicationMatchRow[],
  channels: string[]
) {
  const targetChannels = channelsForCommunicationTarget(target, channels);

  if (target.key === "community") {
    return [
      {
        recipientKey: "community",
        label: "Comunidade Betel",
        investorId: "",
        email: "",
        phone: "",
        planKey: "community",
        lifecycleStage: "community",
        communicationFrequency: "normal",
        matchScore: 0,
        fullAccess: false,
        channels: targetChannels,
        detailLevel: target.detailLevel,
        optInSource: "community_room",
        guardrail: "Publicacao coletiva sem dados completos ou recomendacao individual.",
      },
    ];
  }

  return investors
    .map((investor) => {
      const fullAccess = investorHasFullCommunicationAccess(investor);
      const matchScore = scoreCommunicationInvestor(opportunity, investor, matchRows);
      const detailLevel = target.key === "multichannel" ? (fullAccess ? "completo" : "teaser") : target.detailLevel;
      const recipient: CommunicationRecipient = {
        recipientKey: investor.id,
        label: investor.name,
        investorId: investor.id,
        email: investor.email,
        phone: investor.phone,
        planKey: inferCommunicationPlanKey(investor),
        lifecycleStage: investor.lifecycleStage,
        communicationFrequency: investor.communicationFrequency,
        matchScore,
        fullAccess,
        channels: targetChannels.filter((channel) => communicationOptInForChannel(investor, channel)),
        detailLevel,
        optInSource: "investor_profile",
        guardrail: "",
      };

      recipient.guardrail = investorRecipientGuardrail(target, recipient);
      return recipient;
    })
    .filter((recipient) => {
      if (!recipient.channels.length) return false;
      if (target.key === "paid_clients") return recipient.fullAccess && recipient.matchScore >= 45;
      if (target.key === "cold_leads") return !recipient.fullAccess;
      if (target.key === "multichannel") return recipient.matchScore >= 35;
      return false;
    })
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 80);
}

export function makeCommunicationMessageCode(runCode: string, recipientKey: string, channel: string) {
  const cleanRun = runCode.replace(/^RUN-/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 28) || "COMM";
  const cleanRecipient = recipientKey.replace(/[^a-zA-Z0-9]/g, "").slice(0, 18) || "PUBLICO";
  const cleanChannel = normalizeCommunicationChannelKey(channel).toUpperCase().slice(0, 12) || "CANAL";
  return `OUT-${cleanRun}-${cleanRecipient}-${cleanChannel}`;
}

export function makeDeterministicRatio(seed: string) {
  const total = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (total % 100) / 100;
}

export function estimateRuntimeCost(agentKey: string, inputSummary: string) {
  const baseByAgent: Record<string, number> = {
    "source-scout": 0.018,
    "source-watchdog": 0.014,
    "notice-curator": 0.042,
    "hidden-risk": 0.068,
    "human-handoff": 0.022,
    "compliance-guard": 0.019,
    "paid-lead-alert": 0.031,
    "cold-lead-teaser": 0.024,
    "community-broadcaster": 0.021,
    "multichannel-dispatch": 0.027,
    "bid-strategy": 0.052,
    "post-auction": 0.036,
  };
  const volume = Math.min(inputSummary.length / 12000, 0.04);
  return Number(((baseByAgent[agentKey] || 0.025) + volume).toFixed(4));
}

export async function logAgentRuntimeEvent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  input: {
    runId: string;
    runCode: string;
    agentKey: string;
    eventType: string;
    status: string;
    provider: string;
    model: string;
    attempt: number;
    durationMs?: number;
    costEstimate?: number;
    message: string;
    payload?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from("agent_runtime_events").insert({
      run_id: input.runId || null,
      run_code: input.runCode,
      agent_key: input.agentKey || null,
      event_type: input.eventType,
      status: input.status,
      provider: input.provider,
      model: input.model,
      attempt: input.attempt,
      duration_ms: input.durationMs ?? null,
      cost_estimate: input.costEstimate ?? null,
      message: input.message,
      payload: input.payload || {},
    });
  } catch {
    // Runtime logs must not block the actual agent run.
  }
}

export function buildRuntimeOutput(
  run: AgentRunDbRow,
  runtimeMode: string,
  operatorLabel: string,
  providerResult: AgentRuntimeProviderResult,
  attempt: number,
  durationMs: number
): ProcessAgentRunOutput {
  const agentRow = asRecord(Array.isArray(run.ai_agents) ? run.ai_agents[0] : run.ai_agents);
  const inputPayload = asRecord(run.input_payload);
  const outputPayload = asRecord(run.output_payload);
  const agentKey = asString(agentRow.agent_key, "agent");
  const agentName = asString(agentRow.name, "Agente IA");
  const role = asString(agentRow.role, "Executar etapa operacional.");
  const inputSummary = asString(inputPayload.summary, "Entrada sem resumo estruturado.");
  const nextEdge = findNextStaticWorkflowEdge(agentKey);
  const confidence = Math.round((0.72 + makeDeterministicRatio(`${agentKey}-${run.run_code}`) * 0.2) * 100);
  const modeLabel = runtimeMode === "manual" ? "manual" : "simulado";
  const handoffTo = nextEdge?.toAgent || asString(run.handoff_to, "Operacao");
  const nextAction = nextEdge?.requiresHumanApproval
    ? `Aguardar aprovacao humana antes de acionar ${handoffTo}.`
    : nextEdge
      ? `Enfileirar ${handoffTo} quando o operador liberar o handoff.`
      : asString(outputPayload.nextAction, "Registrar conclusao e aguardar proxima decisao.");
  const humanReviewStatus = nextEdge?.requiresHumanApproval ? "pendente_aprovacao" : "nao_exige";
  const status = nextEdge?.requiresHumanApproval ? "waiting_human" : "completed";
  const costEstimate = estimateRuntimeCost(agentKey, inputSummary);
  const summaryByAgent: Record<string, string> = {
    "source-scout": "Fonte analisada, oportunidade candidata criada e filtros minimos aplicados.",
    "source-watchdog": "Mudanca de edital monitorada e diferencas relevantes marcadas para nova curadoria.",
    "notice-curator": "Edital estruturado, campos ausentes marcados e checklist inicial gerado.",
    "hidden-risk": "Riscos externos priorizados, divergencias separadas e pendencias escaladas.",
    "human-handoff": "Resumo humano preparado com evidencias, pendencias e SLA de aprovacao.",
    "compliance-guard": "Linguagem, gate juridico e permissao de comunicacao revisados.",
    "paid-lead-alert": "Comunicacao completa preparada para clientes elegiveis conforme plano.",
    "cold-lead-teaser": "Teaser seguro preparado sem revelar dados sensiveis da oportunidade.",
    "community-broadcaster": "Publicacao de comunidade preparada sem dados sensiveis ou orientacao individual.",
    "multichannel-dispatch": "Fila de push e email preparada conforme opt-in, plano e frequencia.",
    "bid-strategy": "Teto, custos e roteiro de arremate organizados para decisao humana.",
    "post-auction": "Checklist pos-arremate preparado com documentos, prazos e pendencias.",
  };
  const summary =
    providerResult.summary ||
    summaryByAgent[agentKey] ||
    `${agentName} executou a etapa em modo ${modeLabel}, seguindo a funcao: ${role}`;
  const providerNote =
    providerResult.status === "completed"
      ? ` Provider: ${providerResult.provider}/${providerResult.model}.`
      : providerResult.status === "missing_credentials"
        ? " Provider sem chave configurada; fallback deterministico aplicado."
        : providerResult.status === "provider_error"
          ? " Provider retornou erro; fallback deterministico aplicado."
          : "";

  return {
    runCode: asString(run.run_code, asString(run.id, "RUN")),
    agentKey,
    status,
    summary: `${summary} Confianca operacional: ${providerResult.confidence || confidence}%. Operador: ${
      operatorLabel || "runtime"
    }.${providerNote}`,
    nextAction: providerResult.nextAction && !nextEdge?.requiresHumanApproval ? providerResult.nextAction : nextAction,
    handoffTo,
    costEstimate,
    humanReviewStatus,
    runtimeMode: providerResult.runtimeMode || runtimeMode,
    provider: providerResult.provider,
    model: providerResult.model,
    providerStatus: providerResult.status,
    attempt,
    durationMs,
  };
}

export async function upsertWorkflowEdgeRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  edge: AgentWorkflowEdge
): Promise<MutationResult<{ edgeKey: string }>> {
  const [fromAgentResult, toAgentResult] = await Promise.all([
    ensureAgentRecord(supabase, edge.fromAgentKey),
    ensureAgentRecord(supabase, edge.toAgentKey),
  ]);

  if (!fromAgentResult.ok || !fromAgentResult.data?.id) {
    return { ok: false, error: fromAgentResult.error || `Agente origem ${edge.fromAgentKey} nao preparado.` };
  }

  if (!toAgentResult.ok || !toAgentResult.data?.id) {
    return { ok: false, error: toAgentResult.error || `Agente destino ${edge.toAgentKey} nao preparado.` };
  }

  const { error } = await supabase.from("agent_workflow_edges").upsert(
    {
      from_agent_id: fromAgentResult.data.id,
      to_agent_id: toAgentResult.data.id,
      edge_key: edge.key,
      condition_label: edge.condition,
      requires_human_approval: edge.requiresHumanApproval,
    },
    { onConflict: "edge_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { edgeKey: edge.key } };
}

export function makeSnapshotCuratorRunCode(snapshotCode: string) {
  const clean = snapshotCode.replace(/[^a-zA-Z0-9]/g, "").slice(-18).toUpperCase() || "SNAPSHOT";
  const suffix = Date.now().toString(36).slice(-6).toUpperCase();
  return `CUR-${clean}-${suffix}`;
}

export function buildSnapshotCurationSummary(
  snapshot: SourceSnapshotDbRow,
  source: AuctionSourceDbRow,
  opportunity: OpportunityDbRow
) {
  const rawPayload = asRecord(snapshot.raw_payload);
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const parts = [
    "Curadoria inicial de captura de fonte.",
    `Snapshot: ${asString(snapshot.snapshot_code)}.`,
    `Fonte: ${asString(source.name, "Fonte nao localizada")} (${asString(source.source_type, "Manual")}).`,
    `URL oficial: ${asString(snapshot.source_url, asString(source.url, "nao informada"))}.`,
    `Oportunidade: ${asString(opportunity.code)} - ${asString(opportunity.title, asString(snapshot.title))}.`,
    `Localidade: ${asString(opportunity.city)}/${asString(opportunity.state)}.`,
    `Status atual: IA=${asString(opportunity.ai_status, "Fila IA")}; juridico=${asString(
      opportunity.legal_status,
      "Pendente"
    )}; etapa=${asString(opportunity.stage, "Entrada")}.`,
    "",
    "Tarefa do agente:",
    "1. Separar fatos confirmados, hipoteses e campos ausentes.",
    "2. Marcar divergencias que exigem consulta externa ou advogado.",
    "3. Preparar checklist inicial para risco oculto e compliance.",
    "4. Nao aprovar publicacao nem prometer lucro.",
    "",
    `Payload extraido: ${clampAdminText(JSON.stringify(extractedPayload), 1200)}`,
    `Payload bruto: ${clampAdminText(JSON.stringify(rawPayload), 1200)}`,
  ];

  return parts.join("\n");
}

export function getAnalysisRunForSnapshot(runs: AiAnalysisRunDbRow[], snapshotCode: string) {
  return (
    runs.find((run) => asString(asRecord(run.output_json).snapshotCode) === snapshotCode) ||
    runs[0] ||
    {}
  );
}

export async function updateSourceIntakeAnalysisRun(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  run: AiAnalysisRunDbRow,
  input: {
    opportunityId: string;
    snapshotCode: string;
    status: string;
    agentRunCode: string;
    runtimeOutput?: ProcessAgentRunOutput;
  }
) {
  const now = new Date().toISOString();
  const existingOutput = asRecord(run.output_json);
  const runCode =
    asString(run.run_code) ||
    `INTAKE-${input.snapshotCode.replace(/[^a-zA-Z0-9]/g, "").slice(-16).toUpperCase()}-${Date.now()
      .toString(36)
      .slice(-5)
      .toUpperCase()}`;

  const payload = {
    opportunity_id: input.opportunityId,
    run_code: runCode,
    run_type: "source_intake",
    model: input.runtimeOutput?.model || asString(run.model, "betel-deterministic-v0"),
    prompt_version: asString(run.prompt_version, "auction_notice_curator/v0.2"),
    confidence_pct: input.runtimeOutput ? 82 : asNumber(run.confidence_pct, 55),
    status: input.status,
    cost_estimate: input.runtimeOutput?.costEstimate ?? asNumber(run.cost_estimate, 0),
    input_hash: asString(run.input_hash),
    output_json: {
      ...existingOutput,
      snapshotCode: input.snapshotCode,
      curatorRunCode: input.agentRunCode,
      curationStatus: input.status,
      curationUpdatedAt: now,
      summary: input.runtimeOutput?.summary || asString(existingOutput.summary),
      nextAction:
        input.runtimeOutput?.nextAction ||
        asString(existingOutput.nextAction, "Aguardar execucao do agente curador."),
      humanReviewStatus: input.runtimeOutput?.humanReviewStatus || asString(existingOutput.humanReviewStatus),
      provider: input.runtimeOutput?.provider || asString(existingOutput.provider),
      model: input.runtimeOutput?.model || asString(existingOutput.model),
    },
  };

  if (asString(run.id)) {
    await supabase.from("ai_analysis_runs").update(payload).eq("id", asString(run.id));
    return runCode;
  }

  await supabase.from("ai_analysis_runs").insert(payload);
  return runCode;
}
