import "server-only";

export type SourceProviderMode = "mock" | "sandbox" | "provider";

export type SourceProviderHealth = {
  key: string;
  label: string;
  purpose: string;
  provider: string;
  baseUrlConfigured: boolean;
  tokenConfigured: boolean;
  released: boolean;
  ready: boolean;
  status: "ready" | "blocked" | "missing_configuration";
  envKeys: {
    provider: string;
    baseUrl: string;
    token: string;
    released: string;
  };
  missing: string[];
};

export type SourceProviderCandidate = {
  code: string;
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  sourceName: string;
  sourceType: string;
  initialBid: number;
  appraisalValue: number;
  discountPct: number;
  opportunityScore: number;
  riskScore: number;
  complianceScore: number;
  aiStatus: string;
  legalStatus: string;
  stage: string;
  nextAction: string;
  owner: string;
  auctionDate: string;
  occupancy: string;
  summary: string;
  sourceUrl?: string;
  externalId?: string;
  collectionMode?: string;
  evidenceNotes?: string;
  rawPayload?: Record<string, unknown>;
};

export type SourceProviderPullInput = {
  providerKey?: string;
  runtimeMode?: string;
  query?: string;
  city?: string;
  state?: string;
  limit?: number;
  dryRun?: boolean;
  allowExternal?: boolean;
  providerReleaseConfirmed?: boolean;
  operatorLabel?: string;
};

export type SourceProviderPullResult = {
  provider: SourceProviderHealth;
  runtimeMode: SourceProviderMode;
  dryRun: boolean;
  pulledAt: string;
  requestPayload: Record<string, unknown>;
  candidates: SourceProviderCandidate[];
  providerStatus: "mock_ready" | "sandbox_ready" | "provider_accepted" | "empty" | "blocked" | "failed";
  latencyMs: number;
  responsePreview?: string;
  errorMessage?: string;
};

export type SourceProviderAdapterResult = {
  ok: boolean;
  data?: SourceProviderPullResult;
  error?: string;
};

type SourceProviderConfig = {
  key: string;
  label: string;
  purpose: string;
  defaultProvider: string;
  providerEnv: string;
  baseUrlEnv: string;
  tokenEnv: string;
  releasedEnv: string;
};

