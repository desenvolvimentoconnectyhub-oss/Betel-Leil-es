import type { ResourceTone } from "@/lib/admin/resources";

export type ScraperStrategy = "playwright" | "fetch" | "api";
export type TargetType = "auctioneer" | "bank" | "court" | "portal" | "aggregator";
export type ScraperRunStatus = "queued" | "running" | "completed" | "failed" | "partial";

export type ScraperTarget = {
  id: string;
  targetCode: string;
  name: string;
  url: string;
  targetType: TargetType;
  region: string;
  coverage: string;
  scrapeStrategy: ScraperStrategy;
  selectors: Record<string, unknown>;
  scheduleCron: string;
  enabled: boolean;
  priority: number;
  lastScrapedAt: string;
  lastResultStatus: string;
  lastResultCount: number;
  errorCount: number;
  consecutiveErrors: number;
  maxRetries: number;
  maxPages: number;
  rateLimitMs: number;
  notes: string;
  createdAt: string;
  tone: ResourceTone;
};

export type ScraperRun = {
  id: string;
  targetId: string;
  targetName: string;
  runCode: string;
  status: ScraperRunStatus;
  itemsFound: number;
  itemsIngested: number;
  itemsSkipped: number;
  itemsDuplicate: number;
  pagesScraped: number;
  errorMessage: string;
  durationMs: number;
  startedAt: string;
  completedAt: string;
  createdAt: string;
  tone: ResourceTone;
};

export type ScraperCandidate = {
  sourceUrl: string;
  imageUrls: string[];
  title: string;
  address: string;
  city: string;
  state: string;
  propertyType: string;
  auctionDate: string;
  minBid: number;
  appraisalValue: number;
  discount: number;
  auctioneer: string;
  sourceCode: string;
  rawData: Record<string, unknown>;
};

export type ScraperResult = {
  targetCode: string;
  status: ScraperRunStatus;
  candidates: ScraperCandidate[];
  pagesScraped: number;
  durationMs: number;
  errorMessage?: string;
};

export type ScraperDashboardData = {
  targets: ScraperTarget[];
  recentRuns: ScraperRun[];
  metrics: {
    totalTargets: number;
    enabledTargets: number;
    totalRuns: number;
    itemsIngested: number;
    failedTargets: number;
  };
};
