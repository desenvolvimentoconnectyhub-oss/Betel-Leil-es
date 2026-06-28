"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createInvestorProfileRecord,
  type CreateInvestorProfileInput,
} from "@/lib/admin/repository";
import { normalizeRiskAppetite } from "@/lib/admin/investors";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberField(formData: FormData, name: string, fallback = 0) {
  const raw = field(formData, name);
  if (!raw) return fallback;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanField(formData: FormData, name: string, fallback = false) {
  const value = formData.get(name);
  if (value == null) return fallback;
  if (typeof value !== "string") return fallback;

  return ["true", "1", "on", "sim"].includes(value.trim().toLowerCase());
}

function listField(formData: FormData, name: string) {
  return field(formData, name)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function errorRedirect(path: string, message: string): never {
  redirect(`${path}?status=error&message=${encodeURIComponent(message)}`);
}

function parseInvestorForm(formData: FormData, errorPath: string): CreateInvestorProfileInput {
  const name = field(formData, "name");

  if (!name) errorRedirect(errorPath, "Informe o nome do investidor.");

  return {
    name,
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    organization: field(formData, "organization", "Cliente direto"),
    cityFocus: listField(formData, "cityFocus"),
    maxBudget: numberField(formData, "maxBudget"),
    targetRoiPct: Math.max(0, Math.round(numberField(formData, "targetRoiPct", 18))),
    riskAppetite: normalizeRiskAppetite(field(formData, "riskAppetite", "moderado")),
    preferredPropertyTypes: listField(formData, "preferredPropertyTypes"),
    status: field(formData, "status", "Ativo"),
    planKey: field(formData, "planKey", "free"),
    lifecycleStage: field(formData, "lifecycleStage", "lead"),
    whatsappOptIn: booleanField(formData, "whatsappOptIn", true),
    emailOptIn: booleanField(formData, "emailOptIn", true),
    pushOptIn: booleanField(formData, "pushOptIn"),
    communityOptIn: booleanField(formData, "communityOptIn"),
    communicationFrequency: field(formData, "communicationFrequency", "normal"),
    fullAccessUntil: field(formData, "fullAccessUntil"),
    notes: field(formData, "notes", "Perfil cadastrado para matching assistido."),
    owner: field(formData, "owner", "Comercial"),
  };
}

export async function createInvestorAction(formData: FormData) {
  const payload = parseInvestorForm(formData, "/admin/investidores/novo");
  const result = await createInvestorProfileRecord(payload);

  if (!result.ok || !result.data?.id) {
    errorRedirect("/admin/investidores/novo", result.error || "Nao foi possivel cadastrar o investidor.");
  }

  revalidatePath("/admin");
  revalidatePath("/admin/investidores");
  revalidatePath(`/admin/investidores/${result.data.id}`);

  redirect(`/admin/investidores/${result.data.id}`);
}
