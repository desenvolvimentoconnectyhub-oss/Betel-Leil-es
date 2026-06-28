"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createAgentMaintenanceTaskRecord,
  createAgentPromptRegistryRecord,
  createAgentRecord,
  createAgentRunRecord,
  dispatchCommunicationRecord,
  enqueueAgentHandoffRecord,
  processAgentRunRecord,
  processCommunicationOutboxBatchRecord,
  processCommunicationOutboxRecord,
  resolveHumanGateRecord,
  runAgentPipelineRecord,
  syncAgentWorkflowEdgesRecord,
  updateAgentRunStatusRecord,
  updateAgentStatusRecord,
  updateAgentProfileRecord,
  type CreateAgentInput,
  type CreateAgentMaintenanceTaskInput,
  type CreateAgentPromptInput,
  type CreateAgentRunInput,
  type DispatchCommunicationInput,
  type EnqueueAgentHandoffInput,
  type ProcessAgentRunInput,
  type ProcessCommunicationOutboxBatchInput,
  type ProcessCommunicationOutboxInput,
  type ResolveHumanGateInput,
  type RunAgentPipelineInput,
  type UpdateAgentRunStatusInput,
  type UpdateAgentProfileInput,
} from "@/lib/admin/repository";
import type { AgentStatus } from "@/lib/admin/agent-workforce";

