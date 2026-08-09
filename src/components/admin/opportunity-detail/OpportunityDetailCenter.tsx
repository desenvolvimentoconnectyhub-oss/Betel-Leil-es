/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  FileCheck2,
  FileSearch,
  Gavel,
  Home,
  ImageOff,
  Info,
  ListChecks,
  MapPin,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Save,
  Scale,
  ShieldCheck,
  Sparkles,
  Target,
  UploadCloud,
  XCircle,
} from "lucide-react";
import {
  savePropertyMarketAnalysisAction,
  savePropertyQualificationFeedbackAction,
} from "@/app/admin/oportunidades/actions";
import { RiskBadge } from "@/components/admin/RiskBadge";
import { ScoreBadge } from "@/components/admin/ScoreBadge";
import { StatusBadge, getStatusTone } from "@/components/admin/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  decisionTone,
  statusTone,
  type PropertyMarketAnalysis,
  type PropertyMarketComparable,
} from "@/lib/admin/market-analysis";
import type {
  PropertyQualificationDossier,
  PropertyQualificationEvidenceStatus,
  PropertyQualificationFeedbackDecision,
} from "@/lib/admin/repository/property-qualification";
import {
  formatCurrency,
  formatDate,
  type AuctionOpportunity,
  type PropertyImageAsset,
  type ResourceTone,
} from "@/lib/admin/resources";
import { cn } from "@/lib/utils";

type OpportunityTabId =
  | "visao-geral"
  | "financeiro"
  | "juridico"
  | "mercado"
  | "imovel"
  | "documentos"
  | "revisao"
  | "historico";

type OpportunityDetailCenterProps = {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  qualificationDossier?: PropertyQualificationDossier | null;
  reason?: string;
  qualificationReason?: string;
  activeTab?: string;
  marketFilter?: string;
  marketSort?: string;
  selectedPhoto?: string;
};

const tabs: Array<{ id: OpportunityTabId; label: string; icon: ReactNode }> = [
  { id: "visao-geral", label: "Visao geral", icon: <Sparkles size={14} /> },
  { id: "financeiro", label: "Financeiro", icon: <CircleDollarSign size={14} /> },
  { id: "juridico", label: "Juridico", icon: <Scale size={14} /> },
  { id: "mercado", label: "Mercado", icon: <BarChart3 size={14} /> },
  { id: "imovel", label: "Imovel", icon: <Home size={14} /> },
  { id: "documentos", label: "Documentos", icon: <FileSearch size={14} /> },
  { id: "revisao", label: "Revisao", icon: <ListChecks size={14} /> },
  { id: "historico", label: "Historico", icon: <Clock3 size={14} /> },
];

const toneText: Record<ResourceTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

const toneBorder: Record<ResourceTone, string> = {
  cyan: "border-[rgba(200,90,31,0.36)]",
  green: "border-[rgba(19,122,69,0.32)]",
  yellow: "border-[rgba(183,121,17,0.32)]",
  red: "border-[rgba(196,61,45,0.34)]",
  purple: "border-[rgba(138,90,45,0.34)]",
  muted: "border-[var(--admin-border)]",
};

const toneBg: Record<ResourceTone, string> = {
  cyan: "bg-[rgba(200,90,31,0.08)]",
  green: "bg-[rgba(19,122,69,0.08)]",
  yellow: "bg-[rgba(183,121,17,0.09)]",
  red: "bg-[rgba(196,61,45,0.08)]",
  purple: "bg-[rgba(138,90,45,0.08)]",
  muted: "bg-[rgba(255,255,255,0.42)]",
};

const inputClass =
  "h-10 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] placeholder:text-[var(--admin-muted)] focus-visible:border-[var(--admin-cyan)]";

const textareaClass =
  "min-h-24 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] placeholder:text-[var(--admin-muted)] focus-visible:border-[var(--admin-cyan)]";

const selectClass =
  "h-10 w-full rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-foreground)] outline-none transition focus-visible:border-[var(--admin-cyan)] focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.16)]";

const labelClass = "text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--admin-muted)]";

function normalizeTab(value?: string): OpportunityTabId {
  const normalized = (value || "").toLowerCase();
  if (tabs.some((tab) => tab.id === normalized)) return normalized as OpportunityTabId;
  if (normalized === "geral") return "visao-geral";
  if (normalized === "jurídico") return "juridico";
  if (normalized === "imóvel") return "imovel";
  if (normalized === "histórico") return "historico";
  return "visao-geral";
}

