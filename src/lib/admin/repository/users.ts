import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { bootstrapAdmin, normalizePhone } from "@/lib/auth/bootstrap-admin";
import { sendGlobalWhatsAppText } from "@/lib/communication/connectyhub-client";
import { renderMessageTemplate } from "@/lib/communication/message-templates";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DataResult, MutationResult } from "./shared";

export type AdminUserRole = "owner" | "admin" | "manager" | "analyst" | "viewer";
export type AdminUserStatus = "active" | "invited" | "suspended" | "disabled";
export type AdminUserInviteStatus = "not_sent" | "sent" | "failed" | "linked_existing";

export type AdminUserListItem = {
  id: string;
  organizationId: string | null;
  organizationName: string;
  authUserId: string | null;
  displayName: string;
  email: string;
  phone: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  permissions: Record<string, unknown>;
  inviteStatus: AdminUserInviteStatus;
  inviteError: string | null;
  invitedAt: string | null;
  invitedByAdminUserId: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateAdminUserInput = {
  displayName: string;
  email: string;
  phone?: string;
  role: AdminUserRole;
  status: AdminUserStatus;
  organizationName?: string;
  invitedByAdminId?: string | null;
};

export type UpdateAdminUserInput = CreateAdminUserInput & {
  id: string;
};

export type CreateBootstrapAdminAccountInput = {
  displayName: string;
  email: string;
  phone: string;
  password: string;
};

type AdminInviteLinkKind = "invite" | "recovery";

type AdminInviteDeliveryResult = {
  authUserId: string | null;
  inviteStatus: AdminUserInviteStatus;
  inviteError: string | null;
  invitedAt: string | null;
};

type AdminUserDbRow = {
  id: string;
  organization_id: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  status: string | null;
  permissions: Record<string, unknown> | null;
  invite_status: string | null;
  invite_error: string | null;
  invited_at: string | null;
  invited_by_admin_user_id: string | null;
  last_seen_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  admin_organizations?: { name: string | null } | null;
};

const defaultOrganizationName = "Betel Leiloes";
const adminPasswordPath = "/definir-senha";
const adminDefaultNextPath = "/admin";
const validRoles: AdminUserRole[] = ["owner", "admin", "manager", "analyst", "viewer"];
const validStatuses: AdminUserStatus[] = ["active", "invited", "suspended", "disabled"];
const validInviteStatuses: AdminUserInviteStatus[] = ["not_sent", "sent", "failed", "linked_existing"];

function normalizeRole(value: string): AdminUserRole {
  return validRoles.includes(value as AdminUserRole) ? (value as AdminUserRole) : "analyst";
}

function normalizeStatus(value: string): AdminUserStatus {
  return validStatuses.includes(value as AdminUserStatus) ? (value as AdminUserStatus) : "active";
}

function normalizeInviteStatus(value: string | null | undefined): AdminUserInviteStatus {
  return validInviteStatuses.includes(value as AdminUserInviteStatus)
    ? (value as AdminUserInviteStatus)
    : "not_sent";
}

function permissionsForRole(role: AdminUserRole) {
  if (role === "owner") return { all: true };
  if (role === "admin") return { admin: true, users: true, operations: true };
  if (role === "manager") return { operations: true, review: true };
  if (role === "analyst") return { opportunities: true, review: true };
  return { read: true };
}

function publicAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.BETEL_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  );
}

function buildAdminPasswordUrl(rawUrl: string, baseUrl = "") {
  if (!rawUrl) return undefined;

  try {
    const url = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    url.pathname = adminPasswordPath;
    url.search = "";
    url.hash = "";
    url.searchParams.set("next", adminDefaultNextPath);
    return url.toString();
  } catch {
    return undefined;
  }
}

function getAdminInviteRedirectUrl() {
  const appUrl = publicAppUrl();
  const explicit = process.env.BETEL_ADMIN_INVITE_REDIRECT_URL?.trim();
  const candidates = explicit ? [explicit, appUrl] : [appUrl];

  for (const candidate of candidates) {
    const normalized = buildAdminPasswordUrl(candidate, appUrl);
    if (normalized) return normalized;
  }

  return undefined;
}

function normalizePasswordLinkType(value: string | undefined, fallback: AdminInviteLinkKind): AdminInviteLinkKind {
  return value === "invite" || value === "recovery" ? value : fallback;
}

function buildAdminPasswordPageLink(
  properties: { action_link?: string; hashed_token?: string; verification_type?: string } | null | undefined,
  fallbackKind: AdminInviteLinkKind
) {
  const tokenHash = properties?.hashed_token?.trim();
  const redirectTo = getAdminInviteRedirectUrl();

  if (tokenHash && redirectTo) {
    const url = new URL(redirectTo);
    url.searchParams.set("token_hash", tokenHash);
    url.searchParams.set("type", normalizePasswordLinkType(properties?.verification_type, fallbackKind));
    return url.toString();
  }

  return properties?.action_link?.trim() || "";
}

