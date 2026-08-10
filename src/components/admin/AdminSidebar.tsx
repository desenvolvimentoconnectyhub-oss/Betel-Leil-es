"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ChevronDown, HeartPulse } from "lucide-react";
import { adminNavGroups, getCanonicalAdminHref } from "@/lib/admin/modules";
import type { AdminSessionUser } from "@/lib/auth/types";
import { AdminNavGroup } from "./AdminNavGroup";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

function visibleSectorKeys(admin: AdminSessionUser | undefined) {
  const sectors = admin?.sectors || [];
  const scoped = sectors.some((sector) => sector.isPrimary) ? sectors.filter((sector) => sector.isPrimary) : sectors;
  return new Set(scoped.map((sector) => sector.key));
}

function canAccessHref(admin: AdminSessionUser | undefined, href: string) {
  if (!admin || admin.role === "owner" || admin.role === "admin") return true;

  const sectorKeys = visibleSectorKeys(admin);
  if (href === "/admin") return true;
  if (!sectorKeys.size) return false;
  if (sectorKeys.has("operations")) return true;

  if (sectorKeys.has("market_analysis")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/scraper") || href.startsWith("/admin/fontes");
  }

  if (sectorKeys.has("legal") || sectorKeys.has("validation")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/fontes");
  }

  if (sectorKeys.has("creative")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/meta-whatsapp");
  }

  if (sectorKeys.has("communication")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/whatsapp") || href.startsWith("/admin/meta-whatsapp");
  }

  return false;
}

function visibleNavGroups(admin: AdminSessionUser | undefined) {
  return adminNavGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({
          ...item,
          children: item.children?.filter((child) => canAccessHref(admin, child.href)),
        }))
        .filter((item) => canAccessHref(admin, item.href) || Boolean(item.children?.length)),
    }))
    .filter((group) => group.items.length);
}

export function AdminSidebarContent({ activeHref, admin }: { activeHref: string; admin?: AdminSessionUser }) {
  const groups = visibleNavGroups(admin);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--admin-sidebar)] text-[var(--admin-foreground)]">
      <div className="flex min-h-16 items-center gap-3 border-b border-[var(--admin-border)] px-4">
        <Link
          href="/admin"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-[var(--admin-border)] bg-white shadow-sm"
        >
          <Image src={logoUrl} alt="Betel AI" width={32} height={32} className="object-contain" />
        </Link>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--admin-foreground)]">Betel AI</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--admin-muted)]">
            <Activity size={12} className="text-[var(--admin-cyan)]" />
            Dashboard
          </div>
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {groups.map((group) => (
          <AdminNavGroup key={group.label} group={group} activeHref={activeHref} />
        ))}
        <div className="mt-3 border-t border-[var(--admin-border)] pt-3">
          <Link
            href="/admin/maintenance"
            className="flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-[13px] text-[var(--admin-soft)] transition hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]"
          >
            <HeartPulse size={16} className="text-[var(--admin-yellow)]" />
            <span className="min-w-0 flex-1 truncate">Manutencao</span>
            <span className="size-1.5 rounded-full bg-[var(--admin-yellow)]" />
          </Link>
        </div>
      </nav>

      <div className="border-t border-[var(--admin-border)] p-3">
        <div className="flex items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-white p-2 shadow-sm">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--admin-cyan)] font-mono text-xs font-bold text-black">
            BA
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold text-[var(--admin-foreground)]">Betel Admin</div>
            <div className="truncate text-[10px] text-[var(--admin-muted)]">IA, compliance e leiloes</div>
          </div>
          <ChevronDown size={14} className="text-[var(--admin-muted)]" />
        </div>
      </div>
    </div>
  );
}

export function AdminSidebar({ admin }: { admin?: AdminSessionUser }) {
  const pathname = usePathname();
  const activeHref = getCanonicalAdminHref(pathname);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[272px] border-r border-[var(--admin-border)] lg:block">
      <AdminSidebarContent activeHref={activeHref} admin={admin} />
    </aside>
  );
}
