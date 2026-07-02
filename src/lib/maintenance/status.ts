import { HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getElevenLabsConfig } from "@/lib/voice/elevenlabs";

export type MaintenanceStatusValue = "ok" | "warning" | "missing" | "error";

export type MaintenanceItem = {
  name: string;
  label: string;
  configured: boolean;
  value: string;
  editable?: boolean;
  secret?: boolean;
  configKey?: string;
};

export type MaintenanceIntegration = {
  id: string;
  title: string;
  status: MaintenanceStatusValue;
  message: string;
  items: MaintenanceItem[];
  group?: string;
  usedBy?: string;
  site?: string;
};

export type MaintenancePayload = {
  success: true;
  checked_at: string;
  app: {
    name: string;
    environment: string;
    site_url: string;
  };
  counts: Record<MaintenanceStatusValue, number>;
  integrations: MaintenanceIntegration[];
};

const DEFAULT_CONFIG_VALUES: Record<string, string> = {
  betel_datajud_api_base_url: "https://api-publica.datajud.cnj.jus.br",
  betel_ibge_api_base_url: "https://servicodados.ibge.gov.br/api/v1/localidades",
  betel_receitaws_api_base_url: "https://www.receitaws.com.br/v1/cnpj",
};

type MaintenanceAppConfig = Map<string, string>;

function cleanConfigValue(value: unknown) {
  return String(value || "").trim();
}

async function readMaintenanceAppConfig(): Promise<MaintenanceAppConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map();

  const { data, error } = await supabase
    .from("app_config")
    .select("key,value");

  if (error || !data) return new Map();

  return new Map(
    data
      .map((row) => [cleanConfigValue(row.key).toLowerCase(), cleanConfigValue(row.value)] as const)
      .filter(([key, value]) => Boolean(key && value))
  );
}

function configKeyFor(name: string, configKey?: string) {
  return cleanConfigValue(configKey || name.toLowerCase()).toLowerCase();
}

function resolveConfigValue(appConfig: MaintenanceAppConfig, name: string, configKey?: string) {
  const key = configKeyFor(name, configKey);
  return appConfig.get(key) || cleanConfigValue(process.env[name]) || DEFAULT_CONFIG_VALUES[key] || "";
}

function isSecretName(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("key") || lower.includes("token") || lower.includes("secret") || lower.includes("password");
}

function envItem(
  name: string,
  label = name,
  secret = false,
  appConfig: MaintenanceAppConfig = new Map(),
  configKey?: string
) {
  const key = configKeyFor(name, configKey);
  const value = resolveConfigValue(appConfig, name, key);
  return {
    name,
    label,
    configured: Boolean(value),
    value: secret ? "" : value,
    editable: true,
    secret,
    configKey: key,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Erro desconhecido.";
}

function getSupabaseEnvItems(appConfig: MaintenanceAppConfig) {
  return [
    envItem("NEXT_PUBLIC_SUPABASE_URL", "Project URL", false, appConfig),
    envItem("NEXT_PUBLIC_SUPABASE_ANON_KEY", "Publishable key", true, appConfig),
    envItem("SUPABASE_SERVICE_ROLE_KEY", "Service role key", true, appConfig),
  ];
}

async function checkSupabase(appConfig: MaintenanceAppConfig): Promise<MaintenanceIntegration> {
  const required = getSupabaseEnvItems(appConfig);

  if (required.some((item) => !item.configured)) {
    return {
      id: "supabase",
      title: "Supabase",
      status: "missing",
      message: "Credenciais incompletas.",
      items: required,
    };
  }

  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      id: "supabase",
      title: "Supabase",
      status: "missing",
      message: "Cliente admin indisponivel.",
      items: required,
    };
  }

  const { error } = await supabase.from("app_config").select("key").limit(1);

  if (!error) {
    return {
      id: "supabase",
      title: "Supabase",
      status: "ok",
      message: "Conexao ativa e app_config acessivel.",
      items: required,
    };
  }

  const message = String(error.message || "");
  if (message.toLowerCase().includes("app_config") || message.includes("relation")) {
    return {
      id: "supabase",
      title: "Supabase",
      status: "warning",
      message: "Conexao ativa; tabela app_config ainda pendente.",
      items: required,
    };
  }

  return {
    id: "supabase",
    title: "Supabase",
    status: "error",
    message,
    items: required,
  };
}

