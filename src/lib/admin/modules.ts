export type AdminModuleStatus = "ready" | "build" | "attention";
export type AdminAccent = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

export type AdminModule = {
  slug: string;
  href: string;
  legacySlugs?: string[];
  group: string;
  label: string;
  title: string;
  eyebrow: string;
  description: string;
  icon: string;
  accent: AdminAccent;
  status: AdminModuleStatus;
  statusLabel: string;
  metrics: Array<{ label: string; value: string; detail: string }>;
  workflow: string[];
  focus: string[];
  records: Array<{ title: string; meta: string; status: string; owner: string }>;
};

export type AdminNavItem = {
  href: string;
  label: string;
  icon: string;
  badge?: string;
};

export type AdminNavGroup = {
  label: string;
  items: AdminNavItem[];
};

const createAdminModule = (
  input: Omit<AdminModule, "href"> & { href?: string }
): AdminModule => ({
  ...input,
  href: input.href || `/admin/${input.slug}`,
});

export const adminModules: AdminModule[] = [
  createAdminModule({
    slug: "oportunidades",
    legacySlugs: ["opportunities", "financial", "matching"],
    group: "Operacao",
    label: "Oportunidades",
    title: "Oportunidades de Leilao",
    eyebrow: "Captacao, score e ROI",
    description:
      "Fila central de imoveis captados, score de oportunidade, risco, documentos e proximo passo operacional.",
    icon: "Gavel",
    accent: "cyan",
    status: "build",
    statusLabel: "MVP visual",
    metrics: [
      { label: "Monitorados", value: "142", detail: "base mockada" },
      { label: "Alto potencial", value: "28", detail: "score acima de 80" },
      { label: "Risco critico", value: "7", detail: "bloqueio humano" },
    ],
    workflow: ["Captar fonte", "Normalizar dados", "Pontuar oportunidade", "Enviar para revisao"],
    focus: ["Fonte oficial", "Lance inicial", "Desconto real", "Teto racional"],
    records: [
      {
        title: "Apartamento em Balneario Camboriu",
        meta: "Leiloeiro homologado - 42% de desconto estimado",
        status: "Em analise",
        owner: "Curadoria IA",
      },
      {
        title: "Casa em Itajai",
        meta: "Ocupacao informada no edital",
        status: "Risco alto",
        owner: "Juridico",
      },
    ],
  }),
  createAdminModule({
    slug: "arremate",
    legacySlugs: ["auction-room", "lances"],
    group: "Operacao",
    label: "Arremate",
    title: "Sala de Arremate",
    eyebrow: "Contrato, teto e sessao",
    description:
      "Controle operacional para estrategia de lance, sessao de arremate, resultado e abertura do pos-arremate.",
    icon: "Gavel",
    accent: "yellow",
    status: "build",
    statusLabel: "Guardrail",
    metrics: [
      { label: "Estrategias", value: "0", detail: "aguardando contrato" },
      { label: "Sessoes", value: "0", detail: "sem agenda ativa" },
      { label: "Pos-arremate", value: "0", detail: "casos abertos" },
    ],
    workflow: ["Validar contrato", "Definir teto", "Acompanhar sessao", "Abrir pos-arremate"],
    focus: ["Teto autorizado", "Registro de decisao", "Lance final", "Prazos pos-arremate"],
    records: [
      {
        title: "Sala aguardando autorizacao",
        meta: "Contrato assinado destrava estrategia de lance",
        status: "Bloqueado",
        owner: "Operacao",
      },
      {
        title: "Pos-arremate",
        meta: "Pagamento, registro, posse e chaves",
        status: "Backoffice",
        owner: "Backoffice",
      },
    ],
  }),
  createAdminModule({
    slug: "investidores",
    legacySlugs: ["investors", "crm-investidores"],
    group: "Operacao",
    label: "Investidores",
    title: "Investidores",
    eyebrow: "CRM e matching",
    description:
      "Perfis de investidores, teses, teto de capital, apetite de risco e oportunidades compativeis.",
    icon: "Users",
    accent: "purple",
    status: "build",
    statusLabel: "Matching MVP",
    metrics: [
      { label: "Perfis", value: "3", detail: "base inicial" },
      { label: "Matches fortes", value: "7", detail: "score acima de 80" },
      { label: "Teto medio", value: "R$ 650k", detail: "capital informado" },
    ],
    workflow: ["Cadastrar perfil", "Definir tese", "Rodar matching", "Enviar dossie assistido"],
    focus: ["Teto", "Praca", "Apetite de risco", "ROI alvo"],
    records: [
      {
        title: "Fundo Litoral SC",
        meta: "Busca ativos no litoral catarinense com risco moderado",
        status: "Ativo",
        owner: "Comercial",
      },
      {
        title: "Investidor Conservador SP",
        meta: "Somente oportunidades com parecer juridico favoravel",
        status: "Piloto",
        owner: "Relacionamento",
      },
    ],
  }),
  createAdminModule({
    slug: "mapa",
    group: "Operacao",
    label: "Mapa de Imoveis",
    title: "Mapa de Imoveis",
    eyebrow: "Geolocalizacao",
    description:
      "Visao geografica para oportunidades por cidade, risco, score, faixa de valor e liquidez regional.",
    icon: "MapPinned",
    accent: "green",
    status: "build",
    statusLabel: "Planejado",
    metrics: [
      { label: "Cidades", value: "18", detail: "com ativos monitorados" },
      { label: "Clusters", value: "9", detail: "por regiao" },
      { label: "Liquidez alta", value: "31", detail: "ativos elegiveis" },
    ],
    workflow: ["Localizar imovel", "Cruzar regiao", "Filtrar score", "Abrir detalhe"],
    focus: ["Cidade/UF", "Raio", "Liquidez", "Valor por m2"],
    records: [
      {
        title: "Litoral SC",
        meta: "Balneario Camboriu, Itajai e Porto Belo",
        status: "Ativo",
        owner: "Mercado",
      },
      {
        title: "Capital SP",
        meta: "Oportunidades com alta concorrencia",
        status: "Monitorar",
        owner: "Curadoria",
      },
    ],
  }),
  createAdminModule({
    slug: "fontes",
    legacySlugs: ["sources"],
    group: "Dados",
    label: "Fontes de Leilao",
    title: "Fontes de Leilao",
    eyebrow: "Origem e qualidade",
    description:
      "Cadastro de leiloeiros, portais, bancos, tribunais, importacoes e observacoes de permissao de uso.",
    icon: "RadioTower",
    accent: "yellow",
    status: "build",
    statusLabel: "Estrutura",
    metrics: [
      { label: "Fontes", value: "24", detail: "mapeadas" },
      { label: "Confiaveis", value: "16", detail: "score acima de 80" },
      { label: "Com alerta", value: "3", detail: "revisar origem" },
    ],
    workflow: ["Cadastrar fonte", "Definir permissao", "Importar dados", "Auditar qualidade"],
    focus: ["Termos de uso", "Robots/API", "Score da fonte", "Ultima coleta"],
    records: [
      {
        title: "Portal de banco",
        meta: "Importacao por CSV e link oficial",
        status: "Homologado",
        owner: "Operacao",
      },
      {
        title: "Leiloeiro regional",
        meta: "Precisa validar frequencia de atualizacao",
        status: "Atencao",
        owner: "Fonte",
      },
    ],
  }),
  createAdminModule({
    slug: "ia",
    legacySlugs: ["ai-office"],
    group: "Inteligencia",
    label: "Curadoria IA",
    title: "Curadoria IA",
    eyebrow: "AI Curator",
    description:
      "Normalizacao, inconsistencias, resumo da oportunidade, score e recomendacoes preliminares auditaveis.",
    icon: "Bot",
    accent: "purple",
    status: "ready",
    statusLabel: "Mock ativo",
    metrics: [
      { label: "Runs IA", value: "86", detail: "ultimos 7 dias" },
      { label: "Confianca media", value: "82%", detail: "sem parecer final" },
      { label: "Pendentes", value: "18", detail: "fila de analise" },
    ],
    workflow: ["Receber dados", "Gerar JSON", "Salvar logs", "Solicitar revisao"],
    focus: ["Prompt versionado", "Saida estruturada", "Confianca", "Revisao humana"],
    records: [
      {
        title: "Analise preliminar #AI-1042",
        meta: "Dados divergentes entre edital e anuncio",
        status: "Requer humano",
        owner: "AI Curator",
      },
      {
        title: "Resumo publico #AI-1038",
        meta: "Texto seguro sem promessa de lucro",
        status: "Aprovado",
        owner: "Compliance",
      },
    ],
  }),
  createAdminModule({
    slug: "agentes-ia",
    legacySlugs: ["agent-office", "orquestracao-ia", "agentes"],
    group: "Inteligencia",
    label: "Escritorio de Agentes IA",
    title: "Escritorio de Agentes IA",
    eyebrow: "Empresa virtual",
    description:
      "Empresa virtual de agentes com setores, salas, prompts proprios, funcoes, handoff humano, manutencao e execucao auditavel.",
    icon: "GitCompareArrows",
    accent: "purple",
    status: "build",
    statusLabel: "Escritorio",
    metrics: [
      { label: "Setores", value: "7", detail: "empresa virtual" },
      { label: "Agentes", value: "10", detail: "prompts especializados" },
      { label: "Prompts", value: "10", detail: "registro inicial" },
    ],
    workflow: ["Setorizar agentes", "Versionar prompts", "Rodar handoff", "Manter QA", "Executar com logs"],
    focus: ["Nome e funcao", "Prompt versionado", "Sala de manutencao", "Permissao por canal"],
    records: [
      {
        title: "Sala de Captacao",
        meta: "Busca fontes, editais e oportunidades dentro do padrao definido",
        status: "Supervisionado",
        owner: "Operacao",
      },
      {
        title: "Sala de Comunicacao",
        meta: "Clientes pagantes recebem completo; leads frios recebem teaser",
        status: "Planejado",
        owner: "Growth",
      },
    ],
  }),
  createAdminModule({
    slug: "central-inteligencia",
    legacySlugs: ["intelligence-center", "intel"],
    group: "Inteligencia",
    label: "Central de Inteligencia",
    title: "Central de Inteligencia",
    eyebrow: "Relatorios dos agentes",
    description:
      "Workspace compartilhado onde cada agente publica resultados estruturados: analises, riscos, resumos e insights consumidos pelo pipeline.",
    icon: "BrainCircuit",
    accent: "cyan",
    status: "build",
    statusLabel: "Estrutura",
    metrics: [
      { label: "Relatorios", value: "0", detail: "aguardando pipeline" },
      { label: "Por agente", value: "0", detail: "publicacoes" },
      { label: "Pendentes", value: "0", detail: "revisao" },
    ],
    workflow: ["Receber output", "Estruturar relatorio", "Publicar", "Consumir por agente"],
    focus: ["Agente origem", "Tipo", "Tags", "Revisao"],
    records: [
      {
        title: "Relatorios de curadoria",
        meta: "Outputs estruturados do pipeline de analise",
        status: "Pipeline",
        owner: "Agentes IA",
      },
      {
        title: "Conteudo derivado",
        meta: "Blog e noticias gerados a partir de inteligencia",
        status: "Planejado",
        owner: "Conteudo",
      },
    ],
  }),
  createAdminModule({
    slug: "conteudo",
    group: "Conteudo",
    label: "Conteudo",
    title: "Conteudo e Publicacao",
    eyebrow: "blog / noticias / publicacao",
    description:
      "Gerenciamento de conteudo gerado pelos agentes: artigos de blog, noticias, publicacoes no portal e alertas administrativos.",
    icon: "PenTool",
    accent: "purple",
    status: "build",
    statusLabel: "Fase 7",
    metrics: [
      { label: "Posts", value: "0", detail: "aguardando pipeline" },
      { label: "Publicados", value: "0", detail: "no portal" },
      { label: "Rascunhos", value: "0", detail: "em revisao" },
    ],
    workflow: ["Receber relatorio", "Gerar conteudo", "Revisar", "Publicar"],
    focus: ["Blog", "Noticias", "Portal", "Alertas admin"],
    records: [
      {
        title: "Artigos de blog",
        meta: "Gerados a partir de relatorios da Central de Inteligencia",
        status: "Planejado",
        owner: "Agente Blog",
      },
      {
        title: "Publicacao no portal",
        meta: "Oportunidades para assinantes com nivel de acesso",
        status: "Planejado",
        owner: "Agente Site Publisher",
      },
    ],
  }),
  createAdminModule({
    slug: "compliance",
    group: "Inteligencia",
    label: "Compliance",
    title: "Compliance Operacional",
    eyebrow: "Guardrails",
    description:
      "Regras de linguagem, limites de automacao, trilha de auditoria e bloqueios para decisoes criticas.",
    icon: "ShieldCheck",
    accent: "red",
    status: "attention",
    statusLabel: "Critico",
    metrics: [
      { label: "Regras", value: "12", detail: "ativas" },
      { label: "Bloqueios", value: "4", detail: "juridico e lance" },
      { label: "Alertas", value: "7", detail: "abertos" },
    ],
    workflow: ["Definir regra", "Aplicar bloqueio", "Registrar auditoria", "Revisar excecao"],
    focus: ["Sem risco zero", "Sem lucro garantido", "Humano decide", "Fonte oficial"],
    records: [
      {
        title: "Parecer juridico final",
        meta: "Nao pode ser emitido apenas pela IA",
        status: "Obrigatorio",
        owner: "Juridico",
      },
      {
        title: "Autopilot",
        meta: "Bloqueado para recomendacoes criticas",
        status: "Desativado",
        owner: "Compliance",
      },
    ],
  }),
  createAdminModule({
    slug: "revisao-juridica",
    legacySlugs: ["legal"],
    group: "Inteligencia",
    label: "Revisao Juridica",
    title: "Revisao Juridica",
    eyebrow: "Advogado/revisor",
    description:
      "Mesa para revisar edital, matricula, processo, ocupacao, debitos, ressalvas e decisao humana.",
    icon: "FileSearch",
    accent: "yellow",
    status: "attention",
    statusLabel: "Humano valida",
    metrics: [
      { label: "Aguardando", value: "19", detail: "itens na fila" },
      { label: "Com ressalvas", value: "8", detail: "publicaveis com cuidado" },
      { label: "Reprovados", value: "5", detail: "alto risco" },
    ],
    workflow: ["Abrir edital", "Comparar dados", "Registrar parecer", "Aprovar ou reprovar"],
    focus: ["Matricula", "Ocupacao", "Debitos", "Processo"],
    records: [
      {
        title: "Terreno em Porto Belo",
        meta: "Ausencia de informacao de debitos",
        status: "Pendente",
        owner: "Advogado",
      },
      {
        title: "Sala comercial em Florianopolis",
        meta: "Checklist documental completo",
        status: "Aprovado",
        owner: "Revisor",
      },
    ],
  }),
  createAdminModule({
    slug: "dossies",
    legacySlugs: ["dossiers", "contracts"],
    group: "Documentos",
    label: "Dossies",
    title: "Dossies",
    eyebrow: "Relatorios auditaveis",
    description:
      "Relatorio executivo por imovel com dados, scores, riscos, financeiro, fonte oficial e parecer humano.",
    icon: "Files",
    accent: "cyan",
    status: "build",
    statusLabel: "Template",
    metrics: [
      { label: "Gerados", value: "31", detail: "rascunhos e finais" },
      { label: "Aprovados", value: "12", detail: "com revisao humana" },
      { label: "Rascunhos", value: "9", detail: "aguardando dados" },
    ],
    workflow: ["Consolidar dados", "Adicionar riscos", "Revisar juridico", "Gerar HTML/PDF"],
    focus: ["Disclaimer", "Fonte oficial", "Logs de IA", "Parecer humano"],
    records: [
      {
        title: "Dossie BC-204",
        meta: "Apartamento com score 91",
        status: "Rascunho",
        owner: "Curadoria",
      },
      {
        title: "Dossie SP-118",
        meta: "Aprovado com ressalvas",
        status: "Final",
        owner: "Juridico",
      },
    ],
  }),
  createAdminModule({
    slug: "kanban",
    legacySlugs: ["post-auction", "possession"],
    group: "Operacao",
    label: "Kanban",
    title: "Kanban de Oportunidades",
    eyebrow: "Funil operacional",
    description:
      "Acompanhamento de novas oportunidades, analise, advogado, pronto para arremate, arrematado e pos-arremate.",
    icon: "Kanban",
    accent: "green",
    status: "build",
    statusLabel: "Fluxo visual",
    metrics: [
      { label: "Cards", value: "46", detail: "em aberto" },
      { label: "Vencendo", value: "6", detail: "proximas 48h" },
      { label: "Pos-arremate", value: "3", detail: "em acompanhamento" },
    ],
    workflow: ["Mover fase", "Atribuir responsavel", "Registrar acao", "Encerrar caso"],
    focus: ["Prazo", "Responsavel", "Proxima acao", "Risco"],
    records: [
      {
        title: "Aguardando advogado",
        meta: "19 oportunidades com SLA juridico",
        status: "Fila",
        owner: "Operacao",
      },
      {
        title: "Pos-arremate",
        meta: "3 casos com documentos pendentes",
        status: "Critico",
        owner: "Backoffice",
      },
    ],
  }),
  createAdminModule({
    slug: "alertas",
    legacySlugs: ["whatsapp"],
    group: "Operacao",
    label: "Alertas",
    title: "Alertas Inteligentes",
    eyebrow: "In-app, email e WhatsApp futuro",
    description:
      "Central de alertas para alto score, risco critico, alteracao de edital, leilao proximo e revisao pendente.",
    icon: "Bell",
    accent: "red",
    status: "build",
    statusLabel: "In-app",
    metrics: [
      { label: "Criticos", value: "7", detail: "acao imediata" },
      { label: "Hoje", value: "22", detail: "novos eventos" },
      { label: "Resolvidos", value: "41", detail: "semana atual" },
    ],
    workflow: ["Criar evento", "Classificar severidade", "Notificar responsavel", "Resolver"],
    focus: ["SLA", "Canal", "Responsavel", "Historico"],
    records: [
      {
        title: "Leilao em 24h",
        meta: "Validar teto e autorizacao antes da sessao",
        status: "Critico",
        owner: "Watchdog",
      },
      {
        title: "Mudanca de edital",
        meta: "Fonte atualizada apos primeira analise",
        status: "Revisar",
        owner: "IA",
      },
    ],
  }),
  createAdminModule({
    slug: "scraper",
    legacySlugs: ["scrapers", "crawlers"],
    group: "Dados",
    label: "Scraper",
    title: "Scraper de Leiloes",
    eyebrow: "Coleta automatizada",
    description:
      "Motor de scraping para portais de leilao, bancos e tribunais. Gerenciamento de alvos, agendamento e historico de coletas.",
    icon: "Globe",
    accent: "cyan",
    status: "build",
    statusLabel: "Infraestrutura",
    metrics: [
      { label: "Alvos", value: "14", detail: "cadastrados" },
      { label: "Ativos", value: "14", detail: "habilitados" },
      { label: "Coletas", value: "0", detail: "aguardando cron" },
    ],
    workflow: ["Cadastrar alvo", "Configurar seletores", "Executar coleta", "Ingerir oportunidades"],
    focus: ["URL", "Estrategia", "Rate limit", "Seletores CSS"],
    records: [
      {
        title: "Portais de leiloeiros",
        meta: "Zukerman, Mega, Vip, Sold, Superbid e outros",
        status: "Cadastrado",
        owner: "Scraper",
      },
      {
        title: "Bancos",
        meta: "Caixa, BB, Itau, Bradesco, Santander, Emgea",
        status: "Cadastrado",
        owner: "Scraper",
      },
    ],
  }),
  createAdminModule({
    slug: "integracoes",
    group: "Sistema",
    label: "Integracoes",
    title: "Integracoes",
    eyebrow: "APIs e automacoes",
    description:
      "Status de Supabase, R2, Inngest, WhatsApp, IA, email e webhooks futuros em um painel operacional.",
    icon: "Puzzle",
    accent: "cyan",
    status: "build",
    statusLabel: "Monitorado",
    metrics: [
      { label: "Conectadas", value: "3", detail: "ambiente local" },
      { label: "Pendentes", value: "4", detail: "chaves/API" },
      { label: "Erros", value: "1", detail: "ver manutencao" },
    ],
    workflow: ["Configurar chave", "Testar conexao", "Registrar custo", "Auditar chamada"],
    focus: ["Segredos", "Rate limit", "Custo", "Webhook"],
    records: [
      {
        title: "Gemini",
        meta: "Provider padrao para diagnosticos",
        status: "Configurar",
        owner: "IA",
      },
      {
        title: "R2 Storage",
        meta: "Buckets publico e privado",
        status: "Atencao",
        owner: "Infra",
      },
    ],
  }),
  createAdminModule({
    slug: "big-data-api",
    group: "Sistema",
    label: "Big Data API",
    title: "Big Data API",
    eyebrow: "Enriquecimento",
    description:
      "Adapter preparado para enriquecer endereco, mercado, processo, bairro, leiloeiro e comparaveis.",
    icon: "Database",
    accent: "purple",
    status: "build",
    statusLabel: "Adapter mock",
    metrics: [
      { label: "Chamadas", value: "0", detail: "mock local" },
      { label: "Custo", value: "R$ 0", detail: "sem API real" },
      { label: "Limite", value: "-", detail: "aguardando contrato" },
    ],
    workflow: ["Receber input", "Chamar adapter", "Normalizar retorno", "Salvar evidencias"],
    focus: ["BIGDATA_API_KEY", "Fallback mock", "LGPD", "Logs"],
    records: [
      {
        title: "Endereco",
        meta: "Normalizacao e dados socioeconomicos",
        status: "Mock",
        owner: "Adapter",
      },
      {
        title: "Valor de mercado",
        meta: "Comparaveis e liquidez futura",
        status: "Mock",
        owner: "Mercado",
      },
    ],
  }),
  createAdminModule({
    slug: "usuarios",
    group: "Conta",
    label: "Usuarios",
    title: "Usuarios",
    eyebrow: "Acesso e papeis",
    description:
      "Usuarios internos, revisores, analistas, administradores e clientes com acesso controlado por papel.",
    icon: "Users",
    accent: "green",
    status: "build",
    statusLabel: "RBAC futuro",
    metrics: [
      { label: "Usuarios", value: "18", detail: "mock" },
      { label: "Revisores", value: "4", detail: "juridico" },
      { label: "Admins", value: "3", detail: "conta" },
    ],
    workflow: ["Convidar", "Atribuir papel", "Vincular organizacao", "Auditar acesso"],
    focus: ["Papel", "Permissoes", "Organizacao", "Ultimo acesso"],
    records: [
      {
        title: "Analista de Curadoria",
        meta: "Pode editar oportunidade e solicitar revisao",
        status: "Permitido",
        owner: "Admin",
      },
      {
        title: "Advogado/Revisor",
        meta: "Pode aprovar, reprovar ou ressalvar",
        status: "Restrito",
        owner: "Juridico",
      },
    ],
  }),
  createAdminModule({
    slug: "organizacoes",
    group: "Conta",
    label: "Organizacoes",
    title: "Organizacoes",
    eyebrow: "Workspaces",
    description:
      "Separacao por workspace para multiusuario, RLS, preferencias, plano e trilha de auditoria.",
    icon: "Building2",
    accent: "cyan",
    status: "build",
    statusLabel: "Planejado",
    metrics: [
      { label: "Orgs", value: "5", detail: "mock" },
      { label: "Ativas", value: "4", detail: "com usuarios" },
      { label: "Pendentes", value: "1", detail: "onboarding" },
    ],
    workflow: ["Criar workspace", "Definir plano", "Convidar usuarios", "Aplicar RLS"],
    focus: ["organization_id", "Plano", "Permissoes", "Retencao"],
    records: [
      {
        title: "Betel Operacao",
        meta: "Workspace interno principal",
        status: "Ativo",
        owner: "Super Admin",
      },
      {
        title: "Fundo parceiro",
        meta: "Acesso viewer para dossies",
        status: "Piloto",
        owner: "Comercial",
      },
    ],
  }),
  createAdminModule({
    slug: "planos",
    group: "Conta",
    label: "Planos",
    title: "Planos",
    eyebrow: "Billing futuro",
    description:
      "Estrutura comercial para Explorador, Investidor, Profissional e Escritorio/Fundo sem precificacao fixa.",
    icon: "BadgeDollarSign",
    accent: "yellow",
    status: "build",
    statusLabel: "Sem billing",
    metrics: [
      { label: "Planos", value: "4", detail: "estruturados" },
      { label: "Assinaturas", value: "0", detail: "futuro" },
      { label: "Upsell", value: "11", detail: "sinais mock" },
    ],
    workflow: ["Definir limites", "Configurar features", "Medir uso", "Cobrar futuro"],
    focus: ["Limites", "Usuarios", "APIs", "Dossies"],
    records: [
      {
        title: "Profissional",
        meta: "Curadoria, dossies e revisao",
        status: "Planejado",
        owner: "Produto",
      },
      {
        title: "Escritorio/Fundo",
        meta: "Workspaces e controles avancados",
        status: "Planejado",
        owner: "Comercial",
      },
    ],
  }),
  createAdminModule({
    slug: "logs",
    legacySlugs: ["reports"],
    group: "Sistema",
    label: "Logs",
    title: "Logs e Auditoria",
    eyebrow: "Eventos operacionais",
    description:
      "Trilha de eventos de IA, revisoes humanas, chamadas de API, mudancas de status e decisoes criticas.",
    icon: "ScrollText",
    accent: "muted",
    status: "ready",
    statusLabel: "Visual",
    metrics: [
      { label: "Eventos", value: "680", detail: "mock" },
      { label: "Criticos", value: "24", detail: "precisam retencao" },
      { label: "API", value: "94", detail: "chamadas simuladas" },
    ],
    workflow: ["Capturar evento", "Classificar", "Vincular recurso", "Auditar"],
    focus: ["Entrada", "Saida", "Responsavel", "Timestamp"],
    records: [
      {
        title: "AI output saved",
        meta: "Prompt v0.3 - oportunidade BC-204",
        status: "Registrado",
        owner: "Sistema",
      },
      {
        title: "Legal review approved",
        meta: "Parecer humano com ressalvas",
        status: "Auditoria",
        owner: "Juridico",
      },
    ],
  }),
  createAdminModule({
    slug: "qualidade-ia",
    group: "Sistema",
    label: "Qualidade da IA",
    title: "Qualidade da IA",
    eyebrow: "QA e feedback",
    description:
      "Acompanhamento de falsos positivos, divergencias humanas, confianca, custo e versoes de prompt/modelo.",
    icon: "Brain",
    accent: "purple",
    status: "build",
    statusLabel: "QA",
    metrics: [
      { label: "Acuracia", value: "87%", detail: "mock revisado" },
      { label: "Falsos positivos", value: "6", detail: "semana" },
      { label: "Divergencias", value: "11", detail: "humano x IA" },
    ],
    workflow: ["Comparar saida", "Marcar erro", "Ajustar prompt", "Medir ganho"],
    focus: ["Modelo", "Prompt", "Feedback", "Custo"],
    records: [
      {
        title: "Prompt juridico v0.4",
        meta: "Reduziu recomendacoes conclusivas",
        status: "Melhorou",
        owner: "Produto IA",
      },
      {
        title: "Risco de ocupacao",
        meta: "3 falsos positivos em editais incompletos",
        status: "Ajustar",
        owner: "QA",
      },
    ],
  }),
  createAdminModule({
    slug: "configuracoes",
    legacySlugs: ["settings"],
    group: "Sistema",
    label: "Configuracoes",
    title: "Configuracoes",
    eyebrow: "Parametros",
    description:
      "Prompts, provedores, integracoes, regras de automacao, ambiente e configuracoes da plataforma.",
    icon: "Settings",
    accent: "muted",
    status: "build",
    statusLabel: "Inicial",
    metrics: [
      { label: "Prompts", value: "5", detail: "mapeados" },
      { label: "Providers", value: "2", detail: "Gemini/OpenAI futuro" },
      { label: "Secrets", value: "7", detail: "via env/app_config" },
    ],
    workflow: ["Editar parametro", "Validar segredo", "Salvar log", "Propagar mudanca"],
    focus: ["app_config", "Variaveis", "Permissoes", "Ambiente"],
    records: [
      {
        title: "Provider IA",
        meta: "Gemini como padrao inicial",
        status: "Ativo",
        owner: "Admin",
      },
      {
        title: "Nivel de automacao",
        meta: "Copilot/Supervisionado antes de Autopilot",
        status: "Restrito",
        owner: "Compliance",
      },
    ],
  }),
];

