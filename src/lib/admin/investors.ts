import {
  auctionOpportunities,
  formatCurrency,
  type AuctionOpportunity,
  type ModuleResource,
  type ResourceCell,
  type ResourceColumn,
  type ResourceRow,
  type ResourceTone,
} from "./resources";

export type RiskAppetite = "conservador" | "moderado" | "arrojado";

export type InvestorProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  cityFocus: string[];
  maxBudget: number;
  targetRoiPct: number;
  riskAppetite: RiskAppetite;
  preferredPropertyTypes: string[];
  status: string;
  planKey: string;
  lifecycleStage: string;
  whatsappOptIn: boolean;
  emailOptIn: boolean;
  pushOptIn: boolean;
  communityOptIn: boolean;
  communicationFrequency: string;
  fullAccessUntil: string;
  notes: string;
  owner: string;
};

export type InvestorOpportunityMatch = {
  id: string;
  investorId: string;
  opportunityId: string;
  matchScore: number;
  reasons: string[];
  action: string;
  opportunity: AuctionOpportunity;
};

export const investorProfiles: InvestorProfile[] = [
  {
    id: "INV-001",
    name: "Fundo Litoral SC",
    email: "origem@fundolitoralsc.com",
    phone: "+55 47 99999-0101",
    organization: "Fundo parceiro",
    cityFocus: ["Balneario Camboriu", "Itajai", "Porto Belo"],
    maxBudget: 900000,
    targetRoiPct: 18,
    riskAppetite: "moderado",
    preferredPropertyTypes: ["Apartamento", "Terreno"],
    status: "Ativo",
    planKey: "premium",
    lifecycleStage: "client",
    whatsappOptIn: true,
    emailOptIn: true,
    pushOptIn: true,
    communityOptIn: false,
    communicationFrequency: "normal",
    fullAccessUntil: "",
    notes: "Busca ativos com liquidez forte no litoral, preferindo dossies com parecer juridico encaminhado.",
    owner: "Comercial",
  },
  {
    id: "INV-002",
    name: "Investidor Conservador SP",
    email: "contato@conservadorsp.com",
    phone: "+55 11 98888-0202",
    organization: "Cliente piloto",
    cityFocus: ["Sao Paulo"],
    maxBudget: 400000,
    targetRoiPct: 15,
    riskAppetite: "conservador",
    preferredPropertyTypes: ["Apartamento"],
    status: "Piloto",
    planKey: "pilot",
    lifecycleStage: "client",
    whatsappOptIn: true,
    emailOptIn: true,
    pushOptIn: false,
    communityOptIn: false,
    communicationFrequency: "low",
    fullAccessUntil: "",
    notes: "Perfil sensivel a risco de ocupacao; so deve receber oportunidades com parecer juridico favoravel.",
    owner: "Relacionamento",
  },
  {
    id: "INV-003",
    name: "Mesa Oportunista Sul",
    email: "mesa@suloportunista.com",
    phone: "+55 41 97777-0303",
    organization: "Mesa proprietaria",
    cityFocus: ["Curitiba", "Florianopolis", "Itajai"],
    maxBudget: 650000,
    targetRoiPct: 24,
    riskAppetite: "arrojado",
    preferredPropertyTypes: ["Casa", "Comercial", "Terreno"],
    status: "Ativo",
    planKey: "pro",
    lifecycleStage: "client",
    whatsappOptIn: true,
    emailOptIn: true,
    pushOptIn: true,
    communityOptIn: false,
    communicationFrequency: "normal",
    fullAccessUntil: "",
    notes: "Aceita risco controlado quando o desconto compensa e o prazo permite diligencia rapida.",
    owner: "Mesa",
  },
];

const investorColumns: ResourceColumn[] = [
  { key: "investor", label: "Investidor" },
  { key: "organization", label: "Organizacao" },
  { key: "focus", label: "Foco" },
  { key: "budget", label: "Teto", align: "right" },
  { key: "roi", label: "ROI alvo", align: "right" },
  { key: "plan", label: "Plano" },
  { key: "risk", label: "Perfil risco" },
  { key: "status", label: "Status" },
  { key: "nextAction", label: "Proxima acao" },
];

const riskLimitByAppetite: Record<RiskAppetite, number> = {
  conservador: 45,
  moderado: 65,
  arrojado: 80,
};

export function riskAppetiteLabel(value: RiskAppetite) {
  const labels: Record<RiskAppetite, string> = {
    conservador: "Conservador",
    moderado: "Moderado",
    arrojado: "Arrojado",
  };
  return labels[value];
}

export function normalizeRiskAppetite(value: string): RiskAppetite {
  const normalized = normalizeText(value);
  if (normalized.includes("arroj")) return "arrojado";
  if (normalized.includes("conserv")) return "conservador";
  return "moderado";
}

export function getMockInvestorById(id: string) {
  return investorProfiles.find((item) => item.id.toLowerCase() === id.toLowerCase());
}

