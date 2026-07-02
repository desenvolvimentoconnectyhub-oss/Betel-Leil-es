export type ResourceTone = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

export type PropertyImageAsset = {
  url: string;
  sourceUrl: string;
  storageKey?: string;
  status?: "mirrored" | "external" | "failed" | string;
  contentType?: string;
  sizeBytes?: number;
  alt?: string;
  error?: string;
  collectedAt?: string;
};

export type AuctionOpportunity = {
  id: string;
  title: string;
  propertyType: string;
  address: string;
  city: string;
  state: string;
  sourceName: string;
  sourceType: string;
  initialBid: number;
  appraisalValue: number;
  discountPct: number;
  opportunityScore: number;
  riskScore: number;
  complianceScore: number;
  aiStatus: string;
  legalStatus: string;
  stage: string;
  nextAction: string;
  owner: string;
  auctionDate: string;
  occupancy: string;
  summary: string;
  financialSummary: Array<{ label: string; value: string; detail: string }>;
  riskFlags: Array<{ label: string; severity: ResourceTone; detail: string }>;
  checklist: Array<{ label: string; status: string; owner: string }>;
  documents: Array<{ label: string; status: string; source: string }>;
  timeline: Array<{ time: string; actor: string; action: string; tone: ResourceTone }>;
  images?: PropertyImageAsset[];
};

export type ResourceCell = {
  label: string | number;
  kind?: "text" | "money" | "score" | "risk" | "status" | "date";
  tone?: ResourceTone;
  href?: string;
  muted?: boolean;
};

export type ResourceColumn = {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
};

export type ResourceRow = {
  id: string;
  cells: ResourceCell[];
};

export type ResourceSummary = {
  label: string;
  value: string;
  detail: string;
  tone: ResourceTone;
};

export type KanbanCard = {
  id: string;
  title: string;
  meta: string;
  owner: string;
  due: string;
  opportunityScore: number;
  riskScore: number;
  href?: string;
};

export type KanbanColumn = {
  title: string;
  tone: ResourceTone;
  cards: KanbanCard[];
};

export type ModuleResource = {
  slug: string;
  title: string;
  eyebrow: string;
  description: string;
  summary: ResourceSummary[];
  kind: "table" | "kanban";
  columns?: ResourceColumn[];
  rows?: ResourceRow[];
  kanbanColumns?: KanbanColumn[];
};

export const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

export function formatDate(value: string) {
  return dateFormatter.format(new Date(`${value}T12:00:00`));
}

