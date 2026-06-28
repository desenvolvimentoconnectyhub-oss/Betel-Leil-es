import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getAgentSystemPrompt } from "@/lib/ai/agent-prompts";
import { updateAgentProfileRecord } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const agentKey = request.nextUrl.searchParams.get("agentKey");
  if (!agentKey) {
    return NextResponse.json({ ok: false, error: "agentKey obrigatorio." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  if (supabase) {
    try {
      const { data } = await supabase
        .from("agent_profiles")
        .select("system_prompt")
        .eq("agent_key", agentKey)
        .maybeSingle();
      if (data?.system_prompt) {
        return NextResponse.json({ ok: true, prompt: data.system_prompt, source: "supabase" });
      }
    } catch {}
  }

  const fallback = getAgentSystemPrompt(agentKey);
  return NextResponse.json({ ok: true, prompt: fallback || "", source: fallback ? "builtin" : "empty" });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { agentKey, prompt } = body;

  if (!agentKey) {
    return NextResponse.json({ ok: false, error: "agentKey obrigatorio." }, { status: 400 });
  }

  const result = await updateAgentProfileRecord(agentKey, { systemPrompt: typeof prompt === "string" ? prompt : "" });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "Erro ao salvar prompt." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
