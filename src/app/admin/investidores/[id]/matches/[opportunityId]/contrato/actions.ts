"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  issueAdvisoryContractRecord,
  signAdvisoryContractRecord,
  type AdvisoryContractMutationInput,
} from "@/lib/admin/repository";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function contractPath(investorId: string, opportunityId: string) {
  return `/admin/investidores/${investorId}/matches/${opportunityId}/contrato`;
}

function packPath(investorId: string, opportunityId: string) {
  return `/admin/investidores/${investorId}/matches/${opportunityId}`;
}

function redirectWithStatus(path: string, status: "success" | "error", message: string): never {
  redirect(`${path}?status=${status}&message=${encodeURIComponent(message)}`);
}

function parseContractAction(formData: FormData): AdvisoryContractMutationInput {
  return {
    investorId: field(formData, "investorId"),
    opportunityId: field(formData, "opportunityId"),
    reviewedBy: field(formData, "reviewedBy", "Juridico + Operacao"),
    notes: field(formData, "notes"),
  };
}

export async function issueAdvisoryContractAction(formData: FormData) {
  const payload = parseContractAction(formData);
  const path = contractPath(payload.investorId, payload.opportunityId);
  const result = await issueAdvisoryContractRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus(path, "error", result.error || "Nao foi possivel emitir a minuta.");
  }

  revalidatePath(path);
  revalidatePath(packPath(payload.investorId, payload.opportunityId));
  revalidatePath(`/admin/investidores/${payload.investorId}`);

  redirectWithStatus(path, "success", `Minuta ${result.data.contractCode} emitida e aguardando assinatura.`);
}

export async function signAdvisoryContractAction(formData: FormData) {
  const payload = parseContractAction(formData);
  const path = contractPath(payload.investorId, payload.opportunityId);
  const result = await signAdvisoryContractRecord(payload);

  if (!result.ok || !result.data) {
    redirectWithStatus(path, "error", result.error || "Nao foi possivel registrar a assinatura.");
  }

  revalidatePath(path);
  revalidatePath(packPath(payload.investorId, payload.opportunityId));
  revalidatePath(`/admin/investidores/${payload.investorId}`);
  revalidatePath("/admin/arremate");
  revalidatePath("/admin/auction-room");

  redirectWithStatus(
    path,
    "success",
    `Assinatura registrada. Estrategia ${result.data.strategyCode || "de lance"} e sala de arremate liberadas.`
  );
}