export const auctionOpportunities: AuctionOpportunity[] = [
  {
    id: "BC-204",
    title: "Apartamento frente mar",
    propertyType: "Apartamento",
    address: "Av. Atlantica, Barra Sul",
    city: "Balneario Camboriu",
    state: "SC",
    sourceName: "Leiloeiro homologado",
    sourceType: "Leiloeiro",
    initialBid: 680000,
    appraisalValue: 1170000,
    discountPct: 42,
    opportunityScore: 91,
    riskScore: 24,
    complianceScore: 88,
    aiStatus: "Analisado",
    legalStatus: "Aguardando",
    stage: "Revisao juridica",
    nextAction: "Revisar matricula",
    owner: "Dra. Helena",
    auctionDate: "2026-06-27",
    occupancy: "Nao informado",
    summary:
      "Ativo com desconto relevante, liquidez regional alta e risco documental baixo ate a revisao humana da matricula.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 680.000", detail: "Base do edital" },
      { label: "Valor estimado", value: "R$ 1.170.000", detail: "Referencia de mercado" },
      { label: "Teto sugerido", value: "R$ 742.000", detail: "Antes de custos e diligencia" },
    ],
    riskFlags: [
      { label: "Matricula pendente", severity: "yellow", detail: "Documento precisa de conferencia humana" },
      { label: "Ocupacao ausente", severity: "yellow", detail: "Edital nao informa ocupacao com clareza" },
      { label: "Liquidez forte", severity: "green", detail: "Regiao com demanda superior a media" },
    ],
    checklist: [
      { label: "Edital extraido", status: "Concluido", owner: "Curadoria IA" },
      { label: "Matricula conferida", status: "Pendente", owner: "Juridico" },
      { label: "Debitos estimados", status: "Em analise", owner: "Compliance" },
      { label: "Dossie final", status: "Bloqueado", owner: "Sistema" },
    ],
    documents: [
      { label: "Edital oficial", status: "Anexado", source: "Fonte oficial" },
      { label: "Matricula", status: "Solicitado", source: "Cartorio" },
      { label: "Laudo de mercado", status: "Rascunho", source: "Big Data mock" },
    ],
    timeline: [
      { time: "12:08", actor: "AI Curator", action: "Gerou score 91 e resumo preliminar", tone: "purple" },
      { time: "11:51", actor: "Fonte", action: "Confirmou data do leilao para 27/06", tone: "cyan" },
      { time: "11:44", actor: "Juridico", action: "Recebeu solicitacao de matricula", tone: "yellow" },
    ],
  },
  {
    id: "ITJ-088",
    title: "Casa ocupada",
    propertyType: "Casa",
    address: "Rua Blumenau, Sao Vicente",
    city: "Itajai",
    state: "SC",
    sourceName: "Portal banco",
    sourceType: "Banco",
    initialBid: 420000,
    appraisalValue: 646000,
    discountPct: 35,
    opportunityScore: 72,
    riskScore: 78,
    complianceScore: 61,
    aiStatus: "Requer humano",
    legalStatus: "Risco alto",
    stage: "Compliance",
    nextAction: "Validar ocupacao",
    owner: "Marcos",
    auctionDate: "2026-06-21",
    occupancy: "Ocupado",
    summary:
      "Desconto atrativo, mas a ocupacao informada e a proximidade do leilao exigem parecer humano antes de qualquer recomendacao.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 420.000", detail: "Base do edital" },
      { label: "Valor estimado", value: "R$ 646.000", detail: "Comparaveis regionais" },
      { label: "Reserva tecnica", value: "R$ 58.000", detail: "Risco de desocupacao" },
    ],
    riskFlags: [
      { label: "Ocupacao confirmada", severity: "red", detail: "Pode alongar prazo e custo pos-arremate" },
      { label: "Leilao proximo", severity: "yellow", detail: "Menos de 7 dias para diligencia" },
      { label: "Banco como fonte", severity: "green", detail: "Origem rastreavel e consistente" },
    ],
    checklist: [
      { label: "Edital extraido", status: "Concluido", owner: "Curadoria IA" },
      { label: "Ocupacao validada", status: "Critico", owner: "Juridico" },
      { label: "Custo de posse", status: "Pendente", owner: "Backoffice" },
      { label: "Publicacao", status: "Bloqueado", owner: "Compliance" },
    ],
    documents: [
      { label: "Edital oficial", status: "Anexado", source: "Portal banco" },
      { label: "Fotos do imovel", status: "Parcial", source: "Fonte externa" },
      { label: "Analise de ocupacao", status: "Pendente", source: "Juridico" },
    ],
    timeline: [
      { time: "10:52", actor: "Compliance", action: "Bloqueou recomendacao conclusiva", tone: "red" },
      { time: "10:35", actor: "AI Curator", action: "Detectou termo de ocupacao no edital", tone: "purple" },
      { time: "10:19", actor: "Operacao", action: "Priorizou revisao pela data do leilao", tone: "yellow" },
    ],
  },
  {
    id: "PB-311",
    title: "Terreno urbano",
    propertyType: "Terreno",
    address: "Rua das Figueiras, Centro",
    city: "Porto Belo",
    state: "SC",
    sourceName: "Importacao manual",
    sourceType: "Manual",
    initialBid: 310000,
    appraisalValue: 437000,
    discountPct: 29,
    opportunityScore: 84,
    riskScore: 37,
    complianceScore: 82,
    aiStatus: "Analisado",
    legalStatus: "Com ressalvas",
    stage: "Dossie",
    nextAction: "Gerar dossie",
    owner: "Curadoria",
    auctionDate: "2026-07-04",
    occupancy: "Nao aplicavel",
    summary:
      "Terreno com boa relacao preco/liquidez. Falta confirmar eventuais debitos e restricoes urbanisticas antes do dossie final.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 310.000", detail: "Base cadastrada" },
      { label: "Valor estimado", value: "R$ 437.000", detail: "Mercado regional" },
      { label: "Margem alvo", value: "R$ 71.000", detail: "Antes de impostos" },
    ],
    riskFlags: [
      { label: "Debitos incertos", severity: "yellow", detail: "Dados nao vieram na importacao" },
      { label: "Zoneamento", severity: "yellow", detail: "Confirmar restricoes urbanisticas" },
      { label: "Sem ocupacao", severity: "green", detail: "Risco de posse reduzido" },
    ],
    checklist: [
      { label: "Dados normalizados", status: "Concluido", owner: "Curadoria IA" },
      { label: "Restricoes urbanisticas", status: "Pendente", owner: "Juridico" },
      { label: "Dossie executivo", status: "Em preparo", owner: "Produto" },
      { label: "QA final", status: "Pendente", owner: "Compliance" },
    ],
    documents: [
      { label: "Importacao CSV", status: "Anexado", source: "Operacao" },
      { label: "Matricula", status: "Anexado", source: "Cartorio" },
      { label: "Mapa regional", status: "Gerado", source: "Big Data mock" },
    ],
    timeline: [
      { time: "09:58", actor: "Juridico", action: "Registrou ressalva de debitos", tone: "yellow" },
      { time: "09:42", actor: "AI Curator", action: "Aprovou resumo seguro para dossie", tone: "green" },
      { time: "09:13", actor: "Operacao", action: "Importou lote manual de Porto Belo", tone: "cyan" },
    ],
  },
  {
    id: "FLN-144",
    title: "Sala comercial",
    propertyType: "Comercial",
    address: "Centro Executivo, Trindade",
    city: "Florianopolis",
    state: "SC",
    sourceName: "Leiloeiro regional",
    sourceType: "Leiloeiro",
    initialBid: 198000,
    appraisalValue: 254000,
    discountPct: 22,
    opportunityScore: 68,
    riskScore: 45,
    complianceScore: 76,
    aiStatus: "Fila IA",
    legalStatus: "Pendente",
    stage: "Curadoria IA",
    nextAction: "Extrair edital",
    owner: "AI Curator",
    auctionDate: "2026-07-12",
    occupancy: "Nao informado",
    summary:
      "Ativo comercial com desconto moderado. Precisa extrair edital e validar vacancia antes de avancar no funil.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 198.000", detail: "Base da fonte" },
      { label: "Valor estimado", value: "R$ 254.000", detail: "Mercado comercial" },
      { label: "Custo estimado", value: "R$ 18.000", detail: "Condominio e taxas" },
    ],
    riskFlags: [
      { label: "Edital nao extraido", severity: "yellow", detail: "Dados ainda nao auditaveis" },
      { label: "Mercado comercial", severity: "yellow", detail: "Liquidez depende de locacao" },
      { label: "Leilao distante", severity: "green", detail: "Prazo bom para diligencia" },
    ],
    checklist: [
      { label: "Captacao", status: "Concluido", owner: "Fonte" },
      { label: "Extracao do edital", status: "Pendente", owner: "AI Curator" },
      { label: "Revisao juridica", status: "Aguardando", owner: "Juridico" },
      { label: "Score final", status: "Aguardando", owner: "IA" },
    ],
    documents: [
      { label: "Anuncio da fonte", status: "Anexado", source: "Leiloeiro regional" },
      { label: "Edital oficial", status: "Pendente", source: "Fonte oficial" },
      { label: "Comparaveis", status: "Pendente", source: "Big Data mock" },
    ],
    timeline: [
      { time: "08:40", actor: "Fonte", action: "Novo item captado do leiloeiro regional", tone: "cyan" },
      { time: "08:33", actor: "Sistema", action: "Criou card no kanban de curadoria", tone: "muted" },
      { time: "08:21", actor: "AI Curator", action: "Aguardando extracao do edital", tone: "purple" },
    ],
  },
  {
    id: "SP-118",
    title: "Apartamento compacto",
    propertyType: "Apartamento",
    address: "Rua Vergueiro, Vila Mariana",
    city: "Sao Paulo",
    state: "SP",
    sourceName: "Portal banco",
    sourceType: "Banco",
    initialBid: 255000,
    appraisalValue: 369000,
    discountPct: 31,
    opportunityScore: 79,
    riskScore: 52,
    complianceScore: 84,
    aiStatus: "Analisado",
    legalStatus: "Aprovado",
    stage: "Matching",
    nextAction: "Matching investidor",
    owner: "Comercial",
    auctionDate: "2026-07-08",
    occupancy: "Vago",
    summary:
      "Unidade compacta com liquidez forte e parecer aprovado. Boa candidata para matching com investidor conservador.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 255.000", detail: "Base do edital" },
      { label: "Valor estimado", value: "R$ 369.000", detail: "Comparaveis urbanos" },
      { label: "ROI alvo", value: "18%", detail: "Cenario conservador" },
    ],
    riskFlags: [
      { label: "Risco medio", severity: "yellow", detail: "Custos condominiais exigem confirmacao" },
      { label: "Parecer aprovado", severity: "green", detail: "Advogado liberou com observacoes" },
      { label: "Alta concorrencia", severity: "yellow", detail: "Regiao tende a atrair lances" },
    ],
    checklist: [
      { label: "Edital extraido", status: "Concluido", owner: "Curadoria IA" },
      { label: "Parecer juridico", status: "Aprovado", owner: "Juridico" },
      { label: "Dossie", status: "Final", owner: "Produto" },
      { label: "Matching", status: "Pendente", owner: "Comercial" },
    ],
    documents: [
      { label: "Edital oficial", status: "Anexado", source: "Portal banco" },
      { label: "Parecer juridico", status: "Anexado", source: "Juridico" },
      { label: "Dossie executivo", status: "Final", source: "Sistema" },
    ],
    timeline: [
      { time: "11:44", actor: "Juridico", action: "Aprovou com ressalva de condominio", tone: "green" },
      { time: "11:17", actor: "AI Curator", action: "Gerou dossie executivo", tone: "purple" },
      { time: "10:49", actor: "Comercial", action: "Marcado para matching com investidor", tone: "cyan" },
    ],
  },
  {
    id: "CWB-072",
    title: "Casa terrea",
    propertyType: "Casa",
    address: "Bairro Alto",
    city: "Curitiba",
    state: "PR",
    sourceName: "Tribunal",
    sourceType: "Judicial",
    initialBid: 365000,
    appraisalValue: 493000,
    discountPct: 26,
    opportunityScore: 74,
    riskScore: 61,
    complianceScore: 70,
    aiStatus: "Divergencia",
    legalStatus: "Aguardando",
    stage: "Revisao juridica",
    nextAction: "Comparar processo",
    owner: "Juridico",
    auctionDate: "2026-07-15",
    occupancy: "Nao informado",
    summary:
      "Processo judicial com divergencia entre dados da fonte e edital. Deve seguir bloqueado ate reconciliacao documental.",
    financialSummary: [
      { label: "Lance inicial", value: "R$ 365.000", detail: "Base do tribunal" },
      { label: "Valor estimado", value: "R$ 493.000", detail: "Comparaveis locais" },
      { label: "Custo juridico", value: "R$ 22.000", detail: "Reserva preliminar" },
    ],
    riskFlags: [
      { label: "Divergencia processual", severity: "red", detail: "Dados do edital nao batem com fonte inicial" },
      { label: "Judicial", severity: "yellow", detail: "Exige leitura humana do processo" },
      { label: "Desconto medio", severity: "yellow", detail: "Margem nao compensa risco sem diligencia" },
    ],
    checklist: [
      { label: "Edital extraido", status: "Concluido", owner: "Curadoria IA" },
      { label: "Processo comparado", status: "Pendente", owner: "Juridico" },
      { label: "Risco de posse", status: "Em analise", owner: "Compliance" },
      { label: "Dossie", status: "Bloqueado", owner: "Sistema" },
    ],
    documents: [
      { label: "Edital judicial", status: "Anexado", source: "Tribunal" },
      { label: "Movimentos processuais", status: "Pendente", source: "Tribunal" },
      { label: "Resumo de risco", status: "Rascunho", source: "IA" },
    ],
    timeline: [
      { time: "10:09", actor: "Watchdog", action: "Priorizou por divergencia documental", tone: "red" },
      { time: "09:53", actor: "AI Curator", action: "Sinalizou conflito entre processo e fonte", tone: "purple" },
      { time: "09:31", actor: "Juridico", action: "Recebeu tarefa de comparacao", tone: "yellow" },
    ],
  },
];

