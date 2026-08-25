"use client";

import { useState, type CSSProperties } from "react";
import type { ReactNode } from "react";
import type { AdminSessionUser } from "@/lib/auth/types";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminShell({ admin, children }: { admin: AdminSessionUser; children: ReactNode }) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const sidebarWidth = sidebarExpanded ? "272px" : "76px";

  return (
    <div
      className="betel-admin-light min-h-screen bg-[var(--admin-bg)] text-[var(--admin-foreground)]"
      style={{ "--admin-sidebar-current-width": sidebarWidth } as CSSProperties}
    >
      <AdminSidebar admin={admin} expanded={sidebarExpanded} onExpandedChange={setSidebarExpanded} />
      <div className="min-h-screen transition-[padding-left] duration-200 ease-out lg:pl-[var(--admin-sidebar-current-width)]">
        <AdminTopbar admin={admin} />
        <main className="relative">
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(245,247,250,0.94))]" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