export function createInvestorsResource(items: InvestorProfile[]): ModuleResource {
  const active = items.filter((item) => ["ativo", "piloto"].includes(normalizeText(item.status))).length;
  const averageBudget =
    items.length > 0
      ? Math.round(items.reduce((total, item) => total + item.maxBudget, 0) / items.length)
      : 0;
  const conservative = items.filter((item) => item.riskAppetite === "conservador").length;

  return {
    slug: "investidores",
    title: "CRM de investidores",
    eyebrow: "perfil / capital / matching",
    description: "Perfis de investidores com tese, teto, apetite de risco e proximas oportunidades compativeis.",
    kind: "table",
    summary: [
      { label: "Perfis ativos", value: String(active), detail: "aptos para matching", tone: "green" },
      { label: "Teto medio", value: formatCurrency(averageBudget), detail: "capital informado", tone: "cyan" },
      { label: "Conservadores", value: String(conservative), detail: "exigem risco baixo", tone: "yellow" },
    ],
    columns: investorColumns,
    rows: items.map(investorToResourceRow),
  };
}

export function buildInvestorMatches(
  investor: InvestorProfile,
  opportunities: AuctionOpportunity[] = auctionOpportunities
): InvestorOpportunityMatch[] {
  return opportunities
    .map((opportunity) => scoreOpportunityForInvestor(investor, opportunity))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}

function investorToResourceRow(item: InvestorProfile): ResourceRow {
  const focus = item.cityFocus.slice(0, 3).join(", ") || "Sem foco";
  const propertyTypes = item.preferredPropertyTypes.slice(0, 2).join(", ") || "Todos";

  return {
    id: item.id,
    cells: [
      textCell(item.name, false, `/admin/investidores/${item.id}`),
      textCell(item.organization || "Sem organizacao"),
      textCell(focus),
      { label: formatCurrency(item.maxBudget), kind: "money" },
      textCell(`${item.targetRoiPct}%`, false),
      statusCell(item.planKey.toUpperCase(), planTone(item.planKey)),
      statusCell(riskAppetiteLabel(item.riskAppetite), riskTone(item.riskAppetite)),
      statusCell(item.status),
      textCell(`Matching: ${propertyTypes}`),
    ],
  };
}

function scoreOpportunityForInvestor(
  investor: InvestorProfile,
  opportunity: AuctionOpportunity
): InvestorOpportunityMatch {
  const reasons: string[] = [];
  const cityMatch = investor.cityFocus.some((city) => normalizeText(city) === normalizeText(opportunity.city));
  const propertyMatch =
    investor.preferredPropertyTypes.length === 0 ||
    investor.preferredPropertyTypes.some((type) => normalizeText(type) === normalizeText(opportunity.propertyType));
  const budgetGap = investor.maxBudget - opportunity.initialBid;
  const riskLimit = riskLimitByAppetite[investor.riskAppetite];

  const budgetScore = budgetGap >= 0 ? 25 : Math.max(0, 25 - Math.abs(budgetGap / investor.maxBudget) * 45);
  const cityScore = cityMatch ? 20 : 8;
  const propertyScore = propertyMatch ? 15 : 5;
  const roiScore =
    opportunity.discountPct >= investor.targetRoiPct
      ? 20
      : Math.max(0, (opportunity.discountPct / Math.max(investor.targetRoiPct, 1)) * 20);
  const riskScore =
    opportunity.riskScore <= riskLimit
      ? 20
      : Math.max(0, 20 - (opportunity.riskScore - riskLimit) * 0.8);

  if (cityMatch) reasons.push("Praca prioritaria do investidor");
  if (propertyMatch) reasons.push("Tipo de imovel aderente a tese");
  if (budgetGap >= 0) reasons.push("Lance inicial dentro do teto informado");
  if (opportunity.discountPct >= investor.targetRoiPct) reasons.push("Desconto supera ROI alvo");
  if (opportunity.riskScore <= riskLimit) reasons.push("Risco dentro do apetite declarado");
  if (reasons.length < 3) reasons.push("Exige validacao comercial antes do envio");

  const matchScore = Math.round(budgetScore + cityScore + propertyScore + roiScore + riskScore);
  const action =
    matchScore >= 85
      ? "Preparar dossie e mensagem de oferta assistida"
      : opportunity.riskScore > riskLimit
        ? "Validar ressalvas juridicas antes do contato"
        : "Enviar pre-analise para aprovacao comercial";

  return {
    id: `${investor.id}-${opportunity.id}`,
    investorId: investor.id,
    opportunityId: opportunity.id,
    matchScore,
    reasons,
    action,
    opportunity,
  };
}

function textCell(label: string | number, muted = false, href?: string): ResourceCell {
  return { label, kind: "text", muted, href };
}

function statusCell(label: string, tone?: ResourceTone): ResourceCell {
  return { label, kind: "status", tone };
}

function riskTone(value: RiskAppetite): ResourceTone {
  if (value === "conservador") return "green";
  if (value === "arrojado") return "purple";
  return "cyan";
}

function planTone(value: string): ResourceTone {
  const normalized = normalizeText(value);
  if (["premium", "pro", "enterprise"].includes(normalized)) return "cyan";
  if (["pilot", "piloto", "trial"].includes(normalized)) return "purple";
  return "yellow";
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
