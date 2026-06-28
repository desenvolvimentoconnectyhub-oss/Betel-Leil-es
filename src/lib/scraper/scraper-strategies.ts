import type { ScraperResult, ScraperTarget } from "./types";
import { cleanHtmlForLlm, extractCandidatesWithLlm } from "./scraper-llm";

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
    const { candidates, error } = await extractCandidatesWithLlm(cleaned, target);

    return {
      targetCode: target.targetCode,
      status: error ? "partial" : "completed",
      candidates,
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
      const { candidates, error } = await extractCandidatesWithLlm(cleaned, target);

      return {
        targetCode: target.targetCode,
        status: error ? "partial" : "completed",
        candidates,
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
