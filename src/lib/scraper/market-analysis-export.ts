import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { MutationResult } from "@/lib/admin/repository/shared";

type DbRow = Record<string, unknown>;

type CsvExportData = {
  content: string;
  filename: string;
  rowCount: number;
};

const CSV_DELIMITER = ";";

function cleanString(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = cleanString(value).replace(/[^\d,.-]/g, "");
  if (!raw) return fallback;
  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  const normalized =
    hasComma && hasDot
      ? raw.lastIndexOf(",") > raw.lastIndexOf(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "")
      : hasComma
        ? raw.replace(",", ".")
        : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asRecord(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DbRow) : {};
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => cleanString(value)).filter(Boolean)));
}

function chunk<T>(items: T[], size = 250) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function selectByIds(
  table: string,
  columns: string,
  column: string,
  ids: string[]
) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return [];

  const rows: DbRow[] = [];
  for (const idChunk of chunk(unique(ids))) {
    const { data, error } = await supabase.from(table).select(columns).in(column, idChunk);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(((data || []) as unknown) as DbRow[]));
  }

  return rows;
}

function csvCell(value: unknown) {
  const text = cleanString(value)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ");
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]) {
  return values.map(csvCell).join(CSV_DELIMITER);
}

function slugPart(value: unknown, fallback = "lote") {
  return cleanString(value, fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || fallback;
}

function firstSourceUrl(analysis: DbRow, labelNeedles: string[]): string {
  const sourceLinks = asArray<DbRow>(analysis.source_links);
  const needles = labelNeedles.map((item) => item.toLowerCase());
  const source = sourceLinks.find((item) => {
    const label = cleanString(item.label).toLowerCase();
    return needles.some((needle) => label.includes(needle));
  });
  return cleanString(source?.url);
}

function sourceList(analysis: DbRow) {
  return asArray<DbRow>(analysis.source_links)
    .map((source) => {
      const label = cleanString(source.label, "Fonte");
      const url = cleanString(source.url);
      return url ? `${label}: ${url}` : "";
    })
    .filter(Boolean)
    .join(" | ");
}

function firstCeilingTarget(analysis: DbRow) {
  const targets = asArray<DbRow>(analysis.ceiling_targets);
  const first = targets[0];
  return asNumber(analysis.suggested_ceiling_bid) || asNumber(first?.value);
}

function subjectValue(analysis: DbRow, key: string) {
  return asRecord(analysis.subject_property_snapshot)[key];
}

function rentalValue(analysis: DbRow, key: string) {
  return asRecord(asRecord(analysis.raw_payload).rentalEstimate)[key];
}

function comparableSummary(comparables: DbRow[]) {
  return comparables
    .slice(0, 8)
    .map((comparable) => {
      const parts = [
        cleanString(comparable.source_label, "Comparavel"),
        cleanString(comparable.city),
        cleanString(comparable.state),
        asNumber(comparable.asking_price) ? `R$ ${asNumber(comparable.asking_price)}` : "",
        asNumber(comparable.price_per_m2) ? `R$/m2 ${asNumber(comparable.price_per_m2)}` : "",
        cleanString(comparable.quality),
        cleanString(comparable.source_url),
      ].filter(Boolean);
      return parts.join(" / ");
    })
    .join(" | ");
}

function analysisDecisionLabel(value: unknown) {
  const decision = cleanString(value).toLowerCase();
  if (decision === "excellent") return "Excelente oportunidade";
  if (decision === "good") return "Boa oportunidade";
  if (decision === "caution") return "Oportunidade com cautela";
  if (decision === "review") return "Revisar antes de avancar";
  if (decision === "reject") return "Descartar";
  return cleanString(value);
}

function rowToCsvValues(input: {
  batch: DbRow;
  row: DbRow;
  opportunity: DbRow;
  analysis: DbRow;
  comparables: DbRow[];
}) {
  const { batch, row, opportunity, analysis, comparables } = input;
  const analysisRaw = asRecord(analysis.raw_payload);
  const marketResearch = asRecord(analysisRaw.marketResearch);

  return [
    cleanString(batch.id),
    cleanString(batch.original_filename),
    asNumber(row.row_number),
    cleanString(row.external_code),
    cleanString(opportunity.code),
    cleanString(opportunity.title),
    cleanString(subjectValue(analysis, "propertyType"), cleanString(opportunity.property_type)),
    cleanString(subjectValue(analysis, "city"), cleanString(opportunity.city)),
    cleanString(subjectValue(analysis, "state"), cleanString(opportunity.state)),
    cleanString(subjectValue(analysis, "address"), cleanString(opportunity.address)),
    cleanString(row.auction_url, firstSourceUrl(analysis, ["leilao", "auction"])),
    cleanString(row.status),
    cleanString(analysis.status),
    analysisDecisionLabel(analysis.decision),
    asNumber(opportunity.initial_bid),
    asNumber(analysisRaw.auctionAppraisalValue, asNumber(opportunity.appraisal_value)),
    asNumber(analysis.market_value_low),
    asNumber(analysis.market_value_base),
    asNumber(analysis.market_value_high),
    asNumber(analysis.real_discount_pct),
    firstCeilingTarget(analysis),
    asNumber(analysis.estimated_net_margin),
    asNumber(analysis.liquidity_score),
    asNumber(analysis.confidence_score),
    asNumber(subjectValue(analysis, "privateAreaM2")),
    asNumber(subjectValue(analysis, "builtAreaM2")),
    asNumber(subjectValue(analysis, "landAreaM2")),
    asNumber(rentalValue(analysis, "monthlyRent")),
    asNumber(rentalValue(analysis, "monthlyYieldOnMarketPct")),
    comparables.length,
    comparableSummary(comparables),
    sourceList(analysis),
    cleanString(marketResearch.marketValueSource, cleanString(analysisRaw.marketValueSource)),
    cleanString(analysis.summary),
    cleanString(analysis.decision_reason),
    cleanString(analysis.caution_notes),
    cleanString(analysis.legal_signal),
    cleanString(row.error_message),
    cleanString(analysis.updated_at, cleanString(row.updated_at)),
  ];
}

export async function buildMarketAnalysisBatchCsvExport(input: {
  batchId: string;
}): Promise<MutationResult<CsvExportData>> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: "Supabase admin nao configurado." };

  const batchId = cleanString(input.batchId);
  if (!batchId) return { ok: false, error: "Lote nao informado." };

  const { data: batch, error: batchError } = await supabase
    .from("market_analysis_import_batches")
    .select("*")
    .eq("id", batchId)
    .maybeSingle();

  if (batchError || !batch) {
    return { ok: false, error: batchError?.message || "Lote nao encontrado." };
  }

  const { data: rowData, error: rowError } = await supabase
    .from("market_analysis_import_rows")
    .select("*")
    .eq("batch_id", batchId)
    .order("row_number", { ascending: true });

  if (rowError) return { ok: false, error: rowError.message };

  const rows = ((rowData || []) as unknown) as DbRow[];
  const opportunityIds = unique(rows.map((row) => cleanString(row.opportunity_id)));
  let opportunities: DbRow[] = [];
  let analyses: DbRow[] = [];
  let comparables: DbRow[] = [];

  try {
    opportunities = opportunityIds.length
      ? await selectByIds(
          "auction_opportunities",
          "id,code,title,property_type,address,city,state,initial_bid,appraisal_value,discount_pct,opportunity_score,risk_score,ai_status,legal_status,stage,auction_date,raw_payload",
          "id",
          opportunityIds
        )
      : [];
    analyses = opportunityIds.length
      ? await selectByIds(
          "property_market_analyses",
          "*",
          "opportunity_id",
          opportunityIds
        )
      : [];
    const analysisIds = unique(analyses.map((analysis) => cleanString(analysis.id)));
    comparables = analysisIds.length
      ? await selectByIds(
          "property_market_comparables",
          "*",
          "analysis_id",
          analysisIds
        )
      : [];
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao carregar dados para exportacao.",
    };
  }

  const opportunityById = new Map(opportunities.map((opportunity) => [cleanString(opportunity.id), opportunity]));
  const analysisByOpportunityId = new Map(
    analyses
      .sort((left, right) => cleanString(right.updated_at).localeCompare(cleanString(left.updated_at)))
      .map((analysis) => [cleanString(analysis.opportunity_id), analysis])
  );
  const comparablesByAnalysisId = new Map<string, DbRow[]>();
  comparables.forEach((comparable) => {
    const analysisId = cleanString(comparable.analysis_id);
    const current = comparablesByAnalysisId.get(analysisId) || [];
    current.push(comparable);
    comparablesByAnalysisId.set(analysisId, current);
  });

  const headers = [
    "lote_id",
    "arquivo_origem",
    "linha",
    "codigo_enviado",
    "codigo_imovel",
    "titulo",
    "tipo",
    "cidade",
    "uf",
    "endereco",
    "url_leilao",
    "status_linha",
    "status_analise",
    "decisao",
    "valor_lance",
    "valor_avaliacao_leilao",
    "valor_mercado_conservador",
    "valor_mercado_base",
    "valor_mercado_otimista",
    "desconto_real_pct",
    "teto_sugerido",
    "margem_liquida",
    "liquidez_score",
    "confianca_score",
    "area_privativa_m2",
    "area_construida_m2",
    "area_terreno_m2",
    "aluguel_mensal",
    "yield_mensal_mercado_pct",
    "quantidade_comparaveis",
    "comparaveis",
    "fontes",
    "fonte_valor_mercado",
    "resumo",
    "motivo_decisao",
    "ressalvas",
    "juridico",
    "erro_linha",
    "atualizado_em",
  ];

  const csvRows = rows.map((row) => {
    const opportunity = opportunityById.get(cleanString(row.opportunity_id)) || {};
    const analysis = analysisByOpportunityId.get(cleanString(row.opportunity_id)) || {};
    return csvLine(
      rowToCsvValues({
        batch: batch as DbRow,
        row,
        opportunity,
        analysis,
        comparables: comparablesByAnalysisId.get(cleanString(analysis.id)) || [],
      })
    );
  });

  const filename = [
    "analises-mercado",
    slugPart((batch as DbRow).original_filename, "lote"),
    new Date().toISOString().slice(0, 10),
  ].join("-") + ".csv";

  return {
    ok: true,
    data: {
      content: `\uFEFF${[csvLine(headers), ...csvRows].join("\n")}`,
      filename,
      rowCount: rows.length,
    },
  };
}
