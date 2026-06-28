"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  processComplianceFromSnapshotRecord,
  enqueueHiddenRiskFromSnapshotRecord,
  enqueueHumanReviewFromSnapshotRecord,
  processSourceSnapshotRecord,
  pullSourceProviderOpportunitiesRecord,
  releaseCommunicationFromSnapshotRecord,
  resolveHumanReviewFromSnapshotRecord,
} from "@/lib/admin/repository";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(formData: FormData, name: string, fallback = 0) {
  const value = field(formData, name);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(formData: FormData, name: string, fallback = false) {
  const value = formData.get(name);
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "nao", "off"].includes(normalized)) return false;
  return fallback;
}

function returnPath(formData: FormData, notice: "success" | "error", message: string) {
  const params = new URLSearchParams({
    notice,
    message,
  });
  const sourceId = field(formData, "sourceId");
  const filterStatus = field(formData, "filterStatus");

  if (sourceId) params.set("source", sourceId);
  if (filterStatus) params.set("status", filterStatus);

  return `/admin/fontes/capturas?${params.toString()}`;
}

function revalidateSourceCuration() {
  revalidatePath("/admin");
  revalidatePath("/admin/fontes");
  revalidatePath("/admin/fontes/capturas");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/admin/agentes-ia");
  revalidatePath("/api/admin/fontes/capturas");
  revalidatePath("/api/admin/agentes-ia");
}

export async function pullSourceProviderAction(formData: FormData) {
  const executionMode = field(formData, "executionMode", "dry-run");

  const result = await pullSourceProviderOpportunitiesRecord({
    providerKey: field(formData, "providerKey", "auction_sources"),
    runtimeMode: field(formData, "runtimeMode", "mock"),
    query: field(formData, "query"),
    city: field(formData, "city"),
    state: field(formData, "state"),
    limit: Math.max(1, Math.min(numberField(formData, "limit", 3), 20)),
    dryRun: executionMode !== "ingest" && booleanField(formData, "dryRun", true),
    ingest: executionMode === "ingest" || booleanField(formData, "ingest"),
    allowExternal: booleanField(formData, "allowExternal"),
    providerReleaseConfirmed: booleanField(formData, "providerReleaseConfirmed"),
    operatorLabel: field(formData, "operatorLabel", "Agente Buscador de Imoveis"),
    processAfterIngest: booleanField(formData, "processAfterIngest"),
    curationRuntimeMode: field(formData, "curationRuntimeMode", "mock"),
    curationProvider: field(formData, "curationProvider", "mock"),
    curationModel: field(formData, "curationModel", "betel-deterministic-v0"),
    curationProcessNow: booleanField(formData, "curationProcessNow", true),
    openHumanReviewAfterIngest: booleanField(formData, "openHumanReviewAfterIngest"),
  });

  revalidateSourceCuration();
  revalidatePath("/api/admin/fontes/providers");
  revalidatePath("/api/admin/fontes/providers/pull");

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel puxar candidatos da fonte."));
  }

  const message = result.data.dryRun
    ? `${result.data.candidates.length} candidatos encontrados em modo ${result.data.providerPull.runtimeMode}. Nenhum dado foi gravado.`
    : `${result.data.ingested.length} oportunidades gravadas; ${result.data.processed.length} curadorias; ${result.data.humanReviews.length} revisoes humanas abertas; ${result.data.failed.length + result.data.processFailed.length + result.data.pipelineFailed.length} falhas.`;

  redirect(returnPath(formData, "success", message));
}

export async function processSourceSnapshotAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");

  if (!snapshotCode) {
    redirect(returnPath(formData, "error", "Snapshot nao informado para curadoria."));
  }

  const result = await processSourceSnapshotRecord({
    snapshotCode,
    runtimeMode: field(formData, "runtimeMode", "mock"),
    provider: field(formData, "provider", "mock"),
    model: field(formData, "model", "betel-deterministic-v0"),
    operatorLabel: field(formData, "operatorLabel", "Curadoria Betel"),
    processNow: field(formData, "processNow", "true") !== "false",
  });

  revalidateSourceCuration();

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel processar a captura."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Curadoria ${result.data.agentRunCode} processada para ${result.data.snapshotCode}.`
    )
  );
}

export async function enqueueHiddenRiskAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");
  const curatorRunCode = field(formData, "curatorRunCode");

  if (!snapshotCode || !curatorRunCode) {
    redirect(returnPath(formData, "error", "Execute a curadoria antes de acionar risco oculto."));
  }

  const result = await enqueueHiddenRiskFromSnapshotRecord({
    snapshotCode,
    curatorRunCode,
    runtimeMode: field(formData, "runtimeMode", "mock"),
    provider: field(formData, "provider", "mock"),
    model: field(formData, "model", "betel-deterministic-v0"),
    operatorLabel: field(formData, "operatorLabel", "Risco Oculto Betel"),
    processNow: field(formData, "processNow", "true") !== "false",
  });

  revalidateSourceCuration();

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel acionar risco oculto."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Risco oculto ${result.data.hiddenRiskRunCode} processado para ${result.data.snapshotCode}.`
    )
  );
}

