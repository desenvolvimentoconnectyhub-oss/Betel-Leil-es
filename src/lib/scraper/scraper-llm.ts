import "server-only";

import { getGeminiApiKey, getGeminiModel } from "@/lib/ai/config";
import { getAgentSystemPrompt } from "@/lib/ai/agent-prompts";
import { getAuctionWindow } from "./scraper-criteria";
import type { ScraperCandidate, ScraperTarget } from "./types";

const MAX_HTML_CHARS = 30_000;

export function isGeminiQuotaError(message?: string) {
  const normalized = String(message || "").toLowerCase();
  return (
    normalized.includes("429 too many requests") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("quota exceeded") ||
    normalized.includes("free_tier_requests") ||
    normalized.includes("dunning decision") ||
    normalized.includes("deny for project") ||
    normalized.includes("billing") ||
    normalized.includes("credit") ||
    normalized.includes("no credits") ||
    normalized.includes("rate-limit") ||
    normalized.includes("rate limit")
  );
}

export function cleanHtmlForLlm(html: string): string {
  let cleaned = html;

  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, "");
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
  cleaned = cleaned.replace(/<nav[\s\S]*?<\/nav>/gi, "");
  cleaned = cleaned.replace(/<footer[\s\S]*?<\/footer>/gi, "");
  cleaned = cleaned.replace(/<header[\s\S]*?<\/header>/gi, "");
  cleaned = cleaned.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, "");

  cleaned = cleaned.replace(/<[^>]+>/g, (tag) => {
    const lower = tag.toLowerCase();
    if (
      lower.startsWith("<a ") || lower === "</a>" ||
      lower.startsWith("<img ") ||
      lower.startsWith("<div") || lower === "</div>" ||
      lower.startsWith("<span") || lower === "</span>" ||
      lower.startsWith("<p") || lower === "</p>" ||
      lower.startsWith("<li") || lower === "</li>" ||
      lower.startsWith("<ul") || lower === "</ul>" ||
      lower.startsWith("<h") || lower.match(/^<\/h[1-6]>$/) ||
      lower.startsWith("<td") || lower === "</td>" ||
      lower.startsWith("<tr") || lower === "</tr>" ||
      lower.startsWith("<th") || lower === "</th>"
    ) {
      return tag;
    }
    return "";
  });

  cleaned = cleaned.replace(/\s{3,}/g, " ");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  if (cleaned.length > MAX_HTML_CHARS) {
    cleaned = cleaned.slice(0, MAX_HTML_CHARS);
  }

  return cleaned;
}

function parseLlmCandidates(
  raw: string,
  target: ScraperTarget
): ScraperCandidate[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("[");
    const end = fenced.lastIndexOf("]");
    if (start < 0 || end <= start) return [];
    try {
      parsed = JSON.parse(fenced.slice(start, end + 1));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
    .map((item) => {
      const imageUrls = [
        ...(Array.isArray(item.imageUrls) ? item.imageUrls : []),
        ...(Array.isArray(item.images) ? item.images : []),
        item.imageUrl,
      ]
        .map((url) => String(url || "").trim())
        .filter(Boolean);

      return {
        sourceUrl: String(item.sourceUrl || ""),
        imageUrls,
        title: String(item.title || ""),
        address: String(item.address || ""),
        city: String(item.city || ""),
        state: String(item.state || ""),
        propertyType: String(item.propertyType || ""),
        auctionDate: String(item.auctionDate || ""),
        minBid: Number(item.minBid) || 0,
        appraisalValue: Number(item.appraisalValue) || 0,
        discount: Number(item.discount) || 0,
        auctioneer: String(item.auctioneer || ""),
        sourceCode: target.targetCode,
        rawData: item,
      };
    });
}

export async function extractCandidatesWithLlm(
  html: string,
  target: ScraperTarget
): Promise<{ candidates: ScraperCandidate[]; error?: string }> {
  const apiKey = await getGeminiApiKey();
  if (!apiKey) {
    return { candidates: [], error: "Chave Gemini nao configurada." };
  }

  const agentPrompt = getAgentSystemPrompt("source-scout");
  if (!agentPrompt) {
    return { candidates: [], error: "Prompt da Renata nao encontrado." };
  }

  const model = await getGeminiModel();
  const auctionWindow = getAuctionWindow();

  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const client = new GoogleGenerativeAI(apiKey);
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: agentPrompt,
    });

    const result = await genModel.generateContent(
      [
        "Criterio operacional Betel/Willian para esta rodada:",
        `- Hoje em ${auctionWindow.todayIso}.`,
        `- Buscar imoveis de leilao do Brasil todo, sem limitar por cidade ou UF.`,
        "- Incluir terrenos, galpoes, apartamentos, casas, salas, lojas, areas rurais, comerciais e industriais.",
        "- Leiloes que acontecem hoje tambem sao elegiveis quando aparecem na pagina.",
        `- Retornar somente imoveis com data de leilao entre ${auctionWindow.todayIso} e ${auctionWindow.endIso}.`,
        "- Ignorar veiculos, maquinas, sucatas, equipamentos e outros bens que nao sejam imoveis.",
        "- Se a data do leilao nao estiver clara no HTML, nao retorne o item.",
        "- O campo sourceUrl deve ser o link exato do lote/imovel/edital na fonte. Nunca use a home, listagem geral ou URL do alvo quando nao houver link de detalhe.",
        "- URL de leilao/listagem com varios imoveis, como /leilao/123/..., nao serve como sourceUrl. Use apenas o link individual do lote/imovel, por exemplo /sale/detail?id=123.",
        "- Imagens de logo, vendedor, banner, layout, modal, marca ou institucionais nao contam como foto do imovel.",
        "- Nao retorne paginas institucionais como duvidas, legislacao, como-funciona, o-que-e, sobre, contato, blog ou artigos.",
        "- Se nao encontrar o link exato do imovel, nao retorne o item.",
        "",
        `Alvo: ${target.name} (${target.url})`,
        `Tipo: ${target.targetType}`,
        `Regiao: ${target.region || "Nacional"}`,
        "",
        `HTML da pagina:\n${html}`,
      ].join("\n")
    );

    const rawText = result.response.text();
    const candidates = parseLlmCandidates(rawText, target);

    return { candidates };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao chamar Gemini.";
    return {
      candidates: [],
      error: isGeminiQuotaError(message)
        ? `Gemini atingiu limite de cota/rate limit nesta rodada. ${message}`
        : message,
    };
  }
}
