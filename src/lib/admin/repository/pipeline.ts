import "server-only";

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
  makeSnapshotCuratorRunCode,
  buildSnapshotCurationSummary,
  getAnalysisRunForSnapshot,
  updateSourceIntakeAnalysisRun,
  type ProcessAgentRunOutput,
} from "./shared";
import {
  processAgentRunRecord,
  enqueueAgentHandoffRecord,
  resolveHumanGateRecord,
  dispatchCommunicationRecord,
  createAgentRunRecord,
} from "./agents-comms";

export async function processSourceSnapshotRecord(
  input: ProcessSourceSnapshotInput
): Promise<MutationResult<ProcessSourceSnapshotOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Curadoria de captura exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const snapshotKey = input.snapshotId || input.snapshotCode || "";
  if (!snapshotKey) return { ok: false, error: "Snapshot nao informado para curadoria." };

  const { data: snapshotData, error: snapshotError } = looksLikeUuid(snapshotKey)
    ? await supabase.from("source_snapshots").select("*").eq("id", snapshotKey).limit(1).maybeSingle()
    : await supabase.from("source_snapshots").select("*").eq("snapshot_code", snapshotKey).limit(1).maybeSingle();

  if (snapshotError) return { ok: false, error: snapshotError.message };
  if (!snapshotData) return { ok: false, error: "Snapshot nao encontrado." };

  const snapshot = snapshotData as SourceSnapshotDbRow;
  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const opportunityId = asString(snapshot.opportunity_id);
  const sourceId = asString(snapshot.source_id);

  if (!opportunityId) return { ok: false, error: "Snapshot nao esta ligado a uma oportunidade." };

  const [sourceResult, opportunityResult, agentResult, analysisResult] = await Promise.all([
    sourceId
      ? supabase.from("auction_sources").select("*").eq("id", sourceId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from("auction_opportunities").select("*").eq("id", opportunityId).maybeSingle(),
    ensureAgentRecord(supabase, "notice-curator"),
    supabase
      .from("ai_analysis_runs")
      .select("*")
      .eq("opportunity_id", opportunityId)
      .eq("run_type", "source_intake")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (sourceResult.error) return { ok: false, error: sourceResult.error.message };
  if (opportunityResult.error) return { ok: false, error: opportunityResult.error.message };
  if (!opportunityResult.data) return { ok: false, error: "Oportunidade do snapshot nao encontrada." };
  if (!agentResult.ok || !agentResult.data?.id) {
    return { ok: false, error: agentResult.error || "Nao foi possivel preparar o agente curador." };
  }
  if (analysisResult.error) return { ok: false, error: analysisResult.error.message };

  const source = (sourceResult.data || {}) as AuctionSourceDbRow;
  const opportunity = opportunityResult.data as OpportunityDbRow;
  const opportunityCode = asString(opportunity.code);
  const runCode = makeSnapshotCuratorRunCode(snapshotCode);
  const now = new Date().toISOString();
  const operatorLabel = input.operatorLabel || "Curadoria Betel";
  const runtimeMode = input.runtimeMode || "mock";
  const provider = input.provider || (runtimeMode === "mock" ? "mock" : "");
  const model = input.model || (runtimeMode === "mock" ? "betel-deterministic-v0" : "");
  const summary = buildSnapshotCurationSummary(snapshot, source, opportunity);

  const { error: runInsertError } = await supabase.from("agent_runs").insert({
    agent_id: agentResult.data.id,
    opportunity_id: opportunityId,
    run_code: runCode,
    status: input.processNow === false ? "queued" : "queued",
    trigger_source: `source_snapshot:${snapshotCode}`,
    input_payload: {
      summary,
      snapshotId: asString(snapshot.id),
      snapshotCode,
      sourceId,
      sourceName: asString(source.name),
      sourceUrl: asString(snapshot.source_url, asString(source.url)),
      opportunityCode,
      createdFrom: "source_snapshot_curation",
    },
    output_payload: {
      summary: "",
      nextAction: "Executar curadoria inicial do snapshot e preparar handoff para risco oculto.",
      snapshotCode,
    },
    human_review_status: "pendente",
    handoff_to: "Agente Risco Oculto",
    provider,
    model,
  });

  if (runInsertError) return { ok: false, error: runInsertError.message };

  await supabase
    .from("source_snapshots")
    .update({
      status: input.processNow === false ? "queued_for_curation" : "curating",
      extracted_payload: {
        ...asRecord(snapshot.extracted_payload),
        curatorRunCode: runCode,
        curationStatus: input.processNow === false ? "queued_for_curation" : "curating",
        curationQueuedAt: now,
      },
    })
    .eq("id", asString(snapshot.id));

  const analysisRun = getAnalysisRunForSnapshot((analysisResult.data || []) as AiAnalysisRunDbRow[], snapshotCode);
  const analysisRunCode = await updateSourceIntakeAnalysisRun(supabase, analysisRun, {
    opportunityId,
    snapshotCode,
    status: input.processNow === false ? "queued_for_curation" : "running",
    agentRunCode: runCode,
  });

  if (input.processNow === false) {
    await supabase.from("audit_logs").insert({
      opportunity_id: opportunityId,
      actor_name: operatorLabel,
      event_type: "source_snapshot_curation_queued",
      status: "queued",
      payload: { snapshotCode, agentRunCode: runCode, analysisRunCode },
    });

    return {
      ok: true,
      data: {
        snapshotCode,
        opportunityCode,
        agentRunCode: runCode,
        analysisRunCode,
        snapshotStatus: "queued_for_curation",
        agentRunStatus: "queued",
        nextAction: "Run de curadoria enfileirado.",
      },
    };
  }

  const processed = await processAgentRunRecord({
    runCode,
    runtimeMode,
    operatorLabel,
    provider,
    model,
  });

  if (!processed.ok || !processed.data) {
    await supabase
      .from("source_snapshots")
      .update({
        status: "curation_failed",
        extracted_payload: {
          ...asRecord(snapshot.extracted_payload),
          curatorRunCode: runCode,
          curationStatus: "failed",
          curationError: processed.error || "Falha no runtime do agente curador.",
          curationCompletedAt: new Date().toISOString(),
        },
      })
      .eq("id", asString(snapshot.id));

    return { ok: false, error: processed.error || "Falha no runtime do agente curador." };
  }

  const runtimeOutput = processed.data;
  const finalSnapshotStatus = runtimeOutput.status === "completed" ? "curated" : "curation_attention";
  const mergedExtracted = {
    ...asRecord(snapshot.extracted_payload),
    curatorRunCode: runCode,
    curationStatus: finalSnapshotStatus,
    curationCompletedAt: new Date().toISOString(),
    summary: runtimeOutput.summary,
    nextAction: runtimeOutput.nextAction,
    handoffTo: runtimeOutput.handoffTo,
    humanReviewStatus: runtimeOutput.humanReviewStatus,
    provider: runtimeOutput.provider,
    model: runtimeOutput.model,
    providerStatus: runtimeOutput.providerStatus,
    costEstimate: runtimeOutput.costEstimate,
  };

  await supabase
    .from("source_snapshots")
    .update({
      status: finalSnapshotStatus,
      extracted_payload: mergedExtracted,
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      ai_status: runtimeOutput.status === "completed" ? "Curadoria preliminar" : "Requer humano",
      stage: runtimeOutput.status === "completed" ? "Risco oculto" : asString(opportunity.stage, "Curadoria IA"),
      next_action: runtimeOutput.nextAction,
      timeline: [
        ...currentTimeline,
        {
          time: new Date().toISOString(),
          actor: "Agente Curador de Edital",
          action: runtimeOutput.summary,
          tone: runtimeOutput.status === "completed" ? "purple" : "yellow",
        },
      ],
    })
    .eq("id", opportunityId);

  await updateSourceIntakeAnalysisRun(supabase, analysisRun, {
    opportunityId,
    snapshotCode,
    status: finalSnapshotStatus,
    agentRunCode: runCode,
    runtimeOutput,
  });

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: operatorLabel,
    event_type: "source_snapshot_curated",
    status: finalSnapshotStatus,
    payload: {
      snapshotCode,
      agentRunCode: runCode,
      analysisRunCode,
      summary: runtimeOutput.summary,
      nextAction: runtimeOutput.nextAction,
      costEstimate: runtimeOutput.costEstimate,
      provider: runtimeOutput.provider,
      model: runtimeOutput.model,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode,
      agentRunCode: runCode,
      analysisRunCode,
      snapshotStatus: finalSnapshotStatus,
      agentRunStatus: runtimeOutput.status,
      nextAction: runtimeOutput.nextAction,
    },
  };
}

export async function enqueueHiddenRiskFromSnapshotRecord(
  input: EnqueueHiddenRiskInput
): Promise<MutationResult<EnqueueHiddenRiskOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Handoff de risco oculto exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  let snapshotKey = input.snapshotId || input.snapshotCode || "";

  if (!snapshotKey && input.curatorRunCode) {
    const { data: curatorRun, error: curatorLookupError } = await supabase
      .from("agent_runs")
      .select("input_payload")
      .eq("run_code", input.curatorRunCode)
      .maybeSingle();

    if (curatorLookupError) return { ok: false, error: curatorLookupError.message };
    snapshotKey = asString(asRecord((curatorRun as AgentRunDbRow | null)?.input_payload).snapshotCode);
  }

  if (!snapshotKey) return { ok: false, error: "Snapshot nao informado para handoff de risco oculto." };

  const { data: snapshotData, error: snapshotError } = looksLikeUuid(snapshotKey)
    ? await supabase.from("source_snapshots").select("*").eq("id", snapshotKey).limit(1).maybeSingle()
    : await supabase.from("source_snapshots").select("*").eq("snapshot_code", snapshotKey).limit(1).maybeSingle();

  if (snapshotError) return { ok: false, error: snapshotError.message };
  if (!snapshotData) return { ok: false, error: "Snapshot nao encontrado." };

  const snapshot = snapshotData as SourceSnapshotDbRow;
  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const curatorRunCode = input.curatorRunCode || asString(extractedPayload.curatorRunCode);

  if (!curatorRunCode) {
    return {
      ok: false,
      error: "Execute a curadoria do snapshot antes de acionar o agente de risco oculto.",
    };
  }

  const { data: curatorRunData, error: curatorRunError } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name)")
    .eq("run_code", curatorRunCode)
    .maybeSingle();

  if (curatorRunError) return { ok: false, error: curatorRunError.message };
  if (!curatorRunData) return { ok: false, error: "Run de curadoria nao encontrado." };

  const curatorRun = curatorRunData as AgentRunDbRow;
  const curatorAgent = asRecord(Array.isArray(curatorRun.ai_agents) ? curatorRun.ai_agents[0] : curatorRun.ai_agents);
  const curatorAgentKey = asString(curatorAgent.agent_key);
  const curatorStatus = asString(curatorRun.status);

  if (curatorAgentKey && curatorAgentKey !== "notice-curator") {
    return { ok: false, error: "O run informado nao pertence ao Agente Curador de Edital." };
  }

  if (curatorStatus !== "completed") {
    return { ok: false, error: "A curadoria precisa estar concluida antes do risco oculto." };
  }

  const opportunityId = asString(snapshot.opportunity_id);
  if (!opportunityId) return { ok: false, error: "Snapshot nao esta ligado a uma oportunidade." };

  const { data: opportunityData, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunityData) return { ok: false, error: "Oportunidade do snapshot nao encontrada." };

  const opportunity = opportunityData as OpportunityDbRow;
  const opportunityCode = asString(opportunity.code);
  const curatorOutput = asRecord(curatorRun.output_payload);
  const rawPayload = asRecord(snapshot.raw_payload);
  const now = new Date().toISOString();
  const operatorLabel = input.operatorLabel || "Risco Oculto Betel";
  const runtimeMode = input.runtimeMode || "mock";
  const provider = input.provider || (runtimeMode === "mock" ? "mock" : "");
  const model = input.model || (runtimeMode === "mock" ? "betel-deterministic-v0" : "");
  const inputSummary = [
    "Risco oculto a partir da curadoria preliminar do edital.",
    `Snapshot: ${snapshotCode}.`,
    `Oportunidade: ${opportunityCode} - ${asString(opportunity.title, asString(snapshot.title))}.`,
    `Run de curadoria: ${curatorRunCode}.`,
    "",
    "Resumo da curadoria:",
    clampAdminText(asString(curatorOutput.summary, "Curadoria sem resumo estruturado."), 1400),
    "",
    "Proxima acao da curadoria:",
    clampAdminText(asString(curatorOutput.nextAction, "Cruzar edital com APIs externas."), 900),
    "",
    "Tarefa do agente de risco oculto:",
    "1. Procurar riscos fora do edital.",
    "2. Separar ocupacao, debitos, processo, matricula e divergencias de fonte.",
    "3. Marcar o que exige advogado ou API externa.",
    "4. Nao liberar comunicacao externa sem revisao humana.",
    "",
    `Payload extraido: ${clampAdminText(JSON.stringify(extractedPayload), 1200)}`,
    `Payload bruto: ${clampAdminText(JSON.stringify(rawPayload), 1200)}`,
  ].join("\n");

  const handoff = await enqueueAgentHandoffRecord({
    currentRunCode: curatorRunCode,
    targetAgentKey: "hidden-risk",
    transitionKey: "notice-curator-to-hidden-risk",
    inputSummary,
  });

  if (!handoff.ok || !handoff.data?.runCode) {
    return { ok: false, error: handoff.error || "Nao foi possivel enfileirar risco oculto." };
  }

  const hiddenRiskRunCode = handoff.data.runCode;
  const queuedPayload = {
    ...extractedPayload,
    curatorRunCode,
    hiddenRiskRunCode,
    hiddenRiskStatus: input.processNow === false ? "queued" : "running",
    hiddenRiskQueuedAt: now,
  };

  await supabase
    .from("source_snapshots")
    .update({
      status: input.processNow === false ? "hidden_risk_queued" : "hidden_risk_running",
      extracted_payload: queuedPayload,
    })
    .eq("id", asString(snapshot.id));

  if (input.processNow === false) {
    await supabase.from("audit_logs").insert({
      opportunity_id: opportunityId,
      actor_name: operatorLabel,
      event_type: "hidden_risk_queued",
      status: "queued",
      payload: { snapshotCode, curatorRunCode, hiddenRiskRunCode },
    });

    return {
      ok: true,
      data: {
        snapshotCode,
        opportunityCode,
        curatorRunCode,
        hiddenRiskRunCode,
        hiddenRiskStatus: "queued",
        nextAction: "Run de risco oculto enfileirado.",
      },
    };
  }

  const processed = await processAgentRunRecord({
    runCode: hiddenRiskRunCode,
    runtimeMode,
    operatorLabel,
    provider,
    model,
  });

  if (!processed.ok || !processed.data) {
    await supabase
      .from("source_snapshots")
      .update({
        status: "hidden_risk_failed",
        extracted_payload: {
          ...queuedPayload,
          hiddenRiskStatus: "failed",
          hiddenRiskError: processed.error || "Falha no runtime do agente de risco oculto.",
          hiddenRiskCompletedAt: new Date().toISOString(),
        },
      })
      .eq("id", asString(snapshot.id));

    return { ok: false, error: processed.error || "Falha no runtime do agente de risco oculto." };
  }

  const runtimeOutput = processed.data;
  const finalSnapshotStatus = runtimeOutput.status === "completed" ? "risk_screened" : "risk_attention";
  const hiddenRiskPayload = {
    ...queuedPayload,
    hiddenRiskStatus: finalSnapshotStatus,
    hiddenRiskCompletedAt: new Date().toISOString(),
    hiddenRiskSummary: runtimeOutput.summary,
    hiddenRiskNextAction: runtimeOutput.nextAction,
    hiddenRiskHandoffTo: runtimeOutput.handoffTo,
    hiddenRiskHumanReviewStatus: runtimeOutput.humanReviewStatus,
    hiddenRiskCostEstimate: runtimeOutput.costEstimate,
    hiddenRiskProvider: runtimeOutput.provider,
    hiddenRiskModel: runtimeOutput.model,
  };

  await supabase
    .from("source_snapshots")
    .update({
      status: finalSnapshotStatus,
      extracted_payload: hiddenRiskPayload,
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      ai_status: runtimeOutput.status === "completed" ? "Risco oculto triado" : "Requer humano",
      stage: "Revisao humana",
      next_action: runtimeOutput.nextAction,
      timeline: [
        ...currentTimeline,
        {
          time: new Date().toISOString(),
          actor: "Agente Risco Oculto",
          action: runtimeOutput.summary,
          tone: runtimeOutput.status === "completed" ? "red" : "yellow",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: operatorLabel,
    event_type: "hidden_risk_screened",
    status: finalSnapshotStatus,
    payload: {
      snapshotCode,
      curatorRunCode,
      hiddenRiskRunCode,
      summary: runtimeOutput.summary,
      nextAction: runtimeOutput.nextAction,
      costEstimate: runtimeOutput.costEstimate,
      provider: runtimeOutput.provider,
      model: runtimeOutput.model,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode,
      curatorRunCode,
      hiddenRiskRunCode,
      hiddenRiskStatus: finalSnapshotStatus,
      nextAction: runtimeOutput.nextAction,
    },
  };
}

function makeHumanReviewCode(opportunityCode: string, snapshotCode: string) {
  const cleanOpportunity = opportunityCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase() || "OPP";
  const cleanSnapshot = snapshotCode.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || "SRC";
  return `REV-${cleanOpportunity}-${cleanSnapshot}`;
}

function makeHumanAlertCode(opportunityCode: string, snapshotCode: string) {
  const cleanOpportunity = opportunityCode.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12).toUpperCase() || "OPP";
  const cleanSnapshot = snapshotCode.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase() || "SRC";
  return `ALT-${cleanOpportunity}-${cleanSnapshot}`;
}

async function findAgentRunByPreviousRun(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  opportunityId: string,
  previousRunCode: string,
  agentKey: string
) {
  if (!opportunityId || !previousRunCode) return null;

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name)")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) throw new Error(error.message);

  return ((data || []) as AgentRunDbRow[]).find((run) => {
    const inputPayload = asRecord(run.input_payload);
    const agentRow = asRecord(Array.isArray(run.ai_agents) ? run.ai_agents[0] : run.ai_agents);
    return asString(inputPayload.previousRunCode) === previousRunCode && asString(agentRow.agent_key) === agentKey;
  }) || null;
}

