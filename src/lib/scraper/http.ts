const DESKTOP_CHROME_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36";

type HeaderValue = Record<string, string>;

export function auctionPageFetchHeaders(referer?: string): HeaderValue {
  return {
    "User-Agent": DESKTOP_CHROME_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    ...(referer ? { Referer: referer } : {}),
  };
}

export function auctionApiFetchHeaders(referer?: string): HeaderValue {
  return {
    "User-Agent": DESKTOP_CHROME_USER_AGENT,
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    ...(referer ? { Referer: referer } : {}),
  };
}

export function auctionImageFetchHeaders(referer?: string): HeaderValue {
  return {
    "User-Agent": DESKTOP_CHROME_USER_AGENT,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    ...(referer ? { Referer: referer } : {}),
  };
}