const sourceProviderConfigs: SourceProviderConfig[] = [
  {
    key: "auction_sources",
    label: "Fontes de leilao",
    purpose: "Buscar oportunidades em leiloeiros, bancos, portais e importadores homologados.",
    defaultProvider: "source-webhook",
    providerEnv: "BETEL_AUCTION_SOURCE_PROVIDER",
    baseUrlEnv: "BETEL_AUCTION_SOURCE_WEBHOOK_URL",
    tokenEnv: "BETEL_AUCTION_SOURCE_WEBHOOK_TOKEN",
    releasedEnv: "BETEL_AUCTION_SOURCE_PROVIDER_RELEASED",
  },
  {
    key: "big_data",
    label: "Big Data API",
    purpose: "Enriquecer imovel com comparaveis, mercado, proprietario e sinais de liquidez.",
    defaultProvider: "big-data-api",
    providerEnv: "BETEL_BIG_DATA_PROVIDER",
    baseUrlEnv: "BETEL_BIG_DATA_API_BASE_URL",
    tokenEnv: "BETEL_BIG_DATA_API_KEY",
    releasedEnv: "BETEL_BIG_DATA_PROVIDER_RELEASED",
  },
  {
    key: "registry",
    label: "Cartorios / matricula",
    purpose: "Consultar matricula, registro, titularidade e pendencias documentais.",
    defaultProvider: "registry-api",
    providerEnv: "BETEL_REGISTRY_PROVIDER",
    baseUrlEnv: "BETEL_REGISTRY_API_BASE_URL",
    tokenEnv: "BETEL_REGISTRY_API_KEY",
    releasedEnv: "BETEL_REGISTRY_PROVIDER_RELEASED",
  },
  {
    key: "court",
    label: "Processos judiciais",
    purpose: "Cruzar edital com acoes, ocupacao, dividas e restricoes externas ao edital.",
    defaultProvider: "court-api",
    providerEnv: "BETEL_COURT_PROVIDER",
    baseUrlEnv: "BETEL_COURT_API_BASE_URL",
    tokenEnv: "BETEL_COURT_API_KEY",
    releasedEnv: "BETEL_COURT_PROVIDER_RELEASED",
  },
  {
    key: "comparables",
    label: "Comparaveis de mercado",
    purpose: "Comparar lance, avaliacao e valor real de mercado antes do score final.",
    defaultProvider: "comparables-api",
    providerEnv: "BETEL_COMPARABLES_PROVIDER",
    baseUrlEnv: "BETEL_COMPARABLES_API_BASE_URL",
    tokenEnv: "BETEL_COMPARABLES_API_KEY",
    releasedEnv: "BETEL_COMPARABLES_PROVIDER_RELEASED",
  },
  {
    key: "datajud",
    label: "CNJ DataJud",
    purpose: "Consultar processos judiciais via API publica do CNJ DataJud.",
    defaultProvider: "datajud-api",
    providerEnv: "BETEL_DATAJUD_PROVIDER",
    baseUrlEnv: "BETEL_DATAJUD_API_BASE_URL",
    tokenEnv: "BETEL_DATAJUD_API_KEY",
    releasedEnv: "BETEL_DATAJUD_PROVIDER_RELEASED",
  },
  {
    key: "datazap",
    label: "DataZAP+",
    purpose: "Avaliacoes, comparaveis e preco/m² via DataZAP+ (OLX Group).",
    defaultProvider: "datazap-api",
    providerEnv: "BETEL_DATAZAP_PROVIDER",
    baseUrlEnv: "BETEL_DATAZAP_API_BASE_URL",
    tokenEnv: "BETEL_DATAZAP_API_KEY",
    releasedEnv: "BETEL_DATAZAP_PROVIDER_RELEASED",
  },
  {
    key: "receitaws",
    label: "ReceitaWS",
    purpose: "Verificacao de CNPJ de leiloeiros e partes envolvidas via ReceitaWS.",
    defaultProvider: "receitaws-api",
    providerEnv: "BETEL_RECEITAWS_PROVIDER",
    baseUrlEnv: "BETEL_RECEITAWS_API_BASE_URL",
    tokenEnv: "BETEL_RECEITAWS_API_KEY",
    releasedEnv: "BETEL_RECEITAWS_PROVIDER_RELEASED",
  },
  {
    key: "infosimples",
    label: "InfoSimples",
    purpose: "Dados legais agregados: certidoes, processos, protestos e restricoes.",
    defaultProvider: "infosimples-api",
    providerEnv: "BETEL_INFOSIMPLES_PROVIDER",
    baseUrlEnv: "BETEL_INFOSIMPLES_API_BASE_URL",
    tokenEnv: "BETEL_INFOSIMPLES_API_KEY",
    releasedEnv: "BETEL_INFOSIMPLES_PROVIDER_RELEASED",
  },
  {
    key: "serpro",
    label: "SerPro",
    purpose: "Dados governamentais via API SerPro: CPF, CNPJ, divida ativa.",
    defaultProvider: "serpro-api",
    providerEnv: "BETEL_SERPRO_PROVIDER",
    baseUrlEnv: "BETEL_SERPRO_API_BASE_URL",
    tokenEnv: "BETEL_SERPRO_API_KEY",
    releasedEnv: "BETEL_SERPRO_PROVIDER_RELEASED",
  },
  {
    key: "fipezap",
    label: "FipeZAP",
    purpose: "Indice FipeZAP de precos por cidade para referencia de mercado.",
    defaultProvider: "fipezap-api",
    providerEnv: "BETEL_FIPEZAP_PROVIDER",
    baseUrlEnv: "BETEL_FIPEZAP_API_BASE_URL",
    tokenEnv: "BETEL_FIPEZAP_API_KEY",
    releasedEnv: "BETEL_FIPEZAP_PROVIDER_RELEASED",
  },
  {
    key: "ibge",
    label: "IBGE Cidades",
    purpose: "Dados demograficos e indicadores por municipio via API IBGE.",
    defaultProvider: "ibge-api",
    providerEnv: "BETEL_IBGE_PROVIDER",
    baseUrlEnv: "BETEL_IBGE_API_BASE_URL",
    tokenEnv: "BETEL_IBGE_API_KEY",
    releasedEnv: "BETEL_IBGE_PROVIDER_RELEASED",
  },
];

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    if (!value.trim()) return fallback;
    const normalized = value.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clampScore(value: unknown, fallback = 50) {
  return Math.min(Math.max(Math.round(asNumber(value, fallback)), 0), 100);
}

function readBooleanEnv(value: string | undefined) {
  return ["1", "true", "yes", "sim", "on"].includes((value || "").trim().toLowerCase());
}

