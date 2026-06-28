/**
 * Split repository.ts into 3 domain modules + shared types/utils.
 *
 * Architecture:
 * - shared.ts        (lines 1-2113) — types, utils, normalizers, helpers
 * - agents-comms.ts  (lines 2114-4338) — agents + communication (tightly coupled)
 * - data.ts          (lines 4339-5554) — opportunities, investors, auction-room, sources
 * - pipeline.ts      (lines 5555-7646) — pipeline, ingestion, create/update records
 * - index.ts         — barrel re-exports
 *
 * Dependency graph (no cycles):
 *   shared.ts (no deps on domain files)
 *       ↓
 *   data.ts (shared only)
 *   agents-comms.ts (shared only — queries DB directly for investor/opportunity data)
 *   pipeline.ts (shared + may call createAgentRunRecord from agents-comms)
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..", "src", "lib", "admin");
const SRC = join(ROOT, "repository.ts");
const OUT = join(ROOT, "repository");

// Read from original if it exists, otherwise from _all.ts backup
let srcPath = SRC;
if (!existsSync(SRC)) {
  // Original was deleted; read from shared.ts for shared portion
  // and reconstruct from individual files? No — we need the original.
  // Check for backup
  const backup = join(OUT, "_all.ts");
  if (existsSync(backup)) {
    srcPath = backup;
  } else {
    console.error("Cannot find original repository.ts or backup.");
    process.exit(1);
  }
}

const lines = readFileSync(srcPath, "utf-8").split("\n");

function extract(ranges) {
  const result = [];
  for (const [start, end] of ranges) {
    for (let i = start - 1; i < Math.min(end, lines.length); i++) {
      result.push(lines[i]);
    }
    result.push("");
  }
  return result.join("\n");
}

// Clean up previous split files
const oldFiles = [
  "shared.ts", "agents.ts", "communication.ts", "opportunities.ts",
  "investors.ts", "auction-room.ts", "sources.ts", "pipeline.ts",
  "ingestion.ts", "index.ts", "_all.ts",
  "agents-comms.ts", "data.ts",
];
for (const f of oldFiles) {
  try { unlinkSync(join(OUT, f)); } catch {}
}

// ── shared.ts ──────────────────────────────────────────────────
let shared = extract([[1, 2113]]);

// Export private functions
shared = shared.replace(
  /^(function |async function )/gm,
  "export $1"
);
shared = shared.replace(/^(const mockReason)/m, "export $1");
shared = shared.replace(/^(const adminDateTimeFormatter)/m, "export $1");

// Export private types
shared = shared.replace(
  /^type (OpportunityDbRow|InvestorDbRow|AdvisoryContractDbRow|AgentDbRow|AgentOfficeRoomDbRow|AgentPromptRegistryDbRow|AgentMaintenanceTaskDbRow|AgentRunDbRow|AgentRuntimeEventDbRow|AgentWorkflowEdgeDbRow|CommunicationOutboxDbRow|InvestorCommunicationEventDbRow|AuctionSourceDbRow|SourceSnapshotDbRow|AiAnalysisRunDbRow|AdvisoryContractForeignKeys|AuctionRoomRecord)/gm,
  "export type $1"
);

// Fix relative paths (now one level deeper)
shared = shared.replace(/from "\.\/commercial"/g, 'from "../commercial"');
shared = shared.replace(/from "\.\/contracts"/g, 'from "../contracts"');
shared = shared.replace(/from "\.\/agent-workforce"/g, 'from "../agent-workforce"');
shared = shared.replace(/from "\.\/investors"/g, 'from "../investors"');
shared = shared.replace(/from "\.\/resources"/g, 'from "../resources"');

// Add re-exports so domain files can import everything from ./shared
shared += `
// ── Re-exports for domain files ────────────────────────────────
export { getSupabaseAdminClient } from "@/lib/supabase/admin";
export { createHash } from "node:crypto";
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
`;

writeFileSync(join(OUT, "shared.ts"), shared.trimEnd() + "\n");
console.log("✓ shared.ts");

// ── agents-comms.ts ────────────────────────────────────────────
// Lines 2114-4338: agents + communication (they share createAgentRunRecord)
{
  const body = extract([[2114, 4338]]);
  const header = `import "server-only";\n\nexport * from "./shared";\n\nimport {\n` +
    // All shared identifiers used by agent and communication functions
    [
      "type AgentOfficeData", "type CreateAgentInput", "type CreateAgentPromptInput",
      "type CreateAgentMaintenanceTaskInput", "type CreateAgentRunInput", "type UpdateAgentRunStatusInput",
      "type EnqueueAgentHandoffInput", "type ProcessAgentRunInput", "type ProcessAgentRunOutput",
      "type RunAgentPipelineInput", "type RunAgentPipelineOutput",
      "type ResolveHumanGateInput", "type ResolveHumanGateOutput",
      "type CommunicationAuditFilters", "type CommunicationAuditData",
      "type DispatchCommunicationInput", "type DispatchCommunicationOutput",
      "type ProcessCommunicationOutboxInput", "type ProcessCommunicationOutboxOutput",
      "type ProcessCommunicationOutboxBatchInput", "type ProcessCommunicationOutboxBatchOutput",
      "type CommunicationSchedulerInput", "type CommunicationSchedulerOutput",
      "type InvestorCommunicationEvent",
      "type DataResult", "type MutationResult",
      "type AgentRunDbRow", "type AgentDbRow", "type AgentOfficeRoomDbRow",
      "type AgentPromptRegistryDbRow", "type AgentMaintenanceTaskDbRow",
      "type AgentWorkflowEdgeDbRow", "type AgentRuntimeEventDbRow",
      "type CommunicationOutboxDbRow", "type InvestorCommunicationEventDbRow",
      "type OpportunityDbRow", "type InvestorDbRow",
      "type CommunicationDispatchTarget", "type CommunicationMatchRow", "type CommunicationRecipient",
      "type AgentStatus", "type AuctionRoomRecord",
      "type SourceSnapshotRecord",
      "type AuctionSourceRecord", "type AuctionSourceDbRow",
      "type ResourceTone",
      "type AuctionOpportunity",
      "type InvestorProfile",
      "type AgentWorkflowEdge",
      "type AgentOfficeRoom", "type AgentDirectoryEntry",
      "type AgentPromptRegistryItem", "type AgentMaintenanceItem",
      "type AgentRunSample", "type AgentRuntimeEvent",
      "type CommunicationOutboxItem",
      "type AgentGroup",
      "type CommunicationProviderHealth",
      "asString", "asNumber", "asBoolean", "asArray", "asStringList", "asRecord",
      "mockReason", "adminDateTimeFormatter",
      "getSupabaseAdminClient",
      "normalizeAgentDirectoryEntry", "normalizePromptRegistry",
      "normalizeMaintenanceTask", "normalizeWorkflowEdge",
      "normalizeAgentRun", "normalizeRuntimeEvent",
      "normalizeCommunicationOutbox", "normalizeInvestorCommunicationEvent",
      "normalizeOfficeRoom", "normalizeOpportunity", "normalizeInvestor",
      "normalizeCommunicationAuditFilter",
      "makeAgentOfficeMetrics", "staticAgentOfficeData",
      "mergeByKey", "findStaticAgent", "findStaticWorkflowEdge",
      "fallbackAgentOffice",
      "ensureAgentGroupRecord", "ensureOfficeRoomRecord", "ensureAgentRecord",
      "resolveRunOpportunityId", "resolveRunInvestorId",
      "statusCompletesRun", "reviewApprovesHandoff", "runAgentKey", "runBlocksCommunication",
      "findNextStaticWorkflowEdge", "communicationReleaseError", "isCommunicationReleaseRun",
      "getCommunicationDispatchTargets",
      "normalizeCommunicationToken", "normalizeCommunicationChannelKey",
      "uniqueCommunicationChannels", "channelsForCommunicationTarget",
      "inferCommunicationPlanKey", "investorHasFullCommunicationAccess",
      "investorCommunicationPaused", "communicationOptInForChannel",
      "scoreCommunicationInvestor", "investorRecipientGuardrail",
      "messagePreviewForDetail", "buildCommunicationRecipientsForTarget",
      "makeCommunicationMessageCode", "makeDeterministicRatio",
      "buildRuntimeOutput", "logAgentRuntimeEvent", "estimateRuntimeCost",
      "upsertWorkflowEdgeRecord",
      "filterCommunicationAuditEvents", "makeCommunicationAuditStats",
      "toneForRunStatus", "toneForAgentStatus",
      "shortCode", "formatAdminDateTime", "formatCurrency",
      "normalizeTone", "normalizeAgentStatus",
      "clampAdminText", "looksLikeUuid", "makePayloadPreview",
      "getOpportunityById", "getMockInvestorById", "investorProfiles",
      "agentWorkflowEdges", "agentWorkflowStages", "agentGroups",
      "communicationSegments", "communicationOutbox", "agentRuntimeEvents",
      "getCommunicationProviderHealth",
      "executeAgentRuntime",
      "executeCommunicationDeliveryAdapter",
    ].map(s => `  ${s},`).join("\n") +
    `\n} from "./shared";\n\n`;

  // Remove the `export * from "./shared"` line and any duplicate imports the body might have
  let content = header + body;
  // Remove the first line `export * from "./shared"` since we don't want it
  content = content.replace('export * from "./shared";\n\n', '');

  writeFileSync(join(OUT, "agents-comms.ts"), content.trimEnd() + "\n");
  console.log("✓ agents-comms.ts");
}

// ── data.ts ────────────────────────────────────────────────────
// Lines 4339-5554: opportunities, investors, auction-room, sources
{
  const body = extract([[4339, 5554]]);
  const header = `import "server-only";\n\nimport {\n` +
    [
      "type CreateAuctionOpportunityInput", "type UpdateAuctionOpportunityInput",
      "type CreateInvestorProfileInput", "type AdvisoryContractMutationInput",
      "type AuctionSourceRecord", "type SourceSnapshotRecord", "type SourceSnapshotFilters",
      "type AuctionRoomRecord",
      "type InvestorCommunicationEvent",
      "type DataResult", "type MutationResult",
      "type OpportunityDbRow", "type InvestorDbRow",
      "type InvestorCommunicationEventDbRow",
      "type AuctionSourceDbRow", "type SourceSnapshotDbRow",
      "type ResourceTone",
      "type AuctionOpportunity", "type ModuleResource",
      "type InvestorProfile", "type InvestorOpportunityMatch",
      "type CommercialPack", "type AdvisoryContractGate", "type AdvisoryContractSnapshot",
      "type AdvisoryContractForeignKeys",
      "type RiskAppetite",
      "asString", "asNumber", "asBoolean", "asArray", "asStringList", "asRecord",
      "mockReason", "adminDateTimeFormatter",
      "getSupabaseAdminClient",
      "normalizeOpportunity", "normalizeInvestor", "normalizeAdvisoryContract",
      "normalizeInvestorCommunicationEvent",
      "makeContractCode", "resolveAdvisoryContractForeignKeys", "getAdvisoryContractSnapshot",
      "toDashboardRow", "fallbackOpportunities", "fallbackInvestors",
      "toneForRunStatus", "normalizeTone",
      "shortCode", "formatAdminDateTime", "formatCurrency",
      "clampAdminText", "looksLikeUuid", "makePayloadPreview",
      "getAdminResource", "getOpportunityById",
      "auctionOpportunities", "investorProfiles",
      "createOpportunitiesResource", "createKanbanResourceFromOpportunities",
      "createInvestorsResource", "buildInvestorMatches",
      "getMockInvestorById", "normalizeRiskAppetite",
      "buildCommercialPack", "buildAdvisoryContractGate",
    ].map(s => `  ${s},`).join("\n") +
    `\n} from "./shared";\nimport type { OpportunityRow } from "@/lib/admin/mock-data";\n\n`;

  writeFileSync(join(OUT, "data.ts"), (header + body).trimEnd() + "\n");
  console.log("✓ data.ts");
}

// ── pipeline.ts ────────────────────────────────────────────────
// Lines 5555-7646: pipeline, ingestion, create/update records
{
  const body = extract([[5555, 7646]]);
  const header = `import "server-only";\n\nimport {\n` +
    [
      "type ProcessSourceSnapshotInput", "type ProcessSourceSnapshotOutput",
      "type EnqueueHiddenRiskInput", "type EnqueueHiddenRiskOutput",
      "type EnqueueHumanReviewInput", "type EnqueueHumanReviewOutput",
      "type ResolveHumanReviewInput", "type ResolveHumanReviewOutput",
      "type ProcessComplianceFromSnapshotInput", "type ProcessComplianceFromSnapshotOutput",
      "type ReleaseCommunicationFromSnapshotInput", "type ReleaseCommunicationFromSnapshotOutput",
      "type SourceIntakeInput", "type SourceIntakeOutput",
      "type PullSourceProviderOpportunitiesInput", "type PullSourceProviderOpportunitiesOutput",
      "type CreateAuctionOpportunityInput", "type UpdateAuctionOpportunityInput",
      "type CreateInvestorProfileInput",
      "type DispatchCommunicationOutput",
      "type DataResult", "type MutationResult",
      "type SourceSnapshotDbRow", "type AiAnalysisRunDbRow",
      "type AgentRunDbRow", "type AgentDbRow",
      "type OpportunityDbRow", "type InvestorDbRow",
      "type CommunicationOutboxDbRow",
      "type AuctionSourceDbRow",
      "type AuctionOpportunity", "type InvestorProfile",
      "type AgentWorkflowEdge",
      "type CommunicationDispatchTarget", "type CommunicationMatchRow",
      "type CommunicationRecipient",
      "type RiskAppetite",
      "asString", "asNumber", "asBoolean", "asArray", "asStringList", "asRecord",
      "mockReason", "adminDateTimeFormatter",
      "getSupabaseAdminClient", "createHash",
      "ensureAgentRecord",
      "resolveRunOpportunityId",
      "logAgentRuntimeEvent", "buildRuntimeOutput", "estimateRuntimeCost",
      "statusCompletesRun", "reviewApprovesHandoff",
      "runAgentKey", "runBlocksCommunication",
      "communicationReleaseError", "isCommunicationReleaseRun",
      "getCommunicationDispatchTargets",
      "buildCommunicationRecipientsForTarget",
      "makeCommunicationMessageCode", "messagePreviewForDetail",
      "normalizeCommunicationToken", "normalizeCommunicationChannelKey",
      "normalizeOpportunity", "normalizeInvestor",
      "normalizeCommunicationOutbox",
      "findStaticAgent", "findNextStaticWorkflowEdge",
      "shortCode", "formatAdminDateTime", "formatCurrency",
      "clampAdminText", "looksLikeUuid",
      "normalizeTone", "toneForRunStatus",
      "makePayloadPreview", "makeDeterministicRatio",
      "getMockInvestorById", "investorProfiles",
      "getOpportunityById", "auctionOpportunities",
      "normalizeRiskAppetite",
      "executeAgentRuntime",
      "executeSourceProviderPull",
    ].map(s => `  ${s},`).join("\n") +
    `\n} from "./shared";\n\n`;

  writeFileSync(join(OUT, "pipeline.ts"), (header + body).trimEnd() + "\n");
  console.log("✓ pipeline.ts");
}

// ── index.ts ───────────────────────────────────────────────────
writeFileSync(join(OUT, "index.ts"), [
  'export * from "./shared";',
  'export * from "./agents-comms";',
  'export * from "./data";',
  'export * from "./pipeline";',
  '',
].join("\n"));
console.log("✓ index.ts");

console.log("\nDone! Now run `npx tsc --noEmit` to check.");
