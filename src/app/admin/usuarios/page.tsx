import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Link2,
  MessageCircle,
  Phone,
  Send,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { createAdminUserAction, resendAdminUserInviteAction, updateAdminUserStatusAction } from "./actions";
import { DashboardCard } from "@/components/admin/DashboardCard";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { listAdminUsers, type AdminUserListItem, type AdminUserStatus } from "@/lib/admin/repository";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function formatDate(value: string | null) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return dateFormatter.format(date);
}

function accessLabel(user: AdminUserListItem) {
  if (user.status !== "active") return "Bloqueado";
  if (user.authUserId && user.lastSeenAt) return "Liberado";
  if (user.inviteStatus === "sent") return "Convite enviado";
  if (user.inviteStatus === "linked_existing") return "Conta vinculada";
  if (user.inviteStatus === "failed") return "Convite falhou";
  if (user.authUserId) return "Aguardando senha";
  return "Aguardando Auth";
}

function accessTone(user: AdminUserListItem): "green" | "yellow" | "red" | "muted" {
  if (user.status !== "active") return user.status === "suspended" || user.status === "disabled" ? "red" : "muted";
  if (user.authUserId && user.lastSeenAt) return "green";
  if (user.inviteStatus === "failed") return "red";
  return "yellow";
}

function inviteLabel(user: AdminUserListItem) {
  if (user.inviteStatus === "sent") return "WhatsApp enviado";
  if (user.inviteStatus === "linked_existing") return "Conta existente";
  if (user.inviteStatus === "failed") return "Falhou";
  return "Nao enviado";
}

function inviteTone(user: AdminUserListItem): "green" | "yellow" | "red" | "muted" {
  if (user.inviteStatus === "sent" || user.inviteStatus === "linked_existing") return "green";
  if (user.inviteStatus === "failed") return "red";
  return "muted";
}

function countBy(users: AdminUserListItem[], predicate: (user: AdminUserListItem) => boolean) {
  return users.filter(predicate).length;
}