function tabHref(tab: OpportunityTabId, extra?: Record<string, string | undefined>) {
  const params = new URLSearchParams({ tab });
  Object.entries(extra || {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return `?${params.toString()}`;
}

function imageHref(tab: OpportunityTabId, imageIndex: number) {
  return tabHref(tab, { photo: String(imageIndex + 1) });
}

function normalizePhotoIndex(value: string | undefined, imageCount: number) {
  if (!value || imageCount <= 0) return -1;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return -1;

  const index = parsed <= 0 ? parsed : parsed - 1;
  return index >= 0 && index < imageCount ? index : -1;
}

function percent(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function area(value: number) {
  if (!value) return "nao informado";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m2`;
}

function numberValue(value: number) {
  return value ? String(value) : "";
}

function pricePerM2(value: number) {
  return value ? `${formatCurrency(value)}/m2` : "nao calculado";
}

function safeDate(value?: string) {
  if (!value) return "nao informado";
  try {
    return formatDate(value.slice(0, 10));
  } catch {
    return value;
  }
}

function formatDateTime(value?: string) {
  if (!value) return "nao informado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function decodeEscapedText(value: string) {
  const decoded = value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16))
  );

  if (!/[\u00c3\u00c2\u00e2]/.test(decoded)) return decoded;

  try {
    const bytes = Uint8Array.from(Array.from(decoded, (char) => Math.min(char.charCodeAt(0), 255)));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return decoded;
  }
}

function compactText(value?: string, fallback = "nao informado") {
  const cleaned = decodeEscapedText(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || fallback;
}

function shortText(value?: string, max = 180, fallback = "nao informado") {
  const text = compactText(value, fallback);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}...`;
}

function statusLabel(value?: string) {
  return compactText(value, "pendente").replace(/_/g, " ");
}

function qualificationStatusLabel(dossier: PropertyQualificationDossier) {
  if (dossier.mode === "shadow") return "Modo sombra";
  if (dossier.readinessStatus === "auto_candidate") return "Candidato automatico";
  if (dossier.readinessStatus === "blocked") return "Bloqueado";
  return "Revisao humana";
}

function qualificationTone(dossier: PropertyQualificationDossier): ResourceTone {
  if (dossier.readinessStatus === "auto_candidate") return "green";
  if (dossier.readinessStatus === "blocked") return "red";
  if (dossier.mode === "shadow") return "yellow";
  return "purple";
}

function evidenceStatusLabel(status: PropertyQualificationEvidenceStatus) {
  const labels: Record<PropertyQualificationEvidenceStatus, string> = {
    passed: "Validado",
    warning: "Atencao",
    blocked: "Bloqueio",
    info: "Info",
  };
  return labels[status];
}

function evidenceStatusTone(status: PropertyQualificationEvidenceStatus): ResourceTone {
  if (status === "passed") return "green";
  if (status === "warning") return "yellow";
  if (status === "blocked") return "red";
  return "muted";
}

function evidenceCategoryLabel(value: string) {
  const labels: Record<string, string> = {
    identity: "Identidade",
    image: "Imagem",
    market: "Mercado",
    document: "Documento",
    compliance: "Compliance",
    risk: "Risco",
    source: "Fonte",
  };
  return labels[value] || statusLabel(value);
}

function feedbackDecisionLabel(value: PropertyQualificationFeedbackDecision) {
  const labels: Record<PropertyQualificationFeedbackDecision, string> = {
    confirmado: "Confirmado",
    corrigido: "Corrigido",
    reprovado: "Reprovado",
    pendente: "Pendente",
  };
  return labels[value];
}

function feedbackDecisionTone(value: PropertyQualificationFeedbackDecision): ResourceTone {
  if (value === "confirmado") return "green";
  if (value === "corrigido") return "yellow";
  if (value === "reprovado") return "red";
  return "muted";
}

type QualificationAuditStepView = {
  key: string;
  label: string;
  status: PropertyQualificationEvidenceStatus;
  summary: string;
  sourceUrl?: string;
};

type QualificationAuditSourceView = {
  key: string;
  category: string;
  label: string;
  url: string;
  status: PropertyQualificationEvidenceStatus;
  detail: string;
};

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function jsonArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function jsonText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return fallback;
}

function jsonNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function jsonTextList(value: unknown) {
  return jsonArray(value)
    .map((item) => {
      if (typeof item === "string") return item.trim();
      const record = jsonRecord(item);
      return jsonText(record.detail) || jsonText(record.label) || jsonText(record.title) || jsonText(record.summary);
    })
    .filter(Boolean);
}

function normalizeAuditStatus(value: unknown, fallback: PropertyQualificationEvidenceStatus = "info") {
  const status = jsonText(value).toLowerCase();
  if (["passed", "warning", "blocked", "info"].includes(status)) return status as PropertyQualificationEvidenceStatus;
  return fallback;
}

function scoreStatus(score: number, critical = false): PropertyQualificationEvidenceStatus {
  if (score >= 80) return "passed";
  if (score >= 50) return "warning";
  return critical ? "blocked" : "warning";
}

function buildQualificationAuditSteps(dossier: PropertyQualificationDossier): QualificationAuditStepView[] {
  const storedSteps = jsonArray<Record<string, unknown>>(dossier.rawPayload.auditTrail);
  if (storedSteps.length) {
    return storedSteps.map((item, index) => ({
      key: jsonText(item.stepKey, `step-${index}`),
      label: jsonText(item.label, `Etapa ${index + 1}`),
      status: normalizeAuditStatus(item.status),
      summary: jsonText(item.summary, "Sem resumo registrado."),
      sourceUrl: jsonText(item.sourceUrl),
    }));
  }

  const source = dossier.sourceSnapshot;
  const adapter = jsonRecord(source.adapter);
  const pageDiagnostics = jsonRecord(source.pageDiagnostics);
  const market = dossier.marketEvidence;
  const images = dossier.imageEvidence;
  const documents = dossier.documentEvidence;
  const compliance = dossier.complianceEvidence;
  const qualityReview = jsonRecord(dossier.rawPayload.qualityReview);
  const qualityGate = jsonRecord(dossier.rawPayload.qualityGate);
  const missingFields = jsonTextList(qualityReview.missingFields);
  const qualityIssues = jsonTextList(qualityGate.issues);
  const saleComparables = jsonNumber(market.saleComparables);
  const rentalComparables = jsonNumber(market.rentalComparables);
  const marketSources = jsonNumber(market.sourceDiversity);
  const usableImages = jsonNumber(images.usableCount);
  const mirroredImages = jsonNumber(images.mirroredCount);
  const failedImages = jsonNumber(images.failedCount);
  const documentCount = jsonNumber(documents.count);
  const flags = jsonTextList(compliance.flags);

  return [
    {
      key: "fonte_original",
      label: "Captura da fonte original",
      status: jsonNumber(pageDiagnostics.httpStatus) >= 200 && jsonNumber(pageDiagnostics.httpStatus) < 400 ? "passed" : "warning",
      summary: `${jsonText(source.sourceDomain, "Fonte")} lida com ${jsonText(adapter.name, jsonText(adapter.key, "adaptador automatico"))}; HTTP ${jsonText(pageDiagnostics.httpStatus, "nao informado")}.`,
      sourceUrl: jsonText(source.sourceUrl),
    },
    {
      key: "extracao",
      label: "Extracao e normalizacao",
      status: scoreStatus(dossier.identityScore, true),
      summary: missingFields.length
        ? `Identidade ${dossier.identityScore}/100; pendencias: ${missingFields.slice(0, 3).join(", ")}.`
        : `Identidade ${dossier.identityScore}/100; dados principais normalizados.`,
    },
    {
      key: "imagens",
      label: "Curadoria de imagens",
      status: scoreStatus(dossier.imageScore, true),
      summary: `${usableImages} imagem(ns) util(is), ${mirroredImages} espelhada(s) no R2, ${failedImages} falha(s).`,
    },
    {
      key: "mercado",
      label: "Pesquisa de mercado",
      status: scoreStatus(dossier.marketScore, true),
      summary: `${saleComparables} comparavel(is) de venda, ${rentalComparables} de aluguel, ${marketSources} fonte(s); valor base ${formatCurrency(jsonNumber(market.marketValueBase))}.`,
    },
    {
      key: "documentos_compliance",
      label: "Documentos e compliance",
      status: scoreStatus(dossier.complianceScore),
      summary: `${documentCount} documento(s) capturado(s); ${flags.length ? flags.slice(0, 3).join(", ") : "sem alerta preliminar forte"}.`,
    },
    {
      key: "conclusao",
      label: "Criterios de conclusao",
      status: dossier.readinessStatus === "auto_candidate" ? "passed" : dossier.readinessStatus === "blocked" ? "blocked" : "warning",
      summary: qualityIssues.length
        ? `${dossier.overallScore}/100; travas atuais: ${qualityIssues.slice(0, 3).join(", ")}.`
        : `${dossier.overallScore}/100; status ${qualificationStatusLabel(dossier)}.`,
    },
  ];
}

function buildQualificationSources(dossier: PropertyQualificationDossier): QualificationAuditSourceView[] {
  const storedSources = jsonArray<Record<string, unknown>>(dossier.rawPayload.sourceInventory);
  const source = dossier.sourceSnapshot;
  const documentLinks = jsonArray<Record<string, unknown>>(dossier.documentEvidence.links);
  const candidates: QualificationAuditSourceView[] = [];

  const pushSource = (input: Omit<QualificationAuditSourceView, "key">) => {
    if (!input.url) return;
    const key = input.url.toLowerCase();
    if (candidates.some((item) => item.key === key)) return;
    candidates.push({ ...input, key });
  };

  storedSources.forEach((item, index) => {
    pushSource({
      category: jsonText(item.category, "fonte"),
      label: jsonText(item.label, `Fonte ${index + 1}`),
      url: jsonText(item.url),
      status: normalizeAuditStatus(item.status),
      detail: jsonText(item.detail, "Fonte registrada na auditoria da pesquisa."),
    });
  });

  pushSource({
    category: "leilao",
    label: jsonText(source.sourceDomain, "Fonte original"),
    url: jsonText(source.sourceUrl),
    status: "passed",
    detail: "Link original do imovel no leiloeiro.",
  });
  pushSource({
    category: "pagina",
    label: "URL resolvida",
    url: jsonText(jsonRecord(source.pageDiagnostics).resolvedSourceUrl),
    status: normalizeAuditStatus(jsonRecord(source.pageDiagnostics).blockedByAntiBot ? "warning" : "passed"),
    detail: "Pagina efetivamente aberta durante a coleta.",
  });
  documentLinks.forEach((document, index) => {
    pushSource({
      category: "documento",
      label: jsonText(document.label, `Documento ${index + 1}`),
      url: jsonText(document.url),
      status: "info",
      detail: jsonText(document.kind, "Documento encontrado na fonte."),
    });
  });
  dossier.evidence.forEach((item) => {
    pushSource({
      category: evidenceCategoryLabel(item.category),
      label: item.label,
      url: item.sourceUrl,
      status: item.status,
      detail: item.details,
    });
  });

  return candidates;
}

function marketConclusionText(dossier: PropertyQualificationDossier) {
  const market = dossier.marketEvidence;
  const value = jsonNumber(market.marketValueBase);
  const priceM2 = jsonNumber(market.marketPricePerM2);
  const sale = jsonNumber(market.saleComparables);
  const rent = jsonNumber(market.rentalComparables);
  const diversity = jsonNumber(market.sourceDiversity);

  return `${formatCurrency(value)}${priceM2 ? ` (${pricePerM2(priceM2)})` : ""}; ${sale} venda, ${rent} aluguel, ${diversity} fonte(s).`;
}

function imageConclusionText(dossier: PropertyQualificationDossier) {
  const images = dossier.imageEvidence;
  return `${jsonNumber(images.usableCount)} util(is), ${jsonNumber(images.mirroredCount)} no R2, ${jsonNumber(images.rawCandidateCount)} candidato(s) bruto(s).`;
}

function complianceConclusionText(dossier: PropertyQualificationDossier) {
  const flags = jsonTextList(dossier.complianceEvidence.flags);
  return flags.length ? flags.slice(0, 4).join(", ") : "Sem alerta preliminar forte nesta camada.";
}

function paymentLabel(value?: string) {
  const normalized = compactText(value, "").toLowerCase();
  if (!normalized) return "validar edital";
  if (normalized.includes("parcel")) return "parcelado";
  if (normalized.includes("financi")) return "financiamento";
  if (normalized.includes("vista") || normalized.includes("a_vista")) return "a vista";
  return normalized.length > 28 ? `${normalized.slice(0, 28)}...` : normalized;
}

function sourceUrlFor(analysis: PropertyMarketAnalysis, labels: string[]) {
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  return analysis.sourceLinks.find((item) => {
    const label = item.label.toLowerCase();
    return normalizedLabels.some((needle) => label.includes(needle));
  })?.url || "";
}

function fieldQualityTone(value: boolean): ResourceTone {
  return value ? "green" : "yellow";
}

function recommendationTone(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null): ResourceTone {
  if (opportunity.riskScore >= 70 || opportunity.complianceScore < 50) return "red";
  if (!analysis || analysis.status === "human_review" || analysis.status === "insufficient_data") return "yellow";
  if (analysis.decision === "excellent" || analysis.decision === "good") return "green";
  return "yellow";
}

function recommendedAction(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  if (!analysis) {
    return {
      title: "Criar analise de mercado",
      detail: "A oportunidade ainda nao possui analise estruturada para decisao.",
      action: "Abrir revisao",
      href: tabHref("revisao"),
    };
  }

  const missing = getReviewIssues(opportunity, analysis);
  if (missing.length) {
    return {
      title: "Completar campos obrigatorios",
      detail: missing.slice(0, 4).join(", "),
      action: "Revisar campos",
      href: tabHref("revisao"),
    };
  }

  if (analysis.decision === "excellent" || analysis.decision === "good") {
    return {
      title: "Aprovar oportunidade",
      detail: "Os dados principais estao preenchidos e a analise indica potencial favoravel.",
      action: "Decidir agora",
      href: tabHref("revisao"),
    };
  }

  return {
    title: "Validar ressalvas antes da decisao",
    detail: compactText(analysis.cautionNotes || opportunity.nextAction),
    action: "Abrir revisao",
    href: tabHref("revisao"),
  };
}

function getReviewIssues(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  if (!analysis) return ["analise de mercado ausente"];

  const issues: string[] = [];
  const subject = analysis.subject;
  if (!analysis.initialBid) issues.push("lance inicial");
  if (!analysis.marketValueBase) issues.push("valor de mercado base");
  if (!analysis.realDiscountPct) issues.push("desconto real");
  if (!subject.privateAreaM2 && !subject.landAreaM2 && !subject.builtAreaM2) issues.push("area do imovel");
  if (!analysis.comparables.length) issues.push("comparaveis");
  if (analysis.confidenceScore < 65) issues.push("confianca minima de 65%");
  if (!opportunity.images?.filter((image) => image.status !== "failed").length) issues.push("foto real");
  return issues;
}

function reviewedFieldsCount(opportunity: AuctionOpportunity, analysis: PropertyMarketAnalysis | null) {
  if (!analysis) return { done: 0, total: 24 };
  const subject = analysis.subject;
  const rental = analysis.rentalEstimate;
  const payment = analysis.paymentSimulation;
  const checks = [
    opportunity.title,
    opportunity.city,
    opportunity.state,
    opportunity.address,
    opportunity.propertyType,
    opportunity.occupancy,
    analysis.initialBid,
    analysis.marketValueBase,
    analysis.marketValueLow,
    analysis.marketValueHigh,
    analysis.realDiscountPct,
    subject.privateAreaM2 || subject.landAreaM2 || subject.builtAreaM2,
    subject.bedrooms,
    subject.parkingSpaces,
    analysis.comparables.length,
    rental.monthlyRent || rental.referenceFound,
    payment.paymentMode,
    analysis.estimatedCosts.length,
    analysis.legalSignal,
    analysis.cautionNotes,
    analysis.summary,
    analysis.decisionReason,
    analysis.confidenceScore >= 65,
    opportunity.documents.length,
  ];

  return { done: checks.filter(Boolean).length, total: checks.length };
}

function HeaderActionButton({
  value,
  children,
  tone,
  disabled,
}: {
  value: string;
  children: ReactNode;
  tone: "primary" | "green" | "yellow" | "red" | "neutral";
  disabled?: boolean;
}) {
  const className =
    tone === "green"
      ? "bg-[var(--admin-green)] text-white hover:bg-[#0f6338]"
      : tone === "yellow"
        ? "bg-[var(--admin-yellow)] text-white hover:bg-[#975f0f]"
        : tone === "red"
          ? "bg-[var(--admin-red)] text-white hover:bg-[#9f3024]"
          : tone === "primary"
            ? "bg-[var(--admin-cyan)] text-white hover:bg-[#a54a18]"
            : "border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] hover:bg-[var(--admin-card-2)]";

  return (
    <Button className={cn("h-9", className)} disabled={disabled} name="submitStatus" type="submit" value={value}>
      {children}
    </Button>
  );
}

function HiddenInput({ name, value }: { name: string; value?: string | number | boolean }) {
  return <input name={name} type="hidden" value={value === true ? "true" : value ? String(value) : ""} />;
}

function HiddenReviewFields({ opportunity, analysis }: { opportunity: AuctionOpportunity; analysis: PropertyMarketAnalysis }) {
  const subject = analysis.subject;
  const rental = analysis.rentalEstimate;
  const payment = analysis.paymentSimulation;
  const costs = new Map(analysis.estimatedCosts.map((item) => [item.label.toLowerCase(), item.value]));

  return (
    <div className="hidden" aria-hidden="true">
      <HiddenInput name="opportunityCode" value={analysis.opportunityCode || opportunity.id} />
      <HiddenInput name="marketValueLow" value={analysis.marketValueLow} />
      <HiddenInput name="marketValueBase" value={analysis.marketValueBase} />
      <HiddenInput name="marketValueHigh" value={analysis.marketValueHigh} />
      <HiddenInput name="privateAreaM2" value={subject.privateAreaM2} />
      <HiddenInput name="landAreaM2" value={subject.landAreaM2} />
      <HiddenInput name="builtAreaM2" value={subject.builtAreaM2} />
      <HiddenInput name="bedrooms" value={subject.bedrooms} />
      <HiddenInput name="parkingSpaces" value={subject.parkingSpaces} />
      <HiddenInput name="liquidityScore" value={analysis.liquidityScore} />
      <HiddenInput name="confidenceScore" value={analysis.confidenceScore} />
      <HiddenInput name="analystName" value={analysis.analystName} />
      <HiddenInput name="paymentCondition" value={analysis.paymentCondition} />
      <HiddenInput name="status" value={analysis.status} />
      <HiddenInput name="decision" value={analysis.decision} />
      <HiddenInput name="monthlyRent" value={rental.monthlyRent} />
      <HiddenInput name="rentReferenceUrl" value={rental.referenceUrl} />
      <HiddenInput name="rentReferenceFound" value={rental.referenceFound} />
      <HiddenInput name="rentValueKnown" value={rental.valueKnown} />
      <HiddenInput name="rentNotes" value={rental.notes} />
      <HiddenInput name="paymentMode" value={payment.paymentMode} />
      <HiddenInput name="downPaymentPct" value={payment.downPaymentPct} />
      <HiddenInput name="downPaymentAmount" value={payment.downPaymentAmount} />
      <HiddenInput name="installmentBalance" value={payment.installmentBalance} />
      <HiddenInput name="installmentCount" value={payment.installmentCount} />
      <HiddenInput name="installmentAmount" value={payment.installmentAmount} />
      <HiddenInput name="installmentCorrectionRule" value={payment.correctionRule} />
      <HiddenInput name="installmentCorrectionWarning" value={payment.correctionWarning} />
      <HiddenInput name="summary" value={analysis.summary} />
      <HiddenInput name="legalSignal" value={analysis.legalSignal} />
      <HiddenInput name="cautionNotes" value={analysis.cautionNotes} />
      <HiddenInput name="decisionReason" value={analysis.decisionReason} />
      <HiddenInput name="auctionUrl" value={sourceUrlFor(analysis, ["leilao"])} />
      <HiddenInput name="referenceUrl" value={sourceUrlFor(analysis, ["referencia"])} />
      <HiddenInput name="costItbi" value={costs.get("itbi")} />
      <HiddenInput name="costRegistry" value={costs.get("registro")} />
      <HiddenInput name="costCommission" value={costs.get("comissao leiloeiro")} />
      <HiddenInput name="costLegal" value={costs.get("juridico")} />
      <HiddenInput name="costCondoIptu" value={costs.get("condominio/iptu")} />
      <HiddenInput name="costReform" value={costs.get("reforma")} />
      <HiddenInput name="costVacancy" value={costs.get("desocupacao")} />
      <HiddenInput name="costReserve" value={costs.get("reserva")} />
    </div>
  );
}

function SectionCard({
  id,
  title,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
}: {
  id?: string;
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-foreground)] shadow-sm shadow-[rgba(81,60,36,0.06)]",
        className
      )}
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--admin-border)] px-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="truncate text-sm font-semibold text-[var(--admin-foreground)]">{title}</h2>
        </div>
        {action}
      </div>
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}

