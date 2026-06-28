import type { ReactNode } from "react";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireCurrentAdmin();

  return (
    <div className="min-h-screen bg-[var(--admin-bg)] text-[var(--admin-foreground)]">
      <AdminSidebar />
      <div className="min-h-screen lg:pl-[272px]">
        <AdminTopbar admin={admin} />
        <main className="relative">
          <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(255,90,31,0.09),transparent_30%),radial-gradient(circle_at_10%_12%,rgba(196,122,44,0.07),transparent_24%)]" />
          <div className="relative z-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