export async function enqueueHumanReviewAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");
  const hiddenRiskRunCode = field(formData, "hiddenRiskRunCode");

  if (!snapshotCode || !hiddenRiskRunCode) {
    redirect(returnPath(formData, "error", "Execute risco oculto antes de acionar revisao humana."));
  }

  const result = await enqueueHumanReviewFromSnapshotRecord({
    snapshotCode,
    hiddenRiskRunCode,
    runtimeMode: field(formData, "runtimeMode", "mock"),
    provider: field(formData, "provider", "mock"),
    model: field(formData, "model", "betel-deterministic-v0"),
    operatorLabel: field(formData, "operatorLabel", "Handoff Humano Betel"),
    reviewerLabel: field(formData, "reviewerLabel", "Juridico Betel"),
    processNow: field(formData, "processNow", "true") !== "false",
  });

  revalidateSourceCuration();

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel abrir revisao humana."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Revisao ${result.data.legalReviewCode} aberta para ${result.data.snapshotCode}.`
    )
  );
}

export async function resolveHumanReviewAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");
  const humanHandoffRunCode = field(formData, "humanHandoffRunCode");
  const decision = field(formData, "decision", "approved");

  if (!snapshotCode || !humanHandoffRunCode) {
    redirect(returnPath(formData, "error", "Abra a revisao humana antes de registrar a decisao."));
  }

  const result = await resolveHumanReviewFromSnapshotRecord({
    snapshotCode,
    humanHandoffRunCode,
    decision,
    reviewerLabel: field(formData, "reviewerLabel", "Juridico Betel"),
    notes: field(formData, "notes"),
  });

  revalidateSourceCuration();
  revalidatePath("/admin/revisao-juridica");
  revalidatePath("/admin/alertas");

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel registrar a decisao humana."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Decisao registrada em ${result.data.legalReviewCode}.`
    )
  );
}

export async function processComplianceAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");
  const complianceRunCode = field(formData, "complianceRunCode");

  if (!snapshotCode || !complianceRunCode) {
    redirect(returnPath(formData, "error", "A decisao humana precisa gerar um run de compliance antes desta etapa."));
  }

  const result = await processComplianceFromSnapshotRecord({
    snapshotCode,
    complianceRunCode,
    runtimeMode: field(formData, "runtimeMode", "mock"),
    provider: field(formData, "provider", "mock"),
    model: field(formData, "model", "betel-deterministic-v0"),
    operatorLabel: field(formData, "operatorLabel", "Compliance Betel"),
  });

  revalidateSourceCuration();
  revalidatePath("/admin/compliance");
  revalidatePath("/api/admin/agentes-ia/runtime");

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel processar compliance."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Compliance ${result.data.complianceRunCode} processado para ${result.data.snapshotCode}.`
    )
  );
}

export async function releaseCommunicationAction(formData: FormData) {
  const snapshotCode = field(formData, "snapshotCode");
  const complianceRunCode = field(formData, "complianceRunCode");

  if (!snapshotCode || !complianceRunCode) {
    redirect(returnPath(formData, "error", "Processe compliance antes de liberar comunicacao."));
  }

  const channels = field(formData, "channels", "WhatsApp, Email, Push")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const result = await releaseCommunicationFromSnapshotRecord({
    snapshotCode,
    complianceRunCode,
    audienceScope: field(formData, "audienceScope", "all"),
    channels,
    messageIntent: field(
      formData,
      "messageIntent",
      "Preparar comunicacao supervisionada da oportunidade aprovada, separando mensagem completa para cliente pagante e teaser seguro para lead frio."
    ),
    operatorLabel: field(formData, "operatorLabel", "Growth Betel"),
    reviewerLabel: field(formData, "reviewerLabel", "Compliance Betel"),
    notes: field(formData, "notes"),
  });

  revalidateSourceCuration();
  revalidatePath("/admin/compliance");
  revalidatePath("/admin/alertas");
  revalidatePath("/api/admin/agentes-ia/communication");
  revalidatePath("/api/admin/agentes-ia/communication/delivery");
  revalidatePath("/api/admin/agentes-ia/communication/worker");

  if (!result.ok || !result.data) {
    redirect(returnPath(formData, "error", result.error || "Nao foi possivel liberar comunicacao."));
  }

  redirect(
    returnPath(
      formData,
      "success",
      `Comunicacao liberada: ${result.data.outboxCount} mensagens no outbox.`
    )
  );
}
