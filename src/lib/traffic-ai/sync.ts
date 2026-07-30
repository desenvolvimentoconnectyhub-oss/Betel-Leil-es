import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  readTrafficAppConfig,
  resolveTrafficConfigValue,
} from "@/lib/traffic-ai/dashboard";

type DbRow = Record<string, unknown>;
type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdminClient>>;

export type TrafficSyncScope =
  | "all"
  | "meta_ads"
  | "meta_social"
  | "google_ads"
  | "google_analytics"
  | "google_search_console"
  | "google_business_profile";

export type TrafficSyncResult = {
  ok: boolean;
  scope: TrafficSyncScope;
  source: string;
  generatedAt: string;
  results: Array<{
    id: string;
    ok: boolean;
    skipped?: boolean;
    message: string;
    counts?: Record<string, number>;
  }>;
};

function cleanString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asObject(value: unknown): DbRow {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DbRow : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function snapshotDate() {
  return new Date().toISOString().slice(0, 10);
}

function budgetFromMetaCents(value: unknown) {
  const amount = asNumber(value);
  return amount > 0 ? amount / 100 : null;
}

function actionCount(actions: unknown[], actionTypes: string[]) {
  return actions.reduce<number>((total, action) => {
    const row = asObject(action);
    const type = cleanString(row.action_type);
    if (!actionTypes.includes(type)) return total;
    return total + asNumber(row.value);
  }, 0);
}

function shouldRun(scope: TrafficSyncScope, id: TrafficSyncScope) {
  return scope === "all" || scope === id;
}

async function upsertConnection(
  supabase: SupabaseAdmin,
  row: {
    provider: "meta" | "google" | "organic" | "multichannel";
    connection_type: string;
    label: string;
    status: "pending" | "active" | "warning" | "error" | "paused" | "disabled";
    external_account_id: string;
    business_name?: string;
    scopes?: string[];
    permissions?: DbRow;
    last_error?: string | null;
    metadata?: DbRow;
  }
) {
  const { data, error } = await supabase
    .from("traffic_connections")
    .upsert(
      {
        ...row,
        business_name: row.business_name || null,
        scopes: row.scopes || [],
        permissions: row.permissions || {},
        last_tested_at: new Date().toISOString(),
        last_synced_at: row.status === "active" ? new Date().toISOString() : null,
        last_error: row.last_error || null,
        metadata: row.metadata || {},
      },
      { onConflict: "provider,connection_type,external_account_id" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return cleanString((data as DbRow | null)?.id);
}

async function metaGraphGet(token: string, apiVersion: string, path: string, params: Record<string, string>) {
  const url = new URL(`https://graph.facebook.com/${apiVersion}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = asObject(asObject(payload).error);
    throw new Error(cleanString(error.message, `Meta Graph retornou ${res.status}.`));
  }
  return asObject(payload);
}

async function syncMetaAds(supabase: SupabaseAdmin, source: string) {
  const appConfig = await readTrafficAppConfig();
  const token = resolveTrafficConfigValue(appConfig, "META_SYSTEM_USER_TOKEN", "meta_system_user_token");
  const businessId = resolveTrafficConfigValue(appConfig, "META_BUSINESS_ID", "meta_business_id");
  const adAccountId = resolveTrafficConfigValue(appConfig, "META_AD_ACCOUNT_ID", "meta_ad_account_id").replace(/^act_/, "");
  const apiVersion = resolveTrafficConfigValue(appConfig, "META_GRAPH_API_VERSION", "meta_graph_api_version") || "v26.0";

  if (!token || !adAccountId) {
    return {
      id: "meta_ads",
      ok: false,
      skipped: true,
      message: "Meta Ads ignorado: META_SYSTEM_USER_TOKEN ou META_AD_ACCOUNT_ID ausente.",
    };
  }

  const account = await metaGraphGet(token, apiVersion, `act_${adAccountId}`, {
    fields: "id,name,account_status,currency,timezone_name,amount_spent,spend_cap",
  });

  const connectionId = await upsertConnection(supabase, {
    provider: "meta",
    connection_type: "ads",
    label: cleanString(account.name, `Meta Ads act_${adAccountId}`),
    status: "active",
    external_account_id: businessId || adAccountId,
    business_name: cleanString(account.name),
    scopes: ["ads_read", "business_management"],
    metadata: { source, apiVersion },
  });

  const accountPayload = {
    provider: "meta",
    connection_id: connectionId || null,
    external_account_id: cleanString(account.id, `act_${adAccountId}`),
    name: cleanString(account.name, `Meta Ads act_${adAccountId}`),
    currency: cleanString(account.currency),
    timezone: cleanString(account.timezone_name),
    account_status: cleanString(account.account_status, "unknown"),
    spend_limit: budgetFromMetaCents(account.spend_cap),
    raw_payload: account,
    last_synced_at: new Date().toISOString(),
  };

  const { data: adAccount, error: accountError } = await supabase
    .from("traffic_ad_accounts")
    .upsert(accountPayload, { onConflict: "provider,external_account_id" })
    .select("id")
    .single();
  if (accountError) throw accountError;

  const campaignsPayload = await metaGraphGet(token, apiVersion, `act_${adAccountId}/campaigns`, {
    limit: "100",
    fields:
      "id,name,status,effective_status,objective,buying_type,daily_budget,lifetime_budget,insights.date_preset(last_7d){spend,impressions,clicks,actions,cpc,ctr}",
  });

  const adAccountUuid = cleanString((adAccount as DbRow | null)?.id);
  const rows = asArray(campaignsPayload.data).map((item) => {
    const campaign = asObject(item);
    const insights = asObject(asArray(asObject(campaign.insights).data)[0]);
    const spend = asNumber(insights.spend);
    const clicks = asNumber(insights.clicks);
    const actions = asArray(insights.actions);
    const leads = actionCount(actions, [
      "lead",
      "onsite_conversion.lead_grouped",
      "offsite_conversion.fb_pixel_lead",
      "onsite_conversion.messaging_conversation_started_7d",
    ]);
    const conversions = actionCount(actions, [
      "purchase",
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "complete_registration",
    ]);

    return {
      provider: "meta",
      ad_account_id: adAccountUuid || null,
      external_campaign_id: cleanString(campaign.id),
      name: cleanString(campaign.name, "Campanha Meta"),
      objective: cleanString(campaign.objective),
      buying_type: cleanString(campaign.buying_type),
      status: cleanString(campaign.status, "unknown").toLowerCase(),
      effective_status: cleanString(campaign.effective_status),
      budget: budgetFromMetaCents(campaign.daily_budget) || budgetFromMetaCents(campaign.lifetime_budget),
      spend,
      impressions: asNumber(insights.impressions),
      clicks,
      leads,
      conversions,
      ctr: asNumber(insights.ctr),
      cpc: asNumber(insights.cpc),
      cpl: leads > 0 ? spend / leads : null,
      snapshot_date: snapshotDate(),
      raw_payload: campaign,
    };
  }).filter((row) => row.external_campaign_id);

  if (rows.length > 0) {
    const { error } = await supabase
      .from("traffic_campaign_snapshots")
      .upsert(rows, { onConflict: "provider,external_campaign_id,snapshot_date" });
    if (error) throw error;
  }

  return {
    id: "meta_ads",
    ok: true,
    message: `Meta Ads sincronizado: ${rows.length} campanha(s).`,
    counts: { accounts: 1, campaigns: rows.length },
  };
}

async function syncMetaSocial(supabase: SupabaseAdmin, source: string) {
  const appConfig = await readTrafficAppConfig();
  const token = resolveTrafficConfigValue(appConfig, "META_SYSTEM_USER_TOKEN", "meta_system_user_token");
  const pageId = resolveTrafficConfigValue(appConfig, "META_FACEBOOK_PAGE_ID", "meta_facebook_page_id");
  const instagramId = resolveTrafficConfigValue(appConfig, "META_INSTAGRAM_BUSINESS_ACCOUNT_ID", "meta_instagram_business_account_id");
  const apiVersion = resolveTrafficConfigValue(appConfig, "META_GRAPH_API_VERSION", "meta_graph_api_version") || "v26.0";

  if (!token || !pageId || !instagramId) {
    return {
      id: "meta_social",
      ok: false,
      skipped: true,
      message: "Meta Social ignorado: token, Page ID ou Instagram Business Account ID ausente.",
    };
  }

  const [page, instagram] = await Promise.all([
    metaGraphGet(token, apiVersion, pageId, { fields: "id,name,fan_count,link,instagram_business_account" }),
    metaGraphGet(token, apiVersion, instagramId, { fields: "id,username,name,followers_count,profile_picture_url" }),
  ]);

  const connectionId = await upsertConnection(supabase, {
    provider: "meta",
    connection_type: "social",
    label: cleanString(page.name, "Meta Social"),
    status: "active",
    external_account_id: pageId,
    business_name: cleanString(page.name),
    scopes: ["pages_read_engagement", "instagram_basic", "instagram_manage_messages"],
    metadata: { source, apiVersion, instagramId },
  });

  const rows = [
    {
      provider: "facebook",
      connection_id: connectionId || null,
      external_profile_id: cleanString(page.id, pageId),
      username: "",
      display_name: cleanString(page.name, "Facebook Page"),
      profile_url: cleanString(page.link),
      follower_count: asNumber(page.fan_count),
      status: "active",
      raw_payload: page,
      last_synced_at: new Date().toISOString(),
    },
    {
      provider: "instagram",
      connection_id: connectionId || null,
      external_profile_id: cleanString(instagram.id, instagramId),
      username: cleanString(instagram.username),
      display_name: cleanString(instagram.name, cleanString(instagram.username, "Instagram")),
      profile_url: cleanString(instagram.profile_picture_url),
      follower_count: asNumber(instagram.followers_count),
      status: "active",
      raw_payload: instagram,
      last_synced_at: new Date().toISOString(),
    },
  ];

  const { error } = await supabase
    .from("traffic_social_profiles")
    .upsert(rows, { onConflict: "provider,external_profile_id" });
  if (error) throw error;

  return {
    id: "meta_social",
    ok: true,
    message: "Meta Social sincronizado: Facebook Page e Instagram Business.",
    counts: { profiles: rows.length },
  };
}

async function refreshGoogleOAuth() {
  const appConfig = await readTrafficAppConfig();
  const clientId = resolveTrafficConfigValue(appConfig, "GOOGLE_ADS_CLIENT_ID", "google_ads_client_id");
  const clientSecret = resolveTrafficConfigValue(appConfig, "GOOGLE_ADS_CLIENT_SECRET", "google_ads_client_secret");
  const refreshToken = resolveTrafficConfigValue(appConfig, "GOOGLE_ADS_REFRESH_TOKEN", "google_ads_refresh_token");

  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, message: "OAuth Google incompleto." };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      message: cleanString(asObject(payload).error_description, cleanString(asObject(payload).error, `Google OAuth retornou ${response.status}.`)),
    };
  }
  return { ok: true, message: "OAuth Google validado." };
}

async function syncGoogleConnection(
  supabase: SupabaseAdmin,
  input: {
    id: Exclude<TrafficSyncScope, "all" | "meta_ads" | "meta_social">;
    connectionType: string;
    label: string;
    externalId: string;
    requiredKeys: Array<[envName: string, configKey: string]>;
    metadata?: DbRow;
  }
) {
  const appConfig = await readTrafficAppConfig();
  const missing = input.requiredKeys.filter(([envName, configKey]) => !resolveTrafficConfigValue(appConfig, envName, configKey));
  if (missing.length > 0) {
    return {
      id: input.id,
      ok: false,
      skipped: true,
      message: `${input.label} ignorado: ${missing.map(([envName]) => envName).join(", ")} ausente(s).`,
    };
  }

  const oauth = await refreshGoogleOAuth();
  if (!oauth.ok) {
    await upsertConnection(supabase, {
      provider: "google",
      connection_type: input.connectionType,
      label: input.label,
      status: "error",
      external_account_id: input.externalId,
      last_error: oauth.message,
      metadata: input.metadata,
    });
    return { id: input.id, ok: false, message: oauth.message };
  }

  const connectionId = await upsertConnection(supabase, {
    provider: "google",
    connection_type: input.connectionType,
    label: input.label,
    status: "active",
    external_account_id: input.externalId,
    scopes: ["oauth_validated"],
    metadata: input.metadata,
  });

  if (input.id === "google_ads") {
    const customerId = resolveTrafficConfigValue(appConfig, "GOOGLE_ADS_CUSTOMER_ID", "google_ads_customer_id");
    const { error } = await supabase
      .from("traffic_ad_accounts")
      .upsert(
        {
          provider: "google",
          connection_id: connectionId || null,
          external_account_id: customerId,
          name: `Google Ads ${customerId}`,
          account_status: "pending_sync",
          raw_payload: { customerId },
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "provider,external_account_id" }
      );
    if (error) throw error;
  }

  return {
    id: input.id,
    ok: true,
    message: `${input.label} preparado: OAuth validado e conexao registrada.`,
    counts: { connections: 1 },
  };
}

export async function syncTrafficAi(input: {
  scope?: string;
  source?: string;
} = {}): Promise<TrafficSyncResult> {
  const scope = (cleanString(input.scope, "all") as TrafficSyncScope) || "all";
  const source = cleanString(input.source, "manual");
  const supabase = getSupabaseAdminClient();

  if (!supabase) {
    return {
      ok: false,
      scope,
      source,
      generatedAt: new Date().toISOString(),
      results: [{ id: "supabase", ok: false, message: "Supabase admin nao configurado." }],
    };
  }

  const appConfig = await readTrafficAppConfig();
  const results: TrafficSyncResult["results"] = [];

  async function run(id: TrafficSyncScope, task: () => Promise<TrafficSyncResult["results"][number]>) {
    if (!shouldRun(scope, id)) return;
    try {
      results.push(await task());
    } catch (error) {
      results.push({
        id,
        ok: false,
        message: error instanceof Error ? error.message : `Falha ao sincronizar ${id}.`,
      });
    }
  }

  await run("meta_ads", () => syncMetaAds(supabase, source));
  await run("meta_social", () => syncMetaSocial(supabase, source));
  await run("google_ads", () =>
    syncGoogleConnection(supabase, {
      id: "google_ads",
      connectionType: "ads",
      label: "Google Ads",
      externalId: resolveTrafficConfigValue(appConfig, "GOOGLE_ADS_CUSTOMER_ID", "google_ads_customer_id"),
      requiredKeys: [
        ["GOOGLE_ADS_DEVELOPER_TOKEN", "google_ads_developer_token"],
        ["GOOGLE_ADS_CLIENT_ID", "google_ads_client_id"],
        ["GOOGLE_ADS_CLIENT_SECRET", "google_ads_client_secret"],
        ["GOOGLE_ADS_REFRESH_TOKEN", "google_ads_refresh_token"],
        ["GOOGLE_ADS_CUSTOMER_ID", "google_ads_customer_id"],
      ],
    })
  );
  await run("google_analytics", () =>
    syncGoogleConnection(supabase, {
      id: "google_analytics",
      connectionType: "analytics",
      label: "Google Analytics 4",
      externalId: resolveTrafficConfigValue(appConfig, "GOOGLE_ANALYTICS_PROPERTY_ID", "google_analytics_property_id"),
      requiredKeys: [
        ["GOOGLE_ADS_CLIENT_ID", "google_ads_client_id"],
        ["GOOGLE_ADS_CLIENT_SECRET", "google_ads_client_secret"],
        ["GOOGLE_ADS_REFRESH_TOKEN", "google_ads_refresh_token"],
        ["GOOGLE_ANALYTICS_PROPERTY_ID", "google_analytics_property_id"],
      ],
    })
  );
  await run("google_search_console", () =>
    syncGoogleConnection(supabase, {
      id: "google_search_console",
      connectionType: "search_console",
      label: "Google Search Console",
      externalId: resolveTrafficConfigValue(appConfig, "GOOGLE_SEARCH_CONSOLE_SITE_URL", "google_search_console_site_url"),
      requiredKeys: [
        ["GOOGLE_ADS_CLIENT_ID", "google_ads_client_id"],
        ["GOOGLE_ADS_CLIENT_SECRET", "google_ads_client_secret"],
        ["GOOGLE_ADS_REFRESH_TOKEN", "google_ads_refresh_token"],
        ["GOOGLE_SEARCH_CONSOLE_SITE_URL", "google_search_console_site_url"],
      ],
    })
  );
  await run("google_business_profile", () =>
    syncGoogleConnection(supabase, {
      id: "google_business_profile",
      connectionType: "business_profile",
      label: "Google Business Profile",
      externalId: resolveTrafficConfigValue(appConfig, "GOOGLE_BUSINESS_PROFILE_LOCATION_ID", "google_business_profile_location_id"),
      requiredKeys: [
        ["GOOGLE_ADS_CLIENT_ID", "google_ads_client_id"],
        ["GOOGLE_ADS_CLIENT_SECRET", "google_ads_client_secret"],
        ["GOOGLE_ADS_REFRESH_TOKEN", "google_ads_refresh_token"],
        ["GOOGLE_BUSINESS_PROFILE_ACCOUNT_ID", "google_business_profile_account_id"],
        ["GOOGLE_BUSINESS_PROFILE_LOCATION_ID", "google_business_profile_location_id"],
      ],
    })
  );

  return {
    ok: results.every((result) => result.ok || result.skipped),
    scope,
    source,
    generatedAt: new Date().toISOString(),
    results,
  };
}