export const adminNavGroups: AdminNavGroup[] = [
  {
    label: "Dashboard",
    items: [{ href: "/admin", label: "Dashboard", icon: "LayoutDashboard" }],
  },
  {
    label: "Operacao",
    items: [
      { href: "/admin/oportunidades", label: "Oportunidades", icon: "Gavel" },
      { href: "/admin/investidores", label: "Investidores", icon: "Users" },
      { href: "/admin/scraper", label: "Scraper", icon: "Globe" },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { href: "/admin/agentes-ia", label: "Escritorio de Agentes IA", icon: "GitCompareArrows" },
      { href: "/admin/central-inteligencia", label: "Central de Inteligencia", icon: "BrainCircuit" },
    ],
  },
  {
    label: "Conteudo",
    items: [
      { href: "/admin/conteudo", label: "Conteudo", icon: "PenTool" },
    ],
  },
  {
    label: "Conta",
    items: [
      { href: "/admin/usuarios", label: "Usuarios", icon: "Users" },
    ],
  },
];

export const adminGroups = Array.from(new Set(adminModules.map((item) => item.group)));

const moduleAliases = new Map<string, AdminModule>();

for (const item of adminModules) {
  moduleAliases.set(item.slug, item);
  item.legacySlugs?.forEach((slug) => moduleAliases.set(slug, item));
}

export function getAdminModule(slug: string) {
  return moduleAliases.get(slug);
}

export function getAdminStaticSlugs() {
  return adminModules.flatMap((item) => [item.slug, ...(item.legacySlugs || [])]);
}

export function getCanonicalAdminHref(pathname: string) {
  if (pathname === "/admin") return "/admin";
  const slug = pathname.split("/").filter(Boolean)[1];
  if (!slug) return "/admin";
  return getAdminModule(slug)?.href || pathname;
}

export const executiveFocus = [
  "Schema Supabase para oportunidades, fontes, scores e revisoes",
  "AI Curator com JSON estruturado e logs versionados",
  "Compliance com revisao humana obrigatoria",
  "Dossie HTML pronto para PDF",
  "Adapters mock para Big Data API e notificacoes",
];