function envValue(key: string) {
  return cleanString(process.env[key]);
}

function normalizeProviderMode(value: string | undefined): SourceProviderMode {
  const mode = cleanString(value).toLowerCase();
  if (mode === "provider" || mode === "sandbox") return mode;
  return "mock";
}

function normalizeCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
}

function makeFallbackCode(city: string, title: string, externalId: string, index: number) {
  const cityPrefix = normalizeCode(city).slice(0, 3) || "BET";
  const titlePrefix = normalizeCode(title).slice(0, 3) || "SRC";
  const externalPrefix =
    normalizeCode(externalId).slice(-5) || `${Date.now().toString(36).slice(-4)}${index + 1}`.toUpperCase();
  return `${cityPrefix}-${titlePrefix}-${externalPrefix}`;
}

function preview(text: string, limit = 900) {
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function clampLimit(limit: number | undefined) {
  if (!Number.isFinite(limit || 0)) return 5;
  return Math.min(Math.max(Math.trunc(limit || 5), 1), 20);
}

function getConfigByKey(key: string) {
  return sourceProviderConfigs.find((config) => config.key === key) || sourceProviderConfigs[0];
}

function getHealthByKey(key: string) {
  return getSourceProviderHealth().find((provider) => provider.key === key) || getSourceProviderHealth()[0];
}

function headerToken(token: string): Record<string, string> {
  return token ? { authorization: `Bearer ${token}` } : {};
}

function firstValue(row: Record<string, unknown>, keys: string[], fallback: unknown = "") {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "boolean") return value;
  }

  return fallback;
}

function calculateDiscount(initialBid: number, appraisalValue: number, fallback: unknown) {
  if (appraisalValue > 0 && initialBid > 0) {
    return Math.max(0, Math.min(95, Math.round(((appraisalValue - initialBid) / appraisalValue) * 100)));
  }

  return Math.max(0, Math.min(95, Math.round(asNumber(fallback, 0))));
}

function extractCandidateRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
  }

  if (!payload || typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.opportunities,
    record.items,
    record.data,
    record.results,
    record.candidates,
    record.leiloes,
    record.imoveis,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
    }
  }

  if (record.data && typeof record.data === "object") {
    return extractCandidateRows(record.data);
  }

  return [];
}

function normalizeCandidate(
  row: Record<string, unknown>,
  index: number,
  input: SourceProviderPullInput,
  provider: SourceProviderHealth,
  runtimeMode: SourceProviderMode
): SourceProviderCandidate {
  const title = cleanString(
    firstValue(row, ["title", "titulo", "name", "nome", "propertyTitle", "assetName"]),
    `Imovel capturado ${index + 1}`
  );
  const city = cleanString(firstValue(row, ["city", "cidade", "municipio"], input.city), input.city || "Sao Paulo");
  const state = cleanString(firstValue(row, ["state", "uf", "estado"], input.state), input.state || "SP").toUpperCase();
  const externalId = cleanString(firstValue(row, ["externalId", "external_id", "id", "codigo", "loteId"]));
  const initialBid = asNumber(firstValue(row, ["initialBid", "initial_bid", "lanceInicial", "lance_inicial"]), 280000 + index * 45000);
  const appraisalValue = asNumber(
    firstValue(row, ["appraisalValue", "appraisal_value", "valorAvaliacao", "valor_avaliacao", "marketValue"]),
    Math.round(initialBid * (1.35 + index * 0.08))
  );
  const discountPct = calculateDiscount(
    initialBid,
    appraisalValue,
    firstValue(row, ["discountPct", "discount_pct", "desconto", "desconto_estimado"])
  );

  return {
    code: normalizeCode(cleanString(firstValue(row, ["code", "codigoInterno", "opportunityCode"]))) || makeFallbackCode(city, title, externalId, index),
    title,
    propertyType: cleanString(firstValue(row, ["propertyType", "property_type", "tipo", "assetType"]), "Imovel"),
    address: cleanString(firstValue(row, ["address", "endereco", "location", "localizacao"]), `${city}/${state}`),
    city,
    state,
    sourceName: cleanString(firstValue(row, ["sourceName", "source_name", "fonte", "providerName"]), provider.label),
    sourceType: cleanString(firstValue(row, ["sourceType", "source_type", "tipoFonte"]), provider.provider),
    initialBid,
    appraisalValue,
    discountPct,
    opportunityScore: clampScore(firstValue(row, ["opportunityScore", "opportunity_score", "scoreOportunidade"]), 62 + index * 4),
    riskScore: clampScore(firstValue(row, ["riskScore", "risk_score", "scoreRisco"]), 38 + index * 5),
    complianceScore: clampScore(firstValue(row, ["complianceScore", "compliance_score", "scoreCompliance"]), 70),
    aiStatus: cleanString(firstValue(row, ["aiStatus", "ai_status"]), "Fila IA"),
    legalStatus: cleanString(firstValue(row, ["legalStatus", "legal_status"]), "Pendente"),
    stage: cleanString(firstValue(row, ["stage", "etapa"]), "Entrada"),
    nextAction: cleanString(
      firstValue(row, ["nextAction", "next_action"]),
      "Curadoria IA deve extrair edital, validar fonte e procurar risco oculto."
    ),
    owner: cleanString(firstValue(row, ["owner", "responsavel"]), input.operatorLabel || "Agente Buscador de Imoveis"),
    auctionDate: cleanString(firstValue(row, ["auctionDate", "auction_date", "dataLeilao", "data_leilao"])),
    occupancy: cleanString(firstValue(row, ["occupancy", "ocupacao"]), "Nao informado"),
    summary: cleanString(
      firstValue(row, ["summary", "resumo", "description", "descricao"]),
      "Oportunidade capturada por provider de fonte para triagem, curadoria IA e revisao humana."
    ),
    sourceUrl: cleanString(firstValue(row, ["sourceUrl", "source_url", "url", "link", "editalUrl"])),
    externalId,
    collectionMode: cleanString(firstValue(row, ["collectionMode", "collection_mode"]), `${runtimeMode}_provider_pull`),
    evidenceNotes: cleanString(
      firstValue(row, ["evidenceNotes", "evidence_notes", "observacoes"]),
      "Captura inicial. Exigir conciliacao com edital, matricula, processos e comparaveis antes de qualquer oferta."
    ),
    rawPayload: row,
  };
}

