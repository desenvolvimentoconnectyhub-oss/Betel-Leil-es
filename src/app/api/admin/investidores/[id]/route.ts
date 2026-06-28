import { NextResponse } from "next/server";
import {
  getInvestorProfileById,
  listInvestorMatchesForInvestor,
} from "@/lib/admin/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const [investor, matches] = await Promise.all([
    getInvestorProfileById(id),
    listInvestorMatchesForInvestor(id),
  ]);

  if (!investor.data) {
    return NextResponse.json(
      {
        success: false,
        source: investor.source,
        reason: investor.reason,
        message: "Investidor nao encontrado.",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    source: investor.source,
    reason: investor.reason || matches.reason,
    data: investor.data,
    matches: matches.data,
  });
}
