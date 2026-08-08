import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import {
  archiveLegacyScraperOpportunities,
  createLinkScraperBatch,
  createScraperNotificationRecipient,
  deleteArchivedLegacyScraperOpportunities,
  getLinkScraperDashboardData,
  parsePropertyLinkImportFile,
  queueLinkScraperBatch,
  recordLegacyCleanupDryRun,
  retryLinkScraperRow,
  startLinkScraperBatch,
} from "@/lib/scraper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asBoolean(value: unknown) {
  return value === true || value === "true" || value === "1" || value === "on";
}

function revalidateScraper() {
  revalidatePath("/admin");
  revalidatePath("/admin/scraper");
  revalidatePath("/admin/oportunidades");
  revalidatePath("/api/admin/scraper");
}

export async function GET() {
  const data = await getLinkScraperDashboardData();
  return NextResponse.json({ ...data });
}

async function handleFormData(request: Request) {
  const formData = await request.formData();
  const action = cleanString(formData.get("action"), "import_file");

  if (action === "import_file") {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Envie um arquivo .xlsx, .csv ou .txt." }, { status: 400 });
    }

    const parsed = await parsePropertyLinkImportFile(file);
    const result = await createLinkScraperBatch({
      parsed,
      whatsappAgentKey: cleanString(formData.get("whatsappAgentKey")),
      whatsappInstanceId: cleanString(formData.get("whatsappInstanceId")),
      notificationRecipientId: cleanString(formData.get("notificationRecipientId")),
      analysisDepth: cleanString(formData.get("analysisDepth"), "deep"),
    });

    revalidateScraper();
    return NextResponse.json({ ok: result.ok, result, parsed: { ...parsed, rows: parsed.rows.slice(0, 20) } }, { status: result.ok ? 200 : 400 });
  }

  if (action === "preview_file") {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Envie um arquivo .xlsx, .csv ou .txt." }, { status: 400 });
    }

    const parsed = await parsePropertyLinkImportFile(file);
    return NextResponse.json({ ok: true, parsed: { ...parsed, rows: parsed.rows.slice(0, 50) } });
  }

  return NextResponse.json({ ok: false, error: "Acao de formulario invalida." }, { status: 400 });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      return await handleFormData(request);
    }

    const body = await request.json();
    const action = cleanString(body.action);

    if (action === "start_batch") {
      const startPayload = {
        batchId: cleanString(body.batchId),
        whatsappAgentKey: cleanString(body.whatsappAgentKey),
        whatsappInstanceId: cleanString(body.whatsappInstanceId),
        notificationRecipientId: cleanString(body.notificationRecipientId),
        analysisDepth: cleanString(body.analysisDepth, "deep"),
      };
      const queued = await queueLinkScraperBatch(startPayload);
      if (!queued.ok) return NextResponse.json(queued, { status: 400 });

      try {
        await inngest.send({
          name: "scraper/link_batch.requested",
          data: {
            ...startPayload,
            requestedAt: new Date().toISOString(),
          },
        });
        revalidateScraper();
        return NextResponse.json({ ok: true, data: { ...queued.data, queued: true } });
      } catch {
        const result = await startLinkScraperBatch(startPayload);
        revalidateScraper();
        return NextResponse.json({ ...result, fallbackSync: true }, { status: result.ok ? 200 : 400 });
      }
    }

    if (action === "start_batch_sync") {
      const result = await startLinkScraperBatch({
        batchId: cleanString(body.batchId),
        whatsappAgentKey: cleanString(body.whatsappAgentKey),
        whatsappInstanceId: cleanString(body.whatsappInstanceId),
        notificationRecipientId: cleanString(body.notificationRecipientId),
        analysisDepth: cleanString(body.analysisDepth, "deep"),
      });
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "create_recipient") {
      const result = await createScraperNotificationRecipient({
        sectorName: cleanString(body.sectorName),
        recipientName: cleanString(body.recipientName),
        whatsappNumber: cleanString(body.whatsappNumber),
        whatsappJid: cleanString(body.whatsappJid),
        isGroup: asBoolean(body.isGroup),
        notes: cleanString(body.notes),
      });
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "retry_row") {
      const result = await retryLinkScraperRow({
        rowId: cleanString(body.rowId),
      });
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "legacy_cleanup_dry_run") {
      const result = await recordLegacyCleanupDryRun();
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "legacy_cleanup_archive") {
      const result = await archiveLegacyScraperOpportunities({
        confirmation: cleanString(body.confirmation),
      });
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if (action === "legacy_cleanup_delete_archived") {
      const result = await deleteArchivedLegacyScraperOpportunities({
        confirmation: cleanString(body.confirmation),
      });
      revalidateScraper();
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    if ([
      "create",
      "toggle",
      "update",
      "delete",
      "run",
      "clear_errors",
      "seed_recommended_sources",
      "schedule_save",
    ].includes(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Fluxo antigo por fontes esta congelado. Use import_file e start_batch para processar links enviados pelo usuario.",
        },
        { status: 410 }
      );
    }

    return NextResponse.json({ ok: false, error: "Acao invalida." }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Falha no scraper por lote." },
      { status: 400 }
    );
  }
}
