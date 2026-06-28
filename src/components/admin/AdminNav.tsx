"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Bot, ChevronDown, Gavel, HeartPulse, LayoutDashboard, MessageCircle, Users } from "lucide-react";
import { adminGroups, adminModules } from "@/lib/admin/modules";
import { cn } from "@/lib/utils";
import { AdminIcon } from "./AdminIcons";

const logoUrl = "https://pub-3b8a3e7613ad4776be18e72d6d78207f.r2.dev/logo-betel.png";

const statusDot = {
  ready: "bg-[var(--green)]",
  build: "bg-[var(--gold)]",
  attention: "bg-[var(--red)]",
};

const mobileDock = [
  { href: "/admin", label: "Painel", icon: LayoutDashboard },
  { href: "/admin/opportunities", label: "Leiloes", icon: Gavel },
  { href: "/admin/investors", label: "Clientes", icon: Users },
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/maintenance", label: "Saude", icon: HeartPulse },
];

function isActive(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-9 items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition",
        active
          ? "bg-[rgba(216,173,88,0.12)] text-white ring-1 ring-[rgba(216,173,88,0.28)]"
          : "text-[#d7d1c6] hover:bg-[rgba(255,255,255,0.04)] hover:text-white",
      )}
    >
      {active && <span className="absolute left-0 top-2 h-6 w-0.5 rounded-full bg-[var(--gold)]" />}
      {children}
    </Link>
  );
}

export default function AdminNav() {
  const pathname = usePathname();

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[236px] border-r border-[var(--line)] bg-[rgba(9,10,12,0.97)] lg:flex lg:flex-col">
        <div className="flex min-h-[64px] items-center gap-3 border-b border-[var(--line)] px-3">
          <Link
            href="/"
            className="grid size-10 shrink-0 place-items-center rounded-md border border-[rgba(216,173,88,0.22)] bg-transparent"
          >
            <Image src={logoUrl} alt="Betel Leiloes" width={34} height={34} className="object-contain" />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
              Betel AI
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <Bot size={12} className="text-[var(--gold)]" />
              Dashboard
            </div>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
          <NavLink href="/admin" active={isActive(pathname, "/admin")}>
            <LayoutDashboard size={16} className="shrink-0 text-[var(--gold)]" />
            <span className="min-w-0 truncate">Dashboard</span>
          </NavLink>

          <div className="mt-4 grid gap-4">
            {adminGroups.map((group) => (
              <div key={group}>
                <div className="px-2.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                  {group}
                </div>
                <div className="grid gap-1">
                  {adminModules
                    .filter((item) => item.group === group)
                    .map((item) => {
                      const active = isActive(pathname, item.href);
                      return (
                        <NavLink key={item.href} href={item.href} active={active}>
                          <AdminIcon icon={item.icon} size={16} className="shrink-0 text-[var(--gold)]" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span
                            className={cn("size-1.5 rounded-full", statusDot[item.status])}
                            aria-label={item.statusLabel}
                          />
                        </NavLink>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <NavLink href="/admin/maintenance" active={isActive(pathname, "/admin/maintenance")}>
              <HeartPulse size={16} className="shrink-0 text-[var(--gold)]" />
              <span className="min-w-0 flex-1 truncate">Sala de manutencao</span>
              <span className="size-1.5 rounded-full bg-[var(--gold)]" />
            </NavLink>
          </div>
        </nav>

        <div className="border-t border-[var(--line)] p-3">
          <div className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-white/[0.03] p-2">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[#090a0c] font-mono text-xs text-[var(--gold)]">
              B
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">Betel Leiloes</div>
              <div className="text-[10px] text-[var(--muted)]">Platform Admin</div>
            </div>
            <ChevronDown size={14} className="text-[var(--muted)]" />
          </div>
        </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-5 rounded-md border border-[var(--line)] bg-[rgba(12,13,15,0.94)] p-1 shadow-2xl backdrop-blur lg:hidden">
        {mobileDock.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-md text-[10px] font-semibold transition",
                active ? "bg-[rgba(216,173,88,0.15)] text-[var(--gold)]" : "text-[var(--muted)]",
              )}
            >
              <Icon size={17} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