const sourceRows = [
  ["FON-01", "Leiloeiro homologado", "Leiloeiro", "Ativo", "94", "Hoje 11:51", "Termos revisados"],
  ["FON-02", "Portal banco", "Banco", "Ativo", "88", "Hoje 10:35", "CSV e link oficial"],
  ["FON-03", "Tribunal", "Judicial", "Atencao", "76", "Ontem 18:20", "Validar scraping"],
  ["FON-04", "Importacao manual", "Manual", "Monitorar", "69", "Ontem 14:12", "Exige QA"],
  ["FON-05", "Leiloeiro regional", "Leiloeiro", "Atencao", "64", "Seg 08:40", "Frequencia instavel"],
];

const aiRunRows = [
  ["AI-1042", "BC-204", "Score + resumo", "Analisado", "91%", "R$ 0,42", "Prompt v0.4"],
  ["AI-1041", "ITJ-088", "Risco de ocupacao", "Requer humano", "74%", "R$ 0,48", "Prompt v0.4"],
  ["AI-1038", "SP-118", "Dossie executivo", "Aprovado", "89%", "R$ 0,63", "Prompt v0.3"],
  ["AI-1035", "CWB-072", "Conflito documental", "Divergencia", "68%", "R$ 0,45", "Prompt v0.4"],
];