function makeAdminInviteMessageCode(email: string) {
  const slug = email.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 24) || "usuario";
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ADMIN-INVITE-${Date.now().toString(36).toUpperCase()}-${slug}-${suffix}`;
}

function firstName(displayName: string) {
  return displayName.trim().split(/\s+/)[0] || "tudo bem";
}

function failedInviteDelivery(error: unknown, fallback: string, authUserId: string | null = null): AdminInviteDeliveryResult {
  return {
    authUserId,
    inviteStatus: "failed",
    inviteError: error instanceof Error ? error.message : fallback,
    invitedAt: null,
  };
}

async function sendAdminInviteWhatsApp(input: {
  displayName: string;
  email: string;
  phone: string;
  role: AdminUserRole;
  actionLink: string;
  linkKind: AdminInviteLinkKind;
}): Promise<{ ok: boolean; error?: string }> {
  const messageCode = makeAdminInviteMessageCode(input.email);
  const greeting = firstName(input.displayName);
  const linkPurpose = input.linkKind === "recovery" ? "redefinir sua senha" : "cadastrar sua senha";
  const buttonLabel = input.linkKind === "recovery" ? "Redefinir senha" : "Cadastrar senha";
  const rendered = await renderMessageTemplate({
    templateKey: input.linkKind === "recovery" ? "admin.recovery" : "admin.invite",
    channel: "whatsapp",
    audienceKey: "admin",
    variables: {
      recipient_name: input.displayName,
      recipient_first_name: greeting,
      recipient_email: input.email,
      recipient_phone: input.phone,
      recipient_role: input.role,
      action_link: input.actionLink,
      link_purpose: linkPurpose,
      button_label: buttonLabel,
      button_url: input.actionLink,
    },
  });
  const renderedButton = rendered.actionButton;

  const delivery = await sendGlobalWhatsAppText({
    messageCode,
    runCode: `ADMIN-USER-${messageCode}`,
    subject: rendered.subject || `Oi, ${greeting}. Seu acesso ao painel da Betel foi liberado.`,
    messagePreview:
      rendered.body ||
      [
        `Toque no botao abaixo para ${linkPurpose} e acessar o painel admin.`,
        "",
        "Esse link e pessoal. Se expirar, peca para o admin reenviar outro convite.",
      ].join("\n"),
    guardrailSummary: rendered.guardrailSummary,
    actionButton: {
      label: renderedButton?.label || buttonLabel,
      url: input.actionLink,
      footerText: renderedButton?.footerText || "Acesso seguro Betel Leiloes",
    },
    payload: {
      eventType: "admin_user_password_link",
      template: {
        key: rendered.template.templateKey,
        version: rendered.template.version,
        missingVariables: rendered.missingVariables,
      },
      recipient: {
        name: input.displayName,
        email: input.email,
        phone: input.phone,
      },
      auth: {
        role: input.role,
        linkKind: input.linkKind,
        passwordUrl: adminPasswordPath,
      },
    },
  });

  if (!delivery.ok) {
    return {
      ok: false,
      error: delivery.errorMessage || `ConnectyHub nao aceitou o WhatsApp (${delivery.providerStatus}).`,
    };
  }

  return { ok: true };
}

async function generateAdminPasswordLink(
  supabase: SupabaseClient,
  input: {
    email: string;
    displayName: string;
    phone: string;
    role: AdminUserRole;
    linkKind: AdminInviteLinkKind;
  }
) {
  const redirectTo = getAdminInviteRedirectUrl();

  if (input.linkKind === "invite") {
    const options: { data: Record<string, string>; redirectTo?: string } = {
      data: {
        name: input.displayName,
        phone: input.phone,
        role: input.role,
        source: "admin_user_invite",
        invite_channel: "whatsapp",
      },
    };
    if (redirectTo) options.redirectTo = redirectTo;

    return supabase.auth.admin.generateLink({
      type: "invite",
      email: input.email,
      options,
    });
  }

  const options: { redirectTo?: string } = {};
  if (redirectTo) options.redirectTo = redirectTo;

  return supabase.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
    ...(redirectTo ? { options } : {}),
  });
}

async function deliverAdminPasswordInvite(
  supabase: SupabaseClient,
  input: {
    displayName: string;
    email: string;
    phone: string;
    role: AdminUserRole;
  }
): Promise<AdminInviteDeliveryResult> {
  const invitedAt = new Date().toISOString();
  let authUserId: string | null = null;
  let linkKind: AdminInviteLinkKind = "invite";

  try {
    const existingAuthUser = await findAuthUserByEmail(supabase, input.email);

    if (existingAuthUser?.id) {
      authUserId = existingAuthUser.id;
      linkKind = "recovery";

      const { error: updateAuthError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        user_metadata: {
          ...existingAuthUser.user_metadata,
          name: input.displayName,
          phone: input.phone,
          role: input.role,
          source: "admin_user_management",
          invite_channel: "whatsapp",
        },
      });

      if (updateAuthError) {
        return failedInviteDelivery(updateAuthError, "Nao foi possivel atualizar o usuario no Supabase Auth.", authUserId);
      }
    }

    const { data: linkData, error: linkError } = await generateAdminPasswordLink(supabase, {
      ...input,
      linkKind,
    });

    const actionLink = buildAdminPasswordPageLink(linkData?.properties, linkKind);
    authUserId = linkData?.user?.id || authUserId;

    if (linkError || !actionLink || !authUserId) {
      return failedInviteDelivery(
        linkError,
        "Nao foi possivel gerar o link seguro de senha no Supabase Auth.",
        authUserId
      );
    }

    const whatsapp = await sendAdminInviteWhatsApp({
      ...input,
      actionLink,
      linkKind,
    });

    if (!whatsapp.ok) {
      return {
        authUserId,
        inviteStatus: "failed",
        inviteError: whatsapp.error || "Nao foi possivel enviar o link pelo WhatsApp.",
        invitedAt: null,
      };
    }

    return {
      authUserId,
      inviteStatus: "sent",
      inviteError: null,
      invitedAt,
    };
  } catch (error) {
    return failedInviteDelivery(error, "Nao foi possivel gerar ou enviar o convite administrativo.", authUserId);
  }
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
    phone: row.phone || "",
    role: normalizeRole(row.role || "analyst"),
    status: normalizeStatus(row.status || "active"),
    permissions: row.permissions || {},
    inviteStatus: normalizeInviteStatus(row.invite_status),
    inviteError: row.invite_error,
    invitedAt: row.invited_at,
    invitedByAdminUserId: row.invited_by_admin_user_id,
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
): Promise<
  MutationResult<{
    id: string;
    mode: "created" | "updated";
    inviteStatus: AdminUserInviteStatus;
    inviteError?: string;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone || "");
  const role = normalizeRole(input.role);
  const status = normalizeStatus(input.status);

  if (!displayName) return { ok: false, error: "Informe o nome do usuario." };
  if (!email || !email.includes("@")) return { ok: false, error: "Informe um email valido." };
  if (!phone || phone.length < 10) return { ok: false, error: "Informe um telefone valido." };

  const organization = await ensureAdminOrganization(input.organizationName || defaultOrganizationName);
  if (!organization.ok || !organization.data?.id) {
    return { ok: false, error: organization.error || "Organizacao administrativa indisponivel." };
  }

  const { data: existing, error: existingError } = await supabase
    .from("admin_users")
    .select("id,auth_user_id")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (existingError) return { ok: false, error: existingError.message };

  const now = new Date().toISOString();
  let authUserId = typeof existing?.auth_user_id === "string" ? existing.auth_user_id : null;
  const inviteDelivery = await deliverAdminPasswordInvite(supabase, {
    displayName,
    email,
    phone,
    role,
  });
  authUserId = inviteDelivery.authUserId || authUserId;

  const payload = {
    organization_id: organization.data.id,
    auth_user_id: authUserId,
    display_name: displayName,
    email,
    phone,
    role,
    status,
    permissions: permissionsForRole(role),
    invite_status: inviteDelivery.inviteStatus,
    invite_error: inviteDelivery.inviteError,
    invited_at: inviteDelivery.invitedAt,
    invited_by_admin_user_id: input.invitedByAdminId || null,
    updated_at: now,
  };

  if (existing?.id) {
    const { error } = await supabase.from("admin_users").update(payload).eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      data: {
        id: existing.id,
        mode: "updated",
        inviteStatus: inviteDelivery.inviteStatus,
        ...(inviteDelivery.inviteError ? { inviteError: inviteDelivery.inviteError } : {}),
      },
    };
  }

  const { data, error } = await supabase
    .from("admin_users")
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message || "Nao foi possivel cadastrar o usuario." };
  return {
    ok: true,
    data: {
      id: data.id,
      mode: "created",
      inviteStatus: inviteDelivery.inviteStatus,
      ...(inviteDelivery.inviteError ? { inviteError: inviteDelivery.inviteError } : {}),
    },
  };
}

export async function updateAdminUserRecord(
  input: UpdateAdminUserInput
): Promise<
  MutationResult<{
    id: string;
    inviteStatus: AdminUserInviteStatus;
    inviteError?: string;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const adminUserId = input.id.trim();
  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = normalizePhone(input.phone || "");
  const role = normalizeRole(input.role);
  const status = normalizeStatus(input.status);

  if (!adminUserId) return { ok: false, error: "Usuario nao informado." };
  if (!displayName) return { ok: false, error: "Informe o nome do usuario." };
  if (!email || !email.includes("@")) return { ok: false, error: "Informe um email valido." };
  if (!phone || phone.length < 10) return { ok: false, error: "Informe um telefone valido." };

  const { data: current, error: currentError } = await supabase
    .from("admin_users")
    .select("id,auth_user_id,email")
    .eq("id", adminUserId)
    .maybeSingle();

  if (currentError) return { ok: false, error: currentError.message };
  if (!current) return { ok: false, error: "Usuario administrativo nao encontrado." };

  const { data: emailConflict, error: conflictError } = await supabase
    .from("admin_users")
    .select("id")
    .ilike("email", email)
    .neq("id", adminUserId)
    .limit(1)
    .maybeSingle();

  if (conflictError) return { ok: false, error: conflictError.message };
  if (emailConflict?.id) return { ok: false, error: "Ja existe outro usuario administrativo com este email." };

  const organization = await ensureAdminOrganization(input.organizationName || defaultOrganizationName);
  if (!organization.ok || !organization.data?.id) {
    return { ok: false, error: organization.error || "Organizacao administrativa indisponivel." };
  }

  const currentAuthUserId = typeof current.auth_user_id === "string" ? current.auth_user_id : null;
  if (currentAuthUserId) {
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(currentAuthUserId, {
      email,
      user_metadata: {
        name: displayName,
        phone,
        role,
        source: "admin_user_management",
        invite_channel: "whatsapp",
      },
    });

    if (updateAuthError) return { ok: false, error: updateAuthError.message };
  }

  const inviteDelivery = await deliverAdminPasswordInvite(supabase, {
    displayName,
    email,
    phone,
    role,
  });

  const { error: updateError } = await supabase
    .from("admin_users")
    .update({
      organization_id: organization.data.id,
      auth_user_id: inviteDelivery.authUserId || currentAuthUserId,
      display_name: displayName,
      email,
      phone,
      role,
      status,
      permissions: permissionsForRole(role),
      invite_status: inviteDelivery.inviteStatus,
      invite_error: inviteDelivery.inviteError,
      invited_at: inviteDelivery.invitedAt,
      invited_by_admin_user_id: input.invitedByAdminId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminUserId);

  if (updateError) return { ok: false, error: updateError.message };

  return {
    ok: true,
    data: {
      id: adminUserId,
      inviteStatus: inviteDelivery.inviteStatus,
      ...(inviteDelivery.inviteError ? { inviteError: inviteDelivery.inviteError } : {}),
    },
  };
}

export async function resendAdminUserInviteRecord(
  id: string,
  invitedByAdminId?: string | null
): Promise<
  MutationResult<{
    id: string;
    inviteStatus: AdminUserInviteStatus;
    inviteError?: string;
  }>
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const adminUserId = id.trim();
  if (!adminUserId) return { ok: false, error: "Usuario nao informado." };

  const { data: row, error: rowError } = await supabase
    .from("admin_users")
    .select("id,auth_user_id,display_name,email,phone,role,status")
    .eq("id", adminUserId)
    .maybeSingle();

  if (rowError) return { ok: false, error: rowError.message };
  if (!row) return { ok: false, error: "Usuario administrativo nao encontrado." };

  const currentAuthUserId = typeof row.auth_user_id === "string" ? row.auth_user_id : null;
  const displayName = String(row.display_name || row.email || "Admin").trim();
  const email = String(row.email || "").trim().toLowerCase();
  const phone = normalizePhone(String(row.phone || ""));
  const role = normalizeRole(String(row.role || "analyst"));
  const status = normalizeStatus(String(row.status || "active"));

  if (status !== "active") return { ok: false, error: "Ative o usuario antes de reenviar o convite." };
  if (!email || !email.includes("@")) return { ok: false, error: "Usuario sem email valido para convite." };
  if (!phone || phone.length < 10) return { ok: false, error: "Usuario sem telefone valido para WhatsApp." };

  const inviteDelivery = await deliverAdminPasswordInvite(supabase, {
    displayName,
    email,
    phone,
    role,
  });

  const { error: updateError } = await supabase
    .from("admin_users")
    .update({
      auth_user_id: inviteDelivery.authUserId || currentAuthUserId,
      phone,
      invite_status: inviteDelivery.inviteStatus,
      invite_error: inviteDelivery.inviteError,
      invited_at: inviteDelivery.invitedAt,
      invited_by_admin_user_id: invitedByAdminId || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminUserId);

  if (updateError) return { ok: false, error: updateError.message };

  return {
    ok: true,
    data: {
      id: adminUserId,
      inviteStatus: inviteDelivery.inviteStatus,
      ...(inviteDelivery.inviteError ? { inviteError: inviteDelivery.inviteError } : {}),
    },
  };
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
