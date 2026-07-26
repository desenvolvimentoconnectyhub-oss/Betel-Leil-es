import "server-only";

import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/admin";

export async function requireAdminApi() {
  const admin = await getCurrentAdmin().catch(() => null);

  if (admin) return { admin, response: null };

  return {
    admin: null,
    response: NextResponse.json(
      { success: false, error: "Admin nao autorizado." },
      { status: 401 }
    ),
  };
}
