import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const GOOGLE_MAPS_API_DEFAULT_BASE_URL = "https://maps.googleapis.com/maps/api";
export const GOOGLE_PLACES_API_DEFAULT_BASE_URL = "https://places.googleapis.com/v1";
export const GOOGLE_MAPS_API_BASE_URL_CONFIG_KEY = "betel_google_maps_api_base_url";
export const GOOGLE_PLACES_API_BASE_URL_CONFIG_KEY = "betel_google_places_api_base_url";
export const GOOGLE_MAPS_API_KEY_CONFIG_KEY = "google_maps_api_key";
export const GOOGLE_MAPS_NEARBY_ENABLED_CONFIG_KEY = "betel_google_maps_nearby_enabled";

type GoogleMapsConfigSource = "app_config" | "env" | "default" | "missing";

export type GoogleMapsLatLng = {
  latitude: number;
  longitude: number;
};

export type GoogleMapsConfig = {
  geocodingBaseUrl: string;
  placesBaseUrl: string;
  apiKey: string;
  nearbyEnabled: boolean;
  configured: boolean;
  geocodingBaseUrlSource: GoogleMapsConfigSource;
  placesBaseUrlSource: GoogleMapsConfigSource;
  apiKeySource: GoogleMapsConfigSource;
  nearbyEnabledSource: GoogleMapsConfigSource;
};

export type GoogleMapsGeocodeResult = {
  ok: boolean;
  status: string;
  latencyMs: number;
  query: string;
  formattedAddress: string;
  placeId: string;
  locationType: string;
  latitude: number;
  longitude: number;
  partialMatch: boolean;
  types: string[];
  payload: unknown;
  error?: string;
};

export type GoogleMapsNearbyPlace = {
  name: string;
  primaryType: string;
  types: string[];
  formattedAddress: string;
  latitude: number;
  longitude: number;
  googleMapsUri: string;
};

export type GoogleMapsNearbySignal = {
  label: string;
  includedTypes: string[];
  radiusMeters: number;
  count: number;
  places: GoogleMapsNearbyPlace[];
  error?: string;
};

export type GoogleMapsConnectionTestResult = {
  success: boolean;
  integration: "google_maps";
  message: string;
  latencyMs: number;
  geocode?: GoogleMapsGeocodeResult;
};

const GOOGLE_GEOCODING_TIMEOUT_MS = 12_000;
const GOOGLE_PLACES_TIMEOUT_MS = 12_000;
const GOOGLE_PLACES_FIELD_MASK = [
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryType",
  "places.types",
  "places.googleMapsUri",
].join(",");

const ENV_ALIASES: Record<"geocodingBaseUrl" | "placesBaseUrl" | "apiKey" | "nearbyEnabled", string[]> = {
  geocodingBaseUrl: ["BETEL_GOOGLE_MAPS_API_BASE_URL", "GOOGLE_MAPS_API_BASE_URL"],
  placesBaseUrl: ["BETEL_GOOGLE_PLACES_API_BASE_URL", "GOOGLE_PLACES_API_BASE_URL"],
  apiKey: ["GOOGLE_MAPS_API_KEY", "BETEL_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_PLATFORM_API_KEY"],
  nearbyEnabled: ["BETEL_GOOGLE_MAPS_NEARBY_ENABLED"],
};

const APP_CONFIG_ALIASES: Record<"geocodingBaseUrl" | "placesBaseUrl" | "apiKey" | "nearbyEnabled", string[]> = {
  geocodingBaseUrl: [GOOGLE_MAPS_API_BASE_URL_CONFIG_KEY],
  placesBaseUrl: [GOOGLE_PLACES_API_BASE_URL_CONFIG_KEY],
  apiKey: [GOOGLE_MAPS_API_KEY_CONFIG_KEY, "betel_google_maps_api_key"],
  nearbyEnabled: [GOOGLE_MAPS_NEARBY_ENABLED_CONFIG_KEY],
};

function cleanString(value: unknown) {
  return String(value || "").trim();
}

function booleanFromConfig(value: string, fallback = true) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "sim", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "nao", "não", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function readAppConfigValues(keys: string[]) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return new Map<string, string>();

  const normalizedKeys = keys.map((key) => key.toLowerCase());
  const { data, error } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", normalizedKeys);

  if (error || !data) return new Map<string, string>();

  return new Map(
    data
      .map((row) => [cleanString(row.key).toLowerCase(), cleanString(row.value)] as const)
      .filter(([key, value]) => Boolean(key && value))
  );
}

function readEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = cleanString(process.env[key]);
    if (value) return value;
  }
  return "";
}

function readMapValue(map: Map<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = cleanString(map.get(key.toLowerCase()));
    if (value) return value;
  }
  return "";
}

async function readJsonPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { response: text.slice(0, 240) };
  }
}

function payloadErrorMessage(payload: unknown) {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return cleanString(record.error_message || error.message || record.message || record.status || record.response);
}

function googleMapsUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export async function getGoogleMapsConfig(): Promise<GoogleMapsConfig> {
  const appConfig = await readAppConfigValues([
    ...APP_CONFIG_ALIASES.geocodingBaseUrl,
    ...APP_CONFIG_ALIASES.placesBaseUrl,
    ...APP_CONFIG_ALIASES.apiKey,
    ...APP_CONFIG_ALIASES.nearbyEnabled,
  ]);

  const appGeocodingBaseUrl = readMapValue(appConfig, APP_CONFIG_ALIASES.geocodingBaseUrl);
  const appPlacesBaseUrl = readMapValue(appConfig, APP_CONFIG_ALIASES.placesBaseUrl);
  const appApiKey = readMapValue(appConfig, APP_CONFIG_ALIASES.apiKey);
  const appNearbyEnabled = readMapValue(appConfig, APP_CONFIG_ALIASES.nearbyEnabled);
  const envGeocodingBaseUrl = readEnvValue(ENV_ALIASES.geocodingBaseUrl);
  const envPlacesBaseUrl = readEnvValue(ENV_ALIASES.placesBaseUrl);
  const envApiKey = readEnvValue(ENV_ALIASES.apiKey);
  const envNearbyEnabled = readEnvValue(ENV_ALIASES.nearbyEnabled);
  const nearbyValue = appNearbyEnabled || envNearbyEnabled || "true";

  return {
    geocodingBaseUrl: appGeocodingBaseUrl || envGeocodingBaseUrl || GOOGLE_MAPS_API_DEFAULT_BASE_URL,
    placesBaseUrl: appPlacesBaseUrl || envPlacesBaseUrl || GOOGLE_PLACES_API_DEFAULT_BASE_URL,
    apiKey: appApiKey || envApiKey,
    nearbyEnabled: booleanFromConfig(nearbyValue, true),
    configured: Boolean(appApiKey || envApiKey),
    geocodingBaseUrlSource: appGeocodingBaseUrl ? "app_config" : envGeocodingBaseUrl ? "env" : "default",
    placesBaseUrlSource: appPlacesBaseUrl ? "app_config" : envPlacesBaseUrl ? "env" : "default",
    apiKeySource: appApiKey ? "app_config" : envApiKey ? "env" : "missing",
    nearbyEnabledSource: appNearbyEnabled ? "app_config" : envNearbyEnabled ? "env" : "default",
  };
}