function KpiCard({
  label,
  value,
  detail,
  tone = "muted",
  icon,
  strong,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: ResourceTone;
  icon?: ReactNode;
  strong?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border bg-white px-3 py-3 shadow-sm shadow-[rgba(81,60,36,0.04)]",
        toneBorder[tone],
        strong && "ring-1 ring-[rgba(200,90,31,0.14)]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-[var(--admin-muted)]">{label}</p>
        {icon ? <span className={cn("shrink-0", toneText[tone])}>{icon}</span> : null}
      </div>
      <div className={cn("mt-2 font-mono text-lg font-bold", toneText[tone])}>{value}</div>
      {detail ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p> : null}
    </div>
  );
}

function InfoValue({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <div className="mt-1 min-h-5 text-sm font-semibold leading-5 text-[var(--admin-foreground)]">{value}</div>
    </div>
  );
}

function TextDisclosure({
  label,
  children,
  defaultOpen = false,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white"
      open={defaultOpen}
    >
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-3 px-3 text-sm font-semibold text-[var(--admin-foreground)]">
        {label}
        <ChevronDown size={15} className="text-[var(--admin-muted)] transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-[var(--admin-border)] px-3 py-3 text-sm leading-6 text-[var(--admin-soft)]">
        {children}
      </div>
    </details>
  );
}

function EmptyState({
  title,
  detail,
  icon,
}: {
  title: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="grid min-h-44 place-items-center rounded-lg border border-dashed border-[var(--admin-border)] bg-[rgba(255,255,255,0.55)] px-4 py-8 text-center">
      <div>
        <div className="mx-auto grid size-10 place-items-center rounded-lg border border-[var(--admin-border)] bg-white text-[var(--admin-muted)]">
          {icon || <Info size={18} />}
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[var(--admin-foreground)]">{title}</h3>
        <p className="mt-1 max-w-lg text-sm leading-6 text-[var(--admin-muted)]">{detail}</p>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Input className={inputClass} defaultValue={defaultValue} id={name} name={name} placeholder={placeholder} />
    </div>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <Textarea className={textareaClass} defaultValue={defaultValue} id={name} name={name} placeholder={placeholder} />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="grid gap-2">
      <Label className={labelClass} htmlFor={name}>
        {label}
      </Label>
      <select className={selectClass} defaultValue={defaultValue} id={name} name={name}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-10 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm text-[var(--admin-soft)]">
      <input className="accent-[var(--admin-cyan)]" defaultChecked={defaultChecked} name={name} type="checkbox" />
      {label}
    </label>
  );
}

function OpportunityHeader({
  opportunity,
  analysis,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  const action = recommendedAction(opportunity, analysis);
  const canSubmit = Boolean(analysis?.marketValueBase);
  const updatedAt = analysis?.updatedAt || opportunity.timeline.at(-1)?.time;
  const compactTitle = opportunity.title.length > 92 ? `${opportunity.title.slice(0, 92).trim()}...` : opportunity.title;
  const highlightedAction =
    analysis && analysis.confidenceScore >= 65 && opportunity.riskScore < 70 ? "approved" : "human_review";

  return (
    <section className="rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.96)] p-3 shadow-sm shadow-[rgba(81,60,36,0.07)] backdrop-blur">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]"
            >
              <Link href="/admin/oportunidades">
                <ArrowLeft size={14} />
                Imoveis analisados
              </Link>
            </Button>
            <StatusBadge tone={getStatusTone(opportunity.stage)}>{opportunity.stage}</StatusBadge>
            <StatusBadge tone={analysis ? statusTone(analysis.status) : "yellow"}>
              {analysis ? statusLabel(analysis.status) : "sem analise"}
            </StatusBadge>
            <StatusBadge tone={getStatusTone(opportunity.legalStatus)}>{opportunity.legalStatus}</StatusBadge>
          </div>

          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-cyan)]">
                {opportunity.id} / Central da oportunidade
              </p>
              <h1 className="mt-1 max-w-5xl text-xl font-semibold tracking-tight text-[var(--admin-foreground)] lg:text-2xl">
                {compactTitle}
              </h1>
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-[var(--admin-muted)]">
                <MapPin size={14} />
                <span>{[opportunity.city, opportunity.state].filter(Boolean).join("/")}</span>
                <span className="text-[var(--admin-border)]">|</span>
                <span>{opportunity.sourceName}</span>
                <span className="text-[var(--admin-border)]">|</span>
                <span>Responsavel: {opportunity.owner}</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
              <MiniScore label="Score" value={opportunity.opportunityScore} kind="score" />
              <MiniScore label="Risco" value={opportunity.riskScore} kind="risk" />
              <MiniScore label="Conf." value={analysis?.confidenceScore || opportunity.complianceScore} kind="score" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 xl:max-w-[520px] xl:justify-end">
          <Button
            asChild
            variant="outline"
            className="h-9 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]"
          >
            <Link href={`/admin/oportunidades/${opportunity.id}/editar`}>
              <Pencil size={14} />
              Editar imovel
            </Link>
          </Button>
          {analysis ? (
            <>
              <HeaderActionButton disabled={!canSubmit} tone={highlightedAction === "human_review" ? "primary" : "neutral"} value="human_review">
                <Save size={14} />
                Salvar revisao
              </HeaderActionButton>
              <HeaderActionButton disabled={!canSubmit} tone={highlightedAction === "approved" ? "green" : "neutral"} value="approved">
                <CheckCircle2 size={14} />
                Aprovar
              </HeaderActionButton>
              <details className="relative">
                <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-[var(--admin-border)] bg-white px-2.5 text-sm font-medium text-[var(--admin-foreground)] transition hover:bg-[var(--admin-card-2)]">
                  <MoreHorizontal size={14} />
                  Mais acoes
                </summary>
                <div className="absolute right-0 z-30 mt-2 grid min-w-56 gap-2 rounded-lg border border-[var(--admin-border)] bg-white p-2 shadow-lg">
                  <HeaderActionButton disabled={!canSubmit} tone="yellow" value="approved_with_notes">
                    <ShieldCheck size={14} />
                    Aprovar com ressalvas
                  </HeaderActionButton>
                  <HeaderActionButton disabled={!canSubmit} tone="red" value="rejected">
                    <XCircle size={14} />
                    Reprovar
                  </HeaderActionButton>
                  <Button className="h-9 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)] hover:bg-[var(--admin-card-2)]" type="button">
                    <FileCheck2 size={14} />
                    Criar dossie
                  </Button>
                </div>
              </details>
            </>
          ) : (
            <Button className="h-9 bg-[var(--admin-cyan)] text-white hover:bg-[#a54a18]" type="button">
              <FileCheck2 size={14} />
              Criar dossie
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 border-t border-[var(--admin-border)] pt-3 text-xs text-[var(--admin-muted)] md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <p className="line-clamp-2">
          <span className="font-semibold text-[var(--admin-foreground)]">Proxima acao:</span> {action.title} - {action.detail}
        </p>
        <p>Atualizado: {formatDateTime(updatedAt)}</p>
      </div>
    </section>
  );
}

function MiniScore({
  label,
  value,
  kind,
}: {
  label: string;
  value: number;
  kind: "score" | "risk";
}) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <div className="mt-1">{kind === "risk" ? <RiskBadge score={value} /> : <ScoreBadge score={value} />}</div>
    </div>
  );
}

function OpportunityTabs({ activeTab }: { activeTab: OpportunityTabId }) {
  return (
    <nav
      aria-label="Secoes da oportunidade"
      className="mt-3 flex gap-2 overflow-x-auto rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.96)] p-2 shadow-sm shadow-[rgba(81,60,36,0.05)]"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Link
            key={tab.id}
            href={tabHref(tab.id)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.18)]",
              active
                ? "border-[rgba(200,90,31,0.34)] bg-[rgba(200,90,31,0.1)] text-[var(--admin-cyan)]"
                : "border-transparent bg-white text-[var(--admin-muted)] hover:border-[var(--admin-border)] hover:text-[var(--admin-foreground)]"
            )}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

