/**
 * Consolidate the 8 domain files into 3 larger domain files.
 * shared.ts stays as-is.
 *
 * New structure:
 * - shared.ts (unchanged)
 * - agents-comms.ts = agents.ts body + communication.ts body
 * - data.ts = opportunities.ts body + investors.ts body + auction-room.ts body + sources.ts body
 * - pipeline.ts = pipeline.ts body + ingestion.ts body
 */

import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const DIR = join(import.meta.dirname, "..", "src", "lib", "admin", "repository");

function extractBody(filename) {
  const content = readFileSync(join(DIR, filename), "utf-8");
  const lines = content.split("\n");

  // Find the end of the import header — last line containing "from" import
  let bodyStart = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('} from "') || lines[i].includes("} from '")) {
      bodyStart = i + 1;
    }
    // Also check single-line imports
    if (lines[i].startsWith("import ") && lines[i].includes(" from ")) {
      bodyStart = i + 1;
    }
  }

  // Skip blank lines after imports
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") {
    bodyStart++;
  }

  return lines.slice(bodyStart).join("\n");
}

// ── agents-comms.ts ──────────────────────────────────────────
const agentsBody = extractBody("agents.ts");
const commsBody = extractBody("communication.ts");

const agentsCommsImports = `import "server-only";

import {
  type AgentOfficeData, type CreateAgentInput, type CreateAgentPromptInput,
  type CreateAgentMaintenanceTaskInput, type CreateAgentRunInput,
  type UpdateAgentRunStatusInput, type EnqueueAgentHandoffInput,
  type ProcessAgentRunInput, type ProcessAgentRunOutput,
  type RunAgentPipelineInput, type RunAgentPipelineOutput,
  type ResolveHumanGateInput, type ResolveHumanGateOutput,
  type CommunicationAuditFilters, type CommunicationAuditData,
  type DispatchCommunicationInput, type DispatchCommunicationOutput,
  type ProcessCommunicationOutboxInput, type ProcessCommunicationOutboxOutput,
  type ProcessCommunicationOutboxBatchInput, type ProcessCommunicationOutboxBatchOutput,
  type CommunicationSchedulerInput, type CommunicationSchedulerOutput,
  type InvestorCommunicationEvent,
  type DataResult, type MutationResult,
  type AgentRunDbRow, type AgentDbRow, type AgentOfficeRoomDbRow,
  type AgentPromptRegistryDbRow, type AgentMaintenanceTaskDbRow,
  type AgentWorkflowEdgeDbRow, type AgentRuntimeEventDbRow,
  type CommunicationOutboxDbRow, type InvestorCommunicationEventDbRow,
  type OpportunityDbRow, type InvestorDbRow,
  type CommunicationDispatchTarget, type CommunicationMatchRow, type CommunicationRecipient,
  type AgentStatus,
  type ResourceTone, type AuctionOpportunity, type InvestorProfile,
  type AgentWorkflowEdge, type AgentOfficeRoom, type AgentDirectoryEntry,
  type AgentPromptRegistryItem, type AgentMaintenanceItem,
  type AgentRunSample, type AgentRuntimeEvent, type CommunicationOutboxItem,
  type AgentGroup, type CommunicationProviderHealth,
  asString, asNumber, asBoolean, asArray, asStringList, asRecord,
  mockReason, adminDateTimeFormatter,
  getSupabaseAdminClient,
  normalizeAgentDirectoryEntry, normalizePromptRegistry,
  normalizeMaintenanceTask, normalizeWorkflowEdge,
  normalizeAgentRun, normalizeRuntimeEvent,
  normalizeCommunicationOutbox, normalizeInvestorCommunicationEvent,
  normalizeOfficeRoom, normalizeOpportunity, normalizeInvestor,
  normalizeCommunicationAuditFilter,
  makeAgentOfficeMetrics, staticAgentOfficeData,
  mergeByKey, findStaticAgent, findStaticWorkflowEdge,
  fallbackAgentOffice,
  ensureAgentGroupRecord, ensureOfficeRoomRecord, ensureAgentRecord,
  resolveRunOpportunityId, resolveRunInvestorId,
  statusCompletesRun, reviewApprovesHandoff, runAgentKey, runBlocksCommunication,
  findNextStaticWorkflowEdge, communicationReleaseError, isCommunicationReleaseRun,
  getCommunicationDispatchTargets,
  normalizeCommunicationToken, normalizeCommunicationChannelKey,
  uniqueCommunicationChannels, channelsForCommunicationTarget,
  inferCommunicationPlanKey, investorHasFullCommunicationAccess,
  investorCommunicationPaused, communicationOptInForChannel,
  scoreCommunicationInvestor, investorRecipientGuardrail,
  messagePreviewForDetail, buildCommunicationRecipientsForTarget,
  makeCommunicationMessageCode, makeDeterministicRatio,
  buildRuntimeOutput, logAgentRuntimeEvent, estimateRuntimeCost,
  upsertWorkflowEdgeRecord,
  filterCommunicationAuditEvents, makeCommunicationAuditStats,
  toneForRunStatus, toneForAgentStatus,
  shortCode, formatAdminDateTime, formatCurrency,
  normalizeTone, normalizeAgentStatus,
  clampAdminText, looksLikeUuid, makePayloadPreview,
  getOpportunityById, getMockInvestorById, investorProfiles,
  agentWorkflowEdges, agentWorkflowStages, agentGroups,
  communicationSegments, communicationOutbox, agentRuntimeEvents,
  getCommunicationProviderHealth,
  executeAgentRuntime,
  executeCommunicationDeliveryAdapter,
} from "./shared";

`;

