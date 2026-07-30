import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { requireAdminApi } from "@/lib/auth/admin-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedScopes = new Set([
  "all",
  "meta_ads",
  "meta_social",
  "google_ads",
  "google_analytics",
  "google_search_console",
  "google_business_profile",
]);

export async function POST(request: Request) {
  const authorization = await requireAdminApi();
  if (authorization.response) return authorization.response;

  try {
    const body = await request.json().catch(() => ({})) as { scope?: string; moduleSlug?: string };
    const requestedScope = String(body.scope || "all").trim();
    const scope = allowedScopes.has(requestedScope) ? requestedScope : "all";

    await inngest.send({
      name: "traffic-ai/sync.requested",
      data: {
        scope,
        moduleSlug: String(body.moduleSlug || ""),
        requestedAt: new Date().toISOString(),
      },
    });

    revalidatePath("/admin/meta-ads");
    revalidatePath("/admin/google-ads");
    revalidatePath("/admin/google-analytics");
    revalidatePath("/admin/trafego-organico");
    revalidatePath("/admin/caixa-meta");
    revalidatePath("/admin/criativos");

    return NextResponse.json({
      ok: true,
      scope,
      message: "Sincronizacao enviada para o Inngest.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao disparar sincronizacao Trafego IA.",
      },
      { status: 400 }
    );
  }
}