const legalRows = [
  ["REV-221", "BC-204", "Matricula", "Pendente", "Dra. Helena", "42h", "Conferir cadeia dominial"],
  ["REV-220", "ITJ-088", "Ocupacao", "Risco alto", "Dr. Renato", "12h", "Validar desocupacao"],
  ["REV-218", "SP-118", "Parecer final", "Aprovado", "Dra. Helena", "Concluido", "Ressalva de condominio"],
  ["REV-216", "CWB-072", "Processo", "Aguardando", "Dr. Renato", "36h", "Comparar autos"],
];

const dossierRows = [
  ["DOS-204", "BC-204", "Rascunho", "Curadoria", "3 fontes", "Bloqueado por matricula"],
  ["DOS-118", "SP-118", "Final", "Juridico", "5 fontes", "Pronto para matching"],
  ["DOS-311", "PB-311", "Em preparo", "Produto", "4 fontes", "Incluir zoneamento"],
  ["DOS-072", "CWB-072", "Bloqueado", "Sistema", "2 fontes", "Divergencia processual"],
];

const alertRows = [
  ["ALT-91", "Leilao em 24h", "Critico", "ITJ-088", "Watchdog", "Hoje 10:19"],
  ["ALT-88", "Mudanca de edital", "Revisar", "CWB-072", "IA", "Hoje 09:53"],
  ["ALT-84", "Dossie bloqueado", "Aguardando", "BC-204", "Juridico", "Hoje 11:44"],
  ["ALT-77", "Score alto", "Novo", "BC-204", "Comercial", "Hoje 12:08"],
];

const integrationRows = [
  ["INT-01", "Supabase", "Conectado", "Banco e auth futuro", "Baixo", "Local"],
  ["INT-02", "R2 Storage", "Atencao", "Arquivos e dossies", "Baixo", "Configurar bucket"],
  ["INT-03", "Gemini", "Configurar", "Curadoria IA", "Variavel", "Chave pendente"],
  ["INT-04", "Big Data API", "Mock", "Enriquecimento", "A definir", "Adapter local"],
  ["INT-05", "WhatsApp", "Planejado", "Alertas", "A definir", "Depois do MVP"],
];

const userRows = [
  ["USR-01", "Admin Betel", "Super admin", "Betel Operacao", "Ativo", "Hoje"],
  ["USR-02", "Dra. Helena", "Juridico", "Betel Operacao", "Ativo", "Hoje"],
  ["USR-03", "Marcos", "Analista", "Betel Operacao", "Ativo", "Ontem"],
  ["USR-04", "Viewer Fundo", "Viewer", "Fundo parceiro", "Piloto", "3 dias"],
];

const organizationRows = [
  ["ORG-01", "Betel Operacao", "Interno", "Ativo", "18 usuarios", "Command Center"],
  ["ORG-02", "Fundo parceiro", "Piloto", "Piloto", "2 usuarios", "Dossies viewer"],
  ["ORG-03", "Escritorio juridico", "Parceiro", "Onboarding", "4 usuarios", "Revisao"],
];

const planRows = [
  ["PLN-01", "Explorador", "Planejado", "1 usuario", "Oportunidades publicas", "Sem billing"],
  ["PLN-02", "Investidor", "Planejado", "3 usuarios", "Dossies e alertas", "Sem billing"],
  ["PLN-03", "Profissional", "Planejado", "10 usuarios", "Curadoria e revisao", "Sem billing"],
  ["PLN-04", "Escritorio/Fundo", "Planejado", "Ilimitado", "Workspaces e API", "Sem billing"],
];

const logRows = [
  ["LOG-680", "AI output saved", "BC-204", "Sistema", "Registrado", "Hoje 12:08"],
  ["LOG-679", "Legal review approved", "SP-118", "Dra. Helena", "Auditoria", "Hoje 11:44"],
  ["LOG-678", "Compliance block", "ITJ-088", "Compliance", "Critico", "Hoje 10:52"],
  ["LOG-677", "Source changed", "CWB-072", "Fonte", "Revisar", "Hoje 09:53"],
];

