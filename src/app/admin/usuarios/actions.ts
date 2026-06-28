"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import {
  createAdminUserRecord,
  updateAdminUserStatusRecord,
  type AdminUserRole,
  type AdminUserStatus,
} from "@/lib/admin/repository";

const managerRoles = new Set(["owner", "admin"]);
const allowedRoles = new Set(["owner", "admin", "manager", "analyst", "viewer"]);
const allowedStatuses = new Set(["active", "invited", "suspended", "disabled"]);

function field(formData: FormData, name: string, fallback = "") {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redirectWith(path: string, status: "success" | "error", message: string): never {
  redirect(`${path}?status=${status}&message=${encodeURIComponent(message)}`);
}

async function requireUserManager(errorPath = "/admin/usuarios") {
  const admin = await requireCurrentAdmin();
  if (!managerRoles.has(admin.role)) {
    redirectWith(errorPath, "error", "Seu perfil nao pode gerenciar usuarios.");
  }

  return admin;
}

export async function createAdminUserAction(formData: FormData) {
  await requireUserManager();

  const roleValue = field(formData, "role", "analyst");
  const statusValue = field(formData, "status", "active");
  const role = (allowedRoles.has(roleValue) ? roleValue : "analyst") as AdminUserRole;
  const status = (allowedStatuses.has(statusValue) ? statusValue : "active") as AdminUserStatus;

  const result = await createAdminUserRecord({
    displayName: field(formData, "displayName"),
    email: field(formData, "email"),
    role,
    status,
    organizationName: field(formData, "organizationName", "Betel Leiloes"),
  });

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel cadastrar o usuario.");
  }

  revalidatePath("/admin/usuarios");
  redirectWith(
    "/admin/usuarios",
    "success",
    result.data?.mode === "updated"
      ? "Usuario administrativo atualizado."
      : "Usuario administrativo cadastrado. Agora crie/habilite o mesmo email no Supabase Auth."
  );
}

export async function updateAdminUserStatusAction(formData: FormData) {
  const admin = await requireUserManager();
  const id = field(formData, "id");
  const statusValue = field(formData, "status", "active");
  const status = (allowedStatuses.has(statusValue) ? statusValue : "active") as AdminUserStatus;

  if (!id) redirectWith("/admin/usuarios", "error", "Usuario nao informado.");
  if (id === admin.id && status !== "active") {
    redirectWith("/admin/usuarios", "error", "Voce nao pode bloquear o proprio usuario ativo.");
  }

  const result = await updateAdminUserStatusRecord(id, status);

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel atualizar o status.");
  }

  revalidatePath("/admin/usuarios");
  redirectWith("/admin/usuarios", "success", "Status do usuario atualizado.");
}
