import type { ScraperStrategy, TargetType } from "./types";

export type RecommendedScraperSource = {
  targetCode: string;
  name: string;
  url: string;
  targetType: TargetType;
  coverage: string;
  scrapeStrategy: ScraperStrategy;
  priority: number;
  maxPages: number;
  rateLimitMs: number;
  notes: string;
};

export const RECOMMENDED_SCRAPER_SOURCES: RecommendedScraperSource[] = [
  {
    targetCode: "sodre-santoro",
    name: "Sodre Santoro",
    url: "https://www.sodresantoro.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "hasta-publica",
    name: "Hasta Publica",
    url: "https://www.hastapublica.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "lance-ja",
    name: "Lance Ja",
    url: "https://www.lanceja.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "guariglia-leiloes",
    name: "Guariglia Leiloes",
    url: "https://www.guariglialeiloes.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "nogari-leiloes",
    name: "Nogari Leiloes",
    url: "https://www.nogarileiloes.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "kronberg-leiloes",
    name: "Kronberg Leiloes",
    url: "https://www.kronbergleiloes.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
  {
    targetCode: "frazao-leiloes",
    name: "Frazao Leiloes",
    url: "https://www.frazaoleiloes.com.br/",
    targetType: "auctioneer",
    coverage: "nacional",
    scrapeStrategy: "fetch",
    priority: 59,
    maxPages: 10,
    rateLimitMs: 2500,
    notes: "Fonte recomendada para ampliar cobertura. Verificada por HTTP antes do cadastro.",
  },
];
