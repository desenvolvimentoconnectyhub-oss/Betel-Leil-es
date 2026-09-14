import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdminApi } from "@/lib/auth/admin-api";
import { canResetBetelLead, resetBetelLead } from "@/lib/whatsapp/lead-reset";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (!auth.admin || !await canResetBetelLead(auth.admin)) {
    return NextResponse.json({ error: "Somente o MASTER (Super admin) da Betel pode resetar leads." }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  if (body?.confirmation !== "RESETAR" || !uuid.test(body.leadId || "") || !uuid.test(body.conversationId || "")) {
    return NextResponse.json({ error: "Selecione o atendimento e confirme a exclusão definitiva." }, { status: 400 });
  }
  try {
    const result = await resetBetelLead(auth.admin.id, body.leadId, body.conversationId);
    revalidatePath("/admin/whatsapp");
    return NextResponse.json({ ...result, message: result.complete
      ? "Lead excluído. O próximo contato começará do zero."
      : "Cadastro e conversas excluídos. Ainda há arquivos pendentes; tente novamente para concluir a remoção." },
    { status: result.complete ? 200 : 202 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "";
    const status = reason.includes("MASTER_REQUIRED") ? 403 : /SCOPE_MISMATCH|NOT_FOUND/.test(reason) ? 404 : reason.includes("BUSY") ? 409 : 503;
    return NextResponse.json({ error: status === 409
      ? "Há um atendimento em processamento. Aguarde sua conclusão e tente resetar novamente."
      : status === 404 ? "Lead ou conversa não encontrado neste atendimento."
      : status === 403 ? "Somente o MASTER da Betel pode resetar leads."
      : "Não foi possível concluir o reset. Tente novamente; a operação pode ser retomada com segurança." }, { status });
  }
}
