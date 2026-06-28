"use server";

import { redirect } from "next/navigation";
import { bootstrapAdmin, normalizePhone } from "@/lib/auth/bootstrap-admin";
import { createBootstrapAdminAccountRecord } from "@/lib/admin/repository";

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redirectWith(status: "success" | "error", message: string): never {
  const params = new URLSearchParams({ status, message });
  redirect(`/cadastro?${params.toString()}`);
}

export async function createAdminSignupAction(formData: FormData) {
  const password = field(formData, "password");
  const confirmPassword = field(formData, "confirmPassword");
  const email = field(formData, "email").toLowerCase();
  const phone = normalizePhone(field(formData, "phone"));

  if (password !== confirmPassword) {
    redirectWith("error", "As senhas nao conferem.");
  }

  if (email !== bootstrapAdmin.email || phone !== bootstrapAdmin.phone) {
    redirectWith("error", "Cadastro inicial liberado somente para o owner configurado da Betel.");
  }

  const result = await createBootstrapAdminAccountRecord({
    displayName: field(formData, "name"),
    email: field(formData, "email"),
    password,
    phone: field(formData, "phone"),
  });

  if (!result.ok) {
    redirectWith("error", result.error || "Nao foi possivel criar o admin.");
  }

  const statusByMode = {
    created: "admin_signup_success",
    linked: "admin_linked_success",
    ready: "admin_ready",
  } as const;

  const loginParams = new URLSearchParams({
    status: statusByMode[result.data?.mode || "created"],
    email: result.data?.email || bootstrapAdmin.email,
  });

  redirect(`/login?next=%2Fadmin&${loginParams.toString()}`);
}