export async function geocodeAddressWithGoogleMaps(query: string): Promise<GoogleMapsGeocodeResult> {
  const start = Date.now();
  const config = await getGoogleMapsConfig();
  const cleanQuery = cleanString(query);

  if (!config.apiKey) {
    return {
      ok: false,
      status: "MISSING_KEY",
      latencyMs: Date.now() - start,
      query: cleanQuery,
      formattedAddress: "",
      placeId: "",
      locationType: "",
      latitude: 0,
      longitude: 0,
      partialMatch: false,
      types: [],
      payload: {},
      error: "API key do Google Maps pendente.",
    };
  }

  if (!cleanQuery) {
    return {
      ok: false,
      status: "EMPTY_QUERY",
      latencyMs: Date.now() - start,
      query: cleanQuery,
      formattedAddress: "",
      placeId: "",
      locationType: "",
      latitude: 0,
      longitude: 0,
      partialMatch: false,
      types: [],
      payload: {},
      error: "Endereco vazio para geocodificacao.",
    };
  }

  try {
    const url = new URL(googleMapsUrl(config.geocodingBaseUrl, "/geocode/json"));
    url.searchParams.set("address", cleanQuery);
    url.searchParams.set("region", "br");
    url.searchParams.set("language", "pt-BR");
    url.searchParams.set("key", config.apiKey);

    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(GOOGLE_GEOCODING_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - start;
    const payload = await readJsonPayload(response);
    const record = asRecord(payload);
    const status = cleanString(record.status) || (response.ok ? "UNKNOWN" : String(response.status));
    const results = Array.isArray(record.results) ? record.results : [];
    const first = asRecord(results[0]);
    const geometry = asRecord(first.geometry);
    const location = asRecord(geometry.location);
    const latitude = asNumber(location.lat);
    const longitude = asNumber(location.lng);

    if (!response.ok || status !== "OK" || !latitude || !longitude) {
      return {
        ok: false,
        status,
        latencyMs,
        query: cleanQuery,
        formattedAddress: "",
        placeId: "",
        locationType: "",
        latitude: 0,
        longitude: 0,
        partialMatch: false,
        types: [],
        payload,
        error: payloadErrorMessage(payload) || `Google Maps Geocoding retornou ${status || response.status}.`,
      };
    }

    return {
      ok: true,
      status,
      latencyMs,
      query: cleanQuery,
      formattedAddress: cleanString(first.formatted_address),
      placeId: cleanString(first.place_id),
      locationType: cleanString(geometry.location_type),
      latitude,
      longitude,
      partialMatch: Boolean(first.partial_match),
      types: Array.isArray(first.types) ? first.types.map(cleanString).filter(Boolean) : [],
      payload,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: "FETCH_ERROR",
      latencyMs: Date.now() - start,
      query: cleanQuery,
      formattedAddress: "",
      placeId: "",
      locationType: "",
      latitude: 0,
      longitude: 0,
      partialMatch: false,
      types: [],
      payload: {},
      error: error instanceof Error ? error.message : "Falha ao chamar Google Maps Geocoding.",
    };
  }
}

export async function searchNearbyPlacesWithGoogleMaps(input: {
  label: string;
  includedTypes: string[];
  center: GoogleMapsLatLng;
  radiusMeters: number;
  maxResultCount?: number;
}): Promise<GoogleMapsNearbySignal> {
  const config = await getGoogleMapsConfig();
  const fallback: GoogleMapsNearbySignal = {
    label: input.label,
    includedTypes: input.includedTypes,
    radiusMeters: input.radiusMeters,
    count: 0,
    places: [],
  };

  if (!config.apiKey) return { ...fallback, error: "API key do Google Maps pendente." };
  if (!config.nearbyEnabled) return { ...fallback, error: "Busca Nearby do Google Maps desabilitada." };

  try {
    const response = await fetch(googleMapsUrl(config.placesBaseUrl, "/places:searchNearby"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.apiKey,
        "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        includedTypes: input.includedTypes,
        maxResultCount: Math.max(1, Math.min(10, input.maxResultCount || 3)),
        rankPreference: "DISTANCE",
        languageCode: "pt-BR",
        regionCode: "BR",
        locationRestriction: {
          circle: {
            center: {
              latitude: input.center.latitude,
              longitude: input.center.longitude,
            },
            radius: Math.max(100, Math.min(5000, input.radiusMeters)),
          },
        },
      }),
      signal: AbortSignal.timeout(GOOGLE_PLACES_TIMEOUT_MS),
    });
    const payload = await readJsonPayload(response);
    const record = asRecord(payload);
    if (!response.ok) {
      return {
        ...fallback,
        error: payloadErrorMessage(payload) || `Google Places retornou ${response.status}.`,
      };
    }

    const places = (Array.isArray(record.places) ? record.places : [])
      .map((place) => {
        const item = asRecord(place);
        const displayName = asRecord(item.displayName);
        const location = asRecord(item.location);
        return {
          name: cleanString(displayName.text || item.name),
          primaryType: cleanString(item.primaryType),
          types: Array.isArray(item.types) ? item.types.map(cleanString).filter(Boolean) : [],
          formattedAddress: cleanString(item.formattedAddress),
          latitude: asNumber(location.latitude),
          longitude: asNumber(location.longitude),
          googleMapsUri: cleanString(item.googleMapsUri),
        };
      })
      .filter((place) => place.name);

    return {
      ...fallback,
      count: places.length,
      places,
    };
  } catch (error: unknown) {
    return {
      ...fallback,
      error: error instanceof Error ? error.message : "Falha ao chamar Google Places Nearby.",
    };
  }
}

export async function testGoogleMapsConnection(): Promise<GoogleMapsConnectionTestResult> {
  const result = await geocodeAddressWithGoogleMaps("Blumenau, SC, Brasil");

  if (!result.ok) {
    return {
      success: false,
      integration: "google_maps",
      message: result.error || `Google Maps retornou ${result.status}.`,
      latencyMs: result.latencyMs,
      geocode: result,
    };
  }

  return {
    success: true,
    integration: "google_maps",
    message: `Geocoding OK para ${result.formattedAddress || result.query}. Resposta em ${result.latencyMs}ms.`,
    latencyMs: result.latencyMs,
    geocode: result,
  };
}
