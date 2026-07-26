import "server-only";

type OperationalPauseState = {
  enabled: boolean;
  paused: boolean;
  reason: string;
};

const truthyValues = new Set(["1", "true", "yes", "sim", "on", "enabled", "active"]);
const falsyValues = new Set(["0", "false", "no", "nao", "off", "disabled", "paused"]);

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (truthyValues.has(normalized)) return true;
  if (falsyValues.has(normalized)) return false;
  return undefined;
}

function operationalPauseState(input: {
  enabledEnv: string | undefined;
  pausedEnv: string | undefined;
  defaultEnabled: boolean;
  pausedReason: string;
}): OperationalPauseState {
  const explicitPaused = parseBoolean(input.pausedEnv);
  const explicitEnabled = parseBoolean(input.enabledEnv);
  const enabled = explicitPaused === undefined
    ? explicitEnabled ?? input.defaultEnabled
    : !explicitPaused;

  return {
    enabled,
    paused: !enabled,
    reason: enabled ? "" : input.pausedReason,
  };
}

export function getScraperPauseState() {
  return operationalPauseState({
    enabledEnv: process.env.BETEL_SCRAPER_ENABLED,
    pausedEnv: process.env.BETEL_SCRAPER_PAUSED,
    defaultEnabled: false,
    pausedReason: "Sistema de scraper estacionado temporariamente para novas programacoes.",
  });
}

export function getAnalysisDeliveryPauseState() {
  return operationalPauseState({
    enabledEnv: process.env.BETEL_ANALYSIS_DELIVERY_ENABLED,
    pausedEnv: process.env.BETEL_ANALYSIS_DELIVERY_PAUSED,
    defaultEnabled: false,
    pausedReason: "Envio de analises estacionado temporariamente para novas programacoes.",
  });
}
