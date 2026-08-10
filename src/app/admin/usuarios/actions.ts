"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import {
  createAdminUserRecord,
  deleteAdminUserRecord,
  defaultSectorKeysForRole,
  resendAdminUserInviteRecord,
  updateAdminUserRecord,
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

function sectorKeys(formData: FormData) {
  return formData
    .getAll("sectorKeys")
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);
}

function resolveSectorKeysForRole(role: AdminUserRole, selectedSectorKeys: string[]) {
  if (selectedSectorKeys.length) return selectedSectorKeys;
  if (role === "owner" || role === "admin") return defaultSectorKeysForRole(role);
  return [];
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
  const admin = await requireUserManager();

  const roleValue = field(formData, "role", "analyst");
  const statusValue = field(formData, "status", "active");
  const role = (allowedRoles.has(roleValue) ? roleValue : "analyst") as AdminUserRole;
  const status = (allowedStatuses.has(statusValue) ? statusValue : "active") as AdminUserStatus;
  const selectedSectorKeys = sectorKeys(formData);
  const resolvedSectorKeys = resolveSectorKeysForRole(role, selectedSectorKeys);

  if (!resolvedSectorKeys.length) {
    redirectWith("/admin/usuarios", "error", "Selecione o setor do pipeline deste usuario.");
  }

  const result = await createAdminUserRecord({
    displayName: field(formData, "displayName"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    role,
    status,
    organizationName: field(formData, "organizationName", "Betel Leiloes"),
    invitedByAdminId: admin.id,
    sectorKeys: resolvedSectorKeys,
  });

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel cadastrar o usuario.");
  }

  revalidatePath("/admin/usuarios");
  if (result.data?.inviteStatus === "failed") {
    redirectWith(
      "/admin/usuarios",
      "error",
      `Usuario salvo, mas o convite nao foi enviado: ${result.data.inviteError || "erro desconhecido."}`
    );
  }

  redirectWith(
    "/admin/usuarios",
    "success",
    result.data?.inviteStatus === "linked_existing"
      ? "Usuario salvo e vinculado a uma conta Supabase Auth existente."
      : result.data?.mode === "updated"
        ? "Usuario administrativo atualizado e link de senha enviado pelo WhatsApp."
        : "Usuario administrativo cadastrado e link de senha enviado pelo WhatsApp."
  );
}

export async function updateAdminUserAction(formData: FormData) {
  const admin = await requireUserManager();

  const id = field(formData, "id");
  const roleValue = field(formData, "role", "analyst");
  const statusValue = field(formData, "status", "active");
  const role = (allowedRoles.has(roleValue) ? roleValue : "analyst") as AdminUserRole;
  const status = (allowedStatuses.has(statusValue) ? statusValue : "active") as AdminUserStatus;
  const selectedSectorKeys = sectorKeys(formData);
  const resolvedSectorKeys = resolveSectorKeysForRole(role, selectedSectorKeys);

  if (!resolvedSectorKeys.length) {
    redirectWith("/admin/usuarios", "error", "Selecione o setor do pipeline deste usuario.");
  }

  const result = await updateAdminUserRecord({
    id,
    displayName: field(formData, "displayName"),
    email: field(formData, "email"),
    phone: field(formData, "phone"),
    role,
    status,
    organizationName: field(formData, "organizationName", "Betel Leiloes"),
    invitedByAdminId: admin.id,
    sectorKeys: resolvedSectorKeys,
  });

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel editar o usuario.");
  }

  revalidatePath("/admin/usuarios");
  if (result.data?.inviteStatus === "failed") {
    redirectWith(
      "/admin/usuarios",
      "error",
      `Usuario atualizado, mas o WhatsApp nao foi enviado: ${result.data.inviteError || "erro desconhecido."}`
    );
  }

  redirectWith("/admin/usuarios", "success", "Usuario atualizado e link de senha reenviado pelo WhatsApp.");
}

export async function resendAdminUserInviteAction(formData: FormData) {
  const admin = await requireUserManager();
  const id = field(formData, "id");

  const result = await resendAdminUserInviteRecord(id, admin.id);

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel reenviar o convite.");
  }

  revalidatePath("/admin/usuarios");
  if (result.data?.inviteStatus === "failed") {
    redirectWith(
      "/admin/usuarios",
      "error",
      `Usuario salvo, mas o WhatsApp nao foi enviado: ${result.data.inviteError || "erro desconhecido."}`
    );
  }

  redirectWith("/admin/usuarios", "success", "Link de senha reenviado pelo WhatsApp.");
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

export async function deleteAdminUserAction(formData: FormData) {
  const admin = await requireUserManager();
  const id = field(formData, "id");

  const result = await deleteAdminUserRecord(id, { id: admin.id, role: admin.role });

  if (!result.ok) {
    redirectWith("/admin/usuarios", "error", result.error || "Nao foi possivel remover o usuario.");
  }

  revalidatePath("/admin/usuarios");
  if (result.data?.authDeleteError) {
    redirectWith(
      "/admin/usuarios",
      "success",
      `Usuario removido do painel. Aviso: nao foi possivel remover o acesso Auth automaticamente: ${result.data.authDeleteError}`
    );
  }

  redirectWith("/admin/usuarios", "success", "Usuario removido do painel e do acesso Auth.");
}
