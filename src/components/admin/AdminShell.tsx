"use client";

import type { ReactNode } from "react";
import { useCallback, useSyncExternalStore } from "react";
import type { AdminSessionUser } from "@/lib/auth/types";
import { cn } from "@/lib/utils";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

const sidebarStorageKey = "betel-admin-sidebar-collapsed";
const sidebarListeners = new Set<() => void>();
let sidebarCollapsedFallback = false;

function readSidebarCollapsed() {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(sidebarStorageKey) === "true";
  } catch {
    return sidebarCollapsedFallback;
  }
}

function subscribeSidebarCollapsed(listener: () => void) {
  sidebarListeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    sidebarListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeSidebarCollapsed(value: boolean) {
  sidebarCollapsedFallback = value;

  try {
    window.localStorage.setItem(sidebarStorageKey, String(value));
  } catch {
    // Browser storage can be unavailable in restricted contexts.
  }

  sidebarListeners.forEach((listener) => listener());
}

export function AdminShell({ admin, children }: { admin: AdminSessionUser; children: ReactNode }) {
  const sidebarCollapsed = useSyncExternalStore(subscribeSidebarCollapsed, readSidebarCollapsed, () => false);
  const toggleSidebar = useCallback(() => {
    writeSidebarCollapsed(!readSidebarCollapsed());
  }, []);

  return (
    <div className="betel-admin-light min-h-screen bg-[var(--admin-bg)] text-[var(--admin-foreground)]">
      <AdminSidebar admin={admin} collapsed={sidebarCollapsed} />
      <div
        className={cn(
          "min-h-screen transition-[padding-left] duration-200 ease-out",
          sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[272px]"
        )}
      >
        <AdminTopbar admin={admin} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={toggleSidebar} />
        <main className="relative">
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(245,247,250,0.94))]" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
