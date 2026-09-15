export type CutoverAction = "serve" | "maintenance" | "legacy-proxy" | "webhook-hold";

export function cutoverAction(pathname: string, method = "GET"): CutoverAction {
  const mode = process.env.BETEL_CUTOVER_MODE || "";
  if (!mode || mode === "live") return "serve";
  if (mode === "maintenance") {
    // The VPS must persist and acknowledge this route without dispatching it.
    if (process.env.VERCEL === "1" && method === "POST" && pathname === "/api/webhooks/connectyhub") return "webhook-hold";
    return "maintenance";
  }
  if (mode === "legacy-proxy" && process.env.VERCEL === "1") {
    // Old Cloud checkpoints must never execute on the new engine's database.
    if (pathname === "/api/inngest" || pathname.startsWith("/api/inngest/")) return "maintenance";
    return "legacy-proxy";
  }
  return "maintenance";
}

export function legacyProxyUrl(pathname: string, search: string) {
  const target = new URL("https://betel.connectyhub.com.br");
  // Assign components rather than resolving an untrusted //host relative URL.
  target.pathname = pathname;
  target.search = search;
  return target;
}
