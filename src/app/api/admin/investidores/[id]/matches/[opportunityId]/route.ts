import { NextResponse } from "next/server";
import { getInvestorCommercialPack } from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; opportunityId: string }> }
) {
  const { id, opportunityId } = await context.params;
  const pack = await getInvestorCommercialPack(id, opportunityId);

  if (!pack.data) {
    return NextResponse.json(
      {
        success: false,
        source: pack.source,
        reason: pack.reason,
        message: "Pacote comercial nao encontrado.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    source: pack.source,
    reason: pack.reason,
    data: pack.data,
  });
}