writeFileSync(
  join(DIR, "agents-comms.ts"),
  (agentsCommsImports + agentsBody + "\n\n" + commsBody).trimEnd() + "\n"
);
console.log("✓ agents-comms.ts");

// ── data.ts ──────────────────────────────────────────────────
const oppsBody = extractBody("opportunities.ts");
const investorsBody = extractBody("investors.ts");
const auctionRoomBody = extractBody("auction-room.ts");
const sourcesBody = extractBody("sources.ts");

const dataImports = `import "server-only";

import type { OpportunityRow } from "@/lib/admin/mock-data";
import {
  type CreateAuctionOpportunityInput, type UpdateAuctionOpportunityInput,
  type CreateInvestorProfileInput, type AdvisoryContractMutationInput,
  type AuctionSourceRecord, type SourceSnapshotRecord, type SourceSnapshotFilters,
  type AuctionRoomRecord, type InvestorCommunicationEvent,
  type DataResult, type MutationResult,
  type OpportunityDbRow, type InvestorDbRow,
  type InvestorCommunicationEventDbRow,
  type AuctionSourceDbRow, type SourceSnapshotDbRow,
  type ResourceTone,
  type AuctionOpportunity, type ModuleResource,
  type InvestorProfile, type InvestorOpportunityMatch,
  type CommercialPack, type AdvisoryContractGate, type AdvisoryContractSnapshot,
  type AdvisoryContractForeignKeys, type RiskAppetite,
  asString, asNumber, asBoolean, asArray, asStringList, asRecord,
  mockReason, adminDateTimeFormatter,
  getSupabaseAdminClient,
  normalizeOpportunity, normalizeInvestor, normalizeAdvisoryContract,
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

`;

writeFileSync(
  join(DIR, "data.ts"),
  (dataImports + oppsBody + "\n\n" + investorsBody + "\n\n" + auctionRoomBody + "\n\n" + sourcesBody).trimEnd() + "\n"
);
console.log("✓ data.ts");

// ── pipeline.ts (overwrite) ──────────────────────────────────
const pipelineBody = extractBody("pipeline.ts");
const ingestionBody = extractBody("ingestion.ts");

const pipelineImports = `import "server-only";

import {
  type ProcessSourceSnapshotInput, type ProcessSourceSnapshotOutput,
  type EnqueueHiddenRiskInput, type EnqueueHiddenRiskOutput,
  type EnqueueHumanReviewInput, type EnqueueHumanReviewOutput,
  type ResolveHumanReviewInput, type ResolveHumanReviewOutput,
  type ProcessComplianceFromSnapshotInput, type ProcessComplianceFromSnapshotOutput,
  type ReleaseCommunicationFromSnapshotInput, type ReleaseCommunicationFromSnapshotOutput,
  type SourceIntakeInput, type SourceIntakeOutput,
  type PullSourceProviderOpportunitiesInput, type PullSourceProviderOpportunitiesOutput,
  type CreateAuctionOpportunityInput, type CreateInvestorProfileInput,
  type DispatchCommunicationOutput,
  type DataResult, type MutationResult,
  type SourceSnapshotDbRow, type AiAnalysisRunDbRow,
  type AgentRunDbRow, type AgentDbRow,
  type OpportunityDbRow, type InvestorDbRow,
  type CommunicationOutboxDbRow, type AuctionSourceDbRow,
  type AuctionOpportunity, type InvestorProfile,
  type AgentWorkflowEdge,
  type CommunicationDispatchTarget, type CommunicationMatchRow,
  type CommunicationRecipient, type RiskAppetite,
  asString, asNumber, asBoolean, asArray, asStringList, asRecord,
  mockReason, adminDateTimeFormatter,
  getSupabaseAdminClient, createHash,
  ensureAgentRecord,
  resolveRunOpportunityId,
  logAgentRuntimeEvent, buildRuntimeOutput, estimateRuntimeCost,
  statusCompletesRun, reviewApprovesHandoff,
  runAgentKey, runBlocksCommunication,
  communicationReleaseError, isCommunicationReleaseRun,
  getCommunicationDispatchTargets,
  buildCommunicationRecipientsForTarget,
  makeCommunicationMessageCode, messagePreviewForDetail,
  normalizeCommunicationToken, normalizeCommunicationChannelKey,
  normalizeOpportunity, normalizeInvestor,
  normalizeCommunicationOutbox,
  findStaticAgent, findNextStaticWorkflowEdge,
  shortCode, formatAdminDateTime, formatCurrency,
  clampAdminText, looksLikeUuid,
  normalizeTone, toneForRunStatus,
  makePayloadPreview, makeDeterministicRatio,
  getMockInvestorById, investorProfiles,
  getOpportunityById, auctionOpportunities,
  normalizeRiskAppetite,
  executeAgentRuntime,
  executeSourceProviderPull,
} from "./shared";

`;

writeFileSync(
  join(DIR, "pipeline.ts"),
  (pipelineImports + pipelineBody + "\n\n" + ingestionBody).trimEnd() + "\n"
);
console.log("✓ pipeline.ts (with ingestion)");

// ── Update index.ts ──────────────────────────────────────────
writeFileSync(join(DIR, "index.ts"), [
  'export * from "./shared";',
  'export * from "./agents-comms";',
  'export * from "./data";',
  'export * from "./pipeline";',
  '',
].join("\n"));
console.log("✓ index.ts");

// ── Remove old domain files ─────────────────────────────────
for (const f of ["agents.ts", "communication.ts", "opportunities.ts", "investors.ts", "auction-room.ts", "sources.ts", "ingestion.ts"]) {
  try { unlinkSync(join(DIR, f)); console.log(`  removed ${f}`); } catch {}
}

console.log("\nDone! Run npx tsc --noEmit to verify.");