const adminAgentPath = "/admin/agentes-ia";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function listField(formData: FormData, name: string) {
  return field(formData, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberField(formData: FormData, name: string, fallback = 0) {
  const value = field(formData, name);
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(formData: FormData, name: string) {
  const value = field(formData, name).toLowerCase();
  return ["1", "true", "on", "yes", "sim"].includes(value);
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizeStatus(value: string): AgentStatus {
  if (["active", "supervised", "paused", "planned"].includes(value)) return value as AgentStatus;
  return "planned";
}

function normalizeRunStatus(value: string) {
  return value || "queued";
}

function redirectWithStatus(status: "success" | "error", message: string, hash = ""): never {
  const suffix = hash ? `#${hash}` : "";
  redirect(`${adminAgentPath}?status=${status}&message=${encodeURIComponent(message)}${suffix}`);
}

function revalidateAgentOffice() {
  revalidatePath("/admin");
  revalidatePath(adminAgentPath);
  revalidatePath("/admin/investidores");
  revalidatePath("/api/admin/agentes-ia");
  revalidatePath("/api/admin/agentes-ia/runtime");
  revalidatePath("/api/admin/agentes-ia/pipeline");
  revalidatePath("/api/admin/agentes-ia/human-gate");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/worker");
}

function makeFallbackCode(prefix: string) {
  return `${prefix}-${Date.now().toString(36).slice(-6)}`.toUpperCase();
}

function parseAgentForm(formData: FormData): CreateAgentInput {
  const name = field(formData, "name");
  const role = field(formData, "role");
  const agentKey = normalizeKey(field(formData, "agentKey", name));
  const promptName = normalizeKey(field(formData, "promptName", `${agentKey}_prompt`)).replace(/-/g, "_");

  if (!name) redirectWithStatus("error", "Informe o nome do agente.", "formularios");
  if (!role) redirectWithStatus("error", "Informe a funcao do agente.", "formularios");
  if (!agentKey) redirectWithStatus("error", "Informe uma chave valida para o agente.", "formularios");

  return {
    groupKey: field(formData, "groupKey", "captacao"),
    agentKey,
    name,
    role,
    status: normalizeStatus(field(formData, "status", "planned")),
    promptName,
    promptVersion: field(formData, "promptVersion", "v0.1"),
    systemPrompt: field(formData, "systemPrompt"),
    triggerType: field(formData, "triggerType"),
    inputs: listField(formData, "inputs"),
    outputs: listField(formData, "outputs"),
    guardrails: listField(formData, "guardrails"),
  };
}

function parsePromptForm(formData: FormData): CreateAgentPromptInput {
  const promptName = normalizeKey(field(formData, "promptName")).replace(/-/g, "_");
  const promptVersion = field(formData, "promptVersion", "v0.1");

  if (!promptName) redirectWithStatus("error", "Informe o nome do prompt.", "prompts");

  return {
    promptKey: normalizeKey(field(formData, "promptKey", `${promptName}-${promptVersion}`)),
    agentKey: normalizeKey(field(formData, "agentKey")),
    departmentKey: field(formData, "departmentKey", "curadoria"),
    promptName,
    promptVersion,
    purpose: field(formData, "purpose", "Prompt operacional versionado para agente IA."),
    systemPrompt: field(formData, "systemPrompt"),
    inputContract: listField(formData, "inputContract"),
    outputContract: listField(formData, "outputContract"),
    guardrails: listField(formData, "guardrails"),
    status: normalizeStatus(field(formData, "status", "planned")),
    ownerLabel: field(formData, "ownerLabel", "Produto IA"),
    changeNotes: field(formData, "changeNotes", "Nova versao cadastrada pelo escritorio IA."),
  };
}

function parseMaintenanceForm(formData: FormData): CreateAgentMaintenanceTaskInput {
  const area = field(formData, "area");

  if (!area) redirectWithStatus("error", "Informe a area da manutencao.", "manutencao");

  return {
    taskCode: normalizeKey(field(formData, "taskCode", makeFallbackCode("TASK"))).toUpperCase(),
    roomKey: field(formData, "roomKey"),
    agentKey: normalizeKey(field(formData, "agentKey")),
    area,
    severity: field(formData, "severity", "Media"),
    status: field(formData, "status", "Aberto"),
    checkDescription: field(formData, "checkDescription", "Revisar item operacional do agente."),
    nextAction: field(formData, "nextAction", "Definir responsavel e prazo."),
    ownerLabel: field(formData, "ownerLabel", "Produto IA"),
    dueAt: field(formData, "dueAt"),
  };
}

function parseAgentRunForm(formData: FormData): CreateAgentRunInput {
  const agentKey = normalizeKey(field(formData, "agentKey"));
  const runCode = normalizeKey(field(formData, "runCode", makeFallbackCode("RUN"))).toUpperCase();
  const inputSummary = field(formData, "inputSummary");

  if (!agentKey) redirectWithStatus("error", "Informe o agente responsavel pelo run.", "runs");
  if (!inputSummary) redirectWithStatus("error", "Informe o resumo de entrada do run.", "runs");

  return {
    agentKey,
    opportunityCode: field(formData, "opportunityCode"),
    investorId: field(formData, "investorId"),
    runCode,
    status: normalizeRunStatus(field(formData, "status", "queued")),
    triggerSource: field(formData, "triggerSource", "manual"),
    inputSummary,
    outputSummary: field(formData, "outputSummary"),
    humanReviewStatus: field(formData, "humanReviewStatus", "pendente"),
    handoffTo: field(formData, "handoffTo"),
    errorMessage: field(formData, "errorMessage"),
    costEstimate: numberField(formData, "costEstimate"),
    startedAt: field(formData, "startedAt"),
    completedAt: field(formData, "completedAt"),
  };
}

function parseRunStatusForm(formData: FormData): UpdateAgentRunStatusInput {
  const runCode = field(formData, "runCode");

  if (!runCode) redirectWithStatus("error", "Run nao informado para atualizacao.", "runs");

  return {
    runCode,
    status: normalizeRunStatus(field(formData, "status", "queued")),
    outputSummary: field(formData, "outputSummary"),
    humanReviewStatus: field(formData, "humanReviewStatus", "pendente"),
    handoffTo: field(formData, "handoffTo"),
    errorMessage: field(formData, "errorMessage"),
    costEstimate: numberField(formData, "costEstimate"),
    completedAt: field(formData, "completedAt"),
  };
}

function parseHandoffForm(formData: FormData): EnqueueAgentHandoffInput {
  const currentRunCode = field(formData, "currentRunCode");
  const handoffTarget = field(formData, "handoffTarget");
  const [transitionKey = "", targetAgentKey = ""] = handoffTarget.split("|");

  if (!currentRunCode) redirectWithStatus("error", "Run de origem nao informado.", "runs");
  if (!targetAgentKey) redirectWithStatus("error", "Agente destino nao informado.", "runs");

  return {
    currentRunCode,
    transitionKey,
    targetAgentKey: normalizeKey(targetAgentKey),
    inputSummary: field(formData, "inputSummary"),
  };
}

function parseProcessRunForm(formData: FormData): ProcessAgentRunInput {
  return {
    runCode: field(formData, "runCode"),
    runtimeMode: field(formData, "runtimeMode", "mock"),
    operatorLabel: field(formData, "operatorLabel", "Runtime Betel"),
    provider: field(formData, "provider"),
    model: field(formData, "model"),
  };
}

function parsePipelineForm(formData: FormData): RunAgentPipelineInput {
  return {
    startRunCode: field(formData, "startRunCode"),
    opportunityCode: field(formData, "opportunityCode", "BC-204"),
    inputSummary: field(formData, "inputSummary"),
    runtimeMode: field(formData, "runtimeMode", "mock"),
    provider: field(formData, "provider", "mock"),
    model: field(formData, "model", "betel-deterministic-v0"),
    operatorLabel: field(formData, "operatorLabel", "Pipeline Betel"),
    maxSteps: Math.max(1, Math.min(numberField(formData, "maxSteps", 4), 6)),
  };
}

function parseHumanGateForm(formData: FormData): ResolveHumanGateInput {
  const runCode = field(formData, "runCode");
  const handoffTarget = field(formData, "handoffTarget");
  const [transitionKey = "", targetAgentKey = ""] = handoffTarget.split("|");

  if (!runCode) redirectWithStatus("error", "Run nao informado para resolver gate humano.", "runtime");

  return {
    runCode,
    decision: field(formData, "decision", "approved"),
    reviewerLabel: field(formData, "reviewerLabel", "Operador Betel"),
    notes: field(formData, "notes"),
    transitionKey,
    targetAgentKey: normalizeKey(targetAgentKey),
  };
}

function parseCommunicationDispatchForm(formData: FormData): DispatchCommunicationInput {
  const sourceRunCode = field(formData, "sourceRunCode");

  if (!sourceRunCode) {
    redirectWithStatus("error", "Selecione um run de compliance concluido e liberado.", "setores");
  }

  return {
    sourceRunCode,
    opportunityCode: field(formData, "opportunityCode"),
    investorId: field(formData, "investorId"),
    audienceScope: field(formData, "audienceScope", "all"),
    channels: listField(formData, "channels"),
    messageIntent: field(formData, "messageIntent"),
    operatorLabel: field(formData, "operatorLabel", "Growth Betel"),
  };
}

function parseCommunicationOutboxForm(formData: FormData): ProcessCommunicationOutboxInput {
  const messageCode = field(formData, "messageCode");
  const processNext = booleanField(formData, "processNext");

  if (!messageCode && !processNext) {
    redirectWithStatus("error", "Selecione uma mensagem do outbox para processar.", "setores");
  }

  return {
    messageCode,
    processNext,
    adapterMode: field(formData, "adapterMode", "mock"),
    provider: field(formData, "provider", "sandbox"),
    operatorLabel: field(formData, "operatorLabel", "Delivery Betel"),
    allowExternal: booleanField(formData, "allowExternal"),
    providerReleaseConfirmed: booleanField(formData, "providerReleaseConfirmed"),
    forceFail: booleanField(formData, "forceFail"),
    maxAttempts: Math.max(1, Math.min(numberField(formData, "maxAttempts", 3), 8)),
  };
}

function parseCommunicationOutboxBatchForm(formData: FormData): ProcessCommunicationOutboxBatchInput {
  if (!booleanField(formData, "processBatch")) {
    redirectWithStatus("error", "Confirme o ciclo do worker antes de processar lote.", "setores");
  }

  return {
    processBatch: true,
    batchSize: Math.max(1, Math.min(numberField(formData, "batchSize", 5), 20)),
    adapterMode: field(formData, "adapterMode", "mock"),
    provider: field(formData, "provider", "sandbox"),
    operatorLabel: field(formData, "operatorLabel", "Delivery Worker Betel"),
    allowExternal: booleanField(formData, "allowExternal"),
    providerReleaseConfirmed: booleanField(formData, "providerReleaseConfirmed"),
    forceFail: booleanField(formData, "forceFail"),
    maxAttempts: Math.max(1, Math.min(numberField(formData, "maxAttempts", 3), 8)),
  };
}

export async function createAgentAction(formData: FormData) {
  const payload = parseAgentForm(formData);
  const result = await createAgentRecord(payload);

  if (!result.ok || !result.data?.agentKey) {
    redirectWithStatus("error", result.error || "Nao foi possivel cadastrar o agente.", "formularios");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Agente ${payload.name} cadastrado ou atualizado.`, "agentes");
}

export async function createAgentPromptAction(formData: FormData) {
  const payload = parsePromptForm(formData);
  const result = await createAgentPromptRegistryRecord(payload);

  if (!result.ok || !result.data?.promptKey) {
    redirectWithStatus("error", result.error || "Nao foi possivel versionar o prompt.", "prompts");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Prompt ${payload.promptName} ${payload.promptVersion} salvo.`, "prompts");
}

export async function createMaintenanceTaskAction(formData: FormData) {
  const payload = parseMaintenanceForm(formData);
  const result = await createAgentMaintenanceTaskRecord(payload);

  if (!result.ok || !result.data?.taskCode) {
    redirectWithStatus("error", result.error || "Nao foi possivel abrir a manutencao.", "manutencao");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Manutencao ${payload.taskCode} registrada.`, "manutencao");
}

export async function createAgentRunAction(formData: FormData) {
  const payload = parseAgentRunForm(formData);
  const result = await createAgentRunRecord(payload);

  if (!result.ok || !result.data?.runCode) {
    redirectWithStatus("error", result.error || "Nao foi possivel abrir o run.", "runs");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Run ${result.data.runCode} aberto para ${payload.agentKey}.`, "runs");
}

export async function updateAgentRunStatusAction(formData: FormData) {
  const payload = parseRunStatusForm(formData);
  const result = await updateAgentRunStatusRecord(payload);

  if (!result.ok || !result.data?.runCode) {
    redirectWithStatus("error", result.error || "Nao foi possivel atualizar o run.", "runs");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Run ${result.data.runCode} atualizado.`, "runs");
}

export async function processAgentRunAction(formData: FormData) {
  const payload = parseProcessRunForm(formData);
  const result = await processAgentRunRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel processar o run.", "runtime");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Run ${result.data.runCode} processado por ${result.data.agentKey}.`, "runtime");
}

export async function runAgentPipelineAction(formData: FormData) {
  const payload = parsePipelineForm(formData);
  const result = await runAgentPipelineRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel rodar a esteira piloto.", "runtime");
  }

  revalidateAgentOffice();
  redirectWithStatus(
    "success",
    `Esteira processou ${result.data.processedRuns.length} runs. ${result.data.stoppedReason}`,
    "runtime"
  );
}

export async function enqueueAgentHandoffAction(formData: FormData) {
  const payload = parseHandoffForm(formData);
  const result = await enqueueAgentHandoffRecord(payload);

  if (!result.ok || !result.data?.runCode) {
    redirectWithStatus("error", result.error || "Nao foi possivel enfileirar o proximo agente.", "runs");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Handoff criado: ${result.data.runCode} para ${result.data.targetAgentKey}.`, "runs");
}

export async function resolveHumanGateAction(formData: FormData) {
  const payload = parseHumanGateForm(formData);
  const result = await resolveHumanGateRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel resolver o gate humano.", "runtime");
  }

  revalidateAgentOffice();
  redirectWithStatus(
    "success",
    result.data.nextRunCode
      ? `Gate ${payload.runCode} resolvido. Proximo run: ${result.data.nextRunCode}.`
      : `Gate ${payload.runCode} resolvido. ${result.data.stoppedReason}`,
    "runtime"
  );
}

export async function dispatchCommunicationAction(formData: FormData) {
  const payload = parseCommunicationDispatchForm(formData);
  const result = await dispatchCommunicationRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel despachar comunicacao.", "setores");
  }

  revalidateAgentOffice();
  redirectWithStatus(
    "success",
    `${result.data.createdRuns.length} runs de comunicacao enfileirados. ${result.data.stoppedReason}`,
    "setores"
  );
}

export async function processCommunicationOutboxAction(formData: FormData) {
  const payload = parseCommunicationOutboxForm(formData);
  const result = await processCommunicationOutboxRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel processar a entrega.", "setores");
  }

  revalidateAgentOffice();
  redirectWithStatus(
    "success",
    `Entrega ${result.data.messageCode} marcada como ${result.data.status} via ${result.data.providerStatus}.`,
    "setores"
  );
}

export async function processCommunicationOutboxBatchAction(formData: FormData) {
  const payload = parseCommunicationOutboxBatchForm(formData);
  const result = await processCommunicationOutboxBatchRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel rodar o worker de comunicacao.", "setores");
  }

  revalidateAgentOffice();
  redirectWithStatus(
    "success",
    `${result.data.processed.length} mensagens processadas. Pendentes: ${result.data.pendingAfter}.`,
    "setores"
  );
}

export async function syncAgentWorkflowAction() {
  const result = await syncAgentWorkflowEdgesRecord();

  if (!result.ok || !result.data) {
    redirectWithStatus("error", result.error || "Nao foi possivel sincronizar o mapa de handoffs.", "orquestracao");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `${result.data.count} handoffs sincronizados.`, "orquestracao");
}

export async function updateAgentStatusAction(formData: FormData) {
  const agentKey = normalizeKey(field(formData, "agentKey"));
  const status = normalizeStatus(field(formData, "status", "planned"));

  if (!agentKey) redirectWithStatus("error", "Agente nao informado para alterar status.", "agentes");

  const result = await updateAgentStatusRecord(agentKey, status);

  if (!result.ok) {
    redirectWithStatus("error", result.error || "Nao foi possivel alterar o status do agente.", "agentes");
  }

  revalidateAgentOffice();
  redirectWithStatus("success", `Status do agente ${agentKey} atualizado.`, "agentes");
}

export async function saveAgentPromptAction(agentKey: string, systemPrompt: string) {
  if (!agentKey) return { ok: false, error: "Agente nao informado." };

  const result = await updateAgentProfileRecord(agentKey, { systemPrompt });

  if (!result.ok) return { ok: false, error: result.error || "Nao foi possivel salvar o prompt." };

  revalidateAgentOffice();
  revalidatePath(`${adminAgentPath}/${agentKey}`);
  return { ok: true };
}

export async function updateAgentProfileAction(formData: FormData) {
  const agentKey = normalizeKey(field(formData, "agentKey"));

  if (!agentKey) redirectWithStatus("error", "Agente nao informado.", "controles");

  const input: UpdateAgentProfileInput = {};

  const status = field(formData, "status");
  if (status) input.status = normalizeStatus(status);

  const description = field(formData, "description");
  if (description) input.description = description;

  const avatarIcon = field(formData, "avatarIcon");
  if (avatarIcon) input.avatarIcon = avatarIcon;

  const systemPrompt = formData.get("systemPrompt");
  if (typeof systemPrompt === "string") input.systemPrompt = systemPrompt;

  const runtimeMode = field(formData, "runtimeMode");
  if (runtimeMode) input.runtimeMode = runtimeMode;

  const preferredProvider = field(formData, "preferredProvider");
  if (preferredProvider) input.preferredProvider = preferredProvider;

  const preferredModel = field(formData, "preferredModel");
  if (preferredModel) input.preferredModel = preferredModel;

  const maxCostRaw = field(formData, "maxCostPerRun");
  if (maxCostRaw) input.maxCostPerRun = numberField(formData, "maxCostPerRun");

  const dailyLimitRaw = field(formData, "dailyRunLimit");
  if (dailyLimitRaw) input.dailyRunLimit = numberField(formData, "dailyRunLimit");

  const result = await updateAgentProfileRecord(agentKey, input);

  if (!result.ok) {
    redirectWithStatus("error", result.error || "Nao foi possivel atualizar o perfil do agente.");
  }

  revalidateAgentOffice();
  revalidatePath(`${adminAgentPath}/${agentKey}`);
  redirectWithStatus("success", `Perfil do agente ${agentKey} atualizado.`);
}
