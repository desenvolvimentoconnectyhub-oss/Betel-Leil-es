export const CONNECTION_STATUS_TTL_MS = 90_000;

export function normalizedConnectionState(value: unknown, connected = false): string {
  const state = typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "_") : "";
  if (!state) return connected ? "connected" : "unknown";
  if (/disconnect|not_connected|notconnected|not_logged|notlogged|logout/.test(state) || ["close", "closed", "offline", "deleted", "archived"].includes(state)) return "disconnected";
  if (/qr|scan|pair/.test(state)) return "qr_pending";
  if (["connecting", "reconnecting"].includes(state)) return state;
  if (["connected", "open", "online", "ready", "logged", "loggedin", "logged_in", "authenticated"].includes(state)) return "connected";
  return state;
}

export function freshConnection(status: unknown, checkedAt: unknown, now = Date.now()) {
  const checked = typeof checkedAt === "string" ? Date.parse(checkedAt) : NaN;
  return normalizedConnectionState(status) === "connected" && Number.isFinite(checked) && now >= checked && now - checked <= CONNECTION_STATUS_TTL_MS;
}

// The first record with an explicit connection signal owns the result. Nested
// identity/profile snapshots must never override a current negative status.
export function resolveConnectionRecords(records: Record<string, unknown>[]) {
  const stateKeys = ["connectionStatus", "connection_status", "instanceStatus", "instance_status", "sessionStatus", "session_status", "whatsappStatus", "whatsapp_status", "state", "status"];
  const booleanKeys = ["connected", "isConnected", "is_connected", "loggedIn", "logged_in", "isLogged", "is_logged", "authenticated", "ready", "online", "open"];
  for (const record of records) {
    const rawState = stateKeys.map(key => record[key]).find(value => typeof value === "string" && value.trim() && !["success", "ok"].includes(value));
    const flags = booleanKeys.map(key => record[key]).filter(value => typeof value === "boolean" || value === 0 || value === 1 || ["true", "false", "0", "1"].includes(String(value)));
    const negative = flags.some(value => value === false || value === 0 || value === "false" || value === "0");
    if (negative) return { state: rawState ? normalizedConnectionState(rawState) === "connected" ? "disconnected" : normalizedConnectionState(rawState) : "disconnected", connected: false, loggedIn: false };
    if (rawState || flags.length) {
      const state = normalizedConnectionState(rawState, flags.length > 0);
      return { state, connected: state === "connected", loggedIn: state === "connected" };
    }
  }
  return { state: "unknown", connected: false, loggedIn: false };
}