function PipelineStepper({
  opportunity,
  analysis,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  const steps = [
    { label: "Capturado", status: "completed" },
    { label: "Extraido", status: analysis ? "completed" : "pending" },
    { label: "Curadoria IA", status: analysis ? "running" : "pending" },
    { label: "Revisao juridica", status: opportunity.legalStatus.toLowerCase().includes("bloq") ? "blocked" : "pending" },
    { label: "Dossie", status: opportunity.checklist.some((item) => item.label.toLowerCase().includes("dossie") && item.status.toLowerCase().includes("concl")) ? "completed" : "pending" },
    { label: "Decisao", status: analysis?.status === "approved" ? "completed" : analysis?.status === "rejected" ? "blocked" : "pending" },
  ];

  const statusToneMap: Record<string, ResourceTone> = {
    completed: "green",
    running: "yellow",
    pending: "muted",
    blocked: "red",
    error: "red",
  };

  return (
    <SectionCard title="Pipeline" eyebrow="progresso" contentClassName="p-3">
      <div className="grid gap-2 md:grid-cols-6">
        {steps.map((step, index) => (
          <div key={step.label} className="relative">
            {index < steps.length - 1 ? (
              <span className="absolute left-[calc(50%+18px)] top-4 hidden h-px w-[calc(100%-36px)] bg-[var(--admin-border)] md:block" />
            ) : null}
            <div className="relative z-10 flex items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2 md:flex-col md:text-center">
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full border font-mono text-[10px] font-bold",
                  toneBorder[statusToneMap[step.status]],
                  toneBg[statusToneMap[step.status]],
                  toneText[statusToneMap[step.status]]
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--admin-foreground)]">{step.label}</p>
                <p className="mt-0.5 text-[10px] text-[var(--admin-muted)]">{statusLabel(step.status)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function Gallery({
  images,
  heroImage,
  title,
  currentTab,
  selectedImageIndex,
  compact = false,
  thumbnailEntries,
  fillSpace = false,
}: {
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  title: string;
  currentTab: OpportunityTabId;
  selectedImageIndex?: number;
  compact?: boolean;
  thumbnailEntries?: GalleryImageEntry[];
  fillSpace?: boolean;
}) {
  const activeIndex =
    typeof selectedImageIndex === "number"
      ? selectedImageIndex
      : heroImage
        ? images.findIndex((image) => image.url === heroImage.url)
        : -1;
  const thumbnails = thumbnailEntries || images.map((image, index) => ({ image, index }));
  const hasThumbnails = thumbnails.length > 0;
  const lockScrollableGalleryHeight = compact && fillSpace && thumbnails.length >= 7;
  const stretchToSiblingColumn = fillSpace && !lockScrollableGalleryHeight;
  const heroHeight =
    compact && fillSpace
      ? lockScrollableGalleryHeight
        ? "h-[360px] sm:h-[500px] xl:h-[560px] 2xl:h-[590px]"
        : "h-[360px] sm:h-[500px] xl:h-full xl:min-h-0"
      : compact
        ? "h-[300px] sm:h-[320px] xl:h-[340px]"
        : "h-[360px] sm:h-[500px] xl:h-[620px]";
  const thumbnailRailHeight =
    compact && fillSpace
      ? lockScrollableGalleryHeight
        ? "lg:h-[500px] lg:max-h-[500px] xl:h-[560px] xl:max-h-[560px] 2xl:h-[590px] 2xl:max-h-[590px]"
        : "lg:h-[500px] lg:max-h-[500px] xl:h-full xl:max-h-full"
      : compact
        ? "lg:h-[340px] lg:max-h-[340px]"
        : "lg:h-[620px] lg:max-h-[620px]";

  return (
    <SectionCard
      id="fotos"
      title="Fotos do imovel"
      eyebrow="galeria / r2"
      action={<StatusBadge tone={heroImage ? "green" : "yellow"}>{images.length} foto(s)</StatusBadge>}
      className={cn(
        "scroll-mt-40 min-h-0 self-start h-fit",
        stretchToSiblingColumn && "xl:flex xl:h-full xl:self-stretch xl:flex-col xl:overflow-hidden"
      )}
      contentClassName={cn("p-3", stretchToSiblingColumn && "xl:flex xl:min-h-0 xl:flex-1 xl:overflow-hidden")}
    >
      <div
        className={cn(
          "grid w-full items-start gap-3",
          stretchToSiblingColumn && "xl:h-full xl:min-h-0 xl:items-stretch",
          hasThumbnails && (compact ? "lg:grid-cols-[minmax(0,1fr)_164px]" : "lg:grid-cols-[minmax(0,1fr)_220px]")
        )}
      >
        {heroImage ? (
          <a
            href={heroImage.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "group relative block overflow-hidden rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.2)]",
              heroHeight
            )}
            aria-label={`Abrir foto principal de ${title}`}
          >
            <img
              src={heroImage.url}
              alt={heroImage.alt || title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.015]"
            />
            <span className="absolute bottom-3 right-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-white/60 bg-black/58 px-3 text-xs font-semibold text-white opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-visible:opacity-100">
              Abrir imagem
              <ArrowUpRight size={13} />
            </span>
          </a>
        ) : (
          <div className="grid aspect-[16/9] min-h-56 place-items-center rounded-lg border border-[var(--admin-border)] bg-[#fbf6e9] text-center">
            <div>
              <ImageOff className="mx-auto text-[var(--admin-muted)]" size={36} />
              <p className="mt-3 font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[var(--admin-yellow)]">
                Sem foto real
              </p>
              <p className="mt-1 text-xs text-[var(--admin-muted)]">Banner, logo ou imagem tecnica foi ignorada.</p>
            </div>
          </div>
        )}

        {hasThumbnails ? (
          <div
            className={cn(
              "grid content-start gap-2",
              compact
                ? cn(
                    "grid-cols-5 lg:grid-cols-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1",
                    "lg:min-h-0",
                    thumbnailRailHeight
                  )
                : cn(
                    "grid-cols-4 lg:grid-cols-2 lg:overflow-y-auto lg:overscroll-contain lg:pr-1",
                    "lg:min-h-0",
                    thumbnailRailHeight
                  )
          )}
          >
            {thumbnails.map(({ image, index }) => (
              <GalleryThumbnail
                key={`${image.url}-${index}`}
                image={image}
                index={index}
                activeIndex={activeIndex}
                currentTab={currentTab}
                title={title}
              />
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function GalleryThumbnail({
  image,
  index,
  activeIndex,
  currentTab,
  title,
  fill = false,
}: {
  image: PropertyImageAsset;
  index: number;
  activeIndex: number;
  currentTab: OpportunityTabId;
  title: string;
  fill?: boolean;
}) {
  return (
    <Link
      href={imageHref(currentTab, index)}
      scroll={false}
      className={cn(
        "group relative block overflow-hidden rounded-lg border bg-[var(--admin-card-2)] transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[rgba(200,90,31,0.2)]",
        fill ? "min-h-0" : "aspect-[4/3]",
        activeIndex === index
          ? "border-[rgba(200,90,31,0.75)] ring-2 ring-[rgba(200,90,31,0.18)]"
          : "border-[var(--admin-border)] hover:border-[rgba(200,90,31,0.5)]"
      )}
      aria-label={`Selecionar foto ${index + 1} de ${title}`}
    >
      <img
        src={image.url}
        alt={image.alt || `${title} foto ${index + 1}`}
        loading="lazy"
        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.04]"
      />
      <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/58 font-mono text-[10px] font-semibold text-white">
        {index + 1}
      </span>
    </Link>
  );
}

type GalleryImageEntry = {
  image: PropertyImageAsset;
  index: number;
};

function imageIdentity(image: PropertyImageAsset) {
  const raw = (image.sourceUrl || image.url || "").toLowerCase().split(/[?#]/)[0];
  return raw.replace(/\.(webp|jpe?g|png|gif)$/i, "");
}

function isDecorativeImage(image: PropertyImageAsset) {
  const source = `${image.url} ${image.sourceUrl || ""} ${image.alt || ""}`.toLowerCase();
  return ["/comitentes/", "assets/images", "feedback", "load-btn", "bradesco"].some((marker) =>
    source.includes(marker)
  );
}

function uniqueImageEntries(images: PropertyImageAsset[]) {
  const seen = new Set<string>();
  return images
    .map((image, index) => ({ image, index }))
    .filter(({ image }) => {
      const identity = imageIdentity(image);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
}

function overviewThumbnailEntries(
  images: PropertyImageAsset[],
  heroImage?: PropertyImageAsset,
  selectedImageIndex?: number
) {
  const activeIndex =
    typeof selectedImageIndex === "number"
      ? selectedImageIndex
      : heroImage
        ? images.findIndex((image) => image.url === heroImage.url)
        : -1;
  const activeIdentity = activeIndex >= 0 ? imageIdentity(images[activeIndex]) : "";
  const uniqueEntries = uniqueImageEntries(images);
  const availableEntries = uniqueEntries.filter(
    ({ image, index }) => index !== activeIndex && imageIdentity(image) !== activeIdentity
  );
  const propertyEntries = availableEntries.filter(({ image }) => !isDecorativeImage(image));
  return propertyEntries.length ? propertyEntries : availableEntries;
}

function ExecutiveSummary({
  opportunity,
  analysis,
  images,
  heroImage,
  selectedImageIndex,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  selectedImageIndex?: number;
}) {
  const subject = analysis?.subject;
  const primaryCeiling = analysis?.ceilingTargets[0]?.value || analysis?.suggestedCeilingBid || 0;
  const totalCosts = analysis?.estimatedCosts.reduce((sum, item) => sum + item.value, 0) || 0;
  const areaBase = subject?.privateAreaM2 || subject?.builtAreaM2 || subject?.landAreaM2 || 0;
  const thumbnailEntries = overviewThumbnailEntries(images, heroImage, selectedImageIndex);

  return (
    <section className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
      <Gallery
        images={images}
        heroImage={heroImage}
        selectedImageIndex={selectedImageIndex}
        title={opportunity.title}
        currentTab="visao-geral"
        compact
        fillSpace
        thumbnailEntries={thumbnailEntries}
      />

      <div className="grid content-start gap-4">
        <SectionCard title="Resumo executivo" eyebrow="imovel / decisao" contentClassName="p-4">
          <div className="grid gap-3">
            <div className="grid gap-2 md:grid-cols-2">
              <InfoValue label="Endereco" value={opportunity.address || subject?.address || "nao informado"} className="md:col-span-2" />
              <InfoValue label="Tipo" value={subject?.propertyType || opportunity.propertyType || "nao informado"} />
              <InfoValue label="Ocupacao" value={opportunity.occupancy || "nao informado"} />
              <InfoValue label="Area base" value={area(areaBase)} />
              <InfoValue label="Matricula" value={extractRegistration(opportunity.summary, analysis?.legalSignal)} />
              <InfoValue label="Situacao do leilao" value={opportunity.aiStatus || "nao informado"} />
              <InfoValue label="Data do leilao" value={safeDate(opportunity.auctionDate)} />
            </div>
            <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-sm leading-6 text-[var(--admin-soft)]">
              {shortText(analysis?.summary || opportunity.summary, 420)}
            </p>
          </div>
        </SectionCard>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Mercado"
            value={formatCurrency(analysis?.marketValueBase || opportunity.appraisalValue)}
            detail={analysis ? pricePerM2(analysis.marketPricePerM2) : "base da oportunidade"}
            tone={fieldQualityTone(Boolean(analysis?.marketValueBase || opportunity.appraisalValue))}
            icon={<BarChart3 size={16} />}
            strong
          />
          <KpiCard
            label="Lance"
            value={formatCurrency(analysis?.initialBid || opportunity.initialBid)}
            detail={analysis ? pricePerM2(analysis.initialBidPricePerM2) : "capturado da fonte"}
            tone="yellow"
            icon={<Gavel size={16} />}
            strong
          />
          <KpiCard
            label="Desconto"
            value={percent(analysis?.realDiscountPct || opportunity.discountPct)}
            detail="sobre mercado base"
            tone={(analysis?.realDiscountPct || opportunity.discountPct) >= 35 ? "green" : "yellow"}
            icon={<Target size={16} />}
          />
          <KpiCard label="Teto Betel" value={formatCurrency(primaryCeiling)} detail="investimento maximo sugerido" tone="green" />
          <KpiCard label="Custo total" value={formatCurrency(totalCosts)} detail={`${analysis?.estimatedCosts.length || 0} custo(s) mapeado(s)`} tone={totalCosts ? "yellow" : "muted"} />
          <KpiCard label="Margem" value={formatCurrency(analysis?.estimatedNetMargin || 0)} detail="potencial antes da decisao final" tone={(analysis?.estimatedNetMargin || 0) > 0 ? "green" : "yellow"} />
          <KpiCard label="Aluguel" value={analysis?.rentalEstimate.monthlyRent ? formatCurrency(analysis.rentalEstimate.monthlyRent) : "pendente"} detail={rentalDetail(analysis)} tone={analysis?.rentalEstimate.monthlyRent ? "cyan" : "muted"} />
          <KpiCard label="Confianca" value={`${analysis?.confidenceScore || 0}%`} detail={`${analysis?.comparables.length || 0} comparavel(is)`} tone={(analysis?.confidenceScore || 0) >= 65 ? "green" : "yellow"} />
        </div>
      </div>
    </section>
  );
}

function extractRegistration(summary?: string, legal?: string) {
  const text = compactText(`${summary || ""} ${legal || ""}`, "");
  const match = text.match(/matr[íi]cula\s*(?:n[ºo]\.?\s*)?([0-9.,\s-]+)/i);
  return match?.[1]?.trim() || "nao informado";
}

function rentalDetail(analysis: PropertyMarketAnalysis | null) {
  if (!analysis) return "sem analise";
  const rental = analysis.rentalEstimate;
  if (!rental.monthlyRent) return rental.referenceFound ? "referencia sem valor" : "sem referencia";
  return `${percent(rental.monthlyYieldOnMarketPct)} a.m. mercado / ${percent(rental.monthlyYieldOnBidPct)} a.m. lance`;
}

function RecommendedAction({
  opportunity,
  analysis,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  const action = recommendedAction(opportunity, analysis);
  const tone = recommendationTone(opportunity, analysis);
  const alerts = [
    ...getReviewIssues(opportunity, analysis).map((issue) => ({
      label: issue,
      detail: "Campo essencial para decisao operacional.",
      tone: "yellow" as ResourceTone,
    })),
    ...opportunity.riskFlags.map((risk) => ({ label: risk.label, detail: risk.detail, tone: risk.severity })),
  ];
  const criticalAlerts = alerts.slice(0, 3);
  const hiddenCount = Math.max(0, alerts.length - criticalAlerts.length);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.55fr)]">
      <div className={cn("rounded-xl border bg-white p-4 shadow-sm", toneBorder[tone])}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
              proxima acao recomendada
            </p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-semibold text-[var(--admin-foreground)]">
              <Target size={18} className={toneText[tone]} />
              {action.title}
            </h2>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--admin-soft)]">{action.detail}</p>
            <p className="mt-2 text-xs text-[var(--admin-muted)]">
              Responsavel: {opportunity.owner} {opportunity.auctionDate ? `| Prazo: ${safeDate(opportunity.auctionDate)}` : ""}
            </p>
          </div>
          <Button asChild className="h-9 bg-[var(--admin-cyan)] text-white hover:bg-[#a54a18]">
            <Link href={action.href}>{action.action}</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--admin-border)] bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Alertas criticos</h3>
          {hiddenCount ? <StatusBadge tone="yellow">+{hiddenCount}</StatusBadge> : null}
        </div>
        <div className="grid gap-2">
          {criticalAlerts.length ? (
            criticalAlerts.map((alert) => (
              <div key={`${alert.label}-${alert.detail}`} className={cn("rounded-lg border px-3 py-2", toneBorder[alert.tone], toneBg[alert.tone])}>
                <p className="text-sm font-semibold text-[var(--admin-foreground)]">{alert.label}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{alert.detail}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg border border-[var(--admin-border)] bg-[rgba(19,122,69,0.06)] px-3 py-2 text-sm text-[var(--admin-green)]">
              Nenhum alerta critico encontrado.
            </p>
          )}
          {hiddenCount ? (
            <Link className="text-xs font-semibold text-[var(--admin-cyan)] hover:underline" href={tabHref("revisao")}>
              Ver todos os alertas
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TabContent({
  activeTab,
  opportunity,
  analysis,
  qualificationDossier,
  qualificationReason,
  reason,
  images,
  heroImage,
  selectedImageIndex,
  marketFilter,
  marketSort,
}: OpportunityDetailCenterProps & {
  activeTab: OpportunityTabId;
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  selectedImageIndex?: number;
}) {
  switch (activeTab) {
    case "financeiro":
      return <FinancialTab analysis={analysis} />;
    case "juridico":
      return <LegalTab opportunity={opportunity} analysis={analysis} />;
    case "mercado":
      return <MarketTab analysis={analysis} marketFilter={marketFilter} marketSort={marketSort} />;
    case "imovel":
      return <PropertyTab opportunity={opportunity} analysis={analysis} images={images} heroImage={heroImage} selectedImageIndex={selectedImageIndex} />;
    case "documentos":
      return <DocumentsTab opportunity={opportunity} analysis={analysis} />;
    case "revisao":
      return <ReviewTab opportunity={opportunity} analysis={analysis} qualificationDossier={qualificationDossier} qualificationReason={qualificationReason} reason={reason} />;
    case "historico":
      return <HistoryTab opportunity={opportunity} analysis={analysis} />;
    case "visao-geral":
    default:
      return (
        <OverviewTab
          opportunity={opportunity}
          analysis={analysis}
          images={images}
          heroImage={heroImage}
          selectedImageIndex={selectedImageIndex}
          qualificationDossier={qualificationDossier}
          qualificationReason={qualificationReason}
          reason={reason}
        />
      );
  }
}

function QualificationScoreCard({ label, score, tone = "muted" }: { label: string; score: number; tone?: ResourceTone }) {
  return (
    <div className="rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--admin-muted)]">{label}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className={cn("font-mono text-lg font-bold", toneText[tone])}>{score}</p>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--admin-card-2)]">
          <div className={cn("h-full rounded-full bg-current", toneText[tone])} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function QualificationResearchTrace({
  dossier,
  compact = false,
}: {
  dossier: PropertyQualificationDossier;
  compact?: boolean;
}) {
  const steps = buildQualificationAuditSteps(dossier);
  const sources = buildQualificationSources(dossier);
  const visibleSteps = compact ? steps.slice(0, 5) : steps;
  const visibleSources = compact ? sources.slice(0, 5) : sources.slice(0, 12);

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-border)] px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Como a analise foi feita</h3>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
            Rastro da pesquisa, fontes usadas e motivos que sustentam a conclusao.
          </p>
        </div>
        <StatusBadge tone="muted">{steps.length} etapa(s)</StatusBadge>
      </div>

      <div className="grid gap-4 p-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="grid gap-2">
          {visibleSteps.map((step, index) => (
            <article
              key={step.key}
              className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-3 sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:items-start"
            >
              <div className={cn("grid size-8 place-items-center rounded-full border bg-white text-xs font-bold", toneBorder[evidenceStatusTone(step.status)], toneText[evidenceStatusTone(step.status)])}>
                {index + 1}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-[var(--admin-foreground)]">{step.label}</h4>
                  <StatusBadge tone={evidenceStatusTone(step.status)}>{evidenceStatusLabel(step.status)}</StatusBadge>
                </div>
                <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">{step.summary}</p>
                {step.sourceUrl ? (
                  <Link className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] hover:underline" href={step.sourceUrl} target="_blank" rel="noreferrer">
                    Ver fonte da etapa
                    <ArrowUpRight size={12} />
                  </Link>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="grid content-start gap-3">
          <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileSearch size={15} className="text-[var(--admin-cyan)]" />
                <h4 className="text-sm font-semibold text-[var(--admin-foreground)]">Fontes consultadas</h4>
              </div>
              <StatusBadge tone="muted">{sources.length}</StatusBadge>
            </div>
            <div className="grid gap-2">
              {visibleSources.length ? (
                visibleSources.map((source) => (
                  <div key={source.key} className="rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--admin-foreground)]">{source.label}</p>
                      <StatusBadge tone={evidenceStatusTone(source.status)}>{source.category}</StatusBadge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{source.detail}</p>
                    <Link className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] hover:underline" href={source.url} target="_blank" rel="noreferrer">
                      Abrir fonte
                      <ArrowUpRight size={12} />
                    </Link>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
                  Nenhuma fonte individual registrada alem dos dados da captura.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-3">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck size={15} className="text-[var(--admin-green)]" />
              <h4 className="text-sm font-semibold text-[var(--admin-foreground)]">Base da conclusao</h4>
            </div>
            <div className="grid gap-2">
              <InfoValue label="Mercado" value={marketConclusionText(dossier)} />
              <InfoValue label="Midia" value={imageConclusionText(dossier)} />
              <InfoValue label="Compliance" value={complianceConclusionText(dossier)} />
              <InfoValue
                label="Lacunas"
                value={dossier.blockers.length ? dossier.blockers.slice(0, 3).join(", ") : "Sem bloqueio critico registrado."}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QualificationDossierPanel({
  opportunity,
  dossier,
  reason,
  compact = false,
}: {
  opportunity: AuctionOpportunity;
  dossier?: PropertyQualificationDossier | null;
  reason?: string;
  compact?: boolean;
}) {
  if (!dossier) {
    return (
      <SectionCard
        title="Dossie profundo"
        eyebrow="qualificacao v2"
        action={<StatusBadge tone="yellow">Aguardando</StatusBadge>}
      >
        <EmptyState
          title="Dossie ainda nao gerado"
          detail={reason || "Ele sera criado no proximo processamento do lote, sem alterar a captura atual."}
          icon={<FileCheck2 size={18} />}
        />
      </SectionCard>
    );
  }

  const tone = qualificationTone(dossier);
  const scoreTone: ResourceTone = dossier.overallScore >= 75 ? "green" : dossier.overallScore >= 55 ? "yellow" : "red";
  const evidence = dossier.evidence.slice(0, compact ? 6 : 10);
  const latestFeedback = dossier.feedback.slice(0, 4);
  const hasBlockers = dossier.blockers.length > 0;
  const hasRecommendations = dossier.recommendations.length > 0;

  return (
    <SectionCard
      title="Dossie profundo"
      eyebrow="qualificacao v2"
      action={<StatusBadge tone={tone}>{qualificationStatusLabel(dossier)}</StatusBadge>}
    >
      <input name="qualificationDossierId" type="hidden" value={dossier.id} />
      <input name="qualificationOpportunityId" type="hidden" value={dossier.opportunityId} />
      <input name="qualificationOpportunityCode" type="hidden" value={opportunity.id} />

      <div className="grid gap-4">
        <div className={cn("rounded-lg border p-4", toneBorder[tone], toneBg[tone])}>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-[var(--admin-foreground)]">Pronto para elevar o nivel da curadoria</h3>
                <StatusBadge tone={scoreTone}>{dossier.overallScore}/100</StatusBadge>
              </div>
              <p className="mt-2 text-sm leading-6 text-[var(--admin-soft)]">
                Versao {dossier.version || "qualification-v2"} em {dossier.mode === "shadow" ? "modo sombra" : "modo ativo"}.
                A liberacao automatica continua bloqueada ate a operacao validar os criterios.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:min-w-[440px]">
              <QualificationScoreCard label="Geral" score={dossier.overallScore} tone={scoreTone} />
              <QualificationScoreCard label="Identidade" score={dossier.identityScore} tone={dossier.identityScore >= 70 ? "green" : "yellow"} />
              <QualificationScoreCard label="Mercado" score={dossier.marketScore} tone={dossier.marketScore >= 70 ? "green" : "yellow"} />
              <QualificationScoreCard label="Imagens" score={dossier.imageScore} tone={dossier.imageScore >= 70 ? "green" : "yellow"} />
              <QualificationScoreCard label="Documentos" score={dossier.documentationScore} tone={dossier.documentationScore >= 70 ? "green" : "yellow"} />
              <QualificationScoreCard label="Compliance" score={dossier.complianceScore} tone={dossier.complianceScore >= 70 ? "green" : "yellow"} />
            </div>
          </div>
        </div>

        <QualificationResearchTrace dossier={dossier} compact={compact} />

        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-[var(--admin-border)] bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              {hasBlockers ? <XCircle size={16} className="text-[var(--admin-red)]" /> : <CheckCircle2 size={16} className="text-[var(--admin-green)]" />}
              <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Bloqueios</h3>
            </div>
            <div className="grid gap-2">
              {hasBlockers ? (
                dossier.blockers.slice(0, 6).map((item) => (
                  <p key={item} className="rounded-lg border border-[rgba(196,61,45,0.22)] bg-[rgba(196,61,45,0.06)] px-3 py-2 text-xs leading-5 text-[var(--admin-soft)]">
                    {item}
                  </p>
                ))
              ) : (
                <p className="rounded-lg border border-[rgba(19,122,69,0.22)] bg-[rgba(19,122,69,0.06)] px-3 py-2 text-xs leading-5 text-[var(--admin-green)]">
                  Nenhum bloqueio critico registrado no dossie.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-[var(--admin-border)] bg-white p-3">
            <div className="mb-2 flex items-center gap-2">
              <Target size={16} className="text-[var(--admin-cyan)]" />
              <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Proximos upgrades</h3>
            </div>
            <div className="grid gap-2">
              {hasRecommendations ? (
                dossier.recommendations.slice(0, 6).map((item) => (
                  <p key={item} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-xs leading-5 text-[var(--admin-soft)]">
                    {item}
                  </p>
                ))
              ) : (
                <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
                  Nenhuma recomendacao pendente.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[var(--admin-border)] px-3">
            <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Evidencias da qualificacao</h3>
            <StatusBadge tone="muted">{dossier.evidence.length}</StatusBadge>
          </div>
          {evidence.length ? (
            <div className="divide-y divide-[var(--admin-border)]">
              {evidence.map((item) => (
                <div key={item.id || `${item.category}-${item.label}`} className="grid gap-3 px-3 py-3 md:grid-cols-[9rem_minmax(0,1fr)_7rem] md:items-start">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={evidenceStatusTone(item.status)}>{evidenceStatusLabel(item.status)}</StatusBadge>
                    <p className="text-xs font-semibold text-[var(--admin-muted)]">{evidenceCategoryLabel(item.category)}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{item.label}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{item.details || "Sem detalhe adicional."}</p>
                    {item.sourceUrl ? (
                      <Link className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--admin-cyan)] hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">
                        Ver fonte
                        <ArrowUpRight size={12} />
                      </Link>
                    ) : null}
                  </div>
                  <ScoreBadge score={item.score} />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="Sem evidencias detalhadas" detail="O dossie existe, mas ainda nao recebeu itens de evidencia." />
            </div>
          )}
        </div>

        <div className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.45fr)]">
          <div className="grid gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Feedback humano</h3>
              <p className="mt-1 text-xs leading-5 text-[var(--admin-muted)]">
                Registre se a curadoria confirmou, corrigiu ou reprovou o dossie. Isso vira base para melhorar os proximos lotes.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <SelectField
                label="Decisao"
                name="qualificationDecision"
                defaultValue="confirmado"
                options={[
                  { value: "confirmado", label: "Confirmado" },
                  { value: "corrigido", label: "Corrigido" },
                  { value: "reprovado", label: "Reprovado" },
                  { value: "pendente", label: "Pendente" },
                ]}
              />
              <SelectField
                label="Campo"
                name="qualificationFieldKey"
                defaultValue="geral"
                options={[
                  { value: "geral", label: "Geral" },
                  { value: "identidade", label: "Identidade" },
                  { value: "mercado", label: "Mercado" },
                  { value: "imagem", label: "Imagem" },
                  { value: "documentos", label: "Documentos" },
                  { value: "compliance", label: "Compliance" },
                  { value: "risco", label: "Risco" },
                ]}
              />
            </div>
            <TextField
              label="Observacao"
              name="qualificationNotes"
              placeholder="Descreva o que foi confirmado ou qual correcao precisa virar criterio."
            />
            <Button
              className="h-9 w-fit bg-[var(--admin-green)] text-white hover:bg-[#0f6a3b]"
              formAction={savePropertyQualificationFeedbackAction}
            >
              <CheckCircle2 size={15} />
              Registrar feedback
            </Button>
          </div>

          <div className="rounded-lg border border-[var(--admin-border)] bg-white p-3">
            <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">Historico recente</h3>
            <div className="mt-3 grid gap-2">
              {latestFeedback.length ? (
                latestFeedback.map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--admin-border)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge tone={feedbackDecisionTone(item.decision)}>{feedbackDecisionLabel(item.decision)}</StatusBadge>
                      <p className="text-[10px] text-[var(--admin-muted)]">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-[var(--admin-foreground)]">{item.reviewerName}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{item.notes || "Sem observacao."}</p>
                  </div>
                ))
              ) : (
                <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-xs leading-5 text-[var(--admin-muted)]">
                  Nenhum feedback registrado ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function OverviewTab({
  opportunity,
  analysis,
  images,
  heroImage,
  selectedImageIndex,
  qualificationDossier,
  qualificationReason,
  reason,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  selectedImageIndex?: number;
  qualificationDossier?: PropertyQualificationDossier | null;
  qualificationReason?: string;
  reason?: string;
}) {
  const review = reviewedFieldsCount(opportunity, analysis);
  const subject = analysis?.subject;

  return (
    <div className="grid gap-4">
      <ExecutiveSummary
        opportunity={opportunity}
        analysis={analysis}
        images={images}
        heroImage={heroImage}
        selectedImageIndex={selectedImageIndex}
      />
      <RecommendedAction opportunity={opportunity} analysis={analysis} />
      <PipelineStepper opportunity={opportunity} analysis={analysis} />
      <QualificationDossierPanel opportunity={opportunity} dossier={qualificationDossier} reason={qualificationReason} compact />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard title="Resumo da IA" eyebrow="visao geral" contentClassName="p-4">
          {analysis ? (
            <div className="grid gap-3">
              <div className={cn("rounded-lg border p-4", toneBorder[decisionTone(analysis.decision)], toneBg[decisionTone(analysis.decision)])}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-base font-semibold text-[var(--admin-foreground)]">{analysis.decisionLabel}</h3>
                  <ScoreBadge score={analysis.liquidityScore} />
                </div>
                <p className="mt-3 text-sm leading-6 text-[var(--admin-soft)]">{shortText(analysis.summary, 520)}</p>
              </div>
              <TextDisclosure label="Ler analise completa" defaultOpen>
                <p>{compactText(analysis.decisionReason || analysis.summary)}</p>
                {analysis.cautionNotes ? <p className="mt-3">{compactText(analysis.cautionNotes)}</p> : null}
              </TextDisclosure>
              {reason ? <p className="text-xs leading-5 text-[var(--admin-muted)]">{reason}</p> : null}
            </div>
          ) : (
            <EmptyState title="Analise nao localizada" detail="A oportunidade existe, mas a analise de mercado ainda nao foi estruturada." />
          )}
        </SectionCard>

        <div className="grid content-start gap-4">
          <SectionCard title="Dados essenciais" eyebrow="imovel" contentClassName="grid gap-2">
            <InfoValue label="Tipo" value={subject?.propertyType || opportunity.propertyType} />
            <InfoValue label="Ocupacao" value={opportunity.occupancy || "nao informado"} />
            <InfoValue label="Area" value={area(subject?.privateAreaM2 || subject?.builtAreaM2 || subject?.landAreaM2 || 0)} />
            <InfoValue label="Fonte" value={opportunity.sourceName} />
          </SectionCard>

          <SectionCard title="Progresso da analise" eyebrow="revisao" contentClassName="p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-[var(--admin-foreground)]">
                  {review.done} de {review.total}
                </p>
                <p className="text-sm text-[var(--admin-muted)]">campos revisados</p>
              </div>
              <ScoreBadge score={Math.round((review.done / review.total) * 100)} />
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--admin-card-2)]">
              <div className="h-full rounded-full bg-[var(--admin-cyan)]" style={{ width: `${Math.round((review.done / review.total) * 100)}%` }} />
            </div>
          </SectionCard>

          <ActivityMiniTimeline opportunity={opportunity} />
        </div>
      </div>
    </div>
  );
}

function ActivityMiniTimeline({ opportunity }: { opportunity: AuctionOpportunity }) {
  return (
    <SectionCard title="Ultimas atividades" eyebrow="historico" contentClassName="p-0">
      <div className="divide-y divide-[var(--admin-border)]">
        {[...opportunity.timeline].slice(-4).reverse().map((item) => (
          <div key={`${item.time}-${item.actor}-${item.action}`} className="flex gap-3 px-4 py-3">
            <span className={cn("mt-1 size-2 shrink-0 rounded-full bg-current", toneText[item.tone])} />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--admin-foreground)]">{item.actor}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{item.action}</p>
              <p className="mt-1 font-mono text-[10px] text-[var(--admin-muted)]">{item.time}</p>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FinancialTab({ analysis }: { analysis: PropertyMarketAnalysis | null }) {
  if (!analysis) {
    return (
      <SectionCard title="Financeiro" eyebrow="investimento">
        <EmptyState title="Sem analise financeira" detail="Aba pronta para receber os dados quando a analise de mercado for criada." icon={<Banknote size={18} />} />
      </SectionCard>
    );
  }

  const totalCosts = analysis.estimatedCosts.reduce((sum, item) => sum + item.value, 0);
  const totalInvestment = analysis.initialBid + totalCosts;
  const payment = analysis.paymentSimulation;
  const rental = analysis.rentalEstimate;

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Valor de mercado" value={formatCurrency(analysis.marketValueBase)} detail={pricePerM2(analysis.marketPricePerM2)} tone="cyan" strong />
        <KpiCard label="Lance" value={formatCurrency(analysis.initialBid)} detail={pricePerM2(analysis.initialBidPricePerM2)} tone="yellow" strong />
        <KpiCard label="Custos estimados" value={formatCurrency(totalCosts)} detail={`${analysis.estimatedCosts.length} item(ns)`} tone={totalCosts ? "yellow" : "muted"} />
        <KpiCard label="Investimento total" value={formatCurrency(totalInvestment)} detail="lance + custos estimados" tone="purple" />
        <KpiCard label="Desconto real" value={percent(analysis.realDiscountPct)} detail="sobre valor base" tone={analysis.realDiscountPct >= 35 ? "green" : "yellow"} />
        <KpiCard label="Margem potencial" value={formatCurrency(analysis.estimatedNetMargin)} detail="antes de revisao final" tone={analysis.estimatedNetMargin > 0 ? "green" : "yellow"} />
        <KpiCard label="Aluguel" value={rental.monthlyRent ? formatCurrency(rental.monthlyRent) : "pendente"} detail={rentalDetail(analysis)} tone={rental.monthlyRent ? "cyan" : "muted"} />
        <KpiCard label="Teto sugerido" value={formatCurrency(analysis.suggestedCeilingBid)} detail="referencia Betel" tone="green" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard title="Cenarios" eyebrow="conservador / base / otimista" contentClassName="grid gap-3">
          <div className="grid gap-3 lg:grid-cols-3">
            {analysis.scenarios.map((scenario) => (
              <ScenarioCard key={scenario.label} scenario={scenario} totalInvestment={totalInvestment} />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Pagamento" eyebrow="edital" contentClassName="grid gap-2">
          <InfoValue label="Modo" value={paymentLabel(payment.paymentMode)} />
          <InfoValue label="Entrada" value={payment.downPaymentPct ? `${percent(payment.downPaymentPct)} / ${formatCurrency(payment.downPaymentAmount)}` : "nao informado"} />
          <InfoValue label="Saldo" value={payment.installmentBalance ? formatCurrency(payment.installmentBalance) : "nao informado"} />
          <InfoValue label="Parcelas" value={payment.installmentCount ? `${payment.installmentCount}x de ${formatCurrency(payment.installmentAmount)}` : "nao informado"} />
          {payment.correctionRule || payment.correctionWarning ? (
            <TextDisclosure label="Regras de correcao">
              <p>{compactText(payment.correctionRule, "sem regra informada")}</p>
              {payment.correctionWarning ? <p className="mt-2">{compactText(payment.correctionWarning)}</p> : null}
            </TextDisclosure>
          ) : null}
        </SectionCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <SectionCard title="Custos de aquisicao" eyebrow="composicao">
          {analysis.estimatedCosts.length ? (
            <div className="grid gap-2">
              {analysis.estimatedCosts.map((cost) => (
                <div key={`${cost.label}-${cost.value}`} className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-center">
                  <div>
                    <p className="text-sm font-semibold text-[var(--admin-foreground)]">{cost.label}</p>
                    <p className="mt-1 text-xs text-[var(--admin-muted)]">{cost.detail || "estimativa operacional"}</p>
                  </div>
                  <p className="font-mono text-sm font-bold text-[var(--admin-cyan)] sm:text-right">{formatCurrency(cost.value)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="Custos nao informados" detail="ITBI, registro, juridico, reforma, desocupacao e reserva podem ser preenchidos na aba Revisao." />
          )}
        </SectionCard>

        <SectionCard title="Aluguel e rentabilidade" eyebrow="renda" contentClassName="grid gap-2">
          <InfoValue label="Aluguel mensal" value={rental.monthlyRent ? formatCurrency(rental.monthlyRent) : "nao informado"} />
          <InfoValue label="Yield mercado" value={rental.monthlyRent ? `${percent(rental.monthlyYieldOnMarketPct)} a.m. / ${percent(rental.annualYieldOnMarketPct)} a.a.` : "nao calculado"} />
          <InfoValue label="Yield lance" value={rental.monthlyRent ? `${percent(rental.monthlyYieldOnBidPct)} a.m. / ${percent(rental.annualYieldOnBidPct)} a.a.` : "nao calculado"} />
          <InfoValue label="Referencia" value={rental.referenceFound ? "encontrada" : "pendente"} />
          {rental.notes ? <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-sm leading-6 text-[var(--admin-muted)]">{compactText(rental.notes)}</p> : null}
        </SectionCard>
      </div>
    </div>
  );
}

function ScenarioCard({
  scenario,
  totalInvestment,
}: {
  scenario: PropertyMarketAnalysis["scenarios"][number];
  totalInvestment: number;
}) {
  const possibleSale = scenario.marketValue;
  const profit = possibleSale - totalInvestment;
  const margin = totalInvestment ? (profit / totalInvestment) * 100 : 0;

  return (
    <article className="rounded-lg border border-[var(--admin-border)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">{scenario.label}</h3>
        <StatusBadge tone={profit > 0 ? "green" : "yellow"}>{percent(scenario.realDiscountPct)}</StatusBadge>
      </div>
      <div className="mt-4 grid gap-2">
        <InfoValue label="Investimento" value={formatCurrency(totalInvestment)} />
        <InfoValue label="Venda possivel" value={formatCurrency(possibleSale)} />
        <InfoValue label="Lucro" value={formatCurrency(profit)} />
        <InfoValue label="Margem" value={percent(margin)} />
        <InfoValue label="Prazo" value="validar com operacao" />
      </div>
      {scenario.notes ? <p className="mt-3 text-xs leading-5 text-[var(--admin-muted)]">{compactText(scenario.notes)}</p> : null}
    </article>
  );
}

function LegalTab({
  opportunity,
  analysis,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  const riskTone = opportunity.riskScore >= 70 ? "red" : opportunity.riskScore >= 45 ? "yellow" : "green";

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <SectionCard title="Resumo juridico" eyebrow="juridico" contentClassName="p-5">
        <div className="max-w-4xl space-y-4 text-sm leading-7 text-[var(--admin-soft)]">
          <div className={cn("rounded-lg border p-4", toneBorder[riskTone], toneBg[riskTone])}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-[var(--admin-foreground)]">Classificacao de risco</h3>
              <RiskBadge score={opportunity.riskScore} />
            </div>
            <p className="mt-2">{compactText(analysis?.legalSignal || opportunity.legalStatus)}</p>
          </div>
          <TextDisclosure label="Analise juridica completa" defaultOpen>
            {compactText(analysis?.legalSignal || opportunity.summary)}
          </TextDisclosure>
          {analysis?.cautionNotes ? (
            <TextDisclosure label="Ressalvas e recomendacoes">
              {compactText(analysis.cautionNotes)}
            </TextDisclosure>
          ) : null}
        </div>
      </SectionCard>

      <div className="grid content-start gap-4">
        <SectionCard title="Pontos de atencao" eyebrow="risco" contentClassName="grid gap-2">
          <InfoValue label="Ocupacao" value={opportunity.occupancy || "nao informado"} />
          <InfoValue label="Processo" value={extractProcess(analysis?.legalSignal || opportunity.summary)} />
          <InfoValue label="Matricula" value={extractRegistration(opportunity.summary, analysis?.legalSignal)} />
          <InfoValue label="Debitos" value={extractDebt(analysis?.legalSignal || analysis?.cautionNotes)} />
          <InfoValue label="Gravames" value={opportunity.legalStatus || "validar"} />
        </SectionCard>

        <SectionCard title="Fontes utilizadas" eyebrow="documentos" contentClassName="grid gap-2">
          {analysis?.sourceLinks.length ? (
            analysis.sourceLinks.map((source) => <SourceLink key={source.url} label={source.label} url={source.url} />)
          ) : (
            <EmptyState title="Fontes nao estruturadas" detail="As fontes aparecem aqui quando a analise tiver links de edital, referencia ou aluguel." />
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function extractProcess(text?: string) {
  const match = compactText(text, "").match(/processo\s*(?:n[ºo]\.?\s*)?([0-9.\-]+)/i);
  return match?.[1] || "nao informado";
}

function extractDebt(text?: string) {
  const cleaned = compactText(text, "");
  if (/debito|d[eé]bito|iptu|condominio|condom[íi]nio/i.test(cleaned)) return shortText(cleaned, 120);
  return "nao informado";
}

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <Link
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex min-h-10 items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-white px-3 text-sm font-semibold text-[var(--admin-foreground)] transition hover:border-[rgba(200,90,31,0.34)] hover:text-[var(--admin-cyan)]"
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight size={14} className="shrink-0" />
    </Link>
  );
}

function MarketTab({
  analysis,
  marketFilter,
  marketSort,
}: {
  analysis: PropertyMarketAnalysis | null;
  marketFilter?: string;
  marketSort?: string;
}) {
  if (!analysis) {
    return (
      <SectionCard title="Mercado" eyebrow="comparaveis">
        <EmptyState title="Sem comparaveis" detail="A analise de mercado ainda nao possui fontes estruturadas." icon={<BarChart3 size={18} />} />
      </SectionCard>
    );
  }

  const filter = marketFilter || "todos";
  const sort = marketSort || "similaridade";
  const filtered = analysis.comparables.filter((item) => {
    if (filter === "validos") return item.quality === "strong" || item.quality === "medium";
    if (filter === "invalidos") return item.quality === "weak" || item.quality === "discarded";
    if (filter === "venda") return item.listingType.toLowerCase().includes("venda") || item.askingPrice || item.soldPrice;
    if (filter === "aluguel") return item.listingType.toLowerCase().includes("aluguel");
    return true;
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sort === "preco") return (b.soldPrice || b.askingPrice) - (a.soldPrice || a.askingPrice);
    if (sort === "m2") return b.pricePerM2 - a.pricePerM2;
    if (sort === "distancia") return a.distanceKm - b.distanceKm;
    return b.similarityScore - a.similarityScore;
  });
  const prices = analysis.comparables
    .map((item) => item.soldPrice || item.askingPrice)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : 0;

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Comparaveis"
        eyebrow="mercado"
        action={
          <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
            <Link href={`${tabHref("revisao")}#comparavel-manual`}>Adicionar manual</Link>
          </Button>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex flex-wrap gap-2">
              {[
                ["todos", "Todos"],
                ["validos", "Validos"],
                ["invalidos", "Invalidos"],
                ["venda", "Venda"],
                ["aluguel", "Aluguel"],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  href={tabHref("mercado", { marketFilter: value, marketSort: sort })}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold",
                    filter === value
                      ? "border-[rgba(200,90,31,0.34)] bg-[rgba(200,90,31,0.1)] text-[var(--admin-cyan)]"
                      : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)]"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {[
                ["similaridade", "Similaridade"],
                ["preco", "Preco"],
                ["m2", "R$/m2"],
                ["distancia", "Distancia"],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  href={tabHref("mercado", { marketFilter: filter, marketSort: value })}
                  className={cn(
                    "inline-flex h-8 items-center rounded-lg border px-3 text-xs font-semibold",
                    sort === value
                      ? "border-[rgba(19,122,69,0.32)] bg-[rgba(19,122,69,0.08)] text-[var(--admin-green)]"
                      : "border-[var(--admin-border)] bg-white text-[var(--admin-muted)]"
                  )}
                >
                  {label}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <KpiCard label="Mediana" value={formatCurrency(median)} detail="referencia dos comparaveis" tone="cyan" />
            <KpiCard label="Base usada" value={formatCurrency(analysis.marketValueBase)} detail="valor final considerado" tone="green" />
            <KpiCard label="Aderencia" value={`${analysis.confidenceScore}%`} detail={`${analysis.comparables.length} fontes avaliadas`} tone={analysis.confidenceScore >= 65 ? "green" : "yellow"} />
          </div>

          <p className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] px-3 py-2 text-sm leading-6 text-[var(--admin-soft)]">
            A mediana ajuda a reduzir distorcoes de anuncios muito altos ou baixos. O valor final tambem considera similaridade, area, bairro, padrao do imovel e confianca das fontes.
          </p>

          <ComparableTable comparables={sorted} />
        </div>
      </SectionCard>
    </div>
  );
}

function ComparableTable({ comparables }: { comparables: PropertyMarketComparable[] }) {
  if (!comparables.length) {
    return <EmptyState title="Nenhum comparavel neste filtro" detail="Ajuste o filtro ou adicione um comparavel manual na aba Revisao." />;
  }

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border border-[var(--admin-border)] md:block">
        <table className="w-full border-collapse bg-white text-left text-sm">
          <thead className="bg-[var(--admin-card-2)] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
            <tr>
              <th className="px-3 py-3 font-semibold">Fonte</th>
              <th className="px-3 py-3 font-semibold">Valor</th>
              <th className="px-3 py-3 font-semibold">R$/m2</th>
              <th className="px-3 py-3 font-semibold">Distancia</th>
              <th className="px-3 py-3 font-semibold">Similaridade</th>
              <th className="px-3 py-3 font-semibold">Coleta</th>
              <th className="px-3 py-3 font-semibold">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--admin-border)]">
            {comparables.map((comparable) => (
              <tr key={comparable.id} className="align-top">
                <td className="max-w-[320px] px-3 py-3">
                  <div className="font-semibold text-[var(--admin-foreground)]">{comparable.sourceLabel}</div>
                  <div className="mt-1 text-xs text-[var(--admin-muted)]">
                    {[comparable.neighborhood, comparable.city, comparable.state].filter(Boolean).join(" / ") || comparable.address || "sem endereco"}
                  </div>
                  {comparable.notes ? <div className="mt-1 line-clamp-2 text-xs text-[var(--admin-muted)]">{comparable.notes}</div> : null}
                </td>
                <td className="px-3 py-3 font-mono font-semibold text-[var(--admin-foreground)]">
                  {formatCurrency(comparable.soldPrice || comparable.askingPrice)}
                  <div className="mt-1 text-[10px] font-normal text-[var(--admin-muted)]">{comparable.listingType}</div>
                </td>
                <td className="px-3 py-3 font-mono text-[var(--admin-foreground)]">{pricePerM2(comparable.pricePerM2)}</td>
                <td className="px-3 py-3 text-[var(--admin-muted)]">{comparable.distanceKm ? `${comparable.distanceKm} km` : "nao informado"}</td>
                <td className="px-3 py-3">
                  <ScoreBadge score={comparable.similarityScore} />
                  <div className="mt-1">
                    <StatusBadge tone={comparable.quality === "strong" ? "green" : comparable.quality === "medium" ? "yellow" : "red"}>
                      {comparable.quality}
                    </StatusBadge>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-[var(--admin-muted)]">{formatDateTime(comparable.collectedAt)}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-2">
                    {comparable.sourceUrl ? (
                      <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
                        <Link href={comparable.sourceUrl} target="_blank" rel="noreferrer">
                          Fonte
                          <ArrowUpRight size={13} />
                        </Link>
                      </Button>
                    ) : null}
                    <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
                      <Link href={`${tabHref("revisao")}#comparavel-manual`}>Ajustar</Link>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {comparables.map((comparable) => (
          <article key={comparable.id} className="rounded-lg border border-[var(--admin-border)] bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">{comparable.sourceLabel}</h3>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">{[comparable.city, comparable.state].filter(Boolean).join("/")}</p>
              </div>
              <ScoreBadge score={comparable.similarityScore} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <InfoValue label="Valor" value={formatCurrency(comparable.soldPrice || comparable.askingPrice)} />
              <InfoValue label="R$/m2" value={pricePerM2(comparable.pricePerM2)} />
              <InfoValue label="Distancia" value={comparable.distanceKm ? `${comparable.distanceKm} km` : "nao informado"} />
              <InfoValue label="Qualidade" value={comparable.quality} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {comparable.sourceUrl ? (
                <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
                  <Link href={comparable.sourceUrl} target="_blank" rel="noreferrer">
                    Fonte
                    <ArrowUpRight size={13} />
                  </Link>
                </Button>
              ) : null}
              <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
                <Link href={`${tabHref("revisao")}#comparavel-manual`}>Justificativa IA</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function PropertyTab({
  opportunity,
  analysis,
  images,
  heroImage,
  selectedImageIndex,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  images: PropertyImageAsset[];
  heroImage?: PropertyImageAsset;
  selectedImageIndex?: number;
}) {
  const subject = analysis?.subject;
  const payment = analysis?.paymentSimulation;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(420px,1.2fr)]">
      <Gallery
        images={images}
        heroImage={heroImage}
        selectedImageIndex={selectedImageIndex}
        title={opportunity.title}
        currentTab="imovel"
      />
      <div className="grid content-start gap-4">
        <SectionCard
          title="Cadastro do imovel"
          eyebrow="modo visualizacao"
          action={
            <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
              <Link href={`${tabHref("revisao")}#cadastro-imovel`}>
                <Pencil size={13} />
                Editar dados
              </Link>
            </Button>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <InfoValue label="Endereco" value={opportunity.address || subject?.address || "nao informado"} className="sm:col-span-2" />
            <InfoValue label="Cidade/UF" value={`${opportunity.city}/${opportunity.state}`} />
            <InfoValue label="Tipo" value={subject?.propertyType || opportunity.propertyType} />
            <InfoValue label="Area privativa" value={area(subject?.privateAreaM2 || 0)} />
            <InfoValue label="Area construida" value={area(subject?.builtAreaM2 || 0)} />
            <InfoValue label="Area terreno" value={area(subject?.landAreaM2 || 0)} />
            <InfoValue label="Quartos" value={subject?.bedrooms || "nao informado"} />
            <InfoValue label="Vagas" value={subject?.parkingSpaces || "nao informado"} />
            <InfoValue label="Conservacao" value="validar na revisao" />
            <InfoValue label="Ocupacao" value={opportunity.occupancy || "nao informado"} />
            <InfoValue label="Condominio" value="validar na revisao" />
            <InfoValue label="Coordenadas" value="nao informado" />
            <InfoValue label="Aluguel" value={analysis?.rentalEstimate.monthlyRent ? formatCurrency(analysis.rentalEstimate.monthlyRent) : "nao informado"} />
            <InfoValue label="Pagamento" value={paymentLabel(payment?.paymentMode)} />
          </div>
        </SectionCard>
        <SectionCard title="Observacoes" eyebrow="descricao">
          <div className="max-w-4xl space-y-3 text-sm leading-7 text-[var(--admin-soft)]">
            <p>{compactText(opportunity.summary)}</p>
            {subject?.notes ? <p>{compactText(subject.notes)}</p> : null}
            {analysis?.cautionNotes ? (
              <TextDisclosure label="Ressalvas operacionais">{compactText(analysis.cautionNotes)}</TextDisclosure>
            ) : null}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function DocumentsTab({
  opportunity,
  analysis,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  const sourceRows = analysis?.sourceLinks.map((source) => ({
    label: source.label,
    status: "disponivel",
    source: source.url,
    url: source.url,
  })) || [];
  const rows = [
    ...opportunity.documents.map((document) => ({
      label: document.label,
      status: document.status,
      source: document.source,
      url: "",
    })),
    ...sourceRows,
  ];

  return (
    <SectionCard title="Documentos" eyebrow="evidencias" contentClassName="p-0">
      {rows.length ? (
        <>
          <div className="hidden md:block">
            <table className="w-full border-collapse bg-white text-left text-sm">
              <thead className="bg-[var(--admin-card-2)] text-[10px] uppercase tracking-[0.14em] text-[var(--admin-muted)]">
                <tr>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Origem</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Responsavel</th>
                  <th className="px-4 py-3">Acoes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-border)]">
                {rows.map((document) => (
                  <tr key={`${document.label}-${document.source}`}>
                    <td className="px-4 py-3 text-[var(--admin-muted)]">documento</td>
                    <td className="px-4 py-3 font-semibold text-[var(--admin-foreground)]">{document.label}</td>
                    <td className="max-w-[260px] px-4 py-3 text-[var(--admin-muted)]">
                      <span className="line-clamp-1">{document.source}</span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={getStatusTone(document.status)}>{document.status}</StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-[var(--admin-muted)]">nao informado</td>
                    <td className="px-4 py-3 text-[var(--admin-muted)]">{opportunity.owner}</td>
                    <td className="px-4 py-3">
                      <DocumentActions url={document.url} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-3 md:hidden">
            {rows.map((document) => (
              <article key={`${document.label}-${document.source}`} className="rounded-lg border border-[var(--admin-border)] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-[var(--admin-foreground)]">{document.label}</h3>
                  <StatusBadge tone={getStatusTone(document.status)}>{document.status}</StatusBadge>
                </div>
                <p className="mt-2 text-xs text-[var(--admin-muted)]">{document.source}</p>
                <div className="mt-3">
                  <DocumentActions url={document.url} />
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="p-4">
          <EmptyState title="Nenhum documento cadastrado" detail="Quando edital, matricula ou fontes forem anexados, eles aparecem nesta tabela." />
        </div>
      )}
    </SectionCard>
  );
}

function DocumentActions({ url }: { url?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {url ? (
        <Button asChild variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
          <Link href={url} target="_blank" rel="noreferrer">
            Visualizar
            <ArrowUpRight size={13} />
          </Link>
        </Button>
      ) : (
        <Button disabled type="button" variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
          Visualizar
        </Button>
      )}
      <Button disabled type="button" variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
        <Download size={13} />
        Baixar
      </Button>
      <Button disabled type="button" variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
        <UploadCloud size={13} />
        Substituir
      </Button>
      <Button disabled type="button" variant="outline" className="h-8 border-[var(--admin-border)] bg-white text-[var(--admin-foreground)]">
        <RefreshCcw size={13} />
        Reprocessar
      </Button>
    </div>
  );
}

function ReviewTab({
  opportunity,
  analysis,
  qualificationDossier,
  qualificationReason,
  reason,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
  qualificationDossier?: PropertyQualificationDossier | null;
  qualificationReason?: string;
  reason?: string;
}) {
  if (!analysis) {
    return (
      <SectionCard title="Revisao" eyebrow="curadoria">
        <EmptyState title="Nada para revisar ainda" detail="A analise precisa existir antes da revisao humana." icon={<ListChecks size={18} />} />
      </SectionCard>
    );
  }

  const review = reviewedFieldsCount(opportunity, analysis);
  const subject = analysis.subject;
  const rental = analysis.rentalEstimate;
  const payment = analysis.paymentSimulation;
  const costs = new Map(analysis.estimatedCosts.map((item) => [item.label.toLowerCase(), item.value]));
  const issues = getReviewIssues(opportunity, analysis);

  return (
    <div className="grid gap-4">
      <SectionCard
        title="Revisao operacional"
        eyebrow="curadoria humana"
        action={<StatusBadge tone={issues.length ? "yellow" : "green"}>{review.done} de {review.total}</StatusBadge>}
      >
        <input name="opportunityCode" type="hidden" value={analysis.opportunityCode || opportunity.id} />
        <div className="grid gap-4">
          <div className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card-2)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-[var(--admin-foreground)]">Campos que pedem cuidado</h3>
                <p className="mt-1 text-sm text-[var(--admin-muted)]">
                  {issues.length ? issues.join(", ") : "Campos essenciais preenchidos. Revise o parecer antes da decisao."}
                </p>
              </div>
              <div className="min-w-52">
                <div className="h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-[var(--admin-cyan)]" style={{ width: `${Math.round((review.done / review.total) * 100)}%` }} />
                </div>
                <p className="mt-1 text-right text-xs text-[var(--admin-muted)]">{Math.round((review.done / review.total) * 100)}% revisado</p>
              </div>
            </div>
          </div>

          {reason ? <p className="rounded-lg border border-[var(--admin-border)] bg-white px-3 py-2 text-sm text-[var(--admin-muted)]">{reason}</p> : null}

          <ReviewAccordion title="1. Cadastro do imovel" id="cadastro-imovel" defaultOpen>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Privativa m2" name="privateAreaM2" defaultValue={numberValue(subject.privateAreaM2)} />
              <Field label="Terreno m2" name="landAreaM2" defaultValue={numberValue(subject.landAreaM2)} />
              <Field label="Construida m2" name="builtAreaM2" defaultValue={numberValue(subject.builtAreaM2)} />
              <Field label="Dormitorios" name="bedrooms" defaultValue={numberValue(subject.bedrooms)} />
              <Field label="Garagens" name="parkingSpaces" defaultValue={numberValue(subject.parkingSpaces)} />
              <Field label="Analista" name="analystName" defaultValue={analysis.analystName} />
            </div>
            <TextField label="Resumo" name="summary" defaultValue={analysis.summary} />
          </ReviewAccordion>

          <ReviewAccordion title="2. Valores financeiros" id="valores-financeiros">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Mercado conservador" name="marketValueLow" defaultValue={numberValue(analysis.marketValueLow)} />
              <Field label="Mercado base" name="marketValueBase" defaultValue={numberValue(analysis.marketValueBase)} />
              <Field label="Mercado otimista" name="marketValueHigh" defaultValue={numberValue(analysis.marketValueHigh)} />
              <Field label="Liquidez" name="liquidityScore" defaultValue={analysis.liquidityScore || 60} />
              <Field label="Confianca" name="confidenceScore" defaultValue={analysis.confidenceScore || 50} />
              <Field label="Pagamento" name="paymentCondition" defaultValue={analysis.paymentCondition} />
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="ITBI" name="costItbi" defaultValue={numberValue(costs.get("itbi") || 0)} />
              <Field label="Registro" name="costRegistry" defaultValue={numberValue(costs.get("registro") || 0)} />
              <Field label="Comissao" name="costCommission" defaultValue={numberValue(costs.get("comissao leiloeiro") || 0)} />
              <Field label="Juridico" name="costLegal" defaultValue={numberValue(costs.get("juridico") || 0)} />
              <Field label="Condominio/IPTU" name="costCondoIptu" defaultValue={numberValue(costs.get("condominio/iptu") || 0)} />
              <Field label="Reforma" name="costReform" defaultValue={numberValue(costs.get("reforma") || 0)} />
              <Field label="Desocupacao" name="costVacancy" defaultValue={numberValue(costs.get("desocupacao") || 0)} />
              <Field label="Reserva" name="costReserve" defaultValue={numberValue(costs.get("reserva") || 0)} />
            </div>
          </ReviewAccordion>

          <ReviewAccordion title="3. Ocupacao e desocupacao" id="ocupacao-desocupacao">
            <TextField label="Ressalvas operacionais" name="cautionNotes" defaultValue={analysis.cautionNotes} />
            <TextField label="Motivo da decisao" name="decisionReason" defaultValue={analysis.decisionReason} />
          </ReviewAccordion>

          <ReviewAccordion title="4. Informacoes juridicas" id="juridico-revisao">
            <TextField label="Juridico" name="legalSignal" defaultValue={analysis.legalSignal} />
          </ReviewAccordion>

          <ReviewAccordion title="5. Comparaveis" id="comparavel-manual">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Fonte" name="comparableSourceLabel" placeholder="Chaves na Mao" />
              <Field label="URL" name="comparableSourceUrl" />
              <Field label="Tipo" name="comparablePropertyType" defaultValue={analysis.subject.propertyType} />
              <Field label="Endereco" name="comparableAddress" />
              <Field label="Bairro" name="comparableNeighborhood" />
              <Field label="Cidade" name="comparableCity" defaultValue={analysis.subject.city} />
              <Field label="UF" name="comparableState" defaultValue={analysis.subject.state} />
              <Field label="Area m2" name="comparableAreaM2" />
              <Field label="Preco pedido" name="comparableAskingPrice" />
              <Field label="Preco vendido" name="comparableSoldPrice" />
              <Field label="Distancia km" name="comparableDistanceKm" />
              <Field label="Similaridade" name="comparableSimilarityScore" defaultValue={60} />
              <SelectField
                label="Qualidade"
                name="comparableQuality"
                defaultValue="medium"
                options={[
                  { value: "strong", label: "Forte" },
                  { value: "medium", label: "Media" },
                  { value: "weak", label: "Fraca" },
                  { value: "discarded", label: "Descartada" },
                ]}
              />
            </div>
            <TextField label="Notas do comparavel" name="comparableNotes" />
          </ReviewAccordion>

          <ReviewAccordion title="6. Parecer final" id="parecer-final">
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="Status"
                name="status"
                defaultValue={analysis.status}
                options={[
                  { value: "human_review", label: "Revisao humana" },
                  { value: "approved", label: "Aprovada" },
                  { value: "approved_with_notes", label: "Aprovada com ressalvas" },
                  { value: "rejected", label: "Reprovada" },
                  { value: "insufficient_data", label: "Dados insuficientes" },
                ]}
              />
              <SelectField
                label="Decisao"
                name="decision"
                defaultValue={analysis.decision}
                options={[
                  { value: "excellent", label: "Excelente" },
                  { value: "good", label: "Boa" },
                  { value: "caution", label: "Cautela" },
                  { value: "review", label: "Revisar" },
                  { value: "reject", label: "Descartar" },
                ]}
              />
              <Field label="Link leilao" name="auctionUrl" defaultValue={sourceUrlFor(analysis, ["leilao"])} />
              <Field label="Referencia" name="referenceUrl" defaultValue={sourceUrlFor(analysis, ["referencia"])} />
            </div>
          </ReviewAccordion>

          <ReviewAccordion title="Aluguel, pagamento e parcelamento" id="aluguel-pagamento">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Aluguel mensal" name="monthlyRent" defaultValue={numberValue(rental.monthlyRent)} />
              <Field label="Referencia aluguel" name="rentReferenceUrl" defaultValue={rental.referenceUrl} />
              <CheckboxField label="Referencia de aluguel encontrada" name="rentReferenceFound" defaultChecked={rental.referenceFound} />
              <CheckboxField label="Valor de aluguel conhecido" name="rentValueKnown" defaultChecked={rental.valueKnown} />
            </div>
            <TextField label="Notas de aluguel" name="rentNotes" defaultValue={rental.notes} />
            <div className="grid gap-3 md:grid-cols-3">
              <SelectField
                label="Modo"
                name="paymentMode"
                defaultValue={payment.paymentMode || "a_vista"}
                options={[
                  { value: "a_vista", label: "A vista" },
                  { value: "parcelado", label: "Parcelado" },
                  { value: "financiamento_edital", label: "Financiamento edital" },
                  { value: "validar_edital", label: "Validar edital" },
                ]}
              />
              <Field label="Entrada %" name="downPaymentPct" defaultValue={numberValue(payment.downPaymentPct)} />
              <Field label="Entrada R$" name="downPaymentAmount" defaultValue={numberValue(payment.downPaymentAmount)} />
              <Field label="Saldo R$" name="installmentBalance" defaultValue={numberValue(payment.installmentBalance)} />
              <Field label="Parcelas" name="installmentCount" defaultValue={numberValue(payment.installmentCount)} />
              <Field label="Valor parcela" name="installmentAmount" defaultValue={numberValue(payment.installmentAmount)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <TextField label="Regra de correcao" name="installmentCorrectionRule" defaultValue={payment.correctionRule} />
              <TextField label="Alerta de correcao" name="installmentCorrectionWarning" defaultValue={payment.correctionWarning} />
            </div>
          </ReviewAccordion>
        </div>
      </SectionCard>

      <QualificationDossierPanel
        opportunity={opportunity}
        dossier={qualificationDossier}
        reason={qualificationReason}
      />

      <div className="sticky bottom-3 z-20 rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.96)] p-3 shadow-lg shadow-[rgba(81,60,36,0.12)] backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--admin-foreground)]">Alteracoes nao salvas ficam pendentes ate clicar em Salvar revisao.</p>
            <p className="text-xs text-[var(--admin-muted)]">Use os botoes de decisao no cabecalho fixo para salvar, aprovar ou reprovar.</p>
          </div>
          <Button asChild className="h-9 bg-[var(--admin-cyan)] text-white hover:bg-[#a54a18]">
            <a href="#topo-oportunidade">Voltar ao cabecalho</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewAccordion({
  id,
  title,
  children,
  defaultOpen = false,
}: {
  id: string;
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      id={id}
      className="group scroll-mt-36 overflow-hidden rounded-lg border border-[var(--admin-border)] bg-white"
      open={defaultOpen}
    >
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 px-4 text-sm font-semibold text-[var(--admin-foreground)]">
        {title}
        <ChevronDown size={16} className="text-[var(--admin-muted)] transition group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 border-t border-[var(--admin-border)] p-4">{children}</div>
    </details>
  );
}

function HistoryTab({
  opportunity,
}: {
  opportunity: AuctionOpportunity;
  analysis: PropertyMarketAnalysis | null;
}) {
  return (
    <SectionCard title="Historico" eyebrow="timeline">
      <div className="grid gap-3">
        {opportunity.timeline.length ? (
          opportunity.timeline.map((item, index) => (
            <div key={`${item.time}-${index}`} className="grid gap-3 rounded-lg border border-[var(--admin-border)] bg-white p-3 md:grid-cols-[10rem_minmax(0,1fr)_10rem] md:items-start">
              <div>
                <p className="font-mono text-xs font-semibold text-[var(--admin-foreground)]">{item.time}</p>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">evento #{index + 1}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--admin-foreground)]">{item.action}</p>
                <p className="mt-1 text-xs text-[var(--admin-muted)]">Responsavel: {item.actor}</p>
              </div>
              <StatusBadge tone={item.tone}>{item.tone}</StatusBadge>
            </div>
          ))
        ) : (
          <EmptyState title="Sem eventos" detail="A linha do tempo sera preenchida conforme a oportunidade avancar." />
        )}
      </div>
    </SectionCard>
  );
}

export function OpportunityDetailCenter({
  opportunity,
  analysis,
  qualificationDossier,
  reason,
  qualificationReason,
  activeTab,
  marketFilter,
  marketSort,
  selectedPhoto,
}: OpportunityDetailCenterProps) {
  const tab = normalizeTab(activeTab);
  const images = (opportunity.images || []).filter((image) => image.status !== "failed");
  const requestedImageIndex = normalizePhotoIndex(selectedPhoto, images.length);
  const defaultImageIndex = images.findIndex((image) => image.status === "mirrored");
  const selectedImageIndex =
    requestedImageIndex >= 0 ? requestedImageIndex : defaultImageIndex >= 0 ? defaultImageIndex : images.length ? 0 : -1;
  const heroImage = selectedImageIndex >= 0 ? images[selectedImageIndex] : undefined;
  const body = (
    <div id="topo-oportunidade" className="mx-auto grid max-w-[1600px] gap-4 px-3 py-3 lg:px-5">
      <div>
        <OpportunityHeader opportunity={opportunity} analysis={analysis} />
        <OpportunityTabs activeTab={tab} />
      </div>

      <TabContent
        activeTab={tab}
        opportunity={opportunity}
        analysis={analysis}
        qualificationDossier={qualificationDossier}
        qualificationReason={qualificationReason}
        reason={reason}
        images={images}
        heroImage={heroImage}
        selectedImageIndex={selectedImageIndex >= 0 ? selectedImageIndex : undefined}
        marketFilter={marketFilter}
        marketSort={marketSort}
      />
    </div>
  );

  if (!analysis && !qualificationDossier) return body;

  return (
    <form action={savePropertyMarketAnalysisAction} className="contents">
      {analysis && tab !== "revisao" ? <HiddenReviewFields opportunity={opportunity} analysis={analysis} /> : null}
      {body}
    </form>
  );
}
