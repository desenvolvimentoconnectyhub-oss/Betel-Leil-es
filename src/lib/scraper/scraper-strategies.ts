import type { ScraperCandidate, ScraperResult, ScraperTarget } from "./types";
import { cleanHtmlForLlm, extractCandidatesWithLlm } from "./scraper-llm";
import { getAuctionWindow, parseAuctionDate } from "./scraper-criteria";
import { isLikelyExactPropertySourceUrl, isLikelyPropertyImageUrl } from "./quality";

type ScraperAnchor = { text: string; href: string };

const MAX_IMAGES_PER_CANDIDATE = 40;

const REAL_ESTATE_TITLE_SIGNALS = [
  "apartamento",
  "apto",
  "area",
  "barracao",
  "casa",
  "comercial",
  "condominio",
  "fazenda",
  "galpao",
  "imovel",
  "loja",
  "lote",
  "predio",
  "rural",
  "sala",
  "sitio",
  "sobrado",
  "terreno",
];

function looksLikeBotChallenge(html: string, title: string, url: string) {
  const value = `${title}\n${url}\n${html.slice(0, 5000)}`.toLowerCase();
  return (
    value.includes("captcha") ||
    value.includes("cloudflare") ||
    value.includes("attention required") ||
    value.includes("radware bot manager") ||
    value.includes("shieldsquare") ||
    value.includes("validate.perfdrive")
  );
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function htmlToVisibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\n{3,}/g, "\n\n");
}

function extractAnchorsFromHtml(html: string, baseUrl: string): ScraperAnchor[] {
  const anchors: ScraperAnchor[] = [];
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html))) {
    try {
      const href = new URL(match[1], baseUrl).toString();
      const text = compactText(htmlToVisibleText(match[2]));
      anchors.push({ text, href });
    } catch {}
  }

  return anchors;
}

function decodeHtmlAttribute(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&apos;/gi, "'")
    .trim();
}

function imageLooksUseful(url: string) {
  return isLikelyPropertyImageUrl(url);
}

