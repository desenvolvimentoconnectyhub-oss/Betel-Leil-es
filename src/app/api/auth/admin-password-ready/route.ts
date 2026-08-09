import { NextResponse } from "next/server";
import { sendAdminPasswordReadyWhatsAppRecord } from "@/lib/admin/repository";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ success: false, error: "Sessao nao encontrada para confirmar acesso." }, { status: 401 });
  }

  await supabase.rpc("claim_admin_user_by_email");

  const result = await sendAdminPasswordReadyWhatsAppRecord({
    authUserId: user.id,
    email: user.email || "",
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error, data: result.data }, { status: 400 });
  }

  return NextResponse.json({ success: true, data: result.data });
}