const qualityRows = [
  ["QA-31", "Risco de ocupacao", "Falso positivo", "3 casos", "Ajustar", "Prompt juridico"],
  ["QA-28", "Desconto estimado", "Aprovado", "94%", "Monitorar", "Modelo financeiro"],
  ["QA-25", "Resumo seguro", "Melhorou", "87%", "Ativo", "Prompt v0.4"],
  ["QA-22", "Divergencia documental", "Atencao", "68%", "Revisar", "Extrator edital"],
];

const settingRows = [
  ["CFG-01", "Provider IA", "Gemini", "Ativo", "Admin", "Curadoria"],
  ["CFG-02", "Nivel de automacao", "Supervisionado", "Restrito", "Compliance", "Guardrails"],
  ["CFG-03", "Retencao de logs", "180 dias", "Ativo", "Sistema", "Auditoria"],
  ["CFG-04", "Fonte oficial obrigatoria", "Sim", "Ativo", "Compliance", "Publicacao"],
];

function tableRow(id: string, values: ResourceCell[]): ResourceRow {
  return { id, cells: values };
}

function statusCell(label: string): ResourceCell {
  return { label, kind: "status" };
}

function textCell(label: string | number, muted = false): ResourceCell {
  return { label, kind: "text", muted };
}

function scoreCell(value: number): ResourceCell {
  return { label: value, kind: "score" };
}

function riskCell(value: number): ResourceCell {
  return { label: value, kind: "risk" };
}

function moneyCell(value: number): ResourceCell {
  return { label: formatCurrency(value), kind: "money" };
}

const opportunityColumns: ResourceColumn[] = [
  { key: "property", label: "Imovel" },
  { key: "location", label: "Cidade/UF" },
  { key: "source", label: "Fonte" },
  { key: "initialBid", label: "Lance inicial", align: "right" },
  { key: "discount", label: "Desconto", align: "right" },
  { key: "opportunityScore", label: "Score", align: "center" },
  { key: "riskScore", label: "Risco", align: "center" },
  { key: "aiStatus", label: "IA" },
  { key: "legalStatus", label: "Juridico" },
  { key: "nextAction", label: "Proxima acao" },
];

const compactColumns = (labels: string[]): ResourceColumn[] =>
  labels.map((label, index) => ({ key: `${index}-${label}`, label }));

function opportunityToResourceRow(item: AuctionOpportunity): ResourceRow {
  return tableRow(item.id, [
    { label: item.title, kind: "text", href: `/admin/oportunidades/${item.id}` },
    textCell(`${item.city}/${item.state}`),
    textCell(item.sourceName),
    moneyCell(item.initialBid),
    textCell(`${item.discountPct}%`),
    scoreCell(item.opportunityScore),
    riskCell(item.riskScore),
    statusCell(item.aiStatus),
    statusCell(item.legalStatus),
    textCell(item.nextAction),
  ]);
}

export function createOpportunitiesResource(items: AuctionOpportunity[]): ModuleResource {
  const highScore = items.filter((item) => item.opportunityScore >= 80).length;
  const criticalRisk = items.filter((item) => item.riskScore >= 70).length;
  const legalQueue = items.filter((item) => !item.legalStatus.toLowerCase().includes("aprov")).length;

  return {
    slug: "oportunidades",
    title: "Pipeline de oportunidades",
    eyebrow: "imoveis / scores / acoes",
    description: "Tabela operacional com status de IA, juridico, risco e proxima decisao.",
    kind: "table",
    summary: [
      { label: "Score alto", value: String(highScore), detail: "acima de 80", tone: "green" },
      { label: "Risco critico", value: String(criticalRisk), detail: "bloqueio ativo", tone: "red" },
      { label: "Juridico", value: String(legalQueue), detail: "com revisao humana", tone: "yellow" },
    ],
    columns: opportunityColumns,
    rows: items.map(opportunityToResourceRow),
  };
}

function normalizeBucketText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function formatKanbanDue(value: string) {
  if (!value) return "sem data";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "sem data";
  return dateFormatter.format(date);
}

function classifyKanbanOpportunity(item: AuctionOpportunity) {
  const statusText = normalizeBucketText(`${item.stage} ${item.aiStatus} ${item.legalStatus} ${item.nextAction}`);

  if (item.riskScore >= 70 || statusText.includes("bloque") || statusText.includes("critico")) {
    return "Bloqueado";
  }

  if (
    statusText.includes("entrada") ||
    statusText.includes("captura") ||
    statusText.includes("fila ia") ||
    statusText.includes("curadoria")
  ) {
    return "Entrada";
  }

  if (
    statusText.includes("humano") ||
    statusText.includes("jurid") ||
    statusText.includes("pendente") ||
    statusText.includes("aguard")
  ) {
    return "Revisao humana";
  }

  return "Pronto";
}

