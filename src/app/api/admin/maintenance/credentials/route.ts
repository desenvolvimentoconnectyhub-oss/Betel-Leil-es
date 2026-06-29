import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CredentialInput = {
  key: string;
  value: string;
  secret?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { credentials: CredentialInput[] };

    if (!Array.isArray(body.credentials) || body.credentials.length === 0) {
      return NextResponse.json(
        { success: false, message: "Nenhuma credencial enviada." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { success: false, message: "Supabase nao configurado. Salve as credenciais basicas no .env primeiro." },
        { status: 500 }
      );
    }

    const results: { key: string; ok: boolean; error?: string }[] = [];

    for (const cred of body.credentials) {
      const key = String(cred.key || "").trim();
      const value = String(cred.value || "").trim();

      if (!key || !value) {
        results.push({ key, ok: false, error: "Chave ou valor vazio." });
        continue;
      }

      const { error } = await supabase
        .from("app_config")
        .upsert(
          {
            key,
            value,
            description: `Credencial administrativa ${key}.`,
            is_secret: Boolean(cred.secret),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "key" }
        );

      if (error) {
        results.push({ key, ok: false, error: error.message });
      } else {
        results.push({ key, ok: true });
      }
    }

    const allOk = results.every((r) => r.ok);

    return NextResponse.json({
      success: allOk,
      message: allOk
        ? `${results.length} credencial(is) salva(s) com sucesso.`
        : "Algumas credenciais falharam.",
      results,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Erro ao salvar credenciais.",
      },
      { status: 500 }
    );
  }
}
