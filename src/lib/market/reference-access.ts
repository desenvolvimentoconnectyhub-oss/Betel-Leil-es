import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { canonicalReferenceUrl } from "@/lib/domain/market-quality";

function publicAddress(address: string) {
  if (isIP(address) !== 4) return false; // Fail closed for unresolved/IPv6-only hosts.
  const [a,b] = address.split(".").map(Number);
  return a > 0 && a < 224 && a !== 10 && a !== 127 && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && b === 168) && !(a === 100 && b >= 64 && b <= 127);
}

async function readPublicListing(target: string) {
  const url = new URL(target);
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error("Destino de referencia nao publico.");
  // Pin the verified address, including on redirects, so a second DNS lookup
  // cannot switch the destination to a private server.
  return new Promise<{ status: number; location?: string; type: string; text: string }>((resolve, reject) => {
    let settled = false;
    const req = request(url, { method: "GET", agent: false, family: 4,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { accept: "text/html" } }, res => {
      let text = "";
      const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve({ status: res.statusCode || 0, location: res.headers.location, type: String(res.headers["content-type"] || ""), text }); };
      res.setEncoding("utf8");
      res.on("data", chunk => { text += chunk; if (text.length >= 128000) { finish(); res.destroy(); } });
      res.on("end", finish);
      res.on("error", error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    });
    const timer = setTimeout(() => req.destroy(new Error("Tempo de verificacao esgotado.")), 10000);
    req.on("error", error => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    req.end();
  });
}

export function isGoogleGroundingRedirect(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "vertexaisearch.cloud.google.com" && !url.username && !url.password && !url.port && url.pathname.startsWith("/grounding-api-redirect/");
  } catch { return false; }
}

export async function resolveGroundedMarketReference(value: string) {
  const direct = canonicalReferenceUrl(value);
  if (direct) return direct;
  let target = value;
  try {
    for (let i = 0; i < 3 && isGoogleGroundingRedirect(target); i++) {
      const response = await readPublicListing(target);
      if (response.status < 300 || response.status >= 400 || !response.location) return "";
      target = new URL(response.location, target).toString();
      const listing = canonicalReferenceUrl(target);
      if (listing) return listing;
    }
  } catch { /* Unresolved sources cannot support a valuation. */ }
  return "";
}

export async function verifyMarketReference(url: string): Promise<{ok:boolean; checkedAt:string; error?:string}> {
  const checkedAt = new Date().toISOString();
  try {
    let target = canonicalReferenceUrl(url);
    if (!target) throw new Error("URL de referencia invalida.");
    for (let redirects = 0; redirects < 3; redirects++) {
      const res = await readPublicListing(target);
      if (res.status >= 300 && res.status < 400) {
        target = canonicalReferenceUrl(new URL(res.location || "",target).toString());
        if (!target) throw new Error("Referencia redireciona para pagina sem anuncio.");
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new Error(`Referencia respondeu HTTP ${res.status}.`);
      if (!res.type.includes("text/html")) throw new Error("Referencia nao retornou uma pagina HTML.");
      const text = res.text;
      if (!text || /attention required|access denied|just a moment|anuncio (?:removido|indisponivel)|imovel nao encontrado/i.test(text)) throw new Error("Abertura do anuncio nao confirmada; revise a referencia.");
      return {ok:true,checkedAt};
    }
    throw new Error("Redirecionamentos excessivos.");
  } catch(error) {return {ok:false,checkedAt,error:error instanceof Error?error.message:"Nao foi possivel verificar a referencia."};}
}
