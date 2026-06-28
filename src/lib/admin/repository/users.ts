import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { bootstrapAdmin, normalizePhone } from "@/lib/auth/bootstrap-admin";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DataResult, MutationResult } from "./shared";

export type AdminUserRole = "owner" | "admin" | "manager" | "analyst" | "viewer";
export type AdminUserStatus = "active" | "invited" | "suspended" | "disabled";

export type AdminUserListItem = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  authUserId: string | null;
  displayName: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  permissions: Record<string, unknown>;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminUserInput = {
  displayName: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  organizationName?: string;
};

export type CreateBootstrapAdminAccountInput = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
};

type AdminUserDbRow = {
  id: string;
  organization_id: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  permissions: Record<string, unknown> | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  admin_organizations?: { name: string | null } | null;
};

const defaultOrganizationName = "Betel Leiloes";
const validRoles: AdminUserRole[] = ["owner", "admin", "manager", "analyst", "viewer"];
const validStatuses: AdminUserStatus[] = ["active", "invited", "suspended", "disabled"];

function normalizeRole(value: string): AdminUserRole {
  return validRoles.includes(value as AdminUserRole) ? (value as AdminUserRole) : "analyst";
}

function normalizeStatus(value: string): AdminUserStatus {
  return validStatuses.includes(value as AdminUserStatus) ? (value as AdminUserStatus) : "active";
}

function permissionsForRole(role: AdminUserRole) {
  if (role === "owner") return { all: true };
  if (role === "admin") return { admin: true, users: true, operations: true };
  if (role === "manager") return { operations: true, review: true };
  if (role === "analyst") return { opportunities: true, review: true };
  return { read: true };
}

async function findAuthUserByEmail(supabase: SupabaseClient, email: string): Promise<User | null> {
  const normalizedEmail = email.toLowerCase();

  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);

    const user = data.users.find((item) => item.email?.toLowerCase() === normalizedEmail);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }

  return null;
}

function normalizeAdminUser(row: AdminUserDbRow): AdminUserListItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.admin_organizations?.name || defaultOrganizationName,
    authUserId: row.auth_user_id,
    displayName: row.display_name || row.email || "Admin",
    email: row.email || "",
    role: normalizeRole(row.role || "analyst"),
    status: normalizeStatus(row.status || "active"),
    permissions: row.permissions || {},
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

async function ensureAdminOrganization(name: string): Promise<MutationResult<{ id: string }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const normalizedName = name.trim() || defaultOrganizationName;
  const { data: existing, error: existingError } = await supabase
    .from("admin_organizations")
    .select("id")
    .ilike("name", normalizedName)
    .limit(1)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };
  if (existing?.id) return { ok: true, data: { id: existing.id } };

  const { data, error } = await supabase
    .from("admin_organizations")
    .insert({
      name: normalizedName,
      organization_type: "internal",
      status: "active",
    })
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message || "Nao foi possivel criar a organizacao." };
  return { ok: true, data: { id: data.id } };
}

export async function listAdminUsers(limit = 80): Promise<DataResult<AdminUserListItem[]>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      data: [],
      source: "mock",
      reason: "Supabase admin nao configurado.",
    };
  }

  const { data, error } = await supabase
    .from("admin_users")
    .select("*, admin_organizations(name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return {
      data: [],
      source: "mock",
      reason: error.message,
    };
  }

  return {
    data: (data || []).map((row) => normalizeAdminUser(row as AdminUserDbRow)),
    source: "supabase",
  };
}

export async function createAdminUserRecord(
  input: CreateAdminUserInput
): Promise<MutationResult<{ id: string; mode: "created" | "updated" }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const role = normalizeRole(input.role);
  const status = normalizeStatus(input.status);

  if (!displayName) return { ok: false, error: "Informe o nome do usuario." };
  if (!email || !email.includes("@")) return { ok: false, error: "Informe um email valido." };

  const organization = await ensureAdminOrganization(input.organizationName || defaultOrganizationName);
  if (!organization.ok || !organization.data?.id) {
    return { ok: false, error: organization.error || "Organizacao administrativa indisponivel." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("admin_users")
    .select("id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  const payload = {
    organization_id: organization.data.id,
    display_name: displayName,
    email,
    role,
    status,
    permissions: permissionsForRole(role),
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from("admin_users").update(payload).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { id: existing.id, mode: "updated" } };
  }

  const { data, error } = await supabase
    .from("admin_users")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message || "Nao foi possivel cadastrar o usuario." };
  return { ok: true, data: { id: data.id, mode: "created" } };
}

export async function createBootstrapAdminAccountRecord(
  input: CreateBootstrapAdminAccountInput
): Promise<MutationResult<{ email: string; mode: "created" | "linked" | "ready" }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone);
  const password = input.password;

  if (displayName.toLowerCase() !== bootstrapAdmin.displayName.toLowerCase()) {
    return { ok: false, error: "Nome do admin inicial nao confere." };
  }

  if (email !== bootstrapAdmin.email) {
    return { ok: false, error: "Este cadastro inicial esta liberado somente para o email owner da Betel." };
  }

  if (phone !== bootstrapAdmin.phone) {
    return { ok: false, error: "WhatsApp do admin inicial nao confere." };
  }

  if (password.length < 8) {
    return { ok: false, error: "A senha precisa ter pelo menos 8 caracteres." };
  }

  const organization = await ensureAdminOrganization(bootstrapAdmin.organizationName);
  if (!organization.ok || !organization.data?.id) {
    return { ok: false, error: organization.error || "Organizacao administrativa indisponivel." };
  }

  const { data: existingAdmin, error: existingAdminError } = await supabase
    .from("admin_users")
    .select("id,auth_user_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingAdminError) return { ok: false, error: existingAdminError.message };
  if (existingAdmin?.auth_user_id) {
    return { ok: true, data: { email, mode: "ready" } };
  }

  let authUserId: string | null = null;
  let mode: "created" | "linked" = "linked";

  try {
    const existingAuthUser = await findAuthUserByEmail(supabase, email);

    if (existingAuthUser?.id) {
      authUserId = existingAuthUser.id;
      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        user_metadata: {
          name: displayName,
          phone,
          source: "admin_bootstrap",
        },
      });
      if (updateAuthError) return { ok: false, error: updateAuthError.message };
    } else {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name: displayName,
          phone,
          source: "admin_bootstrap",
        },
      });

      if (authError || !authData.user?.id) {
        return { ok: false, error: authError?.message || "Nao foi possivel criar o usuario no Supabase Auth." };
      }

      authUserId = authData.user.id;
      mode = "created";
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Nao foi possivel consultar o Supabase Auth." };
  }

  const payload = {
    organization_id: organization.data.id,
    auth_user_id: authUserId,
    display_name: displayName,
    email,
    role: "owner" as AdminUserRole,
    status: "active" as AdminUserStatus,
    permissions: { all: true, bootstrap: true },
    updated_at: new Date().toISOString(),
  };

  if (existingAdmin?.id) {
    const { error } = await supabase.from("admin_users").update(payload).eq("id", existingAdmin.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { email, mode } };
  }

  const { error } = await supabase.from("admin_users").insert(payload);
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: { email, mode } };
}

export async function updateAdminUserStatusRecord(
  id: string,
  status: AdminUserStatus
): Promise<MutationResult<{ id: string; status: AdminUserStatus }>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const nextStatus = normalizeStatus(status);
  const { error } = await supabase
    .from("admin_users")
    .update({ status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id, status: nextStatus } };
}
