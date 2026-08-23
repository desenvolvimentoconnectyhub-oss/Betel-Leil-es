import type { ReactNode } from "react";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireCurrentAdmin();

  return (
    <div className="betel-admin-light min-h-screen bg-[var(--admin-bg)] text-[var(--admin-foreground)]">
      <AdminSidebar admin={admin} />
      <div className="min-h-screen lg:pl-[272px]">
        <AdminTopbar admin={admin} />
        <main className="relative">
          <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(245,247,250,0.94))]" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