function Message({ status, message }: { status?: string; message?: string }) {
  if (!message) return null;
  const isSuccess = status === "success";
  const Icon = isSuccess ? CheckCircle2 : AlertCircle;

  return (
    <div
      className={cn(
        "mb-4 flex gap-2 rounded-lg border px-3 py-2 text-sm",
        isSuccess
          ? "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-green-100"
          : "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-red-100"
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function StatusAction({ user, nextStatus, label }: { user: AdminUserListItem; nextStatus: AdminUserStatus; label: string }) {
  return (
    <form action={updateAdminUserStatusAction}>
      <input type="hidden" name="id" value={user.id} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button
        type="submit"
        size="sm"
        variant={nextStatus === "active" ? "outline" : "destructive"}
        className={cn(
          "h-7 rounded-md text-xs",
          nextStatus === "active"
            ? "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-white hover:text-white"
            : "border-[rgba(239,68,68,0.26)] text-red-200"
        )}
      >
        {label}
      </Button>
    </form>
  );
}

function ResendInviteAction({ user }: { user: AdminUserListItem }) {
  const canResend = user.status === "active" && Boolean(user.phone) && (!user.lastSeenAt || user.inviteStatus === "failed");
  if (!canResend) return null;

  return (
    <form action={resendAdminUserInviteAction}>
      <input type="hidden" name="id" value={user.id} />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-7 rounded-md border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-xs text-white hover:text-white"
      >
        <Send size={13} />
        Reenviar
      </Button>
    </form>
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const paramsPromise: Promise<Record<string, string | string[] | undefined>> = searchParams || Promise.resolve({});
  const [usersResult, params] = await Promise.all([listAdminUsers(), paramsPromise]);
  const users = usersResult.data;
  const status = typeof params.status === "string" ? params.status : undefined;
  const message = typeof params.message === "string" ? params.message : undefined;
  const activeCount = countBy(users, (user) => user.status === "active");
  const linkedCount = countBy(users, (user) => user.status === "active" && Boolean(user.authUserId));
  const pendingInviteCount = countBy(users, (user) => user.inviteStatus === "sent" && !user.lastSeenAt);

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <Message status={status} message={message} />

      <section className="mb-4 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusBadge tone="green">RBAC</StatusBadge>
              <StatusBadge tone={usersResult.source === "supabase" ? "green" : "yellow"}>{usersResult.source}</StatusBadge>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Usuarios administrativos</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--admin-muted)]">
              Cadastre o perfil interno, defina o nivel de acesso e envie pelo WhatsApp o link para criar a senha no
              Supabase Auth.
            </p>
            {usersResult.reason && <p className="mt-2 text-xs text-[var(--admin-yellow)]">{usersResult.reason}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-right">
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-white">{activeCount}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">ativos</div>
            </div>
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-[var(--admin-green)]">{linkedCount}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">liberados</div>
            </div>
            <div className="rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
              <div className="font-mono text-xl font-bold text-[var(--admin-yellow)]">{pendingInviteCount}</div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">convites</div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <DashboardCard
          title="Novo usuario"
          eyebrow="admin / acesso"
          action={<UserPlus size={18} className="text-[var(--admin-cyan)]" />}
        >
          <form action={createAdminUserAction} className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="displayName" className="text-xs font-semibold text-[var(--admin-soft)]">
                Nome
              </label>
              <input
                id="displayName"
                name="displayName"
                required
                placeholder="Betel Admin"
                className="h-10 rounded-md border border-[var(--admin-border)] bg-[rgba(0,0,0,0.28)] px-3 text-sm text-white outline-none transition placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-xs font-semibold text-[var(--admin-soft)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="admin@betel.ai"
                className="h-10 rounded-md border border-[var(--admin-border)] bg-[rgba(0,0,0,0.28)] px-3 text-sm text-white outline-none transition placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="phone" className="text-xs font-semibold text-[var(--admin-soft)]">
                Telefone
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="(47) 98857-7996"
                className="h-10 rounded-md border border-[var(--admin-border)] bg-[rgba(0,0,0,0.28)] px-3 text-sm text-white outline-none transition placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <label htmlFor="role" className="text-xs font-semibold text-[var(--admin-soft)]">
                  Nivel de acesso
                </label>
                <select
                  id="role"
                  name="role"
                  defaultValue="admin"
                  className="h-10 rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)]"
                >
                  <option value="owner">Owner</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="analyst">Analyst</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label htmlFor="status" className="text-xs font-semibold text-[var(--admin-soft)]">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue="active"
                  className="h-10 rounded-md border border-[var(--admin-border)] bg-[#050505] px-3 text-sm text-white outline-none transition focus:border-[var(--admin-cyan)]"
                >
                  <option value="active">Ativo</option>
                  <option value="invited">Convidado</option>
                  <option value="suspended">Suspenso</option>
                  <option value="disabled">Desativado</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="organizationName" className="text-xs font-semibold text-[var(--admin-soft)]">
                Organizacao
              </label>
              <input
                id="organizationName"
                name="organizationName"
                defaultValue="Betel Leiloes"
                className="h-10 rounded-md border border-[var(--admin-border)] bg-[rgba(0,0,0,0.28)] px-3 text-sm text-white outline-none transition placeholder:text-[var(--admin-muted)] focus:border-[var(--admin-cyan)]"
              />
            </div>
            <Button
              type="submit"
              className="h-10 bg-[var(--admin-cyan)] font-bold text-black hover:bg-white"
            >
              <UserPlus size={16} />
              Cadastrar e enviar WhatsApp
            </Button>
          </form>

          <div className="mt-4 grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3 text-xs leading-5 text-[var(--admin-muted)]">
            <div className="flex items-start gap-2">
              <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[var(--admin-green)]" />
              <span>Senha e sessao continuam no Supabase Auth.</span>
            </div>
            <div className="flex items-start gap-2">
              <Link2 size={15} className="mt-0.5 shrink-0 text-[var(--admin-cyan)]" />
              <span>O usuario recebe no WhatsApp um link seguro para definir a senha e acessar o painel.</span>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Equipe cadastrada"
          eyebrow="usuarios / permissoes"
          action={<Users size={18} className="text-[var(--admin-green)]" />}
          contentClassName="p-0"
        >
          <div className="overflow-x-auto">
            <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr className="border-b border-[var(--admin-border)] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="px-4 py-3 font-semibold">Papel</th>
                  <th className="px-4 py-3 font-semibold">Acesso</th>
                  <th className="px-4 py-3 font-semibold">Convite</th>
                  <th className="px-4 py-3 font-semibold">Ultimo acesso</th>
                  <th className="px-4 py-3 text-right font-semibold">Acao</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-t border-[var(--admin-border)]">
                    <td className="border-t border-[var(--admin-border)] px-4 py-3">
                      <div className="font-semibold text-white">{user.displayName}</div>
                      <div className="mt-0.5 max-w-xs truncate text-xs text-[var(--admin-muted)]">{user.email}</div>
                      {user.phone && (
                        <div className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--admin-soft)]">
                          <Phone size={12} />
                          {user.phone}
                        </div>
                      )}
                      <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[var(--admin-muted)]">
                        {user.organizationName}
                      </div>
                    </td>
                    <td className="border-t border-[var(--admin-border)] px-4 py-3">
                      <StatusBadge tone={user.role === "owner" || user.role === "admin" ? "cyan" : "muted"}>
                        {user.role}
                      </StatusBadge>
                    </td>
                    <td className="border-t border-[var(--admin-border)] px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={accessTone(user)}>{accessLabel(user)}</StatusBadge>
                        {!user.authUserId && user.status === "active" && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--admin-yellow)]">
                            <Clock3 size={13} />
                            Supabase
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border-t border-[var(--admin-border)] px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <StatusBadge tone={inviteTone(user)}>{inviteLabel(user)}</StatusBadge>
                        {user.invitedAt && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--admin-muted)]">
                            <MessageCircle size={13} />
                            {formatDate(user.invitedAt)}
                          </span>
                        )}
                        {user.inviteError && (
                          <span className="max-w-[240px] truncate text-xs text-[var(--admin-red)]" title={user.inviteError}>
                            {user.inviteError}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="border-t border-[var(--admin-border)] px-4 py-3 text-sm text-[var(--admin-soft)]">
                      {formatDate(user.lastSeenAt)}
                    </td>
                    <td className="border-t border-[var(--admin-border)] px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <ResendInviteAction user={user} />
                        {user.status === "active" ? (
                          <StatusAction user={user} nextStatus="suspended" label="Suspender" />
                        ) : (
                          <StatusAction user={user} nextStatus="active" label="Ativar" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--admin-muted)]">
                      Nenhum usuario administrativo cadastrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DashboardCard>
      </section>
    </div>
  );
}