async function checkR2(appConfig: MaintenanceAppConfig): Promise<MaintenanceIntegration> {
  const required = [
    envItem("R2_ACCOUNT_ID", "Account ID", false, appConfig),
    envItem("R2_ENDPOINT", "Endpoint", false, appConfig),
    envItem("R2_ACCESS_KEY_ID", "Access key", true, appConfig),
    envItem("R2_SECRET_ACCESS_KEY", "Secret key", true, appConfig),
    envItem("R2_PUBLIC_BUCKET_NAME", "Bucket publico", false, appConfig),
    envItem("R2_PUBLIC_URL", "URL publica do bucket", false, appConfig),
    envItem("R2_PRIVATE_BUCKET_NAME", "Bucket privado", false, appConfig),
  ];

  if (required.some((item) => !item.configured)) {
    return {
      id: "r2",
      title: "Cloudflare R2",
      status: "missing",
      message: "Credenciais ou buckets incompletos.",
      items: required,
    };
  }

  const endpoint = resolveConfigValue(appConfig, "R2_ENDPOINT");
  const accessKeyId = resolveConfigValue(appConfig, "R2_ACCESS_KEY_ID");
  const secretAccessKey = resolveConfigValue(appConfig, "R2_SECRET_ACCESS_KEY");
  const publicBucket = resolveConfigValue(appConfig, "R2_PUBLIC_BUCKET_NAME");
  const privateBucket = resolveConfigValue(appConfig, "R2_PRIVATE_BUCKET_NAME");

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  const buckets = [publicBucket, privateBucket];

  try {
    await Promise.all(
      buckets.map((bucket) => client.send(new HeadBucketCommand({ Bucket: bucket })))
    );
    return {
      id: "r2",
      title: "Cloudflare R2",
      status: "ok",
      message: "Buckets acessiveis via S3.",
      items: required,
    };
  } catch (error: unknown) {
    return {
      id: "r2",
      title: "Cloudflare R2",
      status: "warning",
      message: getErrorMessage(error),
      items: required,
    };
  }
}

async function checkGemini(): Promise<MaintenanceIntegration> {
  const [apiKey, model] = await Promise.all([getGeminiApiKey(), getGeminiModel()]);
  const items: MaintenanceItem[] = [
    {
      name: "AI_PROVIDER",
      label: "Provider",
      configured: true,
      value: process.env.AI_PROVIDER || "gemini",
      editable: true,
      secret: false,
      configKey: "ai_provider",
    },
    {
      name: "GEMINI_MODEL",
      label: "Modelo",
      configured: true,
      value: model,
      editable: true,
      secret: false,
      configKey: "gemini_model",
    },
    {
      name: "GEMINI_API_KEY",
      label: "API key",
      configured: Boolean(apiKey),
      value: "",
      editable: true,
      secret: true,
      configKey: "gemini_api_key",
    },
  ];

  return {
    id: "gemini",
    title: "Gemini",
    status: apiKey ? "ok" : "missing",
    message: apiKey ? "Provider padrao configurado." : "Chave Gemini pendente.",
    items,
  };
}

async function checkElevenLabs(): Promise<MaintenanceIntegration> {
  const config = await getElevenLabsConfig();
  const apiKeyConfigured = Boolean(config.apiKey.value);

  const items: MaintenanceItem[] = [
    {
      name: "ELEVENLABS_API_KEY",
      label: "API key",
      configured: apiKeyConfigured,
      value: "",
      editable: true,
      secret: true,
      configKey: "elevenlabs_api_key",
    },
  ];

  return {
    id: "elevenlabs",
    title: "ElevenLabs / Voz e clonagem",
    status: apiKeyConfigured ? "ok" : "missing",
    message: apiKeyConfigured ? "Token ElevenLabs configurado." : "API key pendente.",
    items,
    group: "Voz e Midia IA",
    usedBy: "Willian e futuros agentes de voz",
    site: "elevenlabs.io",
  };
}

function staticCheck(
  id: string,
  title: string,
  message: string,
  vars: string[],
  extra?: { group?: string; usedBy?: string; site?: string },
  appConfig: MaintenanceAppConfig = new Map(),
) {
  const items = vars.map((name) =>
    envItem(
      name,
      name,
      isSecretName(name),
      appConfig
    )
  );
  const missing = items.filter((item) => !item.configured);
  return {
    id,
    title,
    status: missing.length ? "missing" : "ok",
    message: missing.length ? "Variaveis pendentes." : message,
    items,
    ...extra,
  } satisfies MaintenanceIntegration;
}

function checkIbge(appConfig: MaintenanceAppConfig): MaintenanceIntegration {
  const value = resolveConfigValue(appConfig, "BETEL_IBGE_API_BASE_URL");

  return {
    id: "ibge",
    title: "IBGE Cidades",
    status: "ok",
    message: "API publica gratuita configurada com endpoint padrao.",
    items: [
      {
        name: "BETEL_IBGE_API_BASE_URL",
        label: "BETEL_IBGE_API_BASE_URL",
        configured: true,
        value,
        editable: true,
        secret: false,
        configKey: "betel_ibge_api_base_url",
      },
    ],
    group: "Dados de Mercado e Avaliacao",
    usedBy: "Helena (Curadora), Igor (Risco)",
    site: "servicodados.ibge.gov.br",
  };
}

