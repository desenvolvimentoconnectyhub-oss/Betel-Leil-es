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
  children?: AdminNavItem[];
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
    label: "Imóveis analisados",
    title: "Imóveis analisados",
    eyebrow: "Vitrine operacional",
    description:
      "Catálogo dos imóveis analisados pela operação, com fotos, descrição, valores, score, risco e ficha completa.",
    icon: "Gavel",
    accent: "cyan",
    status: "build",
    statusLabel: "MVP visual",
    metrics: [
      { label: "Monitorados", value: "142", detail: "base mockada" },
      { label: "Alto potencial", value: "28", detail: "score acima de 80" },
      { label: "Risco critico", value: "7", detail: "bloqueio humano" },
    ],
    workflow: ["Captar fonte", "Montar vitrine", "Pontuar imóvel", "Abrir ficha completa"],
    focus: ["Fonte oficial", "Lance inicial", "Desconto real", "Teto racional"],
    records: [
      {
        title: "Apartamento em Balneário Camboriú",
        meta: "Leiloeiro homologado - 42% de desconto estimado",
        status: "Em análise",
        owner: "Curadoria IA",
      },
      {
        title: "Casa em Itajaí",
        meta: "Ocupação informada no edital",
        status: "Risco alto",
        owner: "Jurídico",
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
      "Modulo planejado para perfis de investidores, teses, teto de capital, apetite de risco e oportunidades compativeis.",
    icon: "Users",
    accent: "purple",
    status: "build",
    statusLabel: "Em breve",
    metrics: [
      { label: "Perfis", value: "0", detail: "cadastro ainda bloqueado" },
      { label: "Matches fortes", value: "0", detail: "dependente da base futura" },
      { label: "Teto medio", value: "-", detail: "capital nao coletado" },
    ],
    workflow: ["Liberar cadastro", "Definir tese", "Rodar matching", "Enviar dossie assistido"],
    focus: ["Teto", "Praca", "Apetite de risco", "ROI alvo"],
    records: [
      {
        title: "Fundo Litoral SC",
        meta: "Cadastro de perfis ficara para uma proxima fase.",
        status: "Planejado",
        owner: "Comercial",
      },
      {
        title: "Investidor Conservador SP",
        meta: "Matching com imoveis analisados sera liberado depois.",
        status: "Em breve",
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
    slug: "whatsapp",
    group: "Inteligencia",
    label: "Atendimento",
    title: "Atendimento WhatsApp",
    eyebrow: "Atendimento multicanal",
    description:
      "Central de atendimento WhatsApp com chat ao vivo, assumir conversa, CRM do lead, contexto de leilao, follow-up e auditoria operacional.",
    icon: "Headphones",
    accent: "green",
    status: "build",
    statusLabel: "Central WhatsApp",
    metrics: [
      { label: "Atendentes", value: "1+", detail: "ConnectyHub" },
      { label: "Canais", value: "voz/texto", detail: "WhatsApp" },
      { label: "CRM", value: "ativo", detail: "leads e follow-up" },
    ],
    workflow: ["Atender lead", "Assumir conversa", "Atualizar CRM", "Agendar follow-up", "Auditar qualidade"],
    focus: ["Chat ao vivo", "CRM do lead", "Contexto de leilao", "Handoff humano", "Evelyn"],
    records: [
      {
        title: "Configurar Evelyn",
        meta: "Conexao, prompt, voz e comportamento do agente WhatsApp",
        status: "Configuravel",
        owner: "Comercial",
      },
      {
        title: "Central de atendimento",
        meta: "Fila, chat ao vivo, SLA, historico, follow-up e auditoria",
        status: "Operacional",
        owner: "Atendimento",
      },
    ],
  }),
  createAdminModule({
    slug: "meta-ads",
    group: "Trafego IA",
    label: "Meta Ads",
    title: "Meta Ads",
    eyebrow: "trafego pago / meta",
    description:
      "Central preparada para campanhas pagas da Meta com IA, criativos, conjuntos, eventos, custos e recomendacoes.",
    icon: "BarChart3",
    accent: "yellow",
    status: "build",
    statusLabel: "Em breve",
    metrics: [
      { label: "Contas", value: "0", detail: "aguardando conexao" },
      { label: "Campanhas", value: "0", detail: "Meta Ads" },
      { label: "IA", value: "base", detail: "planejamento" },
    ],
    workflow: ["Conectar conta", "Sincronizar campanhas", "Auditar criativos", "Otimizar budget"],
    focus: ["Pixel/CAPI", "ROAS", "CPL", "Criativos", "Publicos"],
    records: [
      {
        title: "Integracao Meta Ads",
        meta: "Modulo separado para trafego pago com IA.",
        status: "Planejado",
        owner: "Trafego",
      },
    ],
  }),
  createAdminModule({
    slug: "meta-whatsapp",
    group: "Trafego IA",
    label: "Campanhas Meta WhatsApp",
    title: "Campanhas Meta WhatsApp",
    eyebrow: "cloud api oficial",
    description:
      "Campanhas e follow-ups em massa usando WhatsApp Cloud API oficial da Meta, com opt-in, templates aprovados e fila Inngest.",
    icon: "MessageSquareText",
    accent: "green",
    status: "build",
    statusLabel: "Em breve",
    metrics: [
      { label: "API", value: "Oficial", detail: "WhatsApp Cloud" },
      { label: "Opt-in", value: "Obrigatorio", detail: "listas autorizadas" },
      { label: "Fila", value: "Inngest", detail: "sem Vercel cron" },
    ],
    workflow: ["Configurar Meta", "Criar template", "Subir lista", "Aprovar campanha", "Enviar por fila"],
    focus: ["Opt-in", "Templates aprovados", "Limites", "Webhook de status"],
    records: [
      {
        title: "Campanhas oficiais",
        meta: "Envios ativos ficarao na API oficial da Meta, separados dos agentes WhatsApp.",
        status: "Planejado",
        owner: "Trafego",
      },
    ],
  }),
  createAdminModule({
    slug: "meta-whatsapp-chat",
    group: "Trafego IA",
    label: "Chat Meta WhatsApp",
    title: "Chat Meta WhatsApp",
    eyebrow: "inbox oficial",
    description:
      "Inbox planejado para conversas originadas pela WhatsApp Cloud API oficial, separado do atendimento ConnectyHub.",
    icon: "MessageCircle",
    accent: "cyan",
    status: "build",
    statusLabel: "Em breve",
    metrics: [
      { label: "Conversas", value: "0", detail: "Cloud API" },
      { label: "Janela", value: "24h", detail: "servico" },
      { label: "Handoff", value: "manual", detail: "futuro" },
    ],
    workflow: ["Receber webhook", "Abrir conversa", "Responder", "Registrar historico"],
    focus: ["Janela 24h", "Origem Meta", "Handoff", "Historico"],
    records: [
      { title: "Chat oficial", meta: "Planejado apos campanhas e webhooks.", status: "Planejado", owner: "Atendimento" },
    ],
  }),
  createAdminModule({
    slug: "meta-whatsapp-templates",
    group: "Trafego IA",
    label: "Templates Meta",
    title: "Templates Meta",
    eyebrow: "whatsapp cloud",
    description:
      "Criacao, sincronizacao e auditoria de templates oficiais gerenciados pelo painel.",
    icon: "Files",
    accent: "purple",
    status: "build",
    statusLabel: "Em breve",
    metrics: [
      { label: "Gerenciados", value: "0", detail: "pelo painel" },
      { label: "Aprovados", value: "0", detail: "Meta" },
      { label: "Antigos", value: "ocultos", detail: "em campanhas" },
    ],
    workflow: ["Criar template", "Enviar para Meta", "Aguardar aprovacao", "Usar em campanha"],
    focus: ["Variaveis", "Header", "Footer", "Botoes", "Preview"],
    records: [
      { title: "Templates oficiais", meta: "Criacao e sincronizacao ficam para uma proxima fase.", status: "Em breve", owner: "Trafego" },
    ],
  }),
  createAdminModule({
    slug: "google-ads",
    group: "Trafego IA",
    label: "Google Ads",
    title: "Google Ads",
    eyebrow: "trafego pago / google",
    description: "Modulo preparado para campanhas Google Ads, keywords, conversoes e otimizacao com IA.",
    icon: "BadgeDollarSign",
    accent: "yellow",
    status: "build",
    statusLabel: "Conexao",
    metrics: [
      { label: "Contas", value: "0", detail: "aguardando" },
      { label: "Campanhas", value: "0", detail: "Google" },
      { label: "Conversoes", value: "0", detail: "futuro" },
    ],
    workflow: ["Conectar conta", "Sincronizar campanhas", "Auditar keywords", "Otimizar conversoes"],
    focus: ["CPL", "Conversoes", "Keywords", "Landing pages"],
    records: [
      { title: "Google Ads", meta: "Planejado para a central de trafego IA.", status: "Planejado", owner: "Trafego" },
    ],
  }),
  createAdminModule({
    slug: "google-analytics",
    group: "Trafego IA",
    label: "Google Analytics",
    title: "Google Analytics",
    eyebrow: "analytics / eventos",
    description: "Modulo preparado para GA4, eventos, funis, fontes e comportamento de visitantes.",
    icon: "MonitorDot",
    accent: "cyan",
    status: "build",
    statusLabel: "Conexao",
    metrics: [
      { label: "Propriedades", value: "0", detail: "GA4" },
      { label: "Eventos", value: "0", detail: "futuro" },
      { label: "Funis", value: "0", detail: "futuro" },
    ],
    workflow: ["Conectar GA4", "Mapear eventos", "Cruzar leads", "Auditar funil"],
    focus: ["Eventos", "Origem", "UTM", "Conversao"],
    records: [
      { title: "Google Analytics", meta: "Planejado para leitura de funil.", status: "Planejado", owner: "Dados" },
    ],
  }),
  createAdminModule({
    slug: "trafego-organico",
    group: "Trafego IA",
    label: "Trafego Organico",
    title: "Trafego Organico",
    eyebrow: "conteudo / seo",
    description: "Central preparada para SEO, conteudo organico, distribuicao e performance por canal.",
    icon: "RadioTower",
    accent: "green",
    status: "build",
    statusLabel: "Conexao",
    metrics: [
      { label: "Conteudos", value: "0", detail: "organico" },
      { label: "Canais", value: "0", detail: "futuro" },
      { label: "Leads", value: "0", detail: "futuro" },
    ],
    workflow: ["Planejar pauta", "Publicar", "Distribuir", "Medir leads"],
    focus: ["SEO", "Posts", "Videos", "UTM"],
    records: [
      { title: "Organico IA", meta: "Planejado para conteudo e distribuicao.", status: "Planejado", owner: "Conteudo" },
    ],
  }),
  createAdminModule({
    slug: "caixa-meta",
    group: "Trafego IA",
    label: "Caixa Meta",
    title: "Caixa Meta",
    eyebrow: "inbox / mensagens",
    description: "Modulo preparado para centralizar mensagens e eventos de paginas, Instagram, Messenger e WhatsApp oficial.",
    icon: "Database",
    accent: "purple",
    status: "build",
    statusLabel: "Conexao",
    metrics: [
      { label: "Entradas", value: "0", detail: "Meta" },
      { label: "Canais", value: "0", detail: "futuro" },
      { label: "SLA", value: "-", detail: "futuro" },
    ],
    workflow: ["Receber eventos", "Classificar", "Responder", "Registrar CRM"],
    focus: ["Inbox", "Instagram", "Messenger", "WhatsApp Oficial"],
    records: [
      { title: "Caixa Meta", meta: "Planejado para inbox de trafego.", status: "Planejado", owner: "Atendimento" },
    ],
  }),
  createAdminModule({
    slug: "criativos",
    group: "Trafego IA",
    label: "Criativos",
    title: "Criativos",
    eyebrow: "assets / testes",
    description: "Biblioteca preparada para criativos, variacoes, copies, thumbnails e testes por campanha.",
    icon: "Puzzle",
    accent: "yellow",
    status: "build",
    statusLabel: "Conexao",
    metrics: [
      { label: "Criativos", value: "0", detail: "biblioteca" },
      { label: "Testes", value: "0", detail: "A/B" },
      { label: "Vencedores", value: "0", detail: "futuro" },
    ],
    workflow: ["Criar asset", "Versionar copy", "Testar", "Promover vencedor"],
    focus: ["Copy", "Imagem", "Video", "Headline"],
    records: [
      { title: "Biblioteca criativa", meta: "Planejada para campanhas pagas e organicas.", status: "Planejado", owner: "Criacao" },
    ],
  }),
  createAdminModule({
    slug: "mensagens",
    legacySlugs: ["messages", "comunicacoes", "templates"],
    group: "Inteligencia",
    label: "Mensagens",
    title: "Mensagens",
    eyebrow: "templates / destinatarios",
    description:
      "Central para personalizar mensagens, escolher destinatarios, configurar rotas de relatorio e criar envios supervisionados.",
    icon: "MessageSquareText",
    accent: "cyan",
    status: "build",
    statusLabel: "Templates",
    metrics: [
      { label: "Templates", value: "7", detail: "defaults + Supabase" },
      { label: "Rotas", value: "1", detail: "relatorio de analise" },
      { label: "Outbox", value: "fila", detail: "entrega auditavel" },
    ],
    workflow: ["Editar template", "Escolher destinatarios", "Pre-visualizar", "Criar outbox", "Processar entrega"],
    focus: ["Texto final", "Usuario especifico", "Segmentos", "Auditoria"],
    records: [
      {
        title: "Relatorio da analise de mercado",
        meta: "Rota decide quais administradores recebem o resumo operacional",
        status: "Ativo",
        owner: "Operacao",
      },
      {
        title: "Mensagem direta",
        meta: "Admin escolhe segmento, usuario especifico ou contato manual",
        status: "Outbox",
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
    focus: ["Matrícula", "Ocupação", "Débitos", "Processo"],
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
    workflow: ["Mover fase", "Atribuir responsável", "Registrar ação", "Encerrar caso"],
    focus: ["Prazo", "Responsável", "Próxima ação", "Risco"],
    records: [
      {
        title: "Aguardando advogado",
        meta: "19 oportunidades com SLA jurídico",
        status: "Fila",
        owner: "Operação",
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
      { label: "Críticos", value: "7", detail: "ação imediata" },
      { label: "Hoje", value: "22", detail: "novos eventos" },
      { label: "Resolvidos", value: "41", detail: "semana atual" },
    ],
    workflow: ["Criar evento", "Classificar severidade", "Notificar responsável", "Resolver"],
    focus: ["SLA", "Canal", "Responsável", "Histórico"],
    records: [
      {
        title: "Leilão em 24h",
        meta: "Validar teto e autorização antes da sessão",
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
    label: "Analise de mercado",
    title: "Analise de mercado",
    eyebrow: "Links importados",
    description:
      "Mesa para importar links de imoveis, capturar dados e imagens, gerar analise preliminar e avisar o setor responsavel por WhatsApp.",
    icon: "Globe",
    accent: "cyan",
    status: "build",
    statusLabel: "Nova fase",
    metrics: [
      { label: "Entrada", value: "XLSX", detail: "CSV e TXT tambem" },
      { label: "Inicio", value: "Manual", detail: "por botao" },
      { label: "Aviso", value: "WhatsApp", detail: "por setor" },
    ],
    workflow: ["Subir arquivo", "Validar links", "Iniciar processo", "Revisar oportunidades"],
    focus: ["Lote", "Imagens", "Gemini", "WhatsApp"],
    records: [
      {
        title: "Importacao por planilha",
        meta: "Links prontos enviados pela equipe",
        status: "Ativo",
        owner: "Analise de Mercado",
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
      { label: "Críticos", value: "24", detail: "precisam retenção" },
      { label: "API", value: "94", detail: "chamadas simuladas" },
    ],
    workflow: ["Capturar evento", "Classificar", "Vincular recurso", "Auditar"],
    focus: ["Entrada", "Saída", "Responsável", "Timestamp"],
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
      {
        href: "/admin/scraper",
        label: "Analise de mercado",
        icon: "Globe",
        children: [
          { href: "/admin/oportunidades", label: "Imóveis analisados", icon: "Gavel" },
        ],
      },
      { href: "/admin/investidores", label: "Investidores", icon: "Users", badge: "Em breve" },
    ],
  },
  {
    label: "Inteligencia",
    items: [
      { href: "/admin/agentes-ia", label: "Escritorio de Agentes IA", icon: "GitCompareArrows", badge: "Em breve" },
      {
        href: "/admin/whatsapp",
        label: "Agentes WhatsApp",
        icon: "Bot",
        children: [
          { href: "/admin/whatsapp", label: "Atendimento", icon: "Headphones" },
          { href: "/admin/mensagens", label: "Mensagens e remetente", icon: "MessageSquareText" },
        ],
      },
      { href: "/admin/central-inteligencia", label: "Central de Inteligencia", icon: "BrainCircuit", badge: "Em breve" },
    ],
  },
  {
    label: "Trafego IA",
    items: [
      { href: "/admin/meta-ads", label: "Meta Ads", icon: "BarChart3", badge: "Em breve" },
      { href: "/admin/meta-whatsapp", label: "Campanhas Meta WhatsApp", icon: "MessageSquareText", badge: "Em breve" },
      { href: "/admin/meta-whatsapp-chat", label: "Chat Meta WhatsApp", icon: "MessageCircle", badge: "Em breve" },
      { href: "/admin/meta-whatsapp-templates", label: "Templates Meta", icon: "Files", badge: "Em breve" },
      { href: "/admin/google-ads", label: "Google Ads", icon: "BadgeDollarSign", badge: "Em breve" },
      { href: "/admin/google-analytics", label: "Google Analytics", icon: "MonitorDot", badge: "Em breve" },
      { href: "/admin/trafego-organico", label: "Trafego Organico", icon: "RadioTower", badge: "Em breve" },
      { href: "/admin/caixa-meta", label: "Caixa Meta", icon: "Database", badge: "Em breve" },
      { href: "/admin/criativos", label: "Criativos", icon: "Puzzle", badge: "Em breve" },
    ],
  },
  {
    label: "Conteudo",
    items: [
      { href: "/admin/conteudo", label: "Conteudo", icon: "PenTool", badge: "Em breve" },
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
  if (pathname === "/admin/whatsapp/remetente") return "/admin/mensagens";
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