function resolveImageUrl(value: string, baseUrl: string) {
  const clean = decodeHtmlAttribute(value)
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .trim();
  if (!clean || clean.startsWith("data:") || clean.startsWith("blob:")) return "";

  try {
    return new URL(clean, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractSrcsetUrls(value: string, baseUrl: string) {
  return value
    .split(",")
    .map((part) => resolveImageUrl(part.trim().split(/\s+/)[0] || "", baseUrl))
    .filter(Boolean);
}

export function extractImageUrlsFromHtml(html: string, baseUrl: string) {
  const images: string[] = [];

  const imageTagPattern = /<img\b[^>]*>/gi;
  let imageTagMatch: RegExpExecArray | null;
  while ((imageTagMatch = imageTagPattern.exec(html))) {
    const tag = imageTagMatch[0];
    for (const attr of [
      "src",
      "data-src",
      "data-original",
      "data-lazy",
      "data-lazy-src",
      "data-zoom-image",
      "data-full",
      "data-image",
      "data-img",
      "data-large",
      "data-background",
      "data-bg",
      "data-url",
    ]) {
      const match = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, "i"));
      if (match) images.push(resolveImageUrl(match[1], baseUrl));
    }

    const srcsetMatch = tag.match(/\bsrcset=["']([^"']+)["']/i);
    if (srcsetMatch) images.push(...extractSrcsetUrls(srcsetMatch[1], baseUrl));
    const dataSrcsetMatch = tag.match(/\bdata-srcset=["']([^"']+)["']/i);
    if (dataSrcsetMatch) images.push(...extractSrcsetUrls(dataSrcsetMatch[1], baseUrl));
  }

  const sourceTagPattern = /<source\b[^>]*>/gi;
  let sourceTagMatch: RegExpExecArray | null;
  while ((sourceTagMatch = sourceTagPattern.exec(html))) {
    const tag = sourceTagMatch[0];
    const srcsetMatch = tag.match(/\bsrcset=["']([^"']+)["']/i);
    if (srcsetMatch) images.push(...extractSrcsetUrls(srcsetMatch[1], baseUrl));
    const dataSrcsetMatch = tag.match(/\bdata-srcset=["']([^"']+)["']/i);
    if (dataSrcsetMatch) images.push(...extractSrcsetUrls(dataSrcsetMatch[1], baseUrl));
  }

  const metaPatterns = [
    /<meta\b[^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["'][^>]*>/gi,
    /<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image(?::secure_url)?["'][^>]*>/gi,
  ];
  for (const pattern of metaPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) images.push(resolveImageUrl(match[1], baseUrl));
  }

  const backgroundPattern = /background-image\s*:\s*url\((["']?)([^"')]+)\1\)/gi;
  let backgroundMatch: RegExpExecArray | null;
  while ((backgroundMatch = backgroundPattern.exec(html))) images.push(resolveImageUrl(backgroundMatch[2], baseUrl));

  const hrefImagePattern = /<a\b[^>]*href=["']([^"']+\.(?:jpe?g|png|webp|avif)(?:[?#][^"']*)?)["'][^>]*>/gi;
  let hrefImageMatch: RegExpExecArray | null;
  while ((hrefImageMatch = hrefImagePattern.exec(html))) images.push(resolveImageUrl(hrefImageMatch[1], baseUrl));

  const quotedImagePattern = /["'`](https?:\\?\/\\?\/[^"'`\\\s]+?\.(?:jpe?g|png|webp|avif)(?:\?[^"'`\s\\]*)?)["'`]/gi;
  let quotedImageMatch: RegExpExecArray | null;
  while ((quotedImageMatch = quotedImagePattern.exec(html))) {
    images.push(resolveImageUrl(quotedImageMatch[1], baseUrl));
  }

  const seen = new Set<string>();
  return images
    .filter(Boolean)
    .filter(imageLooksUseful)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, MAX_IMAGES_PER_CANDIDATE);
}

async function extractRuntimeImageUrlsWithPlaywright(sourceUrl: string) {
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });

    try {
      const page = await browser.newPage();
      await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(1800);
      const html = await page.content();
      const browserImages = await page
        .$$eval("img, source, a[href]", (elements) =>
          elements.flatMap((element) => {
            const values: string[] = [];
            const htmlElement = element as HTMLElement;

            for (const attr of [
              "src",
              "srcset",
              "href",
              "data-src",
              "data-srcset",
              "data-original",
              "data-lazy",
              "data-lazy-src",
              "data-zoom-image",
              "data-full",
              "data-image",
              "data-img",
              "data-large",
              "data-background",
              "data-bg",
              "data-url",
            ]) {
              const value = htmlElement.getAttribute(attr);
              if (value) values.push(value);
            }

            const background = window.getComputedStyle(htmlElement).backgroundImage || "";
            if (background && background !== "none") values.push(background);

            return values;
          })
        )
        .catch(() => [] as string[]);

      return extractImageUrlsFromHtml(
        `${html}\n${browserImages.map((value) => `<img src="${String(value).replace(/"/g, "&quot;")}" />`).join("\n")}`,
        page.url() || sourceUrl
      );
    } finally {
      await browser.close().catch(() => {});
    }
  } catch {
    return [];
  }
}

export async function collectImageUrlsFromSourceUrl(sourceUrl: string, fallbackBaseUrl?: string) {
  if (!sourceUrl) return [];

  let htmlImages: string[] = [];
  try {
    const response = await fetch(sourceUrl, {
      headers: { "User-Agent": "BetelBot/1.0 (+https://betel.com.br)" },
      signal: AbortSignal.timeout(20_000),
    });

    if (response.ok) {
      const html = await response.text();
      htmlImages = extractImageUrlsFromHtml(html, response.url || sourceUrl || fallbackBaseUrl || sourceUrl);
    }
  } catch {}

  const runtimeImages = htmlImages.length >= 2 ? [] : await extractRuntimeImageUrlsWithPlaywright(sourceUrl);
  return Array.from(new Set([...htmlImages, ...runtimeImages])).slice(0, MAX_IMAGES_PER_CANDIDATE);
}

