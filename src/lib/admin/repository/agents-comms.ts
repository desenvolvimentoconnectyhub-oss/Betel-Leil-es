import "server-only";

import { getAgentSystemPrompt } from "@/lib/ai/agent-prompts";
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
  type AgentProfileData, type UpdateAgentProfileInput,
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
import { getWillianInstanceState } from "@/lib/communication/connectyhub-client";
import { getWillianAgentConfig } from "@/lib/communication/willian-agent-config";
import { renderMessageTemplate } from "@/lib/communication/message-templates";

export async function getAgentOfficeData(): Promise<DataResult<AgentOfficeData>> {
  const fallback = staticAgentOfficeData();
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const [willianInstance, willianAgentConfig] = await Promise.all([
      getWillianInstanceState({ checkRemote: true }),
      getWillianAgentConfig(),
    ]);
    const fallbackData = fallbackAgentOffice("Supabase admin nao configurado.");
    return {
      ...fallbackData,
      data: {
        ...fallbackData.data,
        willianInstance,
        willianAgentConfig,
      },
    };
  }

  const [
    roomsResult,
    agentsResult,
    promptsResult,
    maintenanceResult,
    runsResult,
    edgesResult,
    eventsResult,
    outboxResult,
  ] = await Promise.all([
    supabase.from("agent_office_rooms").select("*").order("execution_order", { ascending: true }),
    supabase.from("ai_agents").select("*, agent_groups(group_key, name)").order("updated_at", { ascending: false }),
    supabase.from("agent_prompt_registry").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase.from("agent_maintenance_tasks").select("*").order("updated_at", { ascending: false }).limit(100),
    supabase
      .from("agent_runs")
      .select("*, ai_agents(agent_key, name), auction_opportunities(code, title)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("agent_workflow_edges").select("*").order("created_at", { ascending: true }),
    supabase.from("agent_runtime_events").select("*").order("created_at", { ascending: false }).limit(30),
    supabase
      .from("communication_outbox")
      .select("*, auction_opportunities(code, title)")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const errors = [
    roomsResult.error,
    agentsResult.error,
    promptsResult.error,
    maintenanceResult.error,
    runsResult.error,
    edgesResult.error,
    eventsResult.error,
    outboxResult.error,
  ]
    .map((error) => error?.message)
    .filter(Boolean);

  if (errors.length === 8) {
    const [willianInstance, willianAgentConfig] = await Promise.all([
      getWillianInstanceState({ checkRemote: true }),
      getWillianAgentConfig(),
    ]);
    const fallbackData = fallbackAgentOffice(errors.join(" | "));
    return {
      ...fallbackData,
      data: {
        ...fallbackData.data,
        willianInstance,
        willianAgentConfig,
      },
    };
  }

  const agentRows = (agentsResult.data || []) as AgentDbRow[];
  const agentRowsById = new Map<string, AgentDbRow>(
    agentRows.reduce<Array<[string, AgentDbRow]>>((items, row) => {
      const id = asString(row.id);
      if (id) items.push([id, row]);
      return items;
    }, [])
  );

  const officeRooms = roomsResult.error
    ? fallback.officeRooms
    : mergeByKey(
        fallback.officeRooms,
        ((roomsResult.data || []) as AgentOfficeRoomDbRow[]).map(normalizeOfficeRoom)
      );

  const directory = agentsResult.error
    ? fallback.directory
    : mergeByKey(
        fallback.directory,
        ((agentsResult.data || []) as AgentDbRow[]).map(normalizeAgentDirectoryEntry)
      );

  const promptRegistry = promptsResult.error
    ? fallback.promptRegistry
    : mergeByKey(
        fallback.promptRegistry,
        ((promptsResult.data || []) as AgentPromptRegistryDbRow[]).map(normalizePromptRegistry)
      );

  const maintenanceQueue = maintenanceResult.error
    ? fallback.maintenanceQueue
    : mergeByKey(
        fallback.maintenanceQueue.map((item) => ({ ...item, key: item.code })),
        ((maintenanceResult.data || []) as AgentMaintenanceTaskDbRow[]).map((item) => ({
          ...normalizeMaintenanceTask(item),
          key: asString(item.task_code, "TASK"),
        }))
      ).map((item) => ({
        code: item.code,
        area: item.area,
        owner: item.owner,
        severity: item.severity,
        status: item.status,
        check: item.check,
        nextAction: item.nextAction,
        tone: item.tone,
      }));

  const recentRuns =
    runsResult.error || !runsResult.data?.length
      ? fallback.recentRuns
      : ((runsResult.data || []) as AgentRunDbRow[]).map(normalizeAgentRun);

  const workflowEdges =
    edgesResult.error || !edgesResult.data?.length
      ? fallback.workflowEdges
      : ((edgesResult.data || []) as AgentWorkflowEdgeDbRow[]).map((row) =>
          normalizeWorkflowEdge(row, agentRowsById)
        );

  const runtimeEvents =
    eventsResult.error || !eventsResult.data?.length
      ? fallback.runtimeEvents
      : ((eventsResult.data || []) as AgentRuntimeEventDbRow[]).map(normalizeRuntimeEvent);

  const outbox =
    outboxResult.error || !outboxResult.data?.length
      ? fallback.communicationOutbox
      : ((outboxResult.data || []) as CommunicationOutboxDbRow[]).map(normalizeCommunicationOutbox);

  const [willianInstance, willianAgentConfig] = await Promise.all([
    getWillianInstanceState({ checkRemote: true }),
    getWillianAgentConfig(),
  ]);

  const data = {
    ...fallback,
    officeRooms,
    directory,
    promptRegistry,
    maintenanceQueue,
    recentRuns,
    workflowEdges,
    runtimeEvents,
    communicationOutbox: outbox,
    willianInstance,
    willianAgentConfig,
  };

  return {
    data: {
      ...data,
      metrics: makeAgentOfficeMetrics(data),
    },
    source: "supabase",
    reason: errors.length ? errors.join(" | ") : undefined,
  };
}

export async function getCommunicationAuditData(
  input: CommunicationAuditFilters = {}
): Promise<DataResult<CommunicationAuditData>> {
  const filters: Required<CommunicationAuditFilters> = {
    channel: normalizeCommunicationAuditFilter(input.channel),
    status: normalizeCommunicationAuditFilter(input.status),
    eventType: normalizeCommunicationAuditFilter(input.eventType),
    limit: Math.max(1, Math.min(Math.trunc(input.limit || 50), 100)),
  };
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    const events = filterCommunicationAuditEvents(agentRuntimeEvents, filters);
    return {
      data: {
        filters,
        events,
        stats: makeCommunicationAuditStats(events),
      },
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const queryLimit = Math.max(filters.limit * 4, filters.limit);
  const { data, error } = await supabase
    .from("agent_runtime_events")
    .select("*")
    .like("event_type", "communication_%")
    .order("created_at", { ascending: false })
    .limit(queryLimit);

  if (error) {
    const events = filterCommunicationAuditEvents(agentRuntimeEvents, filters);
    return {
      data: {
        filters,
        events,
        stats: makeCommunicationAuditStats(events),
      },
      source: "mock",
      reason: error.message,
    };
  }

  const events = filterCommunicationAuditEvents(((data || []) as AgentRuntimeEventDbRow[]).map(normalizeRuntimeEvent), filters);

  return {
    data: {
      filters,
      events,
      stats: makeCommunicationAuditStats(events),
    },
    source: "supabase",
  };
}

export async function createAgentRecord(input: CreateAgentInput): Promise<MutationResult<{ agentKey: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Cadastro real de agente exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const groupResult = await ensureAgentGroupRecord(supabase, input.groupKey);
  if (!groupResult.ok || !groupResult.data?.id) {
    return { ok: false, error: groupResult.error || "Nao foi possivel preparar o setor do agente." };
  }

  const { error } = await supabase.from("ai_agents").upsert(
    {
      group_id: groupResult.data.id,
      agent_key: input.agentKey,
      name: input.name,
      role: input.role,
      status: input.status,
      prompt_name: input.promptName,
      prompt_version: input.promptVersion,
      system_prompt: input.systemPrompt || null,
      trigger_type: input.triggerType || null,
      input_schema: { fields: input.inputs },
      output_schema: { fields: input.outputs },
      guardrails: input.guardrails,
    },
    { onConflict: "agent_key" }
  );

  if (error) return { ok: false, error: error.message };

  await createAgentPromptRegistryRecord({
    promptKey: `${input.promptName}-${input.promptVersion}`,
    agentKey: input.agentKey,
    departmentKey: input.groupKey,
    promptName: input.promptName,
    promptVersion: input.promptVersion,
    purpose: input.role,
    systemPrompt: input.systemPrompt,
    inputContract: input.inputs,
    outputContract: input.outputs,
    guardrails: input.guardrails,
    status: input.status,
    ownerLabel: "Produto IA",
    changeNotes: "Prompt registrado a partir do cadastro do agente.",
  });

  return { ok: true, data: { agentKey: input.agentKey } };
}

export async function createAgentPromptRegistryRecord(
  input: CreateAgentPromptInput
): Promise<MutationResult<{ promptKey: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Registro real de prompt exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  if (input.departmentKey) {
    const groupResult = await ensureAgentGroupRecord(supabase, input.departmentKey);
    if (!groupResult.ok) return { ok: false, error: groupResult.error };
  }

  if (input.agentKey) {
    const agentResult = await ensureAgentRecord(supabase, input.agentKey);
    if (!agentResult.ok) return { ok: false, error: agentResult.error };
  }

  const promptKey = input.promptKey || `${input.promptName}-${input.promptVersion}`;
  const { error } = await supabase.from("agent_prompt_registry").upsert(
    {
      prompt_key: promptKey,
      agent_key: input.agentKey || null,
      department_key: input.departmentKey || null,
      prompt_name: input.promptName,
      prompt_version: input.promptVersion,
      purpose: input.purpose,
      system_prompt: input.systemPrompt || null,
      input_contract: { fields: input.inputContract },
      output_contract: { fields: input.outputContract },
      guardrails: input.guardrails,
      status: input.status,
      owner_label: input.ownerLabel,
      updated_by_label: input.ownerLabel,
      change_notes: input.changeNotes,
    },
    { onConflict: "prompt_key" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { promptKey } };
}

export async function createAgentMaintenanceTaskRecord(
  input: CreateAgentMaintenanceTaskInput
): Promise<MutationResult<{ taskCode: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Manutencao real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  if (input.roomKey) {
    const roomResult = await ensureOfficeRoomRecord(supabase, input.roomKey);
    if (!roomResult.ok) return { ok: false, error: roomResult.error };
  }

  if (input.agentKey) {
    const agentResult = await ensureAgentRecord(supabase, input.agentKey);
    if (!agentResult.ok) return { ok: false, error: agentResult.error };
  }

  const { error } = await supabase.from("agent_maintenance_tasks").upsert(
    {
      task_code: input.taskCode,
      room_key: input.roomKey || null,
      agent_key: input.agentKey || null,
      area: input.area,
      severity: input.severity,
      status: input.status,
      check_description: input.checkDescription,
      next_action: input.nextAction,
      owner_label: input.ownerLabel,
      due_at: input.dueAt || null,
    },
    { onConflict: "task_code" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { taskCode: input.taskCode } };
}

export async function createAgentRunRecord(input: CreateAgentRunInput): Promise<MutationResult<{ runCode: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Fila real de execucao exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const agentResult = await ensureAgentRecord(supabase, input.agentKey);
  if (!agentResult.ok || !agentResult.data?.id) {
    return { ok: false, error: agentResult.error || "Nao foi possivel preparar o agente." };
  }

  const [opportunityResult, investorResult] = await Promise.all([
    resolveRunOpportunityId(supabase, input.opportunityCode),
    resolveRunInvestorId(supabase, input.investorId),
  ]);

  if (!opportunityResult.ok) return { ok: false, error: opportunityResult.error };
  if (!investorResult.ok) return { ok: false, error: investorResult.error };

  const runCode = input.runCode || `RUN-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();
  const startedAt = input.startedAt || (input.status === "queued" ? null : now);
  const completedAt = input.completedAt || (statusCompletesRun(input.status) ? now : null);
  const outputSummary = input.outputSummary || "";

  const { error } = await supabase.from("agent_runs").upsert(
    {
      agent_id: agentResult.data.id,
      opportunity_id: opportunityResult.data?.id || null,
      investor_id: investorResult.data?.id || null,
      run_code: runCode,
      status: input.status || "queued",
      trigger_source: input.triggerSource || "manual",
      input_payload: {
        summary: input.inputSummary,
        opportunityCode: input.opportunityCode,
        investorId: input.investorId,
        createdFrom: "agent_office_manual_run",
      },
      output_payload: {
        summary: outputSummary,
        nextAction: input.errorMessage
          ? "Corrigir erro e reenfileirar quando liberado."
          : input.handoffTo
            ? `Acompanhar handoff para ${input.handoffTo}.`
            : outputSummary || "Aguardar processamento do agente.",
      },
      human_review_status: input.humanReviewStatus || null,
      handoff_to: input.handoffTo || null,
      error_message: input.errorMessage || null,
      cost_estimate: input.costEstimate > 0 ? input.costEstimate : null,
      started_at: startedAt,
      completed_at: completedAt,
    },
    { onConflict: "run_code" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { runCode } };
}

export async function updateAgentRunStatusRecord(
  input: UpdateAgentRunStatusInput
): Promise<MutationResult<{ runCode: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Atualizacao real de run exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const completedAt = input.completedAt || (statusCompletesRun(input.status) ? new Date().toISOString() : null);
  const { data, error } = await supabase
    .from("agent_runs")
    .update({
      status: input.status || "queued",
      output_payload: {
        summary: input.outputSummary,
        nextAction: input.errorMessage
          ? "Corrigir erro e reenfileirar quando liberado."
          : input.handoffTo
            ? `Acompanhar handoff para ${input.handoffTo}.`
            : input.outputSummary || "Aguardar proxima etapa.",
      },
      human_review_status: input.humanReviewStatus || null,
      handoff_to: input.handoffTo || null,
      error_message: input.errorMessage || null,
      cost_estimate: input.costEstimate > 0 ? input.costEstimate : null,
      completed_at: completedAt,
    })
    .eq("run_code", input.runCode)
    .select("run_code")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Run nao encontrado na fila." };
  return { ok: true, data: { runCode: asString(data.run_code, input.runCode) } };
}

export async function syncAgentWorkflowEdgesRecord(): Promise<MutationResult<{ count: number }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Sincronizacao real de handoffs exige service role.",
    };
  }

  for (const edge of agentWorkflowEdges) {
    const result = await upsertWorkflowEdgeRecord(supabase, edge);
    if (!result.ok) return { ok: false, error: result.error };
  }

  return { ok: true, data: { count: agentWorkflowEdges.length } };
}

export async function enqueueAgentHandoffRecord(
  input: EnqueueAgentHandoffInput
): Promise<MutationResult<{ runCode: string; targetAgentKey: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Handoff real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const { data: currentRun, error: currentError } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name)")
    .eq("run_code", input.currentRunCode)
    .maybeSingle();

  if (currentError) return { ok: false, error: currentError.message };
  if (!currentRun) return { ok: false, error: "Run de origem nao encontrado." };

  const currentRow = currentRun as AgentRunDbRow;
  const currentAgentRow = asRecord(Array.isArray(currentRow.ai_agents) ? currentRow.ai_agents[0] : currentRow.ai_agents);
  const currentAgentKey = asString(currentAgentRow.agent_key);
  const edge = findStaticWorkflowEdge(input.transitionKey, currentAgentKey, input.targetAgentKey);

  if (edge) {
    const edgeResult = await upsertWorkflowEdgeRecord(supabase, edge);
    if (!edgeResult.ok) return { ok: false, error: edgeResult.error };
  }

  if (edge?.requiresHumanApproval && !reviewApprovesHandoff(currentRow.human_review_status)) {
    return {
      ok: false,
      error: "Este handoff exige revisao humana aprovada no run de origem.",
    };
  }

  const targetAgentResult = await ensureAgentRecord(supabase, input.targetAgentKey);
  if (!targetAgentResult.ok || !targetAgentResult.data?.id) {
    return { ok: false, error: targetAgentResult.error || "Nao foi possivel preparar o agente destino." };
  }

  const inputPayload = asRecord(currentRow.input_payload);
  const outputPayload = asRecord(currentRow.output_payload);
  const transitionKey = edge?.key || input.transitionKey || `${currentAgentKey || "manual"}-to-${input.targetAgentKey}`;
  const summary =
    input.inputSummary ||
    asString(outputPayload.summary, asString(outputPayload.nextAction, "Continuar processamento do run anterior."));
  const runCode = `RUN-HF-${Date.now().toString(36).toUpperCase()}`;

  const { error } = await supabase.from("agent_runs").insert({
    agent_id: targetAgentResult.data.id,
    opportunity_id: currentRow.opportunity_id || null,
    investor_id: currentRow.investor_id || null,
    run_code: runCode,
    status: "queued",
    trigger_source: `handoff:${transitionKey}`,
    input_payload: {
      summary,
      opportunityCode: asString(inputPayload.opportunityCode),
      investorId: asString(inputPayload.investorId),
      previousRunCode: input.currentRunCode,
      transitionKey,
      requiredHumanApproval: edge?.requiresHumanApproval || false,
    },
    output_payload: {
      summary: "",
      nextAction: edge?.trigger || "Executar proxima etapa da esteira.",
    },
    human_review_status: edge?.requiresHumanApproval ? "aprovado_para_handoff" : "pendente",
    handoff_to: edge?.toAgent || input.targetAgentKey,
  });

  if (error) return { ok: false, error: error.message };

  await supabase
    .from("agent_runs")
    .update({
      handoff_to: edge?.toAgent || input.targetAgentKey,
      output_payload: {
        ...outputPayload,
        nextAction: `Handoff criado para ${edge?.toAgent || input.targetAgentKey}.`,
      },
    })
    .eq("run_code", input.currentRunCode);

  return { ok: true, data: { runCode, targetAgentKey: input.targetAgentKey } };
}

export async function resolveHumanGateRecord(
  input: ResolveHumanGateInput
): Promise<MutationResult<ResolveHumanGateOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Gate humano real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  if (!input.runCode) {
    return { ok: false, error: "Run nao informado para resolver o gate humano." };
  }

  const { data: currentRun, error: currentError } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name)")
    .eq("run_code", input.runCode)
    .maybeSingle();

  if (currentError) return { ok: false, error: currentError.message };
  if (!currentRun) return { ok: false, error: "Run de gate humano nao encontrado." };

  const currentRow = currentRun as AgentRunDbRow;
  const currentAgentRow = asRecord(Array.isArray(currentRow.ai_agents) ? currentRow.ai_agents[0] : currentRow.ai_agents);
  const currentAgentKey = asString(currentAgentRow.agent_key);
  const requestedEdge = findStaticWorkflowEdge(input.transitionKey, currentAgentKey, input.targetAgentKey);
  const nextEdge = requestedEdge || findNextStaticWorkflowEdge(currentAgentKey);
  const targetAgentKey = input.targetAgentKey || nextEdge?.toAgentKey || "";
  const transitionKey = nextEdge?.key || input.transitionKey || "";
  const decision = ["approved", "approved_with_notes", "blocked"].includes(input.decision)
    ? input.decision
    : "approved";
  const blocked = decision === "blocked";
  const humanReviewStatus = blocked
    ? "bloqueado_humano"
    : decision === "approved_with_notes"
      ? "aprovado_com_ressalva"
      : "aprovado_para_handoff";
  const decidedAt = new Date().toISOString();
  const outputPayload = asRecord(currentRow.output_payload);
  const reviewerLabel = input.reviewerLabel || "Operador Betel";
  const notes = input.notes || "";
  const nextAction = blocked
    ? `Gate humano bloqueado por ${reviewerLabel}. Oportunidade nao segue para comunicacao externa.`
    : targetAgentKey
      ? `Gate humano aprovado por ${reviewerLabel}. Handoff liberado para ${nextEdge?.toAgent || targetAgentKey}.`
      : `Gate humano aprovado por ${reviewerLabel}. Nenhum proximo agente configurado.`;
  const provider = asString(currentRow.provider, "manual");
  const model = asString(currentRow.model, "human-gate");
  const attempt = Math.max(asNumber(currentRow.attempt_count, 1), 1);

  const { data: updatedRun, error: updateError } = await supabase
    .from("agent_runs")
    .update({
      status: blocked ? "blocked" : "completed",
      output_payload: {
        ...outputPayload,
        nextAction,
        humanDecision: {
          decision,
          reviewerLabel,
          notes,
          decidedAt,
          transitionKey,
          targetAgentKey,
        },
      },
      human_review_status: humanReviewStatus,
      handoff_to: nextEdge?.toAgent || targetAgentKey || asString(currentRow.handoff_to),
      error_message: blocked ? "Gate humano bloqueou o fluxo antes do handoff." : null,
      locked_at: null,
      locked_by: null,
      completed_at: decidedAt,
    })
    .eq("run_code", input.runCode)
    .select("id, run_code")
    .maybeSingle();

  if (updateError) return { ok: false, error: updateError.message };
  if (!updatedRun) return { ok: false, error: "Run nao encontrado ao salvar decisao humana." };

  await logAgentRuntimeEvent(supabase, {
    runId: asString((updatedRun as Record<string, unknown>).id, asString(currentRow.id)),
    runCode: input.runCode,
    agentKey: currentAgentKey,
    eventType: blocked ? "human_gate_blocked" : "human_gate_approved",
    status: blocked ? "blocked" : "completed",
    provider,
    model,
    attempt,
    message: nextAction,
    payload: {
      decision,
      reviewerLabel,
      notes,
      transitionKey,
      targetAgentKey,
      humanReviewStatus,
    },
  });

  if (blocked || !targetAgentKey) {
    return {
      ok: true,
      data: {
        runCode: input.runCode,
        decision,
        humanReviewStatus,
        targetAgentKey: targetAgentKey || undefined,
        stoppedReason: blocked ? "Gate humano bloqueou o fluxo." : "Gate humano aprovado sem proximo agente.",
      },
    };
  }

  const handoffResult = await enqueueAgentHandoffRecord({
    currentRunCode: input.runCode,
    targetAgentKey,
    transitionKey,
    inputSummary:
      notes ||
      `${asString(outputPayload.summary, asString(outputPayload.nextAction, "Gate humano aprovado."))} Proxima etapa: ${
        nextEdge?.trigger || "Executar proximo agente."
      }`,
  });

  if (!handoffResult.ok || !handoffResult.data?.runCode) {
    return {
      ok: false,
      error: handoffResult.error || "Gate aprovado, mas nao foi possivel enfileirar o proximo agente.",
    };
  }

  return {
    ok: true,
    data: {
      runCode: input.runCode,
      decision,
      humanReviewStatus,
      nextRunCode: handoffResult.data.runCode,
      targetAgentKey,
      stoppedReason: `Gate humano aprovado e handoff criado para ${nextEdge?.toAgent || targetAgentKey}.`,
    },
  };
}


export async function processAgentRunRecord(
  input: ProcessAgentRunInput
): Promise<MutationResult<ProcessAgentRunOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Runtime real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const query = supabase
    .from("agent_runs")
    .select(
      "*, ai_agents(agent_key, name, role, prompt_name, prompt_version, system_prompt, guardrails), auction_opportunities(code, title)"
    )
    .order("created_at", { ascending: true });
  const { data: runData, error: runError } = input.runCode
    ? await query.eq("run_code", input.runCode).limit(1).maybeSingle()
    : await query.in("status", ["queued", "planned"]).limit(1).maybeSingle();

  if (runError) return { ok: false, error: runError.message };
  if (!runData) {
    return {
      ok: false,
      error: input.runCode ? "Run nao encontrado para processamento." : "Nenhum run em fila para processar.",
    };
  }

  const run = runData as AgentRunDbRow;
  const runCode = asString(run.run_code, asString(run.id));
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();
  const existingOutput = asRecord(run.output_payload);
  const inputPayload = asRecord(run.input_payload);
  const agentRow = asRecord(Array.isArray(run.ai_agents) ? run.ai_agents[0] : run.ai_agents);
  const agentKey = asString(agentRow.agent_key, "agent");
  const attempt = asNumber(run.attempt_count) + 1;
  const maxAttempts = Math.max(asNumber(run.max_attempts, 3), 1);
  const plannedProvider = asString(input.provider, input.runtimeMode || "mock");
  const plannedModel = asString(input.model, input.runtimeMode === "mock" ? "betel-deterministic-v0" : "provider");

  if (attempt > maxAttempts) {
    await supabase
      .from("agent_runs")
      .update({
        status: "failed",
        error_message: `Limite de tentativas excedido (${maxAttempts}).`,
        completed_at: startedAt,
      })
      .eq("run_code", runCode);

    await logAgentRuntimeEvent(supabase, {
      runId: asString(run.id),
      runCode,
      agentKey,
      eventType: "runtime_retry_exhausted",
      status: "failed",
      provider: plannedProvider,
      model: plannedModel,
      attempt,
      message: `Run ${runCode} excedeu ${maxAttempts} tentativas.`,
      payload: { maxAttempts },
    });

    return { ok: false, error: `Run ${runCode} excedeu o limite de tentativas.` };
  }

  const { error: runningError } = await supabase
    .from("agent_runs")
    .update({
      status: "running",
      started_at: run.started_at || startedAt,
      attempt_count: attempt,
      max_attempts: maxAttempts,
      locked_at: startedAt,
      locked_by: input.operatorLabel || "Runtime Betel",
      provider: plannedProvider,
      model: plannedModel,
      output_payload: {
        ...existingOutput,
        runtimeMode: input.runtimeMode || "mock",
        runtimeStartedAt: startedAt,
        attempt,
        nextAction: "Runtime em execucao.",
      },
    })
    .eq("run_code", runCode);

  if (runningError) return { ok: false, error: runningError.message };

  await logAgentRuntimeEvent(supabase, {
    runId: asString(run.id),
    runCode,
    agentKey,
    eventType: "runtime_started",
    status: "running",
    provider: plannedProvider,
    model: plannedModel,
    attempt,
    message: `Worker iniciou ${runCode}.`,
    payload: {
      runtimeMode: input.runtimeMode || "mock",
      operatorLabel: input.operatorLabel || "Runtime Betel",
    },
  });

  const providerResult = await executeAgentRuntime({
    runCode,
    agentKey,
    agentName: asString(agentRow.name, "Agente IA"),
    role: asString(agentRow.role, "Executar etapa operacional."),
    promptName: asString(agentRow.prompt_name),
    promptVersion: asString(agentRow.prompt_version),
    systemPrompt: asString(agentRow.system_prompt),
    guardrails: asArray<string>(agentRow.guardrails, []),
    inputSummary: asString(inputPayload.summary, "Entrada sem resumo estruturado."),
    runtimeMode: input.runtimeMode || "mock",
    provider: input.provider,
    model: input.model,
    operatorLabel: input.operatorLabel || "Runtime Betel",
  });

  const durationMs = Date.now() - startedMs;
  const runtimeOutput = buildRuntimeOutput(
    run,
    input.runtimeMode || "mock",
    input.operatorLabel || "Runtime Betel",
    providerResult,
    attempt,
    durationMs
  );
  const completedAt = new Date().toISOString();

  const { error: completedError } = await supabase
    .from("agent_runs")
    .update({
      status: runtimeOutput.status,
      output_payload: {
        summary: runtimeOutput.summary,
        nextAction: runtimeOutput.nextAction,
        runtimeMode: input.runtimeMode || "mock",
        runtimeCompletedAt: completedAt,
        durationMs,
        attempt,
        agentKey: runtimeOutput.agentKey,
        promptName: asString(agentRow.prompt_name),
        promptVersion: asString(agentRow.prompt_version),
        provider: runtimeOutput.provider,
        model: runtimeOutput.model,
        providerStatus: runtimeOutput.providerStatus,
        providerError: providerResult.error,
        providerResponsePreview: providerResult.rawText,
        guardrails: asArray<string>(agentRow.guardrails, []),
      },
      human_review_status: runtimeOutput.humanReviewStatus,
      handoff_to: runtimeOutput.handoffTo,
      error_message: null,
      cost_estimate: runtimeOutput.costEstimate,
      provider: runtimeOutput.provider,
      model: runtimeOutput.model,
      locked_at: null,
      locked_by: null,
      completed_at: completedAt,
    })
    .eq("run_code", runCode);

  if (completedError) return { ok: false, error: completedError.message };

  await logAgentRuntimeEvent(supabase, {
    runId: asString(run.id),
    runCode,
    agentKey: runtimeOutput.agentKey,
    eventType: "runtime_completed",
    status: runtimeOutput.status,
    provider: runtimeOutput.provider,
    model: runtimeOutput.model,
    attempt,
    durationMs,
    costEstimate: runtimeOutput.costEstimate,
    message: runtimeOutput.summary,
    payload: {
      nextAction: runtimeOutput.nextAction,
      humanReviewStatus: runtimeOutput.humanReviewStatus,
      providerStatus: runtimeOutput.providerStatus,
    },
  });

  return { ok: true, data: runtimeOutput };
}

export async function runAgentPipelineRecord(
  input: RunAgentPipelineInput
): Promise<MutationResult<RunAgentPipelineOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Esteira real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const syncResult = await syncAgentWorkflowEdgesRecord();
  if (!syncResult.ok) return { ok: false, error: syncResult.error };

  const maxSteps = Math.max(1, Math.min(input.maxSteps || 4, 6));
  const createdRuns: string[] = [];
  const processedRuns: ProcessAgentRunOutput[] = [];
  let currentRunCode = input.startRunCode;

  if (!currentRunCode) {
    const seedRunCode = `RUN-PIPE-${Date.now().toString(36).toUpperCase()}`;
    const createResult = await createAgentRunRecord({
      agentKey: "source-scout",
      opportunityCode: input.opportunityCode,
      investorId: "",
      runCode: seedRunCode,
      status: "queued",
      triggerSource: "pipeline:captacao-curadoria-juridico",
      inputSummary:
        input.inputSummary ||
        "Piloto da esteira Betel: fonte homologada encontrou imovel candidato para captura, curadoria, risco oculto e revisao humana.",
      outputSummary: "",
      humanReviewStatus: "pendente",
      handoffTo: "",
      errorMessage: "",
      costEstimate: 0,
      startedAt: "",
      completedAt: "",
    });

    if (!createResult.ok || !createResult.data?.runCode) {
      return { ok: false, error: createResult.error || "Nao foi possivel criar o run inicial da esteira." };
    }

    currentRunCode = createResult.data.runCode;
    createdRuns.push(currentRunCode);
  }

  const startRunCode = currentRunCode;
  let stoppedReason = "Limite de etapas atingido.";

  for (let step = 0; step < maxSteps; step += 1) {
    const processResult = await processAgentRunRecord({
      runCode: currentRunCode,
      runtimeMode: input.runtimeMode || "mock",
      provider: input.provider,
      model: input.model,
      operatorLabel: input.operatorLabel || "Pipeline Betel",
    });

    if (!processResult.ok || !processResult.data) {
      return { ok: false, error: processResult.error || `Falha ao processar ${currentRunCode}.` };
    }

    const output = processResult.data;
    processedRuns.push(output);

    const nextEdge = findNextStaticWorkflowEdge(output.agentKey);
    const statusText = output.status.toLowerCase();

    if (!nextEdge) {
      stoppedReason = "Nao existe proximo agente configurado para esta etapa.";
      break;
    }

    if (
      nextEdge.requiresHumanApproval ||
      statusText.includes("waiting") ||
      statusText.includes("human") ||
      output.humanReviewStatus.toLowerCase().includes("pendente")
    ) {
      stoppedReason = `Gate humano aguardando aprovacao antes de ${nextEdge.toAgent}.`;
      break;
    }

    const handoffResult = await enqueueAgentHandoffRecord({
      currentRunCode: output.runCode,
      targetAgentKey: nextEdge.toAgentKey,
      transitionKey: nextEdge.key,
      inputSummary: `${output.summary} Proxima etapa: ${nextEdge.trigger}`,
    });

    if (!handoffResult.ok || !handoffResult.data?.runCode) {
      return { ok: false, error: handoffResult.error || "Nao foi possivel enfileirar o proximo agente." };
    }

    currentRunCode = handoffResult.data.runCode;
    createdRuns.push(currentRunCode);
    stoppedReason = `Proximo agente enfileirado: ${nextEdge.toAgent}.`;
  }

  return {
    ok: true,
    data: {
      startRunCode,
      finalRunCode: processedRuns.at(-1)?.runCode || currentRunCode,
      processedRuns,
      createdRuns,
      stoppedReason,
    },
  };
}

export async function updateAgentStatusRecord(
  agentKey: string,
  status: AgentStatus
): Promise<MutationResult<{ agentKey: string; status: AgentStatus }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Alteracao real de status exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const agentResult = await ensureAgentRecord(supabase, agentKey);
  if (!agentResult.ok) return { ok: false, error: agentResult.error };

  const { error } = await supabase.from("ai_agents").update({ status }).eq("agent_key", agentKey);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { agentKey, status } };
}

function communicationSelectionSet(values: string[] | undefined) {
  return new Set((values || []).map((value) => asString(value).trim()).filter(Boolean));
}

function recipientSelectionKeys(recipient: CommunicationRecipient) {
  return [
    recipient.recipientKey,
    recipient.investorId ? `investor:${recipient.investorId}` : "",
    recipient.email ? `investor:${recipient.email}` : "",
    recipient.phone ? `investor:${recipient.phone}` : "",
    recipient.email,
    recipient.phone,
  ].filter(Boolean);
}

function communicationRecipientMatchesSelection(
  recipient: CommunicationRecipient,
  recipientKeys: Set<string>,
  segmentKeys: Set<string>
) {
  if (!recipientKeys.size && !segmentKeys.size) return true;
  if (recipientSelectionKeys(recipient).some((key) => recipientKeys.has(key))) return true;
  if (segmentKeys.has("investors.all") && recipient.optInSource === "investor_profile") return true;
  if (segmentKeys.has("investors.premium") && recipient.fullAccess) return true;
  if (segmentKeys.has("community") && recipient.recipientKey === "community") return true;
  return false;
}

function filterCommunicationRecipientsByInput(
  recipients: CommunicationRecipient[],
  input: DispatchCommunicationInput
) {
  const recipientKeys = communicationSelectionSet(input.recipientKeys);
  const segmentKeys = communicationSelectionSet(input.recipientSegmentKeys);
  return recipients.filter((recipient) => communicationRecipientMatchesSelection(recipient, recipientKeys, segmentKeys));
}

function communicationTemplateKeyFor(
  target: CommunicationDispatchTarget,
  channel: string,
  detailLevel: string,
  override?: string
) {
  if (override) return override;
  const channelKey = normalizeCommunicationChannelKey(channel);
  if (target.key === "community" || channelKey === "community") return "opportunity.community";
  if (target.key === "cold_leads" || detailLevel === "teaser") return "opportunity.cold";
  return "opportunity.paid";
}

function opportunityAdminUrl(opportunityCode: string) {
  const baseUrl =
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "";
  const path = `/admin/oportunidades?codigo=${encodeURIComponent(opportunityCode)}`;
  if (!baseUrl) return path;
  try {
    return new URL(path, baseUrl).toString();
  } catch {
    return path;
  }
}

function communicationTemplateVariables(input: {
  target: CommunicationDispatchTarget;
  recipient: CommunicationRecipient;
  opportunity: AuctionOpportunity | null;
  opportunityCode: string;
  channel: string;
  detailLevel: string;
  messageIntent: string;
  operatorLabel: string;
  sourceRunCode: string;
}) {
  const opportunity = asRecord(input.opportunity);
  return {
    opportunity_code: input.opportunityCode,
    opportunity_title: asString(opportunity.title, input.opportunityCode),
    opportunity_city: asString(opportunity.city),
    opportunity_state: asString(opportunity.state),
    opportunity_type: asString(opportunity.propertyType),
    opportunity_url: opportunityAdminUrl(input.opportunityCode),
    recipient_name: input.recipient.label,
    recipient_email: input.recipient.email,
    recipient_phone: input.recipient.phone,
    recipient_plan: input.recipient.planKey,
    recipient_lifecycle: input.recipient.lifecycleStage,
    recipient_match_score: input.recipient.matchScore,
    target_label: input.target.label,
    target_rule: input.target.rule,
    recipient_guardrail: input.recipient.guardrail,
    detail_level: input.detailLevel,
    channel: input.channel,
    message_intent: input.messageIntent,
    operator_label: input.operatorLabel,
    source_run_code: input.sourceRunCode,
  };
}

function actionButtonFromPayload(value: unknown) {
  const button = asRecord(value);
  const label = asString(button.label);
  const url = asString(button.url);
  if (!label || !url) return undefined;
  return {
    label,
    url,
    footerText: asString(button.footerText, "Betel Leiloes"),
  };
}


export async function dispatchCommunicationRecord(
  input: DispatchCommunicationInput
): Promise<MutationResult<DispatchCommunicationOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Despacho real de comunicacao exige service role.",
    };
  }

  if (!input.sourceRunCode) {
    return { ok: false, error: "Run aprovado de origem nao informado para comunicacao." };
  }

  const { data: sourceRun, error: sourceError } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name), auction_opportunities(code, title)")
    .eq("run_code", input.sourceRunCode)
    .maybeSingle();

  if (sourceError) return { ok: false, error: sourceError.message };
  if (!sourceRun) return { ok: false, error: "Run aprovado de origem nao encontrado." };

  const sourceRow = sourceRun as AgentRunDbRow;
  const sourceAgentRow = asRecord(Array.isArray(sourceRow.ai_agents) ? sourceRow.ai_agents[0] : sourceRow.ai_agents);
  const sourceOpportunityRow = asRecord(
    Array.isArray(sourceRow.auction_opportunities) ? sourceRow.auction_opportunities[0] : sourceRow.auction_opportunities
  );
  const sourceInputPayload = asRecord(sourceRow.input_payload);
  const sourceOutputPayload = asRecord(sourceRow.output_payload);
  const sourceAgentKey = runAgentKey(sourceRow) || asString(sourceAgentRow.agent_key, "agent");
  const sourceReviewStatus = asString(sourceRow.human_review_status);
  const sourceStatus = asString(sourceRow.status);
  const releaseError = isCommunicationReleaseRun(sourceRow) ? "" : communicationReleaseError(sourceRow);

  if (releaseError) {
    return {
      ok: false,
      error: releaseError,
    };
  }

  const opportunityCode = asString(
    input.opportunityCode,
    asString(sourceInputPayload.opportunityCode, asString(sourceOpportunityRow.code, "BC-204"))
  );
  const investorId = input.investorId || asString(sourceInputPayload.investorId);
  const operatorLabel = input.operatorLabel || "Growth Betel";
  const messageIntent =
    input.messageIntent ||
    "Preparar comunicacao supervisionada de oportunidade aprovada, respeitando plano, contrato e nivel de detalhe.";
  const targets = getCommunicationDispatchTargets(input.audienceScope);
  const channels = uniqueCommunicationChannels(input.channels?.length ? input.channels : ["WhatsApp", "Email"]);
  const createdRuns: DispatchCommunicationOutput["createdRuns"] = [];
  const outboxWarnings: string[] = [];
  let outboxCount = 0;

  if (!targets.length) {
    return { ok: false, error: "Publico de comunicacao nao reconhecido." };
  }

  const sourceOpportunityId = asString(sourceRow.opportunity_id);
  const opportunityQuery = sourceOpportunityId
    ? supabase.from("auction_opportunities").select("*").eq("id", sourceOpportunityId).maybeSingle()
    : supabase.from("auction_opportunities").select("*").eq("code", opportunityCode).maybeSingle();
  const { data: opportunityData, error: opportunityError } = await opportunityQuery;

  if (opportunityError) {
    outboxWarnings.push(`Oportunidade nao carregada do Supabase: ${opportunityError.message}`);
  }

  const opportunityRow = opportunityData as OpportunityDbRow | null;
  const opportunity = opportunityRow ? normalizeOpportunity(opportunityRow) : getOpportunityById(opportunityCode) || null;
  const opportunityDbId = asString(opportunityRow?.id, sourceOpportunityId);

  let investorRows: InvestorDbRow[] = [];
  if (looksLikeUuid(investorId)) {
    const { data, error } = await supabase.from("investor_profiles").select("*").eq("id", investorId).limit(1);
    if (error) return { ok: false, error: error.message };
    investorRows = (data || []) as InvestorDbRow[];
  } else {
    const { data, error } = await supabase
      .from("investor_profiles")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) return { ok: false, error: error.message };
    investorRows = (data || []) as InvestorDbRow[];
  }

  let investors = investorRows.map((row) => normalizeInvestor(row));
  if (investorId) {
    const requestedId = investorId.toLowerCase();
    const requestedMock = getMockInvestorById(investorId);
    investors = investors.filter((investor) => investor.id.toLowerCase() === requestedId);
    if (!investors.length && requestedMock) investors = [requestedMock];
  }

  if (!investors.length) {
    investors = investorProfiles;
    outboxWarnings.push("Nenhum investidor real encontrado; usando perfis demonstrativos para manter a fila rastreavel.");
  }

  const activeInvestors = investors.filter((investor) => !investorCommunicationPaused(investor));
  if (activeInvestors.length < investors.length) {
    outboxWarnings.push("Investidores pausados ou descadastrados foram ignorados no despacho.");
  }

  let matchRows: CommunicationMatchRow[] = [];
  if (opportunityDbId) {
    const { data, error } = await supabase
      .from("opportunity_matches")
      .select("investor_id, match_score, status, rationale")
      .eq("opportunity_id", opportunityDbId);

    if (error) {
      outboxWarnings.push(`Matches nao carregados; usando score calculado: ${error.message}`);
    } else {
      matchRows = (data || []) as CommunicationMatchRow[];
    }
  }

  for (const [index, target] of targets.entries()) {
    const recipients = filterCommunicationRecipientsByInput(
      buildCommunicationRecipientsForTarget(target, activeInvestors, opportunity, matchRows, channels),
      input
    );
    const runChannels = uniqueCommunicationChannels(recipients.flatMap((recipient) => recipient.channels));

    if (!recipients.length || !runChannels.length) {
      outboxWarnings.push(`Nenhum destinatario elegivel para ${target.label}.`);
      continue;
    }

    const runCode = `RUN-COMM-${Date.now().toString(36).toUpperCase()}-${target.key
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase()}-${index + 1}`;
    const runInvestorId =
      recipients.length === 1 && looksLikeUuid(recipients[0]?.investorId) ? recipients[0]?.investorId || "" : "";
    const runResult = await createAgentRunRecord({
      agentKey: target.agentKey,
      opportunityCode,
      investorId: runInvestorId,
      runCode,
      status: "queued",
      triggerSource: `communication_dispatch:${input.sourceRunCode}:${target.key}`,
      inputSummary: [
        `Despacho aprovado por ${operatorLabel}.`,
        `Origem: ${input.sourceRunCode} (${sourceAgentKey}).`,
        `Oportunidade: ${opportunityCode}.`,
        `Publico: ${target.label}.`,
        `Destinatarios elegiveis: ${recipients.length}.`,
        `Canais: ${runChannels.join(", ")}.`,
        `Nivel: ${target.detailLevel}.`,
        `Regra: ${target.rule}`,
        `Intencao: ${messageIntent}`,
        `Resumo aprovado: ${asString(sourceOutputPayload.summary, asString(sourceOutputPayload.nextAction))}`,
      ].join(" "),
      outputSummary: "",
      humanReviewStatus: "aprovado_para_comunicacao",
      handoffTo: runChannels.join(", "),
      errorMessage: "",
      costEstimate: 0,
      startedAt: "",
      completedAt: "",
    });

    if (!runResult.ok || !runResult.data?.runCode) {
        return {
        ok: false,
        error: runResult.error || `Nao foi possivel criar run de comunicacao para ${target.label}.`,
        };
    }

    const createdRunCode = runResult.data.runCode;

    createdRuns.push({
      runCode: createdRunCode,
      agentKey: target.agentKey,
      audience: target.label,
      detailLevel: target.detailLevel,
      channels: runChannels,
      recipientCount: recipients.length,
    });

    const outboxRowsNested = await Promise.all(
      recipients.map(async (recipient, recipientIndex) =>
        Promise.all(recipient.channels.map(async (channel, channelIndex) => {
        const channelKey = normalizeCommunicationChannelKey(channel);
        const detailLevel = recipient.detailLevel;
        const cadence = buildCommunicationSchedule(target, recipient, channel, recipientIndex, channelIndex);
        const templateKey = communicationTemplateKeyFor(target, channel, detailLevel, input.templateKey);
        const rendered = await renderMessageTemplate({
          templateKey,
          channel: channelKey,
          audienceKey: target.key,
          variables: communicationTemplateVariables({
            target,
            recipient,
            opportunity,
            opportunityCode,
            channel,
            detailLevel,
            messageIntent,
            operatorLabel,
            sourceRunCode: input.sourceRunCode,
          }),
        });

        return {
          message_code: makeCommunicationMessageCode(createdRunCode, recipient.recipientKey, channel),
        run_code: createdRunCode,
        agent_key: target.agentKey,
        opportunity_code: opportunityCode,
        investor_id: looksLikeUuid(recipient.investorId) ? recipient.investorId : null,
        audience_key: target.key,
        audience_label: target.label,
          channel,
          detail_level: detailLevel,
          status: "draft",
          scheduled_for: cadence.scheduledFor,
          recipient_label: recipient.label,
          subject: rendered.subject || `Oportunidade ${opportunityCode} - ${recipient.label}`,
          message_preview: rendered.body || messagePreviewForDetail(detailLevel),
        guardrail_summary: rendered.guardrailSummary || `${target.rule} ${recipient.guardrail}`.trim(),
        payload: {
          sourceRunCode: input.sourceRunCode,
          sourceAgentKey,
          sourceRunStatus: sourceStatus,
          sourceHumanReviewStatus: sourceReviewStatus,
          complianceReleasedAt: asString(sourceRow.completed_at),
          audienceScope: input.audienceScope,
          messageIntent,
          operatorLabel,
          detailLevel,
          channel,
          channelKey,
          templateKey: rendered.template.templateKey,
          templateVersion: rendered.template.version,
          templateAudienceKey: rendered.template.audienceKey,
          missingTemplateVariables: rendered.missingVariables,
          actionButton: rendered.actionButton,
          opportunityCode,
          recipient: {
            investorId: recipient.investorId,
            label: recipient.label,
            email: recipient.email,
            phone: recipient.phone,
            planKey: recipient.planKey,
            lifecycleStage: recipient.lifecycleStage,
            communicationFrequency: recipient.communicationFrequency,
            matchScore: recipient.matchScore,
            fullAccess: recipient.fullAccess,
            optInSource: recipient.optInSource,
          },
          cadence,
          guardrails: [target.rule, recipient.guardrail],
        },
      };
        }))
      )
    );
    const outboxRows = outboxRowsNested.flat();

    const { error: outboxError } = await supabase
      .from("communication_outbox")
      .upsert(outboxRows, { onConflict: "message_code" });

    if (outboxError) {
      outboxWarnings.push(outboxError.message);
    } else {
      outboxCount += outboxRows.length;
      await Promise.all(
        outboxRows.map((row) =>
          logInvestorCommunicationEvent(supabase, {
            outbox: row,
            eventType: "queued",
            status: "draft",
            scheduledFor: row.scheduled_for,
            payload: {
              cadence: asRecord(row.payload).cadence,
              source: "dispatchCommunicationRecord",
            },
          })
        )
      );
    }

    await logAgentRuntimeEvent(supabase, {
      runId: "",
      runCode: createdRunCode,
      agentKey: target.agentKey,
      eventType: "communication_dispatch_queued",
      status: "queued",
      provider: "manual",
      model: "communication-dispatch",
      attempt: 1,
      message: `Despacho ${target.label} enfileirado por ${operatorLabel}.`,
      payload: {
        sourceRunCode: input.sourceRunCode,
        sourceAgentKey,
        audienceScope: input.audienceScope,
        channels: runChannels,
        detailLevel: target.detailLevel,
        opportunityCode,
        recipientCount: recipients.length,
        outboxCount: outboxRows.length,
        investors: recipients.slice(0, 12).map((recipient) => ({
          investorId: recipient.investorId,
          label: recipient.label,
          planKey: recipient.planKey,
          detailLevel: recipient.detailLevel,
          matchScore: recipient.matchScore,
          channels: recipient.channels,
        })),
      },
    });
  }

  return {
    ok: true,
    data: {
      sourceRunCode: input.sourceRunCode,
      createdRuns,
      outboxCount,
      outboxWarnings: Array.from(new Set(outboxWarnings)),
      stoppedReason: `${createdRuns.length} runs de comunicacao e ${outboxCount} mensagens de outbox enfileirados sem envio externo direto.`,
    },
  };
}

const communicationOutboxQueueStatuses = ["draft", "queued", "retry"];
const minuteMs = 60 * 1000;
const hourMs = 60 * minuteMs;

function clampCommunicationBatchSize(value: number) {
  return Math.max(1, Math.min(Math.trunc(value || 5), 20));
}

function clampCommunicationMaxAttempts(value: number | undefined) {
  return Math.max(1, Math.min(Math.trunc(value || 3), 8));
}

function getCommunicationBackoffMs(attempt: number) {
  const minutes = Math.min(90, Math.max(2, attempt * attempt * 2));
  return minutes * 60 * 1000;
}

function channelCadenceOffsetMs(channel: string) {
  const channelKey = normalizeCommunicationChannelKey(channel);
  if (channelKey === "email") return 10 * minuteMs;
  if (channelKey === "push") return 15 * minuteMs;
  if (channelKey === "community") return 0;
  return 0;
}

function buildCommunicationSchedule(
  target: CommunicationDispatchTarget,
  recipient: CommunicationRecipient,
  channel: string,
  recipientIndex: number,
  channelIndex: number
) {
  const frequency = normalizeCommunicationToken(recipient.communicationFrequency || "normal");
  const channelOffset = channelCadenceOffsetMs(channel) + channelIndex * 2 * minuteMs;
  const spacing = target.key === "cold_leads" ? 8 * minuteMs : 3 * minuteMs;
  let baseDelay = 0;

  if (target.key === "cold_leads") baseDelay = 45 * minuteMs;
  if (target.key === "community") baseDelay = 2 * hourMs;
  if (target.key === "multichannel" && !recipient.fullAccess) baseDelay = 30 * minuteMs;
  if (frequency.includes("low")) baseDelay += 12 * hourMs;
  if (frequency.includes("high")) baseDelay = Math.max(0, baseDelay - 15 * minuteMs);

  const delayMs = baseDelay + recipientIndex * spacing + channelOffset;
  const scheduledFor = delayMs > 0 ? new Date(Date.now() + delayMs).toISOString() : null;
  const delayMinutes = Math.round(delayMs / minuteMs);

  return {
    scheduledFor,
    label: delayMinutes > 0 ? `agendado +${delayMinutes}min` : "imediato",
    delayMinutes,
  };
}

function communicationCadenceWindowMs(channel: string, payload: Record<string, unknown>) {
  const recipient = asRecord(payload.recipient);
  const fullAccess = asBoolean(recipient.fullAccess);
  const detailLevel = normalizeCommunicationToken(asString(payload.detailLevel));
  const channelKey = normalizeCommunicationChannelKey(channel);
  const isTeaser = detailLevel.includes("teaser") || !fullAccess;

  if (channelKey === "community") return 0;
  if (channelKey === "push") return isTeaser ? 24 * hourMs : 2 * hourMs;
  if (channelKey === "email") return isTeaser ? 24 * hourMs : 4 * hourMs;
  if (channelKey === "whatsapp") return isTeaser ? 48 * hourMs : 6 * hourMs;
  return isTeaser ? 24 * hourMs : 4 * hourMs;
}

function shouldRespectScheduledFor(outbox: CommunicationOutboxDbRow) {
  const scheduledFor = asString(outbox.scheduled_for);
  if (!scheduledFor) return { due: true };

  const dueAt = Date.parse(scheduledFor);
  if (!Number.isFinite(dueAt) || dueAt <= Date.now()) return { due: true };

  return {
    due: false,
    nextAllowedAt: scheduledFor,
    reason: `Mensagem agendada para ${scheduledFor}.`,
  };
}

async function evaluateCommunicationCadence(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  outbox: CommunicationOutboxDbRow,
  payload: Record<string, unknown>
) {
  const investorId = asString(outbox.investor_id);
  const channel = asString(outbox.channel, "Canal");
  const windowMs = communicationCadenceWindowMs(channel, payload);

  if (!looksLikeUuid(investorId) || windowMs <= 0) return { allowed: true };

  const { data, error } = await supabase
    .from("investor_communication_events")
    .select("message_code, processed_at, created_at")
    .eq("investor_id", investorId)
    .eq("channel", channel)
    .eq("event_type", "sent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return { allowed: true, warning: `Cadencia nao verificada: ${error.message}` };
  }

  const lastSentAt = asString(data?.processed_at, asString(data?.created_at));
  const lastSentMs = lastSentAt ? Date.parse(lastSentAt) : NaN;
  if (!Number.isFinite(lastSentMs)) return { allowed: true };

  const nextAllowedMs = lastSentMs + windowMs;
  if (nextAllowedMs <= Date.now()) return { allowed: true };

  return {
    allowed: false,
    reason: `Cadencia protege ${channel}: ultimo envio em ${lastSentAt}.`,
    nextAllowedAt: new Date(nextAllowedMs).toISOString(),
    lastSentAt,
    cadenceWindowHours: Math.round(windowMs / hourMs),
  };
}

type InvestorCommunicationEventLogInput = {
  outbox?: CommunicationOutboxDbRow;
  eventType: string;
  status: string;
  provider?: string;
  providerStatus?: string;
  adapterLabel?: string;
  attempt?: number;
  scheduledFor?: string | null;
  processedAt?: string | null;
  payload?: Record<string, unknown>;
};

async function logInvestorCommunicationEvent(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  input: InvestorCommunicationEventLogInput
) {
  const outbox = input.outbox || {};
  const payload = asRecord(outbox.payload);

  await supabase.from("investor_communication_events").insert({
    investor_id: looksLikeUuid(asString(outbox.investor_id)) ? asString(outbox.investor_id) : null,
    message_code: asString(outbox.message_code),
    run_code: asString(outbox.run_code),
    agent_key: asString(outbox.agent_key),
    opportunity_code: asString(outbox.opportunity_code),
    audience_key: asString(outbox.audience_key),
    audience_label: asString(outbox.audience_label),
    channel: asString(outbox.channel, "Canal"),
    detail_level: asString(outbox.detail_level),
    event_type: input.eventType,
    status: input.status,
    recipient_label: asString(outbox.recipient_label),
    provider: input.provider || "",
    provider_status: input.providerStatus || "",
    adapter_label: input.adapterLabel || "",
    attempt: input.attempt || 0,
    scheduled_for: input.scheduledFor || asString(outbox.scheduled_for) || null,
    processed_at: input.processedAt || null,
    payload: {
      ...payload,
      ...(input.payload || {}),
    },
  });
}

async function selectDueCommunicationOutboxRows(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  limit: number
) {
  const nowIso = new Date().toISOString();
  return supabase
    .from("communication_outbox")
    .select("*")
    .in("status", communicationOutboxQueueStatuses)
    .or(`scheduled_for.is.null,scheduled_for.lte.${nowIso}`)
    .order("created_at", { ascending: true })
    .limit(limit);
}

async function countPendingCommunicationOutbox(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>
) {
  const { count } = await supabase
    .from("communication_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", communicationOutboxQueueStatuses);

  return count || 0;
}

function normalizeCommunicationSchedulerInput(input: CommunicationSchedulerInput) {
  return {
    dryRun: input.dryRun !== false,
    batchSize: clampCommunicationBatchSize(input.batchSize || 5),
    adapterMode: input.adapterMode || "mock",
    provider: input.provider || "sandbox",
    operatorLabel: input.operatorLabel || "Communication Scheduler Betel",
    allowExternal: Boolean(input.allowExternal),
    providerReleaseConfirmed: Boolean(input.providerReleaseConfirmed),
    forceFail: Boolean(input.forceFail),
    maxAttempts: clampCommunicationMaxAttempts(input.maxAttempts),
    triggerSource: input.triggerSource || "scheduler",
  };
}

const communicationSchedulerLockKey = "communication_scheduler_lock";
const communicationSchedulerLockTtlMs = 9 * 60 * 1000;

type CommunicationSchedulerLock = {
  acquired: boolean;
  token?: string;
  reason?: string;
};

function parseCommunicationSchedulerLock(value: unknown) {
  try {
    return asRecord(JSON.parse(asString(value, "{}")));
  } catch {
    return {};
  }
}

function makeCommunicationSchedulerLockValue(token: string, owner: string) {
  const acquiredAt = new Date();
  return JSON.stringify({
    token,
    owner,
    acquiredAt: acquiredAt.toISOString(),
    expiresAt: new Date(acquiredAt.getTime() + communicationSchedulerLockTtlMs).toISOString(),
  });
}

function isCommunicationSchedulerLockExpired(lock: Record<string, unknown>) {
  const expiresAt = asString(lock.expiresAt);
  return !expiresAt || Date.parse(expiresAt) <= Date.now();
}

async function acquireCommunicationSchedulerLock(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  owner: string
): Promise<CommunicationSchedulerLock> {
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const nextValue = makeCommunicationSchedulerLockValue(token, owner);

  const inserted = await supabase
    .from("app_config")
    .insert({
      key: communicationSchedulerLockKey,
      value: nextValue,
      description: "Best-effort lock para evitar sobreposicao do cron de comunicacao.",
      is_secret: false,
    })
    .select("value")
    .maybeSingle();

  if (!inserted.error && asString(inserted.data?.value).includes(token)) {
    return { acquired: true, token };
  }

  const current = await supabase
    .from("app_config")
    .select("value")
    .eq("key", communicationSchedulerLockKey)
    .maybeSingle();

  if (current.error) {
    return { acquired: false, reason: current.error.message };
  }

  const currentValue = asString(current.data?.value);
  const currentLock = parseCommunicationSchedulerLock(currentValue);

  if (!isCommunicationSchedulerLockExpired(currentLock)) {
    const ownerLabel = asString(currentLock.owner, "outro scheduler");
    const expiresAt = asString(currentLock.expiresAt, "em instantes");
    return {
      acquired: false,
      reason: `Scheduler ja esta em execucao por ${ownerLabel}. Lock expira em ${expiresAt}.`,
    };
  }

  const updated = await supabase
    .from("app_config")
    .update({
      value: nextValue,
      description: "Best-effort lock para evitar sobreposicao do cron de comunicacao.",
      is_secret: false,
    })
    .eq("key", communicationSchedulerLockKey)
    .eq("value", currentValue)
    .select("value")
    .maybeSingle();

  if (!updated.error && asString(updated.data?.value).includes(token)) {
    return { acquired: true, token };
  }

  return {
    acquired: false,
    reason: updated.error?.message || "Outro ciclo assumiu o lock do scheduler agora.",
  };
}

async function releaseCommunicationSchedulerLock(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  token: string,
  owner: string
) {
  const current = await supabase
    .from("app_config")
    .select("value")
    .eq("key", communicationSchedulerLockKey)
    .maybeSingle();

  if (current.error) return;

  const currentLock = parseCommunicationSchedulerLock(current.data?.value);
  if (asString(currentLock.token) !== token) return;

  await supabase
    .from("app_config")
    .update({
      value: JSON.stringify({
        token: "",
        owner,
        releasedAt: new Date().toISOString(),
        expiresAt: new Date(0).toISOString(),
      }),
      description: "Best-effort lock para evitar sobreposicao do cron de comunicacao.",
      is_secret: false,
    })
    .eq("key", communicationSchedulerLockKey);
}

export async function previewCommunicationSchedulerRecord(
  input: CommunicationSchedulerInput = {}
): Promise<MutationResult<CommunicationSchedulerOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Scheduler de comunicacao exige service role.",
    };
  }

  const normalized = normalizeCommunicationSchedulerInput(input);
  const { data: outboxRows, error: outboxError } = await selectDueCommunicationOutboxRows(
    supabase,
    normalized.batchSize
  );

  if (outboxError) return { ok: false, error: outboxError.message };

  const rows = ((outboxRows || []) as CommunicationOutboxDbRow[]).filter((row) => asString(row.message_code));
  const pendingBefore = await countPendingCommunicationOutbox(supabase);
  const skippedReason = rows.length
    ? undefined
    : "Nenhuma mensagem elegivel no momento. A fila permanece aguardando novas mensagens ou retries vencidos.";

  return {
    ok: true,
    data: {
      dryRun: true,
      triggerSource: normalized.triggerSource,
      requested: normalized.batchSize,
      eligibleCount: rows.length,
      pendingBefore,
      pendingAfter: pendingBefore,
      adapterMode: normalized.adapterMode,
      provider: normalized.provider,
      allowExternal: normalized.allowExternal,
      providerReleaseConfirmed: normalized.providerReleaseConfirmed,
      eligible: rows.map(normalizeCommunicationOutbox),
      skippedReason,
    },
  };
}

export async function runCommunicationSchedulerRecord(
  input: CommunicationSchedulerInput = {}
): Promise<MutationResult<CommunicationSchedulerOutput>> {
  const normalized = normalizeCommunicationSchedulerInput(input);

  if (normalized.dryRun) {
    const preview = await previewCommunicationSchedulerRecord({ ...normalized, dryRun: true });

    if (!preview.ok || !preview.data) return preview;

    return {
      ok: true,
      data: {
        ...preview.data,
        dryRun: true,
        skippedReason:
          preview.data.skippedReason ||
          "Dry-run concluido. Nenhuma entrega foi processada e nenhum provider externo foi acionado.",
      },
    };
  }

  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Scheduler de comunicacao exige service role.",
    };
  }

  const lock = await acquireCommunicationSchedulerLock(supabase, normalized.triggerSource);

  if (!lock.acquired || !lock.token) {
    const pendingBefore = await countPendingCommunicationOutbox(supabase);

    return {
      ok: true,
      data: {
        dryRun: false,
        triggerSource: normalized.triggerSource,
        requested: normalized.batchSize,
        eligibleCount: 0,
        pendingBefore,
        pendingAfter: pendingBefore,
        adapterMode: normalized.adapterMode,
        provider: normalized.provider,
        allowExternal: normalized.allowExternal,
        providerReleaseConfirmed: normalized.providerReleaseConfirmed,
        eligible: [],
        skippedReason: lock.reason || "Scheduler ignorado porque outro ciclo esta ativo.",
      },
    };
  }

  try {
    const preview = await previewCommunicationSchedulerRecord({ ...normalized, dryRun: true });

    if (!preview.ok || !preview.data) return preview;

    const batch = await processCommunicationOutboxBatchRecord({
      processBatch: true,
      batchSize: normalized.batchSize,
      adapterMode: normalized.adapterMode,
      provider: normalized.provider,
      operatorLabel: normalized.operatorLabel,
      allowExternal: normalized.allowExternal,
      providerReleaseConfirmed: normalized.providerReleaseConfirmed,
      forceFail: normalized.forceFail,
      maxAttempts: normalized.maxAttempts,
    });

    if (!batch.ok || !batch.data) return { ok: false, error: batch.error || "Scheduler nao conseguiu rodar o worker." };

    return {
      ok: true,
      data: {
        ...preview.data,
        dryRun: false,
        pendingAfter: batch.data.pendingAfter,
        batch: batch.data,
        skippedReason: batch.data.stoppedReason,
      },
    };
  } finally {
    await releaseCommunicationSchedulerLock(supabase, lock.token, normalized.triggerSource);
  }
}

export async function processCommunicationOutboxRecord(
  input: ProcessCommunicationOutboxInput
): Promise<MutationResult<ProcessCommunicationOutboxOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Entrega de comunicacao exige service role.",
    };
  }

  if (!input.messageCode && !input.processNext) {
    return { ok: false, error: "Informe messageCode ou use processNext para processar a proxima mensagem." };
  }

  let outboxData: unknown = null;
  let outboxError: { message: string } | null = null;

  if (input.messageCode) {
    const result = await supabase
      .from("communication_outbox")
      .select("*")
      .eq("message_code", input.messageCode)
      .limit(1)
      .maybeSingle();
    outboxData = result.data;
    outboxError = result.error;
  } else {
    const result = await selectDueCommunicationOutboxRows(supabase, 1);
    outboxData = result.data?.[0] || null;
    outboxError = result.error;
  }

  if (outboxError) return { ok: false, error: outboxError.message };
  if (!outboxData) return { ok: false, error: "Mensagem de outbox nao encontrada para entrega." };

  const outbox = outboxData as CommunicationOutboxDbRow;
  const messageCode = asString(outbox.message_code, input.messageCode);
  const runCode = asString(outbox.run_code, "RUN-COMM");
  const agentKey = asString(outbox.agent_key, "multichannel-dispatch");
  const channel = asString(outbox.channel, "Canal");
  const audience = asString(outbox.audience_label, asString(outbox.audience_key, "Publico"));
  const currentStatus = asString(outbox.status, "draft").toLowerCase();

  if (currentStatus === "sent") {
    return { ok: false, error: `Mensagem ${messageCode} ja consta como enviada.` };
  }

  const payload = asRecord(outbox.payload);
  const schedule = shouldRespectScheduledFor(outbox);
  const currentAttempt = Math.max(asNumber(payload.deliveryAttempt), asArray<Record<string, unknown>>(payload.deliveryHistory, []).length);
  const maxAttempts = clampCommunicationMaxAttempts(input.maxAttempts);
  const operatorLabel = input.operatorLabel || "Delivery Betel";

  if (!schedule.due) {
    const processedAt = new Date().toISOString();

    await logAgentRuntimeEvent(supabase, {
      runId: asString(outbox.run_id),
      runCode,
      agentKey,
      eventType: "communication_delivery_scheduled_wait",
      status: "retry",
      provider: input.provider || input.adapterMode || "scheduler",
      model: "delivery-cadence",
      attempt: currentAttempt,
      message: `${messageCode} ainda nao esta na janela de envio. ${schedule.reason}`,
      payload: {
        messageCode,
        channel,
        audience,
        nextRetryAt: schedule.nextAllowedAt,
        reason: schedule.reason,
        processedAt,
      },
    });

    return {
      ok: true,
      data: {
        messageCode,
        runCode,
        agentKey,
        channel,
        audience,
        status: "retry",
        providerStatus: "scheduled_wait",
        attempt: currentAttempt,
        latencyMs: 0,
        adapterLabel: "Cadencia Betel",
        errorMessage: schedule.reason,
      },
    };
  }

  const cadence = await evaluateCommunicationCadence(supabase, outbox, payload);

  if (cadence.warning) {
    await logAgentRuntimeEvent(supabase, {
      runId: asString(outbox.run_id),
      runCode,
      agentKey,
      eventType: "communication_cadence_warning",
      status: "warning",
      provider: input.provider || input.adapterMode || "scheduler",
      model: "delivery-cadence",
      attempt: currentAttempt,
      message: cadence.warning,
      payload: { messageCode, channel, audience },
    });
  }

  if (!cadence.allowed) {
    const processedAt = new Date().toISOString();
    const nextRetryAt = cadence.nextAllowedAt || new Date(Date.now() + hourMs).toISOString();
    const cadenceEntry = {
      messageCode,
      runCode,
      agentKey,
      channel,
      audience,
      operatorLabel,
      status: "retry",
      providerStatus: "cadence_delayed",
      adapterLabel: "Cadencia Betel",
      attempt: currentAttempt,
      processedAt,
      nextRetryAt,
      reason: cadence.reason,
      lastSentAt: cadence.lastSentAt,
      cadenceWindowHours: cadence.cadenceWindowHours,
    };

    const { error: cadenceUpdateError } = await supabase
      .from("communication_outbox")
      .update({
        status: "retry",
        error_message: cadence.reason || null,
        scheduled_for: nextRetryAt,
        updated_at: processedAt,
        payload: {
          ...payload,
          nextRetryAt,
          cadenceDelayedAt: processedAt,
          lastCadenceDecision: cadenceEntry,
          cadenceHistory: [...asArray<Record<string, unknown>>(payload.cadenceHistory, []).slice(-9), cadenceEntry],
        },
      })
      .eq("message_code", messageCode);

    if (cadenceUpdateError) return { ok: false, error: cadenceUpdateError.message };

    await logInvestorCommunicationEvent(supabase, {
      outbox,
      eventType: "cadence_delayed",
      status: "retry",
      provider: input.provider || input.adapterMode || "scheduler",
      providerStatus: "cadence_delayed",
      adapterLabel: "Cadencia Betel",
      attempt: currentAttempt,
      scheduledFor: nextRetryAt,
      processedAt,
      payload: cadenceEntry,
    });

    await logAgentRuntimeEvent(supabase, {
      runId: asString(outbox.run_id),
      runCode,
      agentKey,
      eventType: "communication_delivery_cadence_delayed",
      status: "retry",
      provider: input.provider || input.adapterMode || "scheduler",
      model: "delivery-cadence",
      attempt: currentAttempt,
      message: `${messageCode} adiada por cadencia. Proxima janela: ${nextRetryAt}.`,
      payload: cadenceEntry,
    });

    return {
      ok: true,
      data: {
        messageCode,
        runCode,
        agentKey,
        channel,
        audience,
        status: "retry",
        providerStatus: "cadence_delayed",
        attempt: currentAttempt,
        latencyMs: 0,
        adapterLabel: "Cadencia Betel",
        errorMessage: cadence.reason,
      },
    };
  }

  const history = asArray<Record<string, unknown>>(payload.deliveryHistory, []);
  const attempt = currentAttempt + 1;
  const adapterResult = await executeCommunicationDeliveryAdapter({
    messageCode,
    runCode,
    agentKey,
    channel,
    audience,
    recipientLabel: asString(outbox.recipient_label, audience),
    subject: asString(outbox.subject, `Oportunidade ${asString(outbox.opportunity_code, "Betel")}`),
    messagePreview: asString(outbox.message_preview),
    guardrailSummary: asString(outbox.guardrail_summary),
    actionButton: actionButtonFromPayload(payload.actionButton),
    payload,
    adapterMode: input.adapterMode || "mock",
    provider: input.provider,
    operatorLabel,
    attempt,
    allowExternal: Boolean(input.allowExternal),
    providerReleaseConfirmed: Boolean(input.providerReleaseConfirmed),
    forceFail: Boolean(input.forceFail),
  });
  const isSuccess = adapterResult.status === "sent";
  const retryable = !isSuccess && attempt < maxAttempts;
  const finalStatus = isSuccess ? "sent" : retryable ? "retry" : "failed";
  const nextRetryAt = retryable ? new Date(Date.now() + getCommunicationBackoffMs(attempt)).toISOString() : undefined;
  const errorMessage = adapterResult.errorMessage;
  const deliveryEntry = {
    messageCode,
    runCode,
    agentKey,
    channel,
    audience,
    adapterMode: adapterResult.adapterMode,
    provider: adapterResult.provider,
    adapterLabel: adapterResult.adapterLabel,
    channelKey: adapterResult.channelKey,
    endpointConfigured: adapterResult.endpointConfigured,
    providerReleased: adapterResult.providerReleased,
    operatorLabel,
    status: finalStatus,
    adapterStatus: adapterResult.status,
    providerStatus: adapterResult.providerStatus,
    attempt,
    maxAttempts,
    latencyMs: adapterResult.latencyMs,
    processedAt: adapterResult.processedAt,
    nextRetryAt,
    externalDeliveryId: adapterResult.externalDeliveryId,
    responsePreview: adapterResult.responsePreview,
    errorMessage,
  };

  const { error: updateError } = await supabase
    .from("communication_outbox")
    .update({
      status: finalStatus,
      sent_at: isSuccess ? adapterResult.processedAt : null,
      error_message: errorMessage || null,
      scheduled_for: nextRetryAt || null,
      updated_at: adapterResult.processedAt,
      payload: {
        ...payload,
        deliveryAttempt: attempt,
        deliveryStatus: finalStatus,
        adapterStatus: adapterResult.status,
        maxAttempts,
        nextRetryAt: nextRetryAt || null,
        lastDelivery: deliveryEntry,
        deliveryHistory: [...history.slice(-9), deliveryEntry],
      },
    })
    .eq("message_code", messageCode);

  if (updateError) return { ok: false, error: updateError.message };

  await logInvestorCommunicationEvent(supabase, {
    outbox,
    eventType: isSuccess ? "sent" : retryable ? "retry_scheduled" : "failed",
    status: finalStatus,
    provider: adapterResult.provider,
    providerStatus: adapterResult.providerStatus,
    adapterLabel: adapterResult.adapterLabel,
    attempt,
    scheduledFor: nextRetryAt || null,
    processedAt: adapterResult.processedAt,
    payload: deliveryEntry,
  });

  await logAgentRuntimeEvent(supabase, {
    runId: asString(outbox.run_id),
    runCode,
    agentKey,
    eventType: isSuccess
      ? "communication_delivery_sent"
      : retryable
        ? "communication_delivery_retry_scheduled"
        : "communication_delivery_failed",
    status: finalStatus,
    provider: adapterResult.provider,
    model: `delivery-${adapterResult.adapterMode}`,
    attempt,
    durationMs: adapterResult.latencyMs,
    message: isSuccess
      ? `Mensagem ${messageCode} entregue por ${adapterResult.adapterLabel} para ${audience}.`
      : `Mensagem ${messageCode} falhou em ${adapterResult.adapterLabel}: ${errorMessage}`,
    payload: deliveryEntry,
  });

  const data: ProcessCommunicationOutboxOutput = {
    messageCode,
    runCode,
    agentKey,
    channel,
    audience,
    status: finalStatus,
    providerStatus: adapterResult.providerStatus,
    attempt,
    latencyMs: adapterResult.latencyMs,
    adapterLabel: adapterResult.adapterLabel,
  };

  if (isSuccess) data.sentAt = adapterResult.processedAt;
  if (errorMessage) data.errorMessage = errorMessage;
  if (adapterResult.externalDeliveryId) data.externalDeliveryId = adapterResult.externalDeliveryId;

  return {
    ok: true,
    data,
  };
}

export async function processCommunicationOutboxBatchRecord(
  input: ProcessCommunicationOutboxBatchInput
): Promise<MutationResult<ProcessCommunicationOutboxBatchOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Worker de comunicacao exige service role.",
    };
  }

  if (!input.processBatch) {
    return { ok: false, error: "Confirme processBatch para executar o worker de comunicacao." };
  }

  const batchSize = clampCommunicationBatchSize(input.batchSize);
  const { data: outboxRows, error: outboxError } = await selectDueCommunicationOutboxRows(supabase, batchSize);

  if (outboxError) return { ok: false, error: outboxError.message };

  const rows = ((outboxRows || []) as CommunicationOutboxDbRow[]).filter((row) => asString(row.message_code));
  const processed: ProcessCommunicationOutboxOutput[] = [];
  const failed: ProcessCommunicationOutboxBatchOutput["failed"] = [];

  for (const row of rows) {
    const messageCode = asString(row.message_code);
    const result = await processCommunicationOutboxRecord({
      messageCode,
      adapterMode: input.adapterMode || "mock",
      provider: input.provider,
      operatorLabel: input.operatorLabel || "Delivery Worker Betel",
      allowExternal: Boolean(input.allowExternal),
      providerReleaseConfirmed: Boolean(input.providerReleaseConfirmed),
      forceFail: Boolean(input.forceFail),
      maxAttempts: input.maxAttempts,
    });

    if (result.ok && result.data) {
      processed.push(result.data);
    } else {
      failed.push({
        messageCode,
        error: result.error || "Falha desconhecida no processamento do outbox.",
      });
    }
  }

  const pendingAfter = await countPendingCommunicationOutbox(supabase);
  const stoppedReason = rows.length
    ? `Worker processou ${processed.length} de ${rows.length} mensagens elegiveis.`
    : "Nenhuma mensagem elegivel para entrega neste ciclo.";

  await logAgentRuntimeEvent(supabase, {
    runId: "",
    runCode: `COMM-WORKER-${Date.now().toString(36).toUpperCase()}`,
    agentKey: "multichannel-dispatch",
    eventType: "communication_worker_cycle",
    status: failed.length ? "retry" : "completed",
    provider: input.provider || input.adapterMode || "mock",
    model: `delivery-batch-${input.adapterMode || "mock"}`,
    attempt: 1,
    message: `${stoppedReason} Pendentes apos ciclo: ${pendingAfter}.`,
    payload: {
      requested: batchSize,
      processed: processed.length,
      failed: failed.length,
      pendingAfter,
      allowExternal: Boolean(input.allowExternal),
      providerReleaseConfirmed: Boolean(input.providerReleaseConfirmed),
      adapterMode: input.adapterMode || "mock",
    },
  });

  return {
    ok: true,
    data: {
      requested: batchSize,
      processed,
      failed,
      pendingAfter,
      stoppedReason,
    },
  };
}

export async function getAgentByKey(agentKey: string): Promise<DataResult<AgentProfileData>> {
  const staticMatch = findStaticAgent(agentKey);
  const supabase = getSupabaseAdminClient();

  const fallbackProfile = (): AgentProfileData => {
    const agent = staticMatch?.agent;
    const group = staticMatch?.group;
    return {
      key: agentKey,
      name: agent?.name || "Agente IA",
      role: agent?.role || "",
      description: "",
      avatarIcon: "",
      status: agent?.status || "planned",
      tone: toneForAgentStatus(agent?.status || "planned"),
      group: {
        key: group?.key || "",
        name: group?.name || "",
        eyebrow: group?.eyebrow || "",
      },
      department: "",
      promptName: agent?.promptName || "",
      promptVersion: agent?.promptVersion || "v0.1",
      systemPrompt: getAgentSystemPrompt(agentKey) || "",
      triggerType: agent?.trigger || "",
      inputs: agent?.inputs || [],
      outputs: agent?.outputs || [],
      guardrails: agent?.guardrails || [],
      runtimeMode: "mock",
      preferredProvider: "",
      preferredModel: "",
      maxCostPerRun: 0,
      dailyRunLimit: 0,
      runsToday: 0,
      lastRunAt: "",
      lastRunStatus: "",
      reportsTo: "Admin Betel",
      recentRuns: [],
      runtimeEvents: [],
      prompts: [],
    };
  };

  if (!staticMatch && !supabase) {
    return { data: fallbackProfile(), source: "mock", reason: "Agente nao encontrado." };
  }

  if (!supabase) {
    return { data: fallbackProfile(), source: "mock", reason: mockReason };
  }

  const [agentResult, runsResult, eventsResult, promptsResult] = await Promise.all([
    supabase
      .from("ai_agents")
      .select("*, agent_groups(group_key, name)")
      .eq("agent_key", agentKey)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("agent_runs")
      .select("*, ai_agents(agent_key, name), auction_opportunities(code, title)")
      .eq("agent_key", agentKey)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_runtime_events")
      .select("*")
      .eq("agent_key", agentKey)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("agent_prompt_registry")
      .select("*")
      .eq("agent_key", agentKey)
      .order("updated_at", { ascending: false })
      .limit(10),
  ]);

  const row = agentResult.data as AgentDbRow | null;
  const agent = staticMatch?.agent;
  const group = staticMatch?.group;
  const groupRow = row ? (row.agent_groups || row.group) as Record<string, unknown> | null : null;
  const status = normalizeAgentStatus(row?.status || agent?.status);

  const profile: AgentProfileData = {
    key: agentKey,
    name: asString(row?.name, agent?.name || "Agente IA"),
    role: asString(row?.role, agent?.role || ""),
    description: asString(row?.description, ""),
    avatarIcon: asString(row?.avatar_icon, ""),
    status,
    tone: toneForAgentStatus(status),
    group: {
      key: asString(groupRow?.group_key, group?.key || ""),
      name: asString(groupRow?.name, group?.name || ""),
      eyebrow: group?.eyebrow || "",
    },
    department: asString(row?.department, ""),
    promptName: asString(row?.prompt_name, agent?.promptName || ""),
    promptVersion: asString(row?.prompt_version, agent?.promptVersion || "v0.1"),
    systemPrompt: asString(row?.system_prompt, getAgentSystemPrompt(agentKey) || ""),
    triggerType: asString(row?.trigger_type, agent?.trigger || ""),
    inputs: row ? asStringList(row.inputs) : (agent?.inputs || []),
    outputs: row ? asStringList(row.outputs) : (agent?.outputs || []),
    guardrails: row ? asStringList(row.guardrails) : (agent?.guardrails || []),
    runtimeMode: asString(row?.runtime_mode, "mock"),
    preferredProvider: asString(row?.preferred_provider, ""),
    preferredModel: asString(row?.preferred_model, ""),
    maxCostPerRun: asNumber(row?.max_cost_per_run, 0),
    dailyRunLimit: asNumber(row?.daily_run_limit, 0),
    runsToday: asNumber(row?.runs_today, 0),
    lastRunAt: asString(row?.last_run_at, ""),
    lastRunStatus: asString(row?.last_run_status, ""),
    reportsTo: asString(row?.owner_label, "Admin Betel"),
    recentRuns: runsResult.error ? [] : ((runsResult.data || []) as AgentRunDbRow[]).map(normalizeAgentRun),
    runtimeEvents: eventsResult.error ? [] : ((eventsResult.data || []) as AgentRuntimeEventDbRow[]).map(normalizeRuntimeEvent),
    prompts: promptsResult.error ? [] : ((promptsResult.data || []) as AgentPromptRegistryDbRow[]).map(normalizePromptRegistry),
  };

  return { data: profile, source: row ? "supabase" : "mock", reason: row ? undefined : mockReason };
}

export async function getAgentRunHistory(
  agentKey: string,
  limit = 50
): Promise<DataResult<AgentRunSample[]>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { data: [], source: "mock", reason: mockReason };
  }

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name), auction_opportunities(code, title)")
    .eq("agent_key", agentKey)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], source: "mock", reason: error.message };
  }

  return {
    data: ((data || []) as AgentRunDbRow[]).map(normalizeAgentRun),
    source: "supabase",
  };
}

export async function updateAgentProfileRecord(
  agentKey: string,
  input: UpdateAgentProfileInput
): Promise<MutationResult<{ agentKey: string }>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return { ok: false, error: "Supabase admin nao configurado." };
  }

  const agentResult = await ensureAgentRecord(supabase, agentKey);
  if (!agentResult.ok) return { ok: false, error: agentResult.error };

  const updates: Record<string, unknown> = {};
  if (input.status !== undefined) updates.status = input.status;
  if (input.description !== undefined) updates.description = input.description;
  if (input.avatarIcon !== undefined) updates.avatar_icon = input.avatarIcon;
  if (input.systemPrompt !== undefined) updates.system_prompt = input.systemPrompt;
  if (input.runtimeMode !== undefined) updates.runtime_mode = input.runtimeMode;
  if (input.preferredProvider !== undefined) updates.preferred_provider = input.preferredProvider;
  if (input.preferredModel !== undefined) updates.preferred_model = input.preferredModel;
  if (input.maxCostPerRun !== undefined) updates.max_cost_per_run = input.maxCostPerRun;
  if (input.dailyRunLimit !== undefined) updates.daily_run_limit = input.dailyRunLimit;

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { agentKey } };
  }

  updates.updated_at = new Date().toISOString();

  const { error } = await supabase.from("ai_agents").update(updates).eq("agent_key", agentKey);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { agentKey } };
}
