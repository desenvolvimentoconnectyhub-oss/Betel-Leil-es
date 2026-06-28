import "server-only";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AdminSessionUser } from "@/lib/auth/types";

type AdminUserRow = {
  id: string;
  email: string | null;
  display_name: string;
  role: string;
  status: string;
};

export async function getCurrentAdmin(): Promise<AdminSessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("admin_users")
    .select("id,email,display_name,role,status")
    .eq("auth_user_id", user.id)
    .eq("status", "active")
    .maybeSingle<AdminUserRow>();

  if (error || !data) return null;

  return {
    id: data.id,
    email: data.email || user.email || "",
    name: data.display_name || user.email || "Admin",
    role: data.role,
  };
}

export async function requireCurrentAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/login");
  return admin;
}