function moneyToNumber(value: string) {
  const normalized = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function titleLooksLikeRealEstate(line: string) {
  const normalized = normalizeText(line);
  if (normalized.length < 12 || normalized.length > 180) return false;
  if (/^(home|buscar|cidades|bairros|tipos|proximos leiloes|imoveis em destaque)$/i.test(normalized)) return false;
  return REAL_ESTATE_TITLE_SIGNALS.some((signal) => normalized.includes(signal));
}

function inferCityState(title: string) {
  const matches = [...title.matchAll(/([^-\n|]+?)\/([A-Z]{2})\b/g)];
  const last = matches.at(-1);
  if (!last) return { city: "", state: "" };

  const beforeState = compactText(last[1]);
  const segment = compactText(beforeState.split(/\s+-\s+/).at(-1) || beforeState);
  const city = compactText(segment.match(/\bem\s+(.+)$/i)?.[1] || segment);
  return { city, state: last[2] };
}

function inferPropertyType(title: string) {
  const normalized = normalizeText(title);
  if (normalized.includes("apartamento") || normalized.includes("apto")) return "apartamento";
  if (normalized.includes("terreno") || normalized.includes("lote")) return "terreno";
  if (normalized.includes("galpao") || normalized.includes("industrial")) return "industrial";
  if (normalized.includes("sala") || normalized.includes("loja") || normalized.includes("comercial")) return "comercial";
  if (normalized.includes("rural") || normalized.includes("fazenda") || normalized.includes("sitio")) return "rural";
  if (normalized.includes("casa") || normalized.includes("sobrado")) return "casa";
  return "imovel";
}

function uniqueSaleLinks(anchors: ScraperAnchor[]) {
  const seen = new Set<string>();
  return anchors
    .map((anchor) => anchor.href)
    .filter(looksLikeSpecificSourceLink)
    .filter((href) => {
      if (seen.has(href)) return false;
      seen.add(href);
      return true;
    });
}

function looksLikeSpecificSourceLink(href: string) {
  if (!isLikelyExactPropertySourceUrl(href)) return false;

  try {
    const url = new URL(href);
    const path = normalizeText(url.pathname);
    return (
      /\/sale\/detail\b/.test(path) ||
      /\/(?:detail|detalhe|lote|lotes|lot|lots|imovel|imoveis|property|properties|bem|item|edital)\b/.test(path) ||
      /(?:^|[?&])(?:id|lot|lote|bem|item)=\d/i.test(url.search)
    );
  } catch {
    return false;
  }
}

function extractFallbackCandidatesFromText(
  text: string,
  anchors: ScraperAnchor[],
  target: ScraperTarget,
  baseUrl: string,
  pageImages: string[]
) {
  const window = getAuctionWindow();
  const lines = text
    .split(/\r?\n/)
    .map(compactText)
    .filter(Boolean);
  const links = uniqueSaleLinks(anchors);
  const seen = new Set<string>();
  const candidates: ScraperCandidate[] = [];

  for (let index = 0; index < lines.length && candidates.length < 12; index += 1) {
    const title = lines[index];
    if (!titleLooksLikeRealEstate(title)) continue;

    const context = lines.slice(index + 1, index + 14);
    const dateLine = context.find((line) => parseAuctionDate(line, window));
    if (!dateLine) continue;

    const auctionDate = parseAuctionDate(dateLine, window);
    if (!auctionDate || auctionDate < window.today || auctionDate > window.end) continue;

    const sourceUrl = links[candidates.length] || baseUrl || target.url;
    const key = `${title}|${dateLine}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const priceLine = context.find((line) => /R\$\s*[\d.]+,\d{2}/.test(line)) || "";
    const { city, state } = inferCityState(title);

    candidates.push({
      sourceUrl,
      imageUrls: pageImages.slice(candidates.length, candidates.length + 1),
      title,
      address: title,
      city: city || target.region || "",
      state,
      propertyType: inferPropertyType(title),
      auctionDate: dateLine,
      minBid: priceLine ? moneyToNumber(priceLine) : 0,
      appraisalValue: 0,
      discount: 0,
      auctioneer: target.name,
      sourceCode: target.targetCode,
      rawData: {
        extractionMode: "html_fallback",
        dateLine,
        priceLine,
        targetUrl: target.url,
        imageUrls: pageImages,
      },
    });
  }

  return candidates;
}

function mergeFallbackResult(
  html: string,
  text: string,
  anchors: ScraperAnchor[],
  target: ScraperTarget,
  baseUrl: string,
  candidates: Awaited<ReturnType<typeof extractCandidatesWithLlm>>["candidates"],
  error?: string
) {
  const pageImages = extractImageUrlsFromHtml(html, baseUrl);

  if (candidates.length || !error) {
    return {
      candidates: attachPageImagesToCandidates(candidates, pageImages),
      error,
    };
  }

  const fallbackCandidates = extractFallbackCandidatesFromText(
    text || htmlToVisibleText(html),
    anchors.length ? anchors : extractAnchorsFromHtml(html, baseUrl),
    target,
    baseUrl,
    pageImages
  );

  if (!fallbackCandidates.length) return { candidates, error };

  return {
    candidates: fallbackCandidates,
    error: `${error} Fallback HTML coletou ${fallbackCandidates.length} candidato(s) sem IA.`,
  };
}

function attachPageImagesToCandidates(candidates: ScraperCandidate[], pageImages: string[]) {
  if (!pageImages.length) return candidates;

  return candidates.map((candidate, index) => {
    const imageUrls = [
      ...(candidate.imageUrls || []),
      pageImages[index],
    ].filter(Boolean);

    return {
      ...candidate,
      imageUrls: Array.from(new Set(imageUrls)).slice(0, MAX_IMAGES_PER_CANDIDATE),
      rawData: {
        ...(candidate.rawData || {}),
        imageUrls: Array.from(new Set(imageUrls)).slice(0, MAX_IMAGES_PER_CANDIDATE),
      },
    };
  });
}

async function fetchDetailImageUrls(sourceUrl: string, targetUrl: string) {
  if (!sourceUrl || sourceUrl === targetUrl) return [];

  try {
    return collectImageUrlsFromSourceUrl(sourceUrl, targetUrl);
  } catch {
    return [];
  }
}

async function enrichCandidatesWithDetailImages(
  candidates: ScraperCandidate[],
  target: ScraperTarget
) {
  const enriched = await Promise.all(
    candidates.map(async (candidate) => {
      const detailImages = await fetchDetailImageUrls(candidate.sourceUrl, target.url);
      const imageUrls = Array.from(new Set([...(detailImages || []), ...(candidate.imageUrls || [])]))
        .filter(Boolean)
        .slice(0, MAX_IMAGES_PER_CANDIDATE);

      return {
        ...candidate,
        imageUrls,
        rawData: {
          ...(candidate.rawData || {}),
          imageUrls,
          imageCount: imageUrls.length,
        },
      };
    })
  );

  return enriched;
}

export async function executeFetchStrategy(
  target: ScraperTarget
): Promise<ScraperResult> {
  const start = Date.now();

  try {
    const response = await fetch(target.url, {
      headers: { "User-Agent": "BetelBot/1.0 (+https://betel.com.br)" },
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      return {
        targetCode: target.targetCode,
        status: "failed",
        candidates: [],
        pagesScraped: 0,
        durationMs: Date.now() - start,
        errorMessage: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const html = await response.text();
    const cleaned = cleanHtmlForLlm(html);
    const extracted = await extractCandidatesWithLlm(cleaned, target);
    const { candidates, error } = mergeFallbackResult(
      html,
      "",
      extractAnchorsFromHtml(html, response.url || target.url),
      target,
      response.url || target.url,
      extracted.candidates,
      extracted.error
    );

    const enrichedCandidates = await enrichCandidatesWithDetailImages(candidates, target);

    return {
      targetCode: target.targetCode,
      status: error ? "partial" : "completed",
      candidates: enrichedCandidates,
      pagesScraped: 1,
      durationMs: Date.now() - start,
      errorMessage: error,
    };
  } catch (err) {
    return {
      targetCode: target.targetCode,
      status: "failed",
      candidates: [],
      pagesScraped: 0,
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}

export async function executePlaywrightStrategy(
  target: ScraperTarget
): Promise<ScraperResult> {
  const start = Date.now();

  const isAvailable = await checkPlaywrightAvailable();

  if (!isAvailable) {
    return {
      targetCode: target.targetCode,
      status: "failed",
      candidates: [],
      pagesScraped: 0,
      durationMs: Date.now() - start,
      errorMessage: "Playwright nao disponivel neste ambiente. Use fetch ou instale playwright.",
    };
  }

  try {
    const { chromium } = await import("playwright");
    let browser: import("playwright").Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      const response = await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(target.rateLimitMs);

      const title = await page.title().catch(() => "");
      const html = await page.content();
      const visibleText = await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "");
      const anchors = await page
        .$$eval("a[href]", (elements) =>
          elements.map((element) => ({
            text: (element.textContent || "").replace(/\s+/g, " ").trim(),
            href: (element as HTMLAnchorElement).href,
          }))
        )
        .catch(() => [] as ScraperAnchor[]);

      if (response && !response.ok()) {
        return {
          targetCode: target.targetCode,
          status: "failed",
          candidates: [],
          pagesScraped: 1,
          durationMs: Date.now() - start,
          errorMessage: `HTTP ${response.status()} ao abrir ${page.url()}.`,
        };
      }

      if (looksLikeBotChallenge(html, title, page.url())) {
        return {
          targetCode: target.targetCode,
          status: "failed",
          candidates: [],
          pagesScraped: 1,
          durationMs: Date.now() - start,
          errorMessage: `Bloqueio anti-bot/CAPTCHA detectado em ${page.url()}.`,
        };
      }

      const cleaned = cleanHtmlForLlm(html);
      const extracted = await extractCandidatesWithLlm(cleaned, target);
      const { candidates, error } = mergeFallbackResult(
        html,
        visibleText,
        anchors,
        target,
        page.url(),
        extracted.candidates,
        extracted.error
      );

      const enrichedCandidates = await enrichCandidatesWithDetailImages(candidates, target);

      return {
        targetCode: target.targetCode,
        status: error ? "partial" : "completed",
        candidates: enrichedCandidates,
        pagesScraped: 1,
        durationMs: Date.now() - start,
        errorMessage: error,
      };
    } finally {
      await browser?.close().catch(() => {});
    }
  } catch (err) {
    return {
      targetCode: target.targetCode,
      status: "failed",
      candidates: [],
      pagesScraped: 0,
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : "Erro no Playwright",
    };
  }
}

export async function executeApiStrategy(
  target: ScraperTarget
): Promise<ScraperResult> {
  return {
    targetCode: target.targetCode,
    status: "failed",
    candidates: [],
    pagesScraped: 0,
    durationMs: 0,
    errorMessage: "Estrategia API ainda nao implementada para este alvo.",
  };
}

async function checkPlaywrightAvailable(): Promise<boolean> {
  try {
    await import("playwright");
    return true;
  } catch {
    return false;
  }
}

export async function executeStrategy(target: ScraperTarget): Promise<ScraperResult> {
  switch (target.scrapeStrategy) {
    case "fetch":
      return executeFetchStrategy(target);
    case "playwright":
      return executePlaywrightStrategy(target);
    case "api":
      return executeApiStrategy(target);
    default:
      return {
        targetCode: target.targetCode,
        status: "failed",
        candidates: [],
        pagesScraped: 0,
        durationMs: 0,
        errorMessage: `Estrategia desconhecida: ${target.scrapeStrategy}`,
      };
  }
}
