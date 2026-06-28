export type MetricTone = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

export type Metric = {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone: MetricTone;
};

export type OpportunityRow = {
  id?: string;
  property: string;
  location: string;
  source: string;
  initialBid: string;
  discount: string;
  opportunityScore: number;
  riskScore: number;
  aiStatus: string;
  legalStatus: string;
  nextAction: string;
};

export const dashboardMetrics: Metric[] = [
  {
    label: "Imoveis monitorados",
    value: "142",
    detail: "fontes homologadas e importacoes",
    trend: "+18 esta semana",
    tone: "cyan",
  },
  {
    label: "Novos imoveis hoje",
    value: "14",
    detail: "captados nas ultimas 24h",
    trend: "+8.2%",
    tone: "green",
  },
  {
    label: "Em analise pela IA",
    value: "31",
    detail: "normalizacao, score e riscos",
    trend: "18 pendentes",
    tone: "purple",
  },
  {
    label: "Aguardando advogado",
    value: "19",
    detail: "parecer humano obrigatorio",
    trend: "SLA 42h",
    tone: "yellow",
  },
  {
    label: "Riscos criticos",
    value: "7",
    detail: "bloqueios ativos",
    trend: "+2 hoje",
    tone: "red",
  },
  {
    label: "Aprovados",
    value: "28",
    detail: "curadoria com ressalvas ou livre",
    trend: "94.2% QA",
    tone: "green",
  },
];

export const monthlyAnalyses = [
  { label: "Jan", value: 36 },
  { label: "Fev", value: 48 },
  { label: "Mar", value: 42 },
  { label: "Abr", value: 61 },
  { label: "Mai", value: 68 },
  { label: "Jun", value: 57 },
  { label: "Jul", value: 84 },
  { label: "Ago", value: 118 },
  { label: "Set", value: 93 },
  { label: "Out", value: 64 },
  { label: "Nov", value: 39 },
  { label: "Dez", value: 72 },
];

export const statusDistribution = [
  { label: "Curadoria IA", value: 31, tone: "purple" as MetricTone },
  { label: "Revisao juridica", value: 19, tone: "yellow" as MetricTone },
  { label: "Aprovados", value: 28, tone: "green" as MetricTone },
  { label: "Descartados", value: 12, tone: "red" as MetricTone },
];

export const apiCosts = [
  { label: "IA", value: "R$ 184", detail: "Gemini/OpenAI futuro" },
  { label: "Big Data", value: "R$ 0", detail: "adapter mock" },
  { label: "Storage", value: "R$ 21", detail: "R2 docs e imagens" },
];

export const activityLog = [
  {
    time: "12:08",
    actor: "AI Curator",
    action: "gerou analise preliminar para BC-204",
    tone: "purple" as MetricTone,
  },
  {
    time: "11:44",
    actor: "Juridico",
    action: "aprovou SP-118 com ressalvas",
    tone: "green" as MetricTone,
  },
  {
    time: "11:17",
    actor: "Fonte",
    action: "detectou divergencia de data em edital",
    tone: "yellow" as MetricTone,
  },
  {
    time: "10:52",
    actor: "Compliance",
    action: "bloqueou recomendacao conclusiva de risco",
    tone: "red" as MetricTone,
  },
  {
    time: "10:09",
    actor: "Watchdog",
    action: "priorizou 7 oportunidades com leilao proximo",
    tone: "cyan" as MetricTone,
  },
];

export const latestOpportunities: OpportunityRow[] = [
  {
    id: "BC-204",
    property: "Apartamento frente mar",
    location: "Balneario Camboriu/SC",
    source: "Leiloeiro homologado",
    initialBid: "R$ 680.000",
    discount: "42%",
    opportunityScore: 91,
    riskScore: 24,
    aiStatus: "Analisado",
    legalStatus: "Aguardando",
    nextAction: "Revisar matricula",
  },
  {
    id: "ITJ-088",
    property: "Casa ocupada",
    location: "Itajai/SC",
    source: "Portal banco",
    initialBid: "R$ 420.000",
    discount: "35%",
    opportunityScore: 72,
    riskScore: 78,
    aiStatus: "Requer humano",
    legalStatus: "Risco alto",
    nextAction: "Validar ocupacao",
  },
  {
    id: "PB-311",
    property: "Terreno urbano",
    location: "Porto Belo/SC",
    source: "Importacao manual",
    initialBid: "R$ 310.000",
    discount: "29%",
    opportunityScore: 84,
    riskScore: 37,
    aiStatus: "Analisado",
    legalStatus: "Com ressalvas",
    nextAction: "Gerar dossie",
  },
  {
    id: "FLN-144",
    property: "Sala comercial",
    location: "Florianopolis/SC",
    source: "Leiloeiro regional",
    initialBid: "R$ 198.000",
    discount: "22%",
    opportunityScore: 68,
    riskScore: 45,
    aiStatus: "Fila IA",
    legalStatus: "Pendente",
    nextAction: "Extrair edital",
  },
  {
    id: "SP-118",
    property: "Apartamento compacto",
    location: "Sao Paulo/SP",
    source: "Portal banco",
    initialBid: "R$ 255.000",
    discount: "31%",
    opportunityScore: 79,
    riskScore: 52,
    aiStatus: "Analisado",
    legalStatus: "Aprovado",
    nextAction: "Matching investidor",
  },
  {
    id: "CWB-072",
    property: "Casa terrea",
    location: "Curitiba/PR",
    source: "Tribunal",
    initialBid: "R$ 365.000",
    discount: "26%",
    opportunityScore: 74,
    riskScore: 61,
    aiStatus: "Divergencia",
    legalStatus: "Aguardando",
    nextAction: "Comparar processo",
  },
];
