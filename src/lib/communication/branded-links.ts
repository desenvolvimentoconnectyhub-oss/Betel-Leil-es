import "server-only";
import { isIP } from "node:net";
import { getConnectyHubLinkConnection } from "./connectyhub-client";
import { getBetelPublicOrigin } from "../public-origin";

const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const responseHeaders = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

function safeDestination(value: unknown, requestUrl: string) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || isIP(hostname) || !hostname.includes(".") || /\.(?:localhost|local|internal)$/i.test(hostname)) return null;
    const ownOrigins = [getBetelPublicOrigin(), new URL(requestUrl).origin, "https://www.connectyhub.com.br"];
    if (ownOrigins.includes(url.origin) && url.pathname.startsWith("/w/")) return null;
    return url.toString();
  } catch { return null; }
}

/** No caller-provided target or upstream host: the authenticated account owns every resolved UUID. */
export async function redirectBetelTrackedLink(request: Request, id: string) {
  if (!validId.test(id)) return new Response("Link nao encontrado.", { status: 404, headers: responseHeaders });
  try {
    const config = await getConnectyHubLinkConnection();
    const base = new URL(config.baseUrl);
    if (base.origin !== "https://www.connectyhub.com.br" || base.pathname.replace(/\/+$/, "") !== "/api/v1" || base.username || base.password || base.search || base.hash || !config.apiToken) throw new Error("Invalid link service configuration");
    const preview = /bot|crawler|spider|facebookexternalhit|whatsapp|preview/i.test(request.headers.get("user-agent") || "") || /prefetch|preview/i.test(`${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`);
    const method = request.method === "HEAD" || preview ? "HEAD" : "GET";
    const upstream = await fetch(`${base.origin}/api/v1/links/${id}/resolve`, {
      method, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12000),
      headers: { authorization: `Bearer ${config.apiToken}` },
    });
    if ([403,404,410].includes(upstream.status)) return new Response("Link nao encontrado.", { status: 404, headers: responseHeaders });
    let target: unknown;
    if (method === "HEAD") {
      if (upstream.status !== 302) throw new Error("Link unavailable");
      target = upstream.headers.get("location");
    } else {
      if (upstream.status !== 200) throw new Error("Link unavailable");
      const result = await upstream.json();
      if (result.ok !== true) throw new Error("Link unavailable");
      target = result.destination;
    }
    const destination = safeDestination(target, request.url);
    if (!destination) throw new Error("Invalid destination");
    return new Response(null, { status: 302, headers: { ...responseHeaders, Location: destination } });
  } catch {
    return new Response("Nao foi possivel abrir o link. Tente novamente em instantes.", { status: 503, headers: responseHeaders });
  }
}
