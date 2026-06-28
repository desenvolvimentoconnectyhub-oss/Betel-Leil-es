import { NextResponse } from "next/server";
import {
  getAdvisoryContractGate,
  issueAdvisoryContractRecord,
  signAdvisoryContractRecord,
} from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; opportunityId: string }> }
) {
  const { id, opportunityId } = await context.params;
  const gate = await getAdvisoryContractGate(id, opportunityId);

  if (!gate.data) {
    return NextResponse.json(
      {
        success: false,
        source: gate.source,
        reason: gate.reason,
        message: "Gate de contrato nao encontrado.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    source: gate.source,
    reason: gate.reason,
    data: gate.data,
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; opportunityId: string }> }
) {
  const { id, opportunityId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";
  const payload = {
    investorId: id,
    opportunityId,
    reviewedBy: typeof body.reviewedBy === "string" ? body.reviewedBy : "Juridico + Operacao",
    notes: typeof body.notes === "string" ? body.notes : "",
  };

  const result =
    action === "issue"
      ? await issueAdvisoryContractRecord(payload)
      : action === "sign"
        ? await signAdvisoryContractRecord(payload)
        : {
            ok: false,
            error: "Acao invalida. Use issue ou sign.",
          };

  if (!result.ok) {
    return NextResponse.json(
      {
        success: false,
        message: result.error || "Nao foi possivel atualizar o gate de contrato.",
      },
      { status: 400 }
    );
  }

  const gate = await getAdvisoryContractGate(id, opportunityId);

  return NextResponse.json({
    success: true,
    data: gate.data,
    mutation: result.data,
  });
}