function buildMockCandidates(
  input: SourceProviderPullInput,
  provider: SourceProviderHealth,
  runtimeMode: SourceProviderMode,
  limit: number
) {
  const city = input.city || "Balneario Camboriu";
  const state = (input.state || "SC").toUpperCase();
  const now = Date.now().toString(36).toUpperCase();
  const rows = [
    {
      title: "Apartamento em leilao com desconto operacional",
      propertyType: "Apartamento",
      address: `Centro, ${city}/${state}`,
      city,
      state,
      externalId: `MOCK-${now}-01`,
      initialBid: 680000,
      appraisalValue: 1170000,
      sourceUrl: "https://example.com/leilao/apartamento-centro",
      evidenceNotes: "Mock de provider: conferir edital, ocupacao e eventuais debitos condominiais.",
    },
    {
      title: "Casa judicial com potencial de revenda",
      propertyType: "Casa",
      address: `Bairro residencial, ${city}/${state}`,
      city,
      state,
      externalId: `MOCK-${now}-02`,
      initialBid: 420000,
      appraisalValue: 690000,
      riskScore: 58,
      sourceUrl: "https://example.com/leilao/casa-judicial",
      evidenceNotes: "Mock de provider: risco medio por posse e necessidade de revisao de processo.",
    },
    {
      title: "Sala comercial retomada por banco",
      propertyType: "Comercial",
      address: `Regiao central, ${city}/${state}`,
      city,
      state,
      externalId: `MOCK-${now}-03`,
      initialBid: 260000,
      appraisalValue: 410000,
      riskScore: 36,
      sourceUrl: "https://example.com/leilao/sala-comercial",
      evidenceNotes: "Mock de provider: validar liquidez comercial e regras do banco antes de divulgar.",
    },
  ];

  return rows.slice(0, limit).map((row, index) => normalizeCandidate(row, index, input, provider, runtimeMode));
}