export async function getMaintenanceStatus(): Promise<MaintenancePayload> {
  const appConfig = await readMaintenanceAppConfig();
  const [supabase, r2, gemini, elevenlabs] = await Promise.all([
    checkSupabase(appConfig),
    checkR2(appConfig),
    checkGemini(),
    checkElevenLabs(),
  ]);

  supabase.group = "Infraestrutura Base";
  supabase.usedBy = "Todos os agentes";
  r2.group = "Infraestrutura Base";
  r2.usedBy = "Armazenamento de arquivos";
  gemini.group = "Infraestrutura Base";
  gemini.usedBy = "Todos os agentes (IA)";

  const integrations: MaintenanceIntegration[] = [
    supabase,
    r2,
    gemini,

    // --- Prioridade 2: Essenciais para operacao ---
    staticCheck("inngest", "Inngest", "Orquestrador de filas e agendamentos.", [
      "INNGEST_APP_ID",
      "INNGEST_EVENT_KEY",
      "INNGEST_SIGNING_KEY",
    ], { group: "Essenciais para Operacao", usedBy: "Pipeline inteiro", site: "inngest.com" }, appConfig),

    staticCheck("connectyhub", "WhatsApp / ConnectyHub", "Ponte WhatsApp configurada.", [
      "CONNECTYHUB_API_URL",
      "CONNECTYHUB_API_TOKEN",
      "CONNECTYHUB_WEBHOOK_SECRET",
      "CONNECTYHUB_WEBHOOK_URL",
    ], { group: "Essenciais para Operacao", usedBy: "Willian, Camila, Tiago", site: "connectyhub.com.br" }, appConfig),

    staticCheck("resend", "Resend (Email)", "Email transacional configurado.", [
      "RESEND_API_KEY",
      "BETEL_EMAIL_FROM",
    ], { group: "Essenciais para Operacao", usedBy: "Willian (WhatsApp e Email)", site: "resend.com" }, appConfig),

    elevenlabs,

    // --- Prioridade 3: Dados de mercado ---
    staticCheck("datazap", "DataZAP+ (OLX Group)", "Avaliacao de imoveis e preco/m².", [
      "BETEL_DATAZAP_API_BASE_URL",
      "BETEL_DATAZAP_API_KEY",
    ], { group: "Dados de Mercado e Avaliacao", usedBy: "Helena (Curadora), Igor (Risco)", site: "datazap.com.br" }, appConfig),

    staticCheck("fipezap", "FipeZAP", "Indice de precos por cidade.", [
      "BETEL_FIPEZAP_API_BASE_URL",
      "BETEL_FIPEZAP_API_KEY",
    ], { group: "Dados de Mercado e Avaliacao", usedBy: "Helena (Curadora), Rafael (Estrategia)", site: "fipezap.zapimoveis.com.br" }, appConfig),

    checkIbge(appConfig),

    // --- Prioridade 4: Verificacao juridica ---
    staticCheck("datajud", "CNJ DataJud", "Consulta de processos judiciais.", [
      "BETEL_DATAJUD_API_BASE_URL",
      "BETEL_DATAJUD_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto)", site: "datajud-wiki.cnj.jus.br" }, appConfig),

    staticCheck("receitaws", "ReceitaWS", "Verificacao de CNPJ de leiloeiros.", [
      "BETEL_RECEITAWS_API_BASE_URL",
      "BETEL_RECEITAWS_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto)", site: "receitaws.com.br" }, appConfig),

    staticCheck("bigdata", "BigData Corp", "Enriquecimento de pessoa/empresa/imovel.", [
      "BETEL_BIG_DATA_API_BASE_URL",
      "BETEL_BIG_DATA_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto), Patricia (Revisao)", site: "bigdatacorp.com.br" }, appConfig),

    staticCheck("registry", "ONR Registradores", "Matricula e cadeia dominial do imovel.", [
      "BETEL_REGISTRY_API_BASE_URL",
      "BETEL_REGISTRY_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto)", site: "registradores.onr.org.br" }, appConfig),

    staticCheck("infosimples", "InfoSimples", "Dados legais agregados.", [
      "BETEL_INFOSIMPLES_API_BASE_URL",
      "BETEL_INFOSIMPLES_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto), Patricia (Revisao)", site: "infosimples.com" }, appConfig),

    staticCheck("serpro", "SerPro", "Dados governamentais (CPF, CNPJ).", [
      "BETEL_SERPRO_API_BASE_URL",
      "BETEL_SERPRO_API_KEY",
    ], { group: "Verificacao Juridica", usedBy: "Igor (Risco Oculto)", site: "servicos.serpro.gov.br" }, appConfig),
  ];

  const counts = integrations.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { ok: 0, warning: 0, missing: 0, error: 0 } as Record<
      MaintenanceStatusValue,
      number
    >
  );

  return {
    success: true,
    checked_at: new Date().toISOString(),
    app: {
      name: "Betel AI",
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
      site_url: process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "",
    },
    counts,
    integrations,
  };
}