export async function enqueueHumanReviewFromSnapshotRecord(
  input: EnqueueHumanReviewInput
): Promise<MutationResult<EnqueueHumanReviewOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Handoff humano exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  let snapshotKey = input.snapshotId || input.snapshotCode || "";

  if (!snapshotKey && input.hiddenRiskRunCode) {
    const { data: hiddenRiskRun, error: hiddenRiskLookupError } = await supabase
      .from("agent_runs")
      .select("input_payload")
      .eq("run_code", input.hiddenRiskRunCode)
      .maybeSingle();

    if (hiddenRiskLookupError) return { ok: false, error: hiddenRiskLookupError.message };
    snapshotKey = asString(asRecord((hiddenRiskRun as AgentRunDbRow | null)?.input_payload).snapshotCode);
  }

  if (!snapshotKey) return { ok: false, error: "Snapshot nao informado para handoff humano." };

  const { data: snapshotData, error: snapshotError } = looksLikeUuid(snapshotKey)
    ? await supabase.from("source_snapshots").select("*").eq("id", snapshotKey).limit(1).maybeSingle()
    : await supabase.from("source_snapshots").select("*").eq("snapshot_code", snapshotKey).limit(1).maybeSingle();

  if (snapshotError) return { ok: false, error: snapshotError.message };
  if (!snapshotData) return { ok: false, error: "Snapshot nao encontrado." };

  const snapshot = snapshotData as SourceSnapshotDbRow;
  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const hiddenRiskRunCode = input.hiddenRiskRunCode || asString(extractedPayload.hiddenRiskRunCode);

  if (!hiddenRiskRunCode) {
    return {
      ok: false,
      error: "Execute risco oculto antes de acionar revisao humana.",
    };
  }

  const { data: hiddenRiskRunData, error: hiddenRiskRunError } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name)")
    .eq("run_code", hiddenRiskRunCode)
    .maybeSingle();

  if (hiddenRiskRunError) return { ok: false, error: hiddenRiskRunError.message };
  if (!hiddenRiskRunData) return { ok: false, error: "Run de risco oculto nao encontrado." };

  const hiddenRiskRun = hiddenRiskRunData as AgentRunDbRow;
  const hiddenRiskAgent = asRecord(Array.isArray(hiddenRiskRun.ai_agents) ? hiddenRiskRun.ai_agents[0] : hiddenRiskRun.ai_agents);
  const hiddenRiskAgentKey = asString(hiddenRiskAgent.agent_key);
  const hiddenRiskStatus = asString(hiddenRiskRun.status);

  if (hiddenRiskAgentKey && hiddenRiskAgentKey !== "hidden-risk") {
    return { ok: false, error: "O run informado nao pertence ao Agente Risco Oculto." };
  }

  if (hiddenRiskStatus !== "completed") {
    return { ok: false, error: "Risco oculto precisa estar concluido antes do handoff humano." };
  }

  const opportunityId = asString(snapshot.opportunity_id);
  if (!opportunityId) return { ok: false, error: "Snapshot nao esta ligado a uma oportunidade." };

  const { data: opportunityData, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunityData) return { ok: false, error: "Oportunidade do snapshot nao encontrada." };

  const opportunity = opportunityData as OpportunityDbRow;
  const opportunityCode = asString(opportunity.code);
  const operatorLabel = input.operatorLabel || "Handoff Humano Betel";
  const reviewerLabel = input.reviewerLabel || "Juridico Betel";
  const runtimeMode = input.runtimeMode || "mock";
  const provider = input.provider || (runtimeMode === "mock" ? "mock" : "");
  const model = input.model || (runtimeMode === "mock" ? "betel-deterministic-v0" : "");
  const hiddenRiskOutput = asRecord(hiddenRiskRun.output_payload);
  const reviewCode = makeHumanReviewCode(opportunityCode, snapshotCode);
  const alertCode = makeHumanAlertCode(opportunityCode, snapshotCode);
  const now = new Date().toISOString();
  const slaDueAt = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();

  let humanHandoffRun = await findAgentRunByPreviousRun(supabase, opportunityId, hiddenRiskRunCode, "human-handoff");

  if (!humanHandoffRun) {
    const inputSummary = [
      "Preparar handoff humano/juridico a partir do risco oculto.",
      `Snapshot: ${snapshotCode}.`,
      `Oportunidade: ${opportunityCode} - ${asString(opportunity.title, asString(snapshot.title))}.`,
      `Run de risco oculto: ${hiddenRiskRunCode}.`,
      "",
      "Resumo do risco oculto:",
      clampAdminText(asString(hiddenRiskOutput.summary, "Risco oculto sem resumo estruturado."), 1500),
      "",
      "Proxima acao do risco oculto:",
      clampAdminText(asString(hiddenRiskOutput.nextAction, "Enviar para revisor humano."), 900),
      "",
      "Tarefa do agente de handoff:",
      "1. Preparar resumo claro para advogado ou responsavel interno.",
      "2. Listar pendencias, evidencias e decisao esperada.",
      "3. Bloquear publicacao ate aprovacao humana.",
      "4. Registrar SLA, responsavel e status no sistema.",
    ].join("\n");

    const handoff = await enqueueAgentHandoffRecord({
      currentRunCode: hiddenRiskRunCode,
      targetAgentKey: "human-handoff",
      transitionKey: "hidden-risk-to-human-handoff",
      inputSummary,
    });

    if (!handoff.ok || !handoff.data?.runCode) {
      return { ok: false, error: handoff.error || "Nao foi possivel enfileirar handoff humano." };
    }

    const { data: createdRun, error: createdRunError } = await supabase
      .from("agent_runs")
      .select("*, ai_agents(agent_key, name)")
      .eq("run_code", handoff.data.runCode)
      .maybeSingle();

    if (createdRunError) return { ok: false, error: createdRunError.message };
    humanHandoffRun = (createdRun || null) as AgentRunDbRow | null;
  }

  if (!humanHandoffRun) return { ok: false, error: "Run de handoff humano nao encontrado apos enfileirar." };

  let humanHandoffRunCode = asString(humanHandoffRun.run_code);

  if (input.processNow !== false && ["queued", "planned"].includes(asString(humanHandoffRun.status))) {
    const processed = await processAgentRunRecord({
      runCode: humanHandoffRunCode,
      runtimeMode,
      operatorLabel,
      provider,
      model,
    });

    if (!processed.ok || !processed.data) {
      return { ok: false, error: processed.error || "Falha no runtime do handoff humano." };
    }
  }

  const { data: refreshedRun, error: refreshError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("run_code", humanHandoffRunCode)
    .maybeSingle();

  if (refreshError) return { ok: false, error: refreshError.message };
  const finalRun = (refreshedRun || humanHandoffRun) as AgentRunDbRow;
  humanHandoffRunCode = asString(finalRun.run_code, humanHandoffRunCode);
  const finalRunStatus = asString(finalRun.status, "queued");
  const finalOutput = asRecord(finalRun.output_payload);

  const reviewNotes = [
    `Snapshot: ${snapshotCode}.`,
    `Risco oculto: ${hiddenRiskRunCode}.`,
    `Handoff humano: ${humanHandoffRunCode}.`,
    asString(finalOutput.summary, asString(hiddenRiskOutput.summary, "Aguardando parecer humano.")),
  ].join("\n\n");

  await supabase.from("legal_reviews").upsert(
    {
      opportunity_id: opportunityId,
      review_code: reviewCode,
      topic: "Parecer humano sobre risco oculto",
      status: "pending",
      reviewer_name: reviewerLabel,
      sla_due_at: slaDueAt,
      decision: null,
      notes: reviewNotes,
    },
    { onConflict: "review_code" }
  );

  await supabase.from("admin_alerts").upsert(
    {
      opportunity_id: opportunityId,
      alert_code: alertCode,
      title: `Revisao humana pendente: ${opportunityCode}`,
      severity: "high",
      status: "open",
      owner_name: reviewerLabel,
      message: `Risco oculto concluiu e requer revisao humana antes de compliance/comunicacao. Snapshot ${snapshotCode}.`,
      resolved_at: null,
    },
    { onConflict: "alert_code" }
  );

  await supabase
    .from("source_snapshots")
    .update({
      status: "waiting_human_review",
      extracted_payload: {
        ...extractedPayload,
        hiddenRiskRunCode,
        humanHandoffRunCode,
        humanHandoffStatus: finalRunStatus,
        legalReviewCode: reviewCode,
        adminAlertCode: alertCode,
        humanReviewStatus: "pending",
        humanReviewQueuedAt: now,
      },
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      legal_status: "Aguardando revisao humana",
      stage: "Revisao juridica",
      next_action: "Advogado/responsavel deve revisar risco oculto antes de compliance e comunicacao.",
      timeline: [
        ...currentTimeline,
        {
          time: new Date().toISOString(),
          actor: "Agente Handoff Humano",
          action: `Revisao humana ${reviewCode} aberta para ${reviewerLabel}.`,
          tone: "yellow",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: operatorLabel,
    event_type: "human_review_requested",
    status: "waiting_human_review",
    payload: {
      snapshotCode,
      hiddenRiskRunCode,
      humanHandoffRunCode,
      legalReviewCode: reviewCode,
      alertCode,
      reviewerLabel,
      slaDueAt,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode,
      hiddenRiskRunCode,
      humanHandoffRunCode,
      humanHandoffStatus: finalRunStatus,
      legalReviewCode: reviewCode,
      alertCode,
      nextAction: "Revisao humana aberta e oportunidade bloqueada antes de compliance/comunicacao.",
    },
  };
}

function normalizeHumanReviewDecision(value: string) {
  if (value === "blocked") return "blocked";
  if (value === "approved_with_notes") return "approved_with_notes";
  return "approved";
}

function humanDecisionLabel(decision: string) {
  if (decision === "blocked") return "Bloqueado";
  if (decision === "approved_with_notes") return "Aprovado com ressalva";
  return "Aprovado";
}

async function findSourceSnapshotByFlowKey(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  input: {
    snapshotId?: string;
    snapshotCode?: string;
    humanHandoffRunCode?: string;
    complianceRunCode?: string;
  }
) {
  const snapshotKey = input.snapshotId || input.snapshotCode || "";

  if (snapshotKey) {
    const result = looksLikeUuid(snapshotKey)
      ? await supabase.from("source_snapshots").select("*").eq("id", snapshotKey).limit(1).maybeSingle()
      : await supabase.from("source_snapshots").select("*").eq("snapshot_code", snapshotKey).limit(1).maybeSingle();

    if (result.error) throw new Error(result.error.message);
    return (result.data || null) as SourceSnapshotDbRow | null;
  }

  const humanHandoffRunCode = input.humanHandoffRunCode || "";
  const complianceRunCode = input.complianceRunCode || "";
  if (!humanHandoffRunCode && !complianceRunCode) return null;

  const { data, error } = await supabase
    .from("source_snapshots")
    .select("*")
    .order("collected_at", { ascending: false })
    .limit(150);

  if (error) throw new Error(error.message);

  return (
    ((data || []) as SourceSnapshotDbRow[]).find((row) => {
      const extracted = asRecord(row.extracted_payload);
      return (
        (humanHandoffRunCode && asString(extracted.humanHandoffRunCode) === humanHandoffRunCode) ||
        (complianceRunCode && asString(extracted.complianceRunCode) === complianceRunCode)
      );
    }) || null
  );
}

export async function resolveHumanReviewFromSnapshotRecord(
  input: ResolveHumanReviewInput
): Promise<MutationResult<ResolveHumanReviewOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Decisao humana exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  let snapshot: SourceSnapshotDbRow | null;

  try {
    snapshot = await findSourceSnapshotByFlowKey(supabase, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao localizar snapshot." };
  }

  if (!snapshot) return { ok: false, error: "Snapshot nao encontrado para decisao humana." };

  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const humanHandoffRunCode = input.humanHandoffRunCode || asString(extractedPayload.humanHandoffRunCode);

  if (!humanHandoffRunCode) {
    return { ok: false, error: "Abra o handoff humano antes de registrar a decisao." };
  }

  const opportunityId = asString(snapshot.opportunity_id);
  if (!opportunityId) return { ok: false, error: "Snapshot nao esta ligado a uma oportunidade." };

  const { data: opportunityData, error: opportunityError } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (opportunityError) return { ok: false, error: opportunityError.message };
  if (!opportunityData) return { ok: false, error: "Oportunidade do snapshot nao encontrada." };

  const opportunity = opportunityData as OpportunityDbRow;
  const opportunityCode = asString(opportunity.code);
  const decision = normalizeHumanReviewDecision(input.decision);
  const reviewerLabel = input.reviewerLabel || "Juridico Betel";
  const notes = input.notes || `${humanDecisionLabel(decision)} por ${reviewerLabel}.`;
  const reviewCode = asString(extractedPayload.legalReviewCode, makeHumanReviewCode(opportunityCode, snapshotCode));
  const alertCode = asString(extractedPayload.adminAlertCode, makeHumanAlertCode(opportunityCode, snapshotCode));
  const decidedAt = new Date().toISOString();

  const gateResult = await resolveHumanGateRecord({
    runCode: humanHandoffRunCode,
    decision,
    reviewerLabel,
    notes,
    transitionKey: "human-handoff-to-compliance-guard",
    targetAgentKey: decision === "blocked" ? "" : "compliance-guard",
  });

  if (!gateResult.ok || !gateResult.data) {
    return { ok: false, error: gateResult.error || "Nao foi possivel salvar a decisao humana." };
  }

  const complianceRunCode = gateResult.data.nextRunCode;
  const reviewStatus =
    decision === "blocked" ? "blocked" : decision === "approved_with_notes" ? "approved_with_notes" : "approved";
  const alertStatus = decision === "blocked" ? "resolved_blocked" : "resolved";
  const snapshotStatus =
    decision === "blocked" ? "human_blocked" : decision === "approved_with_notes" ? "human_approved_with_notes" : "human_approved";
  const opportunityLegalStatus =
    decision === "blocked" ? "Bloqueado por humano" : decision === "approved_with_notes" ? "Aprovado com ressalva" : "Aprovado";
  const opportunityStage = decision === "blocked" ? "Bloqueado" : "Compliance";
  const nextAction =
    decision === "blocked"
      ? "Oportunidade bloqueada por decisao humana. Nao comunicar externamente."
      : complianceRunCode
        ? "Compliance deve validar linguagem e permissao antes da comunicacao."
        : "Decisao humana registrada; aguardar compliance.";

  await supabase.from("legal_reviews").upsert(
    {
      opportunity_id: opportunityId,
      review_code: reviewCode,
      topic: "Parecer humano sobre risco oculto",
      status: reviewStatus,
      reviewer_name: reviewerLabel,
      sla_due_at: null,
      decision,
      notes,
    },
    { onConflict: "review_code" }
  );

  await supabase.from("admin_alerts").upsert(
    {
      opportunity_id: opportunityId,
      alert_code: alertCode,
      title: `Decisao humana: ${opportunityCode}`,
      severity: decision === "blocked" ? "critical" : decision === "approved_with_notes" ? "medium" : "info",
      status: alertStatus,
      owner_name: reviewerLabel,
      message:
        decision === "blocked"
          ? `Oportunidade bloqueada por ${reviewerLabel}. Snapshot ${snapshotCode}.`
          : `Oportunidade liberada por ${reviewerLabel} para compliance. Snapshot ${snapshotCode}.`,
      resolved_at: decidedAt,
    },
    { onConflict: "alert_code" }
  );

  await supabase
    .from("source_snapshots")
    .update({
      status: snapshotStatus,
      extracted_payload: {
        ...extractedPayload,
        legalReviewCode: reviewCode,
        adminAlertCode: alertCode,
        humanDecision: decision,
        humanDecisionLabel: humanDecisionLabel(decision),
        humanDecisionNotes: notes,
        humanDecisionBy: reviewerLabel,
        humanDecisionAt: decidedAt,
        complianceRunCode: complianceRunCode || null,
        humanReviewStatus: reviewStatus,
      },
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      legal_status: opportunityLegalStatus,
      stage: opportunityStage,
      next_action: nextAction,
      timeline: [
        ...currentTimeline,
        {
          time: decidedAt,
          actor: reviewerLabel,
          action: `${humanDecisionLabel(decision)}. ${notes}`,
          tone: decision === "blocked" ? "red" : decision === "approved_with_notes" ? "yellow" : "green",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: reviewerLabel,
    event_type: "human_review_decided",
    status: snapshotStatus,
    payload: {
      snapshotCode,
      humanHandoffRunCode,
      legalReviewCode: reviewCode,
      alertCode,
      decision,
      notes,
      complianceRunCode,
      stoppedReason: gateResult.data.stoppedReason,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode,
      humanHandoffRunCode,
      decision,
      legalReviewCode: reviewCode,
      alertCode,
      complianceRunCode,
      stoppedReason: gateResult.data.stoppedReason,
    },
  };
}

async function fetchComplianceRunByCode(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  complianceRunCode: string
) {
  if (!complianceRunCode) throw new Error("Run de compliance nao informado.");

  const { data, error } = await supabase
    .from("agent_runs")
    .select("*, ai_agents(agent_key, name), auction_opportunities(code, title)")
    .eq("run_code", complianceRunCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Run de compliance nao encontrado.");

  const run = data as AgentRunDbRow;
  if (runAgentKey(run) !== "compliance-guard") {
    throw new Error("O run informado nao pertence ao Agente Guardrail Compliance.");
  }

  return run;
}

async function loadSnapshotOpportunity(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  snapshot: SourceSnapshotDbRow
) {
  const opportunityId = asString(snapshot.opportunity_id);
  if (!opportunityId) throw new Error("Snapshot nao esta ligado a uma oportunidade.");

  const { data, error } = await supabase
    .from("auction_opportunities")
    .select("*")
    .eq("id", opportunityId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Oportunidade do snapshot nao encontrada.");

  return data as OpportunityDbRow;
}

export async function processComplianceFromSnapshotRecord(
  input: ProcessComplianceFromSnapshotInput
): Promise<MutationResult<ProcessComplianceFromSnapshotOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Compliance real exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  let snapshot: SourceSnapshotDbRow | null;

  try {
    snapshot = await findSourceSnapshotByFlowKey(supabase, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao localizar snapshot." };
  }

  if (!snapshot) return { ok: false, error: "Snapshot nao encontrado para compliance." };

  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const complianceRunCode = input.complianceRunCode || asString(extractedPayload.complianceRunCode);

  let complianceRun: AgentRunDbRow;
  let opportunity: OpportunityDbRow;

  try {
    complianceRun = await fetchComplianceRunByCode(supabase, complianceRunCode);
    opportunity = await loadSnapshotOpportunity(supabase, snapshot);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Nao foi possivel carregar compliance." };
  }

  if (runBlocksCommunication(complianceRun)) {
    return { ok: false, error: "Compliance esta bloqueado ou falhou. Nao processe comunicacao para esta captura." };
  }

  const currentStatus = asString(complianceRun.status);
  const statusText = currentStatus.toLowerCase();
  const alreadyProcessed =
    statusText.includes("waiting") ||
    statusText.includes("human") ||
    statusText.includes("completed") ||
    statusText.includes("concluido") ||
    statusText.includes("done");
  const processed = alreadyProcessed
    ? {
        runCode: complianceRunCode,
        status: currentStatus,
        humanReviewStatus: asString(complianceRun.human_review_status),
        nextAction: asString(asRecord(complianceRun.output_payload).nextAction, "Liberar comunicacao apos validacao."),
      }
    : (
        await processAgentRunRecord({
          runCode: complianceRunCode,
          runtimeMode: input.runtimeMode || "mock",
          provider: input.provider || "mock",
          model: input.model || "betel-deterministic-v0",
          operatorLabel: input.operatorLabel || "Compliance Betel",
        })
      ).data;

  if (!processed) {
    return { ok: false, error: "Nao foi possivel processar o compliance." };
  }

  const processedAt = new Date().toISOString();
  const opportunityCode = asString(opportunity.code);
  const nextAction =
    processed.humanReviewStatus && reviewApprovesHandoff(processed.humanReviewStatus)
      ? "Compliance liberado. Comunicacao pode ser despachada para outbox segmentado."
      : "Compliance processado. Responsavel deve liberar comunicacao antes de avisar leads.";

  await supabase
    .from("source_snapshots")
    .update({
      status: reviewApprovesHandoff(processed.humanReviewStatus) ? "communication_ready" : "compliance_review",
      extracted_payload: {
        ...extractedPayload,
        complianceRunCode,
        complianceRunStatus: processed.status,
        complianceReviewStatus: processed.humanReviewStatus,
        complianceProcessedAt: processedAt,
      },
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      legal_status: reviewApprovesHandoff(processed.humanReviewStatus)
        ? "Compliance liberado"
        : "Compliance pendente",
      stage: reviewApprovesHandoff(processed.humanReviewStatus) ? "Comunicacao" : "Compliance",
      next_action: nextAction,
      timeline: [
        ...currentTimeline,
        {
          time: processedAt,
          actor: input.operatorLabel || "Compliance Betel",
          action: `${processed.status}: ${processed.nextAction}`,
          tone: reviewApprovesHandoff(processed.humanReviewStatus) ? "green" : "yellow",
        },
      ],
    })
    .eq("id", asString(opportunity.id));

  await supabase.from("audit_logs").insert({
    opportunity_id: asString(opportunity.id),
    actor_name: input.operatorLabel || "Compliance Betel",
    event_type: "compliance_processed",
    status: processed.status,
    payload: {
      snapshotCode,
      complianceRunCode,
      complianceReviewStatus: processed.humanReviewStatus,
      nextAction: processed.nextAction,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode,
      complianceRunCode,
      complianceRunStatus: processed.status,
      complianceReviewStatus: processed.humanReviewStatus,
      nextAction,
    },
  };
}

export async function releaseCommunicationFromSnapshotRecord(
  input: ReleaseCommunicationFromSnapshotInput
): Promise<MutationResult<ReleaseCommunicationFromSnapshotOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Liberacao de comunicacao exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  let snapshot: SourceSnapshotDbRow | null;

  try {
    snapshot = await findSourceSnapshotByFlowKey(supabase, input);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erro ao localizar snapshot." };
  }

  if (!snapshot) return { ok: false, error: "Snapshot nao encontrado para liberar comunicacao." };

  const snapshotCode = asString(snapshot.snapshot_code, shortCode(asString(snapshot.id), "SRC"));
  const extractedPayload = asRecord(snapshot.extracted_payload);
  const communication = asRecord(extractedPayload.communication);
  const alreadyDispatchedAt = asString(communication.dispatchedAt, asString(extractedPayload.communicationDispatchedAt));
  const opportunityId = asString(snapshot.opportunity_id);
  const complianceRunCode = input.complianceRunCode || asString(extractedPayload.complianceRunCode);

  if (alreadyDispatchedAt) {
    return {
      ok: true,
      data: {
        snapshotCode,
        opportunityCode: asString(extractedPayload.opportunityCode),
        complianceRunCode,
        communicationStatus: "already_dispatched",
        outboxCount: asNumber(communication.outboxCount, asNumber(extractedPayload.communicationOutboxCount)),
        createdRuns: [],
        stoppedReason: `Comunicacao ja despachada em ${alreadyDispatchedAt}.`,
      },
    };
  }

  let complianceRun: AgentRunDbRow;
  let opportunity: OpportunityDbRow;

  try {
    complianceRun = await fetchComplianceRunByCode(supabase, complianceRunCode);
    opportunity = await loadSnapshotOpportunity(supabase, snapshot);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Nao foi possivel carregar compliance." };
  }

  if (runBlocksCommunication(complianceRun)) {
    return { ok: false, error: "Compliance esta bloqueado ou falhou. Comunicacao externa permanece travada." };
  }

  const statusText = asString(complianceRun.status).toLowerCase();
  if (!statusText.includes("waiting") && !statusCompletesRun(statusText)) {
    return { ok: false, error: "Processe o compliance antes de liberar comunicacao." };
  }

  const releasedAt = new Date().toISOString();
  const reviewerLabel = input.reviewerLabel || "Compliance Betel";
  const notes =
    input.notes ||
    "Compliance liberou comunicacao segmentada. Mensagem completa somente para clientes elegiveis; teaser seguro para leads frios.";
  const outputPayload = asRecord(complianceRun.output_payload);

  const { error: updateRunError } = await supabase
    .from("agent_runs")
    .update({
      status: "completed",
      human_review_status: "aprovado_para_comunicacao",
      handoff_to: "communication_outbox",
      output_payload: {
        ...outputPayload,
        nextAction: "Comunicacao liberada para outbox segmentado.",
        complianceRelease: {
          reviewerLabel,
          notes,
          releasedAt,
          audienceScope: input.audienceScope || "all",
          channels: input.channels || ["WhatsApp", "Email", "Push"],
        },
      },
      error_message: null,
      locked_at: null,
      locked_by: null,
      completed_at: releasedAt,
    })
    .eq("run_code", complianceRunCode);

  if (updateRunError) return { ok: false, error: updateRunError.message };

  await logAgentRuntimeEvent(supabase, {
    runId: asString(complianceRun.id),
    runCode: complianceRunCode,
    agentKey: "compliance-guard",
    eventType: "compliance_communication_released",
    status: "completed",
    provider: asString(complianceRun.provider, "manual"),
    model: asString(complianceRun.model, "compliance-release"),
    attempt: Math.max(asNumber(complianceRun.attempt_count, 1), 1),
    message: `Compliance liberou comunicacao de ${asString(opportunity.code)} para outbox segmentado.`,
    payload: {
      snapshotCode,
      reviewerLabel,
      notes,
      releasedAt,
      audienceScope: input.audienceScope || "all",
      channels: input.channels || ["WhatsApp", "Email", "Push"],
    },
  });

  const dispatch = await dispatchCommunicationRecord({
    sourceRunCode: complianceRunCode,
    opportunityCode: asString(opportunity.code),
    investorId: "",
    audienceScope: input.audienceScope || "all",
    channels: input.channels || ["WhatsApp", "Email", "Push"],
    messageIntent:
      input.messageIntent ||
      "Preparar comunicacao supervisionada da oportunidade aprovada, separando mensagem completa para cliente pagante e teaser seguro para lead frio.",
    templateKey: input.templateKey,
    recipientKeys: input.recipientKeys,
    recipientSegmentKeys: input.recipientSegmentKeys,
    operatorLabel: input.operatorLabel || "Growth Betel",
  });

  if (!dispatch.ok || !dispatch.data) {
    return { ok: false, error: dispatch.error || "Compliance liberado, mas nao foi possivel despachar comunicacao." };
  }

  const communicationPayload = {
    status: "dispatched",
    sourceRunCode: complianceRunCode,
    outboxCount: dispatch.data.outboxCount,
    createdRuns: dispatch.data.createdRuns.map((run) => run.runCode),
    dispatchedAt: releasedAt,
    operatorLabel: input.operatorLabel || "Growth Betel",
    reviewerLabel,
    channels: input.channels || ["WhatsApp", "Email", "Push"],
    audienceScope: input.audienceScope || "all",
  };

  await supabase
    .from("source_snapshots")
    .update({
      status: "communication_dispatched",
      extracted_payload: {
        ...extractedPayload,
        complianceRunCode,
        complianceRunStatus: "completed",
        complianceReviewStatus: "aprovado_para_comunicacao",
        communication: communicationPayload,
        communicationStatus: "dispatched",
        communicationOutboxCount: dispatch.data.outboxCount,
        communicationDispatchedAt: releasedAt,
      },
    })
    .eq("id", asString(snapshot.id));

  const currentTimeline = asArray<Record<string, unknown>>(opportunity.timeline, []);
  await supabase
    .from("auction_opportunities")
    .update({
      legal_status: "Liberado para comunicacao",
      stage: "Comunicacao",
      next_action: `Outbox segmentado criado: ${dispatch.data.outboxCount} mensagens aguardam worker/mock/provider.`,
      timeline: [
        ...currentTimeline,
        {
          time: releasedAt,
          actor: reviewerLabel,
          action: `Compliance liberou comunicacao. ${dispatch.data.stoppedReason}`,
          tone: "green",
        },
      ],
    })
    .eq("id", opportunityId);

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: reviewerLabel,
    event_type: "communication_released_from_capture",
    status: "communication_dispatched",
    payload: {
      snapshotCode,
      complianceRunCode,
      communication: communicationPayload,
      stoppedReason: dispatch.data.stoppedReason,
    },
  });

  return {
    ok: true,
    data: {
      snapshotCode,
      opportunityCode: asString(opportunity.code),
      complianceRunCode,
      communicationStatus: "dispatched",
      outboxCount: dispatch.data.outboxCount,
      createdRuns: dispatch.data.createdRuns,
      stoppedReason: dispatch.data.stoppedReason,
    },
  };
}

function makeSourceQualityScore(sourceType: string) {
  const normalized = sourceType.toLowerCase();
  if (normalized.includes("banco")) return 88;
  if (normalized.includes("tribunal") || normalized.includes("judicial")) return 82;
  if (normalized.includes("api")) return 78;
  if (normalized.includes("leiloeiro")) return 74;
  return 62;
}

function makePayloadHash(payload: Record<string, unknown>) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function makeSourceSnapshotCode(opportunityCode: string) {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  return `SRC-${opportunityCode}-${suffix}`;
}

function makeSourceIntakeRunCode(opportunityCode: string) {
  const suffix = Date.now().toString(36).slice(-7).toUpperCase();
  return `INTAKE-${opportunityCode}-${suffix}`;
}

async function ensureAuctionSourceRecord(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdminClient>>,
  input: SourceIntakeInput
): Promise<MutationResult<{ id: string }>> {
  const sourceName = input.sourceName || "Fonte nao informada";
  const sourceType = input.sourceType || "Manual";
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("auction_sources")
    .upsert(
      {
        name: sourceName,
        source_type: sourceType,
        url: input.sourceUrl || null,
        status: "active",
        quality_score: makeSourceQualityScore(sourceType),
        terms_status: input.collectionMode || "manual_intake",
        last_collected_at: now,
        notes: input.evidenceNotes || "Fonte registrada pela captura operacional.",
      },
      { onConflict: "name,source_type" }
    )
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: asString(data?.id) } };
}

function buildSourceIntakeArtifacts(input: SourceIntakeInput, modeLabel: string) {
  const financialSummary = [
    { label: "Lance inicial", value: formatCurrency(input.initialBid), detail: "Capturado da fonte" },
    { label: "Valor estimado", value: formatCurrency(input.appraisalValue), detail: "Referencia inicial da fonte" },
    { label: "Desconto estimado", value: `${input.discountPct}%`, detail: "Calculado antes da diligencia" },
  ];

  const riskFlags = [
    {
      label: input.riskScore >= 70 ? "Risco critico na captura" : "Risco preliminar",
      severity: input.riskScore >= 70 ? "red" : input.riskScore >= 45 ? "yellow" : "green",
      detail: input.evidenceNotes || "Risco inicial calculado antes da conferencia de edital e fontes externas.",
    },
  ];

  const checklist = [
    { label: "Fonte capturada", status: "Concluido", owner: input.owner || "Operacao" },
    { label: "Extrair edital", status: input.sourceUrl ? "Preparar" : "Pendente", owner: "Agente Buscador de Imoveis" },
    { label: "Curadoria IA", status: input.aiStatus || "Fila IA", owner: "Agente Curador de Edital" },
    { label: "Revisao juridica", status: input.legalStatus || "Pendente", owner: "Juridico" },
    { label: "Dossie", status: "Pendente", owner: "Sistema" },
  ];

  const documents = [
    {
      label: "Fonte oficial",
      status: input.sourceUrl ? "Anexado" : "Pendente",
      source: input.sourceName || "Fonte operacional",
    },
    { label: "Edital oficial", status: "Pendente", source: input.sourceName || "Fonte oficial" },
    { label: "Matricula", status: "Pendente", source: "Cartorio" },
    { label: "Comparaveis", status: "Pendente", source: "Big Data mock" },
  ];

  const timelineEntry = {
    time: new Date().toISOString(),
    actor: input.owner || "Agente Buscador de Imoveis",
    action: `Capturou oportunidade via ${modeLabel} e abriu fila de curadoria.`,
    tone: "cyan",
  };

  return { financialSummary, riskFlags, checklist, documents, timelineEntry };
}


export async function ingestAuctionOpportunityRecord(
  input: SourceIntakeInput
): Promise<MutationResult<SourceIntakeOutput>> {
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Ingestao de fonte exige NEXT_PUBLIC_SUPABASE_URL e service role.",
    };
  }

  const sourceResult = await ensureAuctionSourceRecord(supabase, input);
  if (!sourceResult.ok || !sourceResult.data?.id) {
    return { ok: false, error: sourceResult.error || "Nao foi possivel registrar a fonte." };
  }

  const rawPayload = {
    ...(input.rawPayload || {}),
    sourceUrl: input.sourceUrl || null,
    externalId: input.externalId || null,
    collectionMode: input.collectionMode || "manual_intake",
    evidenceNotes: input.evidenceNotes || null,
  };
  const modeLabel = input.collectionMode || "captura manual";
  const artifacts = buildSourceIntakeArtifacts(input, modeLabel);
  const existing = await supabase
    .from("auction_opportunities")
    .select("id, timeline")
    .eq("code", input.code)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message };

  const currentTimeline = asArray<Record<string, unknown>>(
    (existing.data as Record<string, unknown> | null)?.timeline,
    []
  );
  const opportunityPayload = {
    source_id: sourceResult.data.id,
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
    ai_status: input.aiStatus || "Fila IA",
    legal_status: input.legalStatus || "Pendente",
    stage: input.stage || "Entrada",
    next_action: input.nextAction || "Curadoria IA deve extrair edital e reconciliar fonte.",
    owner_name: input.owner || "Operacao",
    auction_date: input.auctionDate || null,
    occupancy: input.occupancy || "Nao informado",
    summary: input.summary,
    financial_summary: artifacts.financialSummary,
    risk_flags: artifacts.riskFlags,
    checklist: artifacts.checklist,
    documents: artifacts.documents,
    timeline: [...currentTimeline, artifacts.timelineEntry],
    raw_payload: {
      created_from: "source_intake",
      ...rawPayload,
    },
  };

  const opportunityMutation = existing.data
    ? await supabase
        .from("auction_opportunities")
        .update(opportunityPayload)
        .eq("id", asString((existing.data as Record<string, unknown>).id))
        .select("id, code")
        .single()
    : await supabase.from("auction_opportunities").insert(opportunityPayload).select("id, code").single();

  if (opportunityMutation.error) {
    return { ok: false, error: opportunityMutation.error.message };
  }

  const opportunityId = asString(opportunityMutation.data?.id);
  const opportunityCode = asString(opportunityMutation.data?.code, input.code);
  const snapshotCode = makeSourceSnapshotCode(opportunityCode);
  const contentHash = makePayloadHash(rawPayload);

  const snapshot = await supabase
    .from("source_snapshots")
    .insert({
      source_id: sourceResult.data.id,
      opportunity_id: opportunityId,
      snapshot_code: snapshotCode,
      external_id: input.externalId || null,
      snapshot_type: input.collectionMode || "manual_intake",
      source_url: input.sourceUrl || null,
      title: input.title,
      content_hash: contentHash,
      status: "captured",
      collected_by: input.owner || "Operacao",
      raw_payload: rawPayload,
      extracted_payload: {
        code: opportunityCode,
        title: input.title,
        city: input.city,
        state: input.state,
        initialBid: input.initialBid,
        appraisalValue: input.appraisalValue,
        discountPct: input.discountPct,
      },
    })
    .select("id, snapshot_code")
    .single();

  if (snapshot.error) {
    return { ok: false, error: snapshot.error.message };
  }

  const analysisRunCode = makeSourceIntakeRunCode(opportunityCode);
  await supabase.from("ai_analysis_runs").insert({
    opportunity_id: opportunityId,
    run_code: analysisRunCode,
    run_type: "source_intake",
    model: "source-scout-v0",
    prompt_version: "auction_source_scout/v0.1",
    confidence_pct: 55,
    status: "queued",
    input_hash: contentHash,
    output_json: {
      nextAgent: "notice-curator",
      nextAction: "Extrair edital, reconciliar dados da fonte e procurar surpresa fora do edital.",
      snapshotCode,
      sourceUrl: input.sourceUrl || null,
    },
  });

  await supabase.from("audit_logs").insert({
    opportunity_id: opportunityId,
    actor_name: input.owner || "Agente Buscador de Imoveis",
    event_type: "source_intake_captured",
    status: "registered",
    payload: {
      opportunityCode,
      sourceId: sourceResult.data.id,
      snapshotCode,
      analysisRunCode,
      collectionMode: input.collectionMode || "manual_intake",
      sourceUrl: input.sourceUrl || null,
      externalId: input.externalId || null,
    },
  });

  return {
    ok: true,
    data: {
      code: opportunityCode,
      sourceId: sourceResult.data.id,
      opportunityId,
      snapshotId: asString(snapshot.data?.id),
      snapshotCode: asString(snapshot.data?.snapshot_code, snapshotCode),
      analysisRunCode,
    },
  };
}

export async function pullSourceProviderOpportunitiesRecord(
  input: PullSourceProviderOpportunitiesInput
): Promise<MutationResult<PullSourceProviderOpportunitiesOutput>> {
  const providerResult = await executeSourceProviderPull(input);

  if (!providerResult.ok || !providerResult.data) {
    return { ok: false, error: providerResult.error || "Nao foi possivel puxar oportunidades do provider." };
  }

  const ingestRequested = Boolean(input.ingest);
  const dryRun = input.dryRun !== false || !ingestRequested;
  const candidates = providerResult.data.candidates;
  const output: PullSourceProviderOpportunitiesOutput = {
    providerPull: providerResult.data,
    candidates,
    ingested: [],
    failed: [],
    processed: [],
    processFailed: [],
    hiddenRisk: [],
    humanReviews: [],
    pipelineFailed: [],
    dryRun,
    ingestRequested,
  };

  if (dryRun || !candidates.length) {
    return { ok: true, data: output };
  }

  for (const candidate of candidates) {
    const result = await ingestAuctionOpportunityRecord({
      ...candidate,
      collectionMode: candidate.collectionMode || `${providerResult.data.runtimeMode}_provider_pull`,
      rawPayload: {
        ...(candidate.rawPayload || {}),
        providerPull: {
          providerKey: providerResult.data.provider.key,
          provider: providerResult.data.provider.provider,
          providerStatus: providerResult.data.providerStatus,
          pulledAt: providerResult.data.pulledAt,
        },
      },
    });

    if (result.ok && result.data) {
      output.ingested.push(result.data);

      if (input.processAfterIngest || input.openHumanReviewAfterIngest) {
        const processed = await processSourceSnapshotRecord({
          snapshotCode: result.data.snapshotCode,
          runtimeMode: input.curationRuntimeMode || "mock",
          provider: input.curationProvider || "mock",
          model: input.curationModel || "betel-deterministic-v0",
          operatorLabel: input.operatorLabel || "Curadoria Betel",
          processNow: input.openHumanReviewAfterIngest ? true : input.curationProcessNow !== false,
        });

        if (processed.ok && processed.data) {
          output.processed.push(processed.data);

          if (input.openHumanReviewAfterIngest) {
            const hiddenRisk = await enqueueHiddenRiskFromSnapshotRecord({
              snapshotCode: result.data.snapshotCode,
              curatorRunCode: processed.data.agentRunCode,
              runtimeMode: input.curationRuntimeMode || "mock",
              provider: input.curationProvider || "mock",
              model: input.curationModel || "betel-deterministic-v0",
              operatorLabel: "Risco Oculto Betel",
              processNow: true,
            });

            if (hiddenRisk.ok && hiddenRisk.data) {
              output.hiddenRisk.push(hiddenRisk.data);

              const humanReview = await enqueueHumanReviewFromSnapshotRecord({
                snapshotCode: result.data.snapshotCode,
                hiddenRiskRunCode: hiddenRisk.data.hiddenRiskRunCode,
                runtimeMode: input.curationRuntimeMode || "mock",
                provider: input.curationProvider || "mock",
                model: input.curationModel || "betel-deterministic-v0",
                operatorLabel: "Handoff Humano Betel",
                reviewerLabel: "Juridico Betel",
                processNow: true,
              });

              if (humanReview.ok && humanReview.data) {
                output.humanReviews.push(humanReview.data);
              } else {
                output.pipelineFailed.push({
                  code: candidate.code,
                  title: candidate.title,
                  snapshotCode: result.data.snapshotCode,
                  stage: "human-review",
                  error: humanReview.error || "Falha desconhecida ao abrir revisao humana.",
                });
              }
            } else {
              output.pipelineFailed.push({
                code: candidate.code,
                title: candidate.title,
                snapshotCode: result.data.snapshotCode,
                stage: "hidden-risk",
                error: hiddenRisk.error || "Falha desconhecida ao processar risco oculto.",
              });
            }
          }
        } else {
          output.processFailed.push({
            code: candidate.code,
            title: candidate.title,
            snapshotCode: result.data.snapshotCode,
            error: processed.error || "Falha desconhecida ao processar curadoria.",
          });
        }
      }
    } else {
      output.failed.push({
        code: candidate.code,
        title: candidate.title,
        error: result.error || "Falha desconhecida ao gravar candidato.",
      });
    }
  }

  if (!output.ingested.length && output.failed.length) {
    return {
      ok: false,
      data: output,
      error: output.failed[0]?.error || "Nenhuma oportunidade foi gravada.",
    };
  }

  return { ok: true, data: output };
}
