"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronDown, HeartPulse } from "lucide-react";
import { filterAdminNavGroupsForUser } from "@/lib/admin/access";
import { adminNavGroups, getCanonicalAdminHref } from "@/lib/admin/modules";
import type { AdminSessionUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { AdminNavGroup } from "./AdminNavGroup";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

export function AdminSidebarContent({
  activeHref,
  admin,
  collapsed = false,
}: {
  activeHref: string;
  admin?: AdminSessionUser;
  collapsed?: boolean;
}) {
  const groups = filterAdminNavGroupsForUser(adminNavGroups, admin);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--admin-sidebar)] text-[var(--admin-foreground)]">
      <div
        className={cn(
          "flex min-h-16 items-center border-b border-[var(--admin-border)] transition-all duration-200",
          collapsed ? "justify-center px-2" : "gap-3 px-4"
        )}
      >
        <Link
          href="/admin"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--admin-border)] bg-white shadow-sm"
          title="Betel AI"
        >
          <Image src={logoUrl} alt="Betel AI" width={32} height={32} className="object-contain" />
        </Link>
        <div className={cn("min-w-0", collapsed && "sr-only")}>
          <div className="truncate text-sm font-semibold text-[var(--admin-foreground)]">Betel AI</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--admin-muted)]">
            <Activity size={12} className="text-[var(--admin-cyan)]" />
            Dashboard
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group) => (
          <AdminNavGroup key={group.label} group={group} activeHref={activeHref} collapsed={collapsed} />
        ))}
        <div className="mt-3 border-t border-[var(--admin-border)] pt-3">
          <Link
            href="/admin/maintenance"
            title="Manutencao"
            aria-label="Manutencao"
            className={cn(
              "flex min-h-9 items-center rounded-md text-[13px] text-[var(--admin-soft)] transition hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]",
              collapsed ? "justify-center px-0 py-2" : "gap-2 px-2.5 py-2"
            )}
          >
            <HeartPulse size={16} className="text-[var(--admin-yellow)]" />
            <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>Manutencao</span>
            {!collapsed && <span className="size-1.5 rounded-full bg-[var(--admin-yellow)]" />}
          </Link>
        </div>
      </nav>

      <div className="border-t border-[var(--admin-border)] p-3">
        <div
          className={cn(
            "flex items-center rounded-lg border border-[var(--admin-border)] bg-white p-2 shadow-sm transition-all duration-200",
            collapsed ? "justify-center" : "gap-2"
          )}
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--admin-cyan)] font-mono text-xs font-bold text-black"
            title="Betel Admin"
          >
            BA
          </span>
          <div className={cn("min-w-0 flex-1", collapsed && "sr-only")}>
            <div className="truncate text-xs font-semibold text-[var(--admin-foreground)]">Betel Admin</div>
            <div className="truncate text-[10px] text-[var(--admin-muted)]">IA, compliance e leiloes</div>
          </div>
          {!collapsed && <ChevronDown size={14} className="text-[var(--admin-muted)]" />}
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar({ admin, collapsed = false }: { admin?: AdminSessionUser; collapsed?: boolean }) {
  const pathname = usePathname();
  const activeHref = getCanonicalAdminHref(pathname);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden border-r border-[var(--admin-border)] transition-[width] duration-200 ease-out lg:block",
        collapsed ? "w-[76px]" : "w-[272px]"
      )}
    >
      <AdminSidebarContent activeHref={activeHref} admin={admin} collapsed={collapsed} />
    </aside>
  );
}
