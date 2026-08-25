import type { ReactNode } from "react";
import { requireCurrentAdmin } from "@/lib/auth/admin";
import { AdminShell } from "./AdminShell";

export async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireCurrentAdmin();

  return <AdminShell admin={admin}>{children}</AdminShell>;
}