export function getSourceProviderHealth(): SourceProviderHealth[] {
  return sourceProviderConfigs.map((config) => {
    const provider = envValue(config.providerEnv) || config.defaultProvider;
    const baseUrlConfigured = Boolean(envValue(config.baseUrlEnv));
    const tokenConfigured = Boolean(envValue(config.tokenEnv));
    const released = readBooleanEnv(process.env[config.releasedEnv]) || readBooleanEnv(process.env.BETEL_SOURCE_PROVIDER_RELEASED);
    const ready = baseUrlConfigured && tokenConfigured && released;
    const missing = [
      !baseUrlConfigured ? "endpoint/base URL" : "",
      !tokenConfigured ? "token/API key" : "",
      !released ? "homologacao liberada" : "",
    ].filter(Boolean);
    const status = ready ? "ready" : baseUrlConfigured && tokenConfigured ? "blocked" : "missing_configuration";

    return {
      key: config.key,
      label: config.label,
      purpose: config.purpose,
      provider,
      baseUrlConfigured,
      tokenConfigured,
      released,
      ready,
      status,
      envKeys: {
        provider: config.providerEnv,
        baseUrl: config.baseUrlEnv,
        token: config.tokenEnv,
        released: config.releasedEnv,
      },
      missing,
    };
  });
}

export async function executeSourceProviderPull(
  input: SourceProviderPullInput
): Promise<SourceProviderAdapterResult> {
  const startedMs = Date.now();
  const runtimeMode = normalizeProviderMode(input.runtimeMode);
  const limit = clampLimit(input.limit);
  const providerConfig = getConfigByKey(cleanString(input.providerKey, "auction_sources"));
  const provider = getHealthByKey(providerConfig.key);
  const endpointUrl = envValue(providerConfig.baseUrlEnv);
  const token = envValue(providerConfig.tokenEnv);
  const providerReleased = provider.released || Boolean(input.providerReleaseConfirmed);
  const dryRun = input.dryRun !== false;
  const requestPayload = {
    providerKey: provider.key,
    provider: provider.provider,
    runtimeMode,
    query: cleanString(input.query),
    city: cleanString(input.city),
    state: cleanString(input.state).toUpperCase(),
    limit,
    dryRun,
    operatorLabel: cleanString(input.operatorLabel, "Agente Buscador de Imoveis"),
    pulledAt: new Date().toISOString(),
  };

  if (runtimeMode !== "provider") {
    const candidates = buildMockCandidates(input, provider, runtimeMode, limit);

    return {
      ok: true,
      data: {
        provider,
        runtimeMode,
        dryRun,
        pulledAt: requestPayload.pulledAt,
        requestPayload,
        candidates,
        providerStatus: runtimeMode === "sandbox" ? "sandbox_ready" : "mock_ready",
        latencyMs: Math.max(Date.now() - startedMs, 24),
      },
    };
  }

  if (!input.allowExternal) {
    return {
      ok: false,
      error: "Provider externo bloqueado: confirme allowExternal somente apos homologar o contrato da API.",
    };
  }

  if (!providerReleased) {
    return {
      ok: false,
      error: "Provider externo bloqueado: confirme a homologacao no formulario ou libere a flag de ambiente da fonte.",
    };
  }

  if (!endpointUrl || !token) {
    return {
      ok: false,
      error: `Configuracao incompleta para ${provider.label}: endpoint/base URL e token/API key sao obrigatorios.`,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpointUrl, {
      body: JSON.stringify(requestPayload),
      headers: {
        "content-type": "application/json",
        ...headerToken(token),
      },
      method: "POST",
      signal: controller.signal,
    });
    const responseText = preview(await response.text().catch(() => ""));
    const latencyMs = Math.max(Date.now() - startedMs, 30);

    if (!response.ok) {
      return {
        ok: false,
        error: `Provider ${provider.provider} retornou HTTP ${response.status}.`,
        data: {
          provider,
          runtimeMode,
          dryRun,
          pulledAt: requestPayload.pulledAt,
          requestPayload,
          candidates: [],
          providerStatus: "failed",
          latencyMs,
          responsePreview: responseText,
          errorMessage: `Provider ${provider.provider} retornou HTTP ${response.status}.`,
        },
      };
    }

    let parsed: unknown;

    try {
      parsed = responseText ? JSON.parse(responseText) : [];
    } catch {
      return {
        ok: false,
        error: "Provider retornou uma resposta que nao e JSON valido.",
      };
    }

    const candidates = extractCandidateRows(parsed)
      .slice(0, limit)
      .map((row, index) => normalizeCandidate(row, index, input, provider, runtimeMode));

    return {
      ok: true,
      data: {
        provider,
        runtimeMode,
        dryRun,
        pulledAt: requestPayload.pulledAt,
        requestPayload,
        candidates,
        providerStatus: candidates.length ? "provider_accepted" : "empty",
        latencyMs,
        responsePreview: responseText,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erro desconhecido ao chamar provider de fonte.",
    };
  } finally {
    clearTimeout(timeout);
  }
}