export function createKanbanResourceFromOpportunities(items: AuctionOpportunity[]): ModuleResource {
  const columns: Array<{ title: string; tone: ResourceTone }> = [
    { title: "Entrada", tone: "cyan" },
    { title: "Revisao humana", tone: "yellow" },
    { title: "Bloqueado", tone: "red" },
    { title: "Pronto", tone: "green" },
  ];
  const cardsByColumn = new Map<string, KanbanCard[]>(columns.map((column) => [column.title, []]));

  for (const item of items) {
    const column = classifyKanbanOpportunity(item);
    const cards = cardsByColumn.get(column) || cardsByColumn.get("Entrada") || [];

    cards.push({
      id: item.id,
      title: item.title,
      meta: `${item.city}/${item.state} - ${item.nextAction || item.stage}`,
      owner: item.owner || "Operacao",
      due: formatKanbanDue(item.auctionDate),
      opportunityScore: item.opportunityScore,
      riskScore: item.riskScore,
      href: `/admin/oportunidades/${item.id}`,
    });
  }

  const kanbanColumns = columns.map((column) => ({
    ...column,
    cards: cardsByColumn.get(column.title) || [],
  }));
  const humanQueue = kanbanColumns.find((column) => column.title === "Revisao humana")?.cards.length || 0;
  const blocked = kanbanColumns.find((column) => column.title === "Bloqueado")?.cards.length || 0;
  const ready = kanbanColumns.find((column) => column.title === "Pronto")?.cards.length || 0;

  return {
    slug: "kanban",
    title: "Kanban operacional",
    eyebrow: "captura / humano / arremate",
    description: "Fila viva das oportunidades reais, agrupada por etapa operacional e guardrails.",
    kind: "kanban",
    summary: [
      { label: "Cards reais", value: String(items.length), detail: "vindos de auction_opportunities", tone: "cyan" },
      { label: "Humano", value: String(humanQueue), detail: "aguardando revisao ou decisao", tone: humanQueue ? "yellow" : "green" },
      { label: "Bloqueios", value: String(blocked), detail: `${ready} prontos para proxima etapa`, tone: blocked ? "red" : "green" },
    ],
    kanbanColumns,
  };
}

const makeSimpleRows = (rows: string[][], statusIndex = 3): ResourceRow[] =>
  rows.map((row) =>
    tableRow(row[0], row.map((value, index) => (index === statusIndex ? statusCell(value) : textCell(value))))
  );

const kanbanColumns: KanbanColumn[] = [
  {
    title: "Entrada",
    tone: "cyan",
    cards: [
      {
        id: "FLN-144",
        title: "Sala comercial",
        meta: "Extrair edital e confirmar vacancia",
        owner: "AI Curator",
        due: "12 jul",
        opportunityScore: 68,
        riskScore: 45,
        href: "/admin/oportunidades/FLN-144",
      },
    ],
  },
  {
    title: "Revisao humana",
    tone: "yellow",
    cards: [
      {
        id: "BC-204",
        title: "Apartamento frente mar",
        meta: "Matricula pendente",
        owner: "Dra. Helena",
        due: "27 jun",
        opportunityScore: 91,
        riskScore: 24,
        href: "/admin/oportunidades/BC-204",
      },
      {
        id: "CWB-072",
        title: "Casa terrea",
        meta: "Comparar processo judicial",
        owner: "Juridico",
        due: "15 jul",
        opportunityScore: 74,
        riskScore: 61,
        href: "/admin/oportunidades/CWB-072",
      },
    ],
  },
  {
    title: "Bloqueado",
    tone: "red",
    cards: [
      {
        id: "ITJ-088",
        title: "Casa ocupada",
        meta: "Ocupacao exige parecer",
        owner: "Compliance",
        due: "21 jun",
        opportunityScore: 72,
        riskScore: 78,
        href: "/admin/oportunidades/ITJ-088",
      },
    ],
  },
  {
    title: "Pronto",
    tone: "green",
    cards: [
      {
        id: "SP-118",
        title: "Apartamento compacto",
        meta: "Aprovado para matching",
        owner: "Comercial",
        due: "8 jul",
        opportunityScore: 79,
        riskScore: 52,
        href: "/admin/oportunidades/SP-118",
      },
      {
        id: "PB-311",
        title: "Terreno urbano",
        meta: "Dossie em preparo",
        owner: "Produto",
        due: "4 jul",
        opportunityScore: 84,
        riskScore: 37,
        href: "/admin/oportunidades/PB-311",
      },
    ],
  },
];

const resourceMap = new Map<string, ModuleResource>([
  [
    "oportunidades",
    createOpportunitiesResource(auctionOpportunities),
  ],
  [
    "mapa",
    {
      slug: "mapa",
      title: "Mapa operacional por praca",
      eyebrow: "cidade / liquidez",
      description: "Resumo por cidade para priorizar diligencia, liquidez e risco regional.",
      kind: "table",
      summary: [
        { label: "Pracas", value: "5", detail: "com oportunidades", tone: "cyan" },
        { label: "Liquidez alta", value: "2", detail: "BC e Sao Paulo", tone: "green" },
        { label: "Revisar", value: "2", detail: "risco/documentos", tone: "yellow" },
      ],
      columns: compactColumns(["Cidade/UF", "Ativos", "Score medio", "Risco medio", "Liquidez", "Proxima acao"]),
      rows: makeSimpleRows(
        [
          ["Balneario Camboriu/SC", "1", "91", "24", "Alta", "Revisar matricula"],
          ["Itajai/SC", "1", "72", "78", "Media", "Validar ocupacao"],
          ["Porto Belo/SC", "1", "84", "37", "Alta", "Checar zoneamento"],
          ["Sao Paulo/SP", "1", "79", "52", "Alta", "Matching investidor"],
        ],
        4
      ),
    },
  ],
  [
    "fontes",
    {
      slug: "fontes",
      title: "Fontes monitoradas",
      eyebrow: "origem / qualidade",
      description: "Controle de origem, confiabilidade, ultima coleta e observacoes de permissao.",
      kind: "table",
      summary: [
        { label: "Homologadas", value: "2", detail: "qualidade alta", tone: "green" },
        { label: "Com alerta", value: "2", detail: "revisao de origem", tone: "yellow" },
        { label: "Score medio", value: "78", detail: "fontes ativas", tone: "cyan" },
      ],
      columns: compactColumns(["ID", "Fonte", "Tipo", "Status", "Score", "Ultima coleta", "Observacao"]),
      rows: makeSimpleRows(sourceRows, 3),
    },
  ],
  [
    "ia",
    {
      slug: "ia",
      title: "Runs de curadoria IA",
      eyebrow: "logs / confianca",
      description: "Execucoes auditaveis por oportunidade, custo estimado, prompt e status.",
      kind: "table",
      summary: [
        { label: "Runs semana", value: "86", detail: "mock local", tone: "purple" },
        { label: "Confianca", value: "82%", detail: "media operacional", tone: "green" },
        { label: "Requer humano", value: "2", detail: "guardrail acionado", tone: "yellow" },
      ],
      columns: compactColumns(["Run", "Oportunidade", "Tipo", "Status", "Confianca", "Custo", "Prompt"]),
      rows: makeSimpleRows(aiRunRows, 3),
    },
  ],
  [
    "compliance",
    {
      slug: "compliance",
      title: "Guardrails de compliance",
      eyebrow: "bloqueios / revisao",
      description: "Regras de decisao humana obrigatoria e linguagem segura para oportunidades.",
      kind: "table",
      summary: [
        { label: "Regras ativas", value: "12", detail: "operacionais", tone: "cyan" },
        { label: "Bloqueios", value: "4", detail: "decisao critica", tone: "red" },
        { label: "Excecoes", value: "2", detail: "aguardando parecer", tone: "yellow" },
      ],
      columns: compactColumns(["Regra", "Escopo", "Status", "Dono", "Quando bloqueia", "Evidencia"]),
      rows: makeSimpleRows(
        [
          ["CMP-01", "Parecer juridico final", "Obrigatorio", "Compliance", "Antes de publicar", "Audit log"],
          ["CMP-02", "Lucro garantido", "Bloqueado", "Marketing", "Sempre", "Texto publico"],
          ["CMP-03", "Risco zero", "Bloqueado", "IA", "Sempre", "Saida do modelo"],
          ["CMP-04", "Fonte oficial", "Ativo", "Operacao", "Sem documento", "Anexo"],
        ],
        2
      ),
    },
  ],
  [
    "revisao-juridica",
    {
      slug: "revisao-juridica",
      title: "Fila de revisao juridica",
      eyebrow: "parecer humano",
      description: "Itens que dependem de advogado/revisor antes de publicacao, dossie ou matching.",
      kind: "table",
      summary: [
        { label: "Aguardando", value: "19", detail: "na fila", tone: "yellow" },
        { label: "Alto risco", value: "1", detail: "ocupacao", tone: "red" },
        { label: "Concluidos", value: "8", detail: "semana", tone: "green" },
      ],
      columns: compactColumns(["Revisao", "Oportunidade", "Tema", "Status", "Responsavel", "SLA", "Proxima acao"]),
      rows: makeSimpleRows(legalRows, 3),
    },
  ],
  [
    "dossies",
    {
      slug: "dossies",
      title: "Dossies operacionais",
      eyebrow: "relatorios auditaveis",
      description: "Controle de dossies executivos com fontes, status e bloqueios de publicacao.",
      kind: "table",
      summary: [
        { label: "Gerados", value: "31", detail: "rascunhos e finais", tone: "cyan" },
        { label: "Finais", value: "12", detail: "com revisao humana", tone: "green" },
        { label: "Bloqueados", value: "2", detail: "risco/documento", tone: "red" },
      ],
      columns: compactColumns(["Dossie", "Oportunidade", "Status", "Responsavel", "Fontes", "Observacao"]),
      rows: makeSimpleRows(dossierRows, 2),
    },
  ],
  [
    "kanban",
    {
      slug: "kanban",
      title: "Kanban de oportunidades",
      eyebrow: "funil operacional",
      description: "Cards por etapa para acompanhar responsabilidade, prazo, score e risco.",
      kind: "kanban",
      summary: [
        { label: "Cards", value: "6", detail: "em aberto", tone: "cyan" },
        { label: "Bloqueados", value: "1", detail: "compliance", tone: "red" },
        { label: "Prontos", value: "2", detail: "dossie/matching", tone: "green" },
      ],
      kanbanColumns,
    },
  ],
  [
    "alertas",
    {
      slug: "alertas",
      title: "Alertas inteligentes",
      eyebrow: "sla / prioridade",
      description: "Eventos criticos e operacionais que precisam de acao ou confirmacao humana.",
      kind: "table",
      summary: [
        { label: "Criticos", value: "7", detail: "acao imediata", tone: "red" },
        { label: "Hoje", value: "22", detail: "novos eventos", tone: "cyan" },
        { label: "Resolvidos", value: "41", detail: "semana", tone: "green" },
      ],
      columns: compactColumns(["Alerta", "Titulo", "Status", "Recurso", "Responsavel", "Criado"]),
      rows: makeSimpleRows(alertRows, 2),
    },
  ],
  [
    "integracoes",
    {
      slug: "integracoes",
      title: "Integracoes e provedores",
      eyebrow: "api / custo / status",
      description: "Mapa das dependencias tecnicas e custos previstos por provider.",
      kind: "table",
      summary: [
        { label: "Conectadas", value: "2", detail: "locais", tone: "green" },
        { label: "Pendentes", value: "3", detail: "configuracao", tone: "yellow" },
        { label: "Custo hoje", value: "R$ 205", detail: "estimado", tone: "cyan" },
      ],
      columns: compactColumns(["ID", "Integracao", "Status", "Uso", "Custo", "Observacao"]),
      rows: makeSimpleRows(integrationRows, 2),
    },
  ],
  [
    "big-data-api",
    {
      slug: "big-data-api",
      title: "Adapter Big Data API",
      eyebrow: "enriquecimento mock",
      description: "Endpoints previstos para normalizacao de endereco, mercado, processo e comparaveis.",
      kind: "table",
      summary: [
        { label: "Chamadas reais", value: "0", detail: "sem contrato", tone: "muted" },
        { label: "Mocks", value: "4", detail: "preparados", tone: "purple" },
        { label: "Custo", value: "R$ 0", detail: "ambiente atual", tone: "green" },
      ],
      columns: compactColumns(["Endpoint", "Finalidade", "Status", "Entrada", "Saida", "LGPD"]),
      rows: makeSimpleRows(
        [
          ["BD-01", "Endereco", "Mock", "logradouro/cidade", "geo + bairro", "Minimizado"],
          ["BD-02", "Comparaveis", "Mock", "imovel", "valor estimado", "Sem CPF"],
          ["BD-03", "Processo", "Planejado", "numero", "eventos", "Auditar"],
          ["BD-04", "Leiloeiro", "Planejado", "CNPJ/nome", "score fonte", "Auditar"],
        ],
        2
      ),
    },
  ],
  [
    "usuarios",
    {
      slug: "usuarios",
      title: "Usuarios e papeis",
      eyebrow: "rbac futuro",
      description: "Controle visual de usuarios, papeis, organizacao e ultimo acesso.",
      kind: "table",
      summary: [
        { label: "Usuarios", value: "18", detail: "mock", tone: "cyan" },
        { label: "Revisores", value: "4", detail: "juridico", tone: "yellow" },
        { label: "Admins", value: "3", detail: "conta", tone: "green" },
      ],
      columns: compactColumns(["ID", "Usuario", "Papel", "Organizacao", "Status", "Ultimo acesso"]),
      rows: makeSimpleRows(userRows, 4),
    },
  ],
  [
    "organizacoes",
    {
      slug: "organizacoes",
      title: "Organizacoes",
      eyebrow: "workspaces",
      description: "Workspaces previstos para RLS, planos, acesso a dossies e auditoria.",
      kind: "table",
      summary: [
        { label: "Orgs", value: "3", detail: "mock", tone: "cyan" },
        { label: "Ativas", value: "1", detail: "operacao", tone: "green" },
        { label: "Pilotos", value: "2", detail: "parceiros", tone: "yellow" },
      ],
      columns: compactColumns(["ID", "Organizacao", "Tipo", "Status", "Usuarios", "Escopo"]),
      rows: makeSimpleRows(organizationRows, 3),
    },
  ],
  [
    "planos",
    {
      slug: "planos",
      title: "Planos comerciais",
      eyebrow: "billing futuro",
      description: "Estrutura de planos e limites sem ativar cobranca ou banco de dados ainda.",
      kind: "table",
      summary: [
        { label: "Planos", value: "4", detail: "conceituais", tone: "cyan" },
        { label: "Billing", value: "0", detail: "nao ativado", tone: "muted" },
        { label: "Upsell", value: "11", detail: "sinais mock", tone: "yellow" },
      ],
      columns: compactColumns(["ID", "Plano", "Status", "Usuarios", "Recursos", "Billing"]),
      rows: makeSimpleRows(planRows, 2),
    },
  ],
  [
    "logs",
    {
      slug: "logs",
      title: "Logs e auditoria",
      eyebrow: "eventos",
      description: "Trilha operacional de IA, juridico, compliance, fontes e mudancas criticas.",
      kind: "table",
      summary: [
        { label: "Eventos", value: "680", detail: "mock", tone: "cyan" },
        { label: "Criticos", value: "24", detail: "retencao", tone: "red" },
        { label: "API", value: "94", detail: "simulado", tone: "purple" },
      ],
      columns: compactColumns(["Log", "Evento", "Recurso", "Ator", "Status", "Horario"]),
      rows: makeSimpleRows(logRows, 4),
    },
  ],
  [
    "qualidade-ia",
    {
      slug: "qualidade-ia",
      title: "Qualidade da IA",
      eyebrow: "qa / feedback",
      description: "Sinais de divergencia, falso positivo, prompt e confianca por area.",
      kind: "table",
      summary: [
        { label: "Acuracia", value: "87%", detail: "revisado", tone: "green" },
        { label: "Falsos positivos", value: "6", detail: "semana", tone: "yellow" },
        { label: "Divergencias", value: "11", detail: "humano x IA", tone: "red" },
      ],
      columns: compactColumns(["ID", "Sinal", "Tipo", "Impacto", "Status", "Area"]),
      rows: makeSimpleRows(qualityRows, 4),
    },
  ],
  [
    "configuracoes",
    {
      slug: "configuracoes",
      title: "Configuracoes operacionais",
      eyebrow: "parametros",
      description: "Parametros previstos para providers, automacao, logs e regras de publicacao.",
      kind: "table",
      summary: [
        { label: "Prompts", value: "5", detail: "mapeados", tone: "purple" },
        { label: "Providers", value: "2", detail: "previstos", tone: "cyan" },
        { label: "Restricoes", value: "4", detail: "compliance", tone: "yellow" },
      ],
      columns: compactColumns(["ID", "Parametro", "Valor", "Status", "Dono", "Escopo"]),
      rows: makeSimpleRows(settingRows, 3),
    },
  ],
]);

export function getAdminResource(slug: string) {
  return resourceMap.get(slug);
}

export function getOpportunityById(id: string) {
  return auctionOpportunities.find((item) => item.id.toLowerCase() === id.toLowerCase());
}
