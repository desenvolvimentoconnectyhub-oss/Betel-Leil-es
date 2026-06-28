import type { ResourceTone } from "./resources";

export type AgentStatus = "active" | "supervised" | "paused" | "planned";

export type AgentWorker = {
  key: string;
  name: string;
  role: string;
  promptName: string;
  promptVersion: string;
  status: AgentStatus;
  tone: ResourceTone;
  trigger: string;
  inputs: string[];
  outputs: string[];
  guardrails: string[];
};

export type AgentGroup = {
  key: string;
  name: string;
  eyebrow: string;
  purpose: string;
  status: string;
  tone: ResourceTone;
  trigger: string;
  humanGate: string;
  sla: string;
  apiDependencies: string[];
  agents: AgentWorker[];
};

export type AgentWorkflowStage = {
  label: string;
  description: string;
  owner: string;
  tone: ResourceTone;
};

export type AgentWorkflowEdge = {
  key: string;
  fromAgentKey: string;
  fromAgent: string;
  toAgentKey: string;
  toAgent: string;
  condition: string;
  trigger: string;
  output: string;
  requiresHumanApproval: boolean;
  tone: ResourceTone;
};

export type AgentRunSample = {
  id: string;
  agentKey?: string;
  agent: string;
  opportunity: string;
  status: string;
  triggerSource?: string;
  inputSummary?: string;
  outputSummary?: string;
  humanReviewStatus?: string;
  handoff: string;
  nextAction: string;
  errorMessage?: string;
  costEstimate?: number;
  attemptCount?: number;
  maxAttempts?: number;
  provider?: string;
  model?: string;
  durationMs?: number;
  startedAt?: string;
  completedAt?: string;
  tone: ResourceTone;
};

export type AgentRuntimeEvent = {
  id: string;
  runCode: string;
  agentKey: string;
  eventType: string;
  status: string;
  provider: string;
  model: string;
  attempt: number;
  durationMs?: number;
  costEstimate?: number;
  message: string;
  payload?: Record<string, unknown>;
  createdAt: string;
  tone: ResourceTone;
};

export type CommunicationSegment = {
  label: string;
  agent: string;
  audience: string;
  rule: string;
  status: string;
  tone: ResourceTone;
};

export type CommunicationOutboxItem = {
  id: string;
  messageCode: string;
  runCode: string;
  agentKey: string;
  agent: string;
  audience: string;
  channel: string;
  detailLevel: string;
  status: string;
  opportunity: string;
  recipientLabel: string;
  recipientPlan?: string;
  recipientLifecycle?: string;
  recipientMatchScore?: number;
  fullAccess?: boolean;
  cadenceLabel?: string;
  preview: string;
  guardrail: string;
  createdAt: string;
  scheduledFor?: string;
  isDue?: boolean;
  sentAt?: string;
  errorMessage?: string;
  deliveryAttempt?: number;
  nextRetryAt?: string;
  adapterLabel?: string;
  providerStatus?: string;
  tone: ResourceTone;
};

export type AgentOfficeRoom = {
  key: string;
  name: string;
  sector: string;
  purpose: string;
  lead: string;
  operatingMode: string;
  status: string;
  tone: ResourceTone;
  agents: string[];
  systems: string[];
  rituals: string[];
  maintenanceFocus: string;
};

export type AgentDirectoryEntry = {
  key: string;
  name: string;
  department: string;
  group: string;
  jobTitle: string;
  functionSummary: string;
  promptName: string;
  promptVersion: string;
  status: AgentStatus;
  tone: ResourceTone;
  reportsTo: string;
  currentDesk: string;
  currentShift: string;
  avatarIcon: string;
};

export type AgentPromptRegistryItem = {
  key: string;
  promptName: string;
  promptVersion: string;
  agent: string;
  department: string;
  objective: string;
  updatePolicy: string;
  owner: string;
  status: AgentStatus;
  tone: ResourceTone;
};

export type AgentMaintenanceItem = {
  code: string;
  area: string;
  owner: string;
  severity: string;
  status: string;
  check: string;
  nextAction: string;
  tone: ResourceTone;
};

export const agentWorkflowStages: AgentWorkflowStage[] = [
  {
    label: "Busca",
    description: "Agentes vasculham fontes e APIs para encontrar imoveis dentro do padrao definido.",
    owner: "Grupo Captacao",
    tone: "cyan",
  },
  {
    label: "Curadoria",
    description: "Agentes conferem edital, dados externos, riscos ocultos, score e divergencias.",
    owner: "Grupo Curadoria",
    tone: "purple",
  },
  {
    label: "Revisao humana",
    description: "Responsavel interno recebe alerta, valida evidencias e aprova ou bloqueia a oportunidade.",
    owner: "Juridico/Operacao",
    tone: "yellow",
  },
  {
    label: "Comunicacao",
    description: "Agentes avisam clientes pagantes, leads frios, comunidade, push e email conforme permissao.",
    owner: "Grupo Growth",
    tone: "green",
  },
  {
    label: "Execucao",
    description: "Contrato, teto de lance, sala de arremate e pos-arremate seguem com guardrails.",
    owner: "Mesa Betel",
    tone: "red",
  },
];

export const agentGroups: AgentGroup[] = [
  {
    key: "captacao",
    name: "Grupo Captacao de Oportunidades",
    eyebrow: "fontes / APIs / filtros",
    purpose:
      "Encontrar imoveis de leilao que batem com padroes de valor, desconto, praca, tipo e qualidade minima da fonte.",
    status: "Ativo supervisionado",
    tone: "cyan",
    trigger: "Agendamento, webhook de fonte, importacao CSV ou busca manual.",
    humanGate: "Nao publica nada. Apenas cria ou atualiza oportunidades em fila.",
    sla: "15 min por lote",
    apiDependencies: ["Portais de leilao", "Bancos", "Tribunais", "Big Data API futura"],
    agents: [
      {
        key: "source-scout",
        name: "Renata — Buscadora de Imoveis",
        role: "Busca oportunidades em fontes homologadas e aplica os filtros minimos.",
        promptName: "auction_source_scout",
        promptVersion: "v0.1",
        status: "supervised",
        tone: "cyan",
        trigger: "Nova fonte ou janela de coleta",
        inputs: ["URL/API da fonte", "Padrao de imovel", "Praca alvo", "Faixa de lance"],
        outputs: ["auction_opportunities", "auction_sources", "audit_logs"],
        guardrails: ["Respeitar fonte oficial", "Registrar origem", "Nao inferir dados ausentes"],
      },
      {
        key: "source-watchdog",
        name: "Marcos — Monitor de Edital",
        role: "Detecta mudancas em edital, data, lance, status e documentos.",
        promptName: "auction_notice_watchdog",
        promptVersion: "v0.1",
        status: "planned",
        tone: "yellow",
        trigger: "Mudanca de pagina, diff de arquivo ou nova coleta",
        inputs: ["Edital anterior", "Edital atual", "Metadados da fonte"],
        outputs: ["admin_alerts", "audit_logs"],
        guardrails: ["Alertar humano em mudanca critica", "Nao sobrescrever evidencia antiga"],
      },
    ],
  },
  {
    key: "curadoria",
    name: "Grupo Curadoria e Verificacao",
    eyebrow: "edital / divergencia / risco oculto",
    purpose:
      "Vasculhar se o edital e verdadeiro, se os dados batem com outras fontes e se existe surpresa fora do edital.",
    status: "Prioritario",
    tone: "purple",
    trigger: "Oportunidade nova ou atualizada pelo grupo de captacao.",
    humanGate: "Encaminha para advogado/revisor quando risco, divergencia ou baixa confianca aparecem.",
    sla: "30 min por imovel",
    apiDependencies: ["Big Data API", "Cartorios", "Processos judiciais", "Comparaveis de mercado"],
    agents: [
      {
        key: "notice-curator",
        name: "Helena — Curadora de Edital",
        role: "Extrai fatos do edital, identifica campos ausentes e cria checklist inicial.",
        promptName: "auction_notice_curator",
        promptVersion: "v0.2",
        status: "supervised",
        tone: "purple",
        trigger: "Edital anexado",
        inputs: ["PDF/link do edital", "Dados da fonte", "Resumo do imovel"],
        outputs: ["ai_analysis_runs", "checklist", "documents"],
        guardrails: ["Separar fato de hipotese", "Marcar campo ausente", "Sem promessa de lucro"],
      },
      {
        key: "hidden-risk",
        name: "Igor — Analista de Risco Oculto",
        role: "Cruza edital com APIs externas para achar ocupacao, debitos, processo e divergencias.",
        promptName: "hidden_risk_reviewer",
        promptVersion: "v0.1",
        status: "planned",
        tone: "red",
        trigger: "Curadoria preliminar concluida",
        inputs: ["Edital estruturado", "Endereco", "Matricula", "Processos", "Dados de mercado"],
        outputs: ["risk_flags", "admin_alerts", "legal_reviews"],
        guardrails: ["Bloquear recomendacao conclusiva", "Exigir evidencia externa", "Escalar risco alto"],
      },
    ],
  },
  {
    key: "revisao",
    name: "Grupo Revisao Humana Assistida",
    eyebrow: "advogado / compliance / aprovacao",
    purpose:
      "Avisar responsaveis internos, organizar evidencias e exigir aprovacao humana antes de publicar oportunidade.",
    status: "Humano obrigatorio",
    tone: "yellow",
    trigger: "Curadoria concluida, risco alto, divergencia ou dossie pronto.",
    humanGate: "Advogado ou responsavel da empresa aprova, ressalva ou reprova.",
    sla: "SLA por risco e data do leilao",
    apiDependencies: ["Legal reviews", "Dossiers", "Audit logs"],
    agents: [
      {
        key: "human-handoff",
        name: "Patricia — Coordenadora de Revisao",
        role: "Notifica responsavel da empresa com resumo, pendencias e evidencias.",
        promptName: "human_review_handoff",
        promptVersion: "v0.1",
        status: "supervised",
        tone: "yellow",
        trigger: "Fim da curadoria",
        inputs: ["Analise IA", "Riscos", "Documentos", "SLA"],
        outputs: ["admin_alerts", "legal_reviews", "audit_logs"],
        guardrails: ["Nao aprovar sozinho", "Mostrar pendencias", "Registrar responsavel humano"],
      },
      {
        key: "compliance-guard",
        name: "Dr. Otavio — Guardrail Compliance",
        role: "Bloqueia linguagem proibida, recomendacao conclusiva e envio sem revisao.",
        promptName: "compliance_guardrail",
        promptVersion: "v0.3",
        status: "active",
        tone: "red",
        trigger: "Antes de dossie, WhatsApp, email ou comunidade",
        inputs: ["Mensagem", "Status juridico", "Contrato", "Risco"],
        outputs: ["audit_logs", "admin_alerts"],
        guardrails: ["Sem lucro garantido", "Sem risco zero", "Contrato antes de execucao"],
      },
    ],
  },
  {
    key: "comunicacao",
    name: "Grupo Comunicacao e Growth",
    eyebrow: "clientes / leads / comunidade",
    purpose:
      "Avisar clientes pagantes com oportunidade completa e leads frios com teaser seguro para conversao de plano.",
    status: "Apos aprovacao",
    tone: "green",
    trigger: "Oportunidade aprovada por humano e regras de plano satisfeitas.",
    humanGate: "Envio externo com revisao e logs; completo apenas para quem tem plano/acesso.",
    sla: "Imediato apos aprovacao",
    apiDependencies: ["WhatsApp/ConnectyHub futuro", "Email", "Push", "Comunidade"],
    agents: [
      {
        key: "paid-lead-alert",
        name: "Camila — Atendimento Premium",
        role: "Envia oportunidade completa para leads/clientes com acesso ao plano correto.",
        promptName: "paid_opportunity_alert",
        promptVersion: "v0.1",
        status: "planned",
        tone: "green",
        trigger: "Oportunidade aprovada e segmentada",
        inputs: ["Dossie aprovado", "Plano do cliente", "Perfil do investidor", "Contrato quando aplicavel"],
        outputs: ["communication_logs", "audit_logs"],
        guardrails: ["Checar plano", "Checar contrato quando orientar lance", "Registrar mensagem"],
      },
      {
        key: "cold-lead-teaser",
        name: "Tiago — Captacao de Leads",
        role: "Envia chamada parcial, sem entregar a oportunidade completa, incentivando compra de plano.",
        promptName: "cold_lead_teaser",
        promptVersion: "v0.1",
        status: "planned",
        tone: "cyan",
        trigger: "Nova oportunidade publicavel",
        inputs: ["Resumo seguro", "Plano recomendado", "Canal permitido"],
        outputs: ["communication_logs", "crm_events"],
        guardrails: ["Nao revelar endereco completo", "Nao prometer retorno", "CTA para plano"],
      },
      {
        key: "community-broadcaster",
        name: "Beatriz — Gestora de Comunidade",
        role: "Publica recortes educacionais e oportunidades resumidas nos grupos e canais da comunidade.",
        promptName: "community_opportunity_broadcast",
        promptVersion: "v0.1",
        status: "planned",
        tone: "purple",
        trigger: "Oportunidade publicavel e aprovada para comunicacao ampla",
        inputs: ["Resumo seguro", "Canal da comunidade", "Calendario editorial"],
        outputs: ["community_posts", "communication_logs"],
        guardrails: ["Sem endereco completo", "Sem orientacao individual", "Sem promessa de retorno"],
      },
      {
        key: "multichannel-dispatch",
        name: "Willian - Distribuidor WhatsApp e Email",
        role: "Distribui oportunidades por WhatsApp e email com opt-in, frequencia, plano e auditoria por usuario.",
        promptName: "multichannel_dispatch",
        promptVersion: "v0.1",
        status: "planned",
        tone: "yellow",
        trigger: "Oportunidade aprovada e usuario possui canal permitido",
        inputs: ["Preferencias do usuario", "Plano", "Canal opt-in", "Resumo aprovado"],
        outputs: ["whatsapp_jobs", "email_jobs", "communication_logs"],
        guardrails: ["Respeitar opt-in", "Controlar frequencia", "Registrar entrega por canal"],
      },
    ],
  },
  {
    key: "execucao",
    name: "Grupo Execucao de Arremate",
    eyebrow: "contrato / lance / pos-arremate",
    purpose:
      "Atuar depois da autorizacao: teto, estrategia, sala de arremate e acompanhamento pos-arremate.",
    status: "Dependente do contrato",
    tone: "red",
    trigger: "Contrato assinado e `gate.canOperate` verdadeiro.",
    humanGate: "Operador humano controla lance e confirma decisoes criticas.",
    sla: "Conforme data do leilao",
    apiDependencies: ["advisory_contracts", "bid_strategies", "auction_sessions", "post_auction_cases"],
    agents: [
      {
        key: "bid-strategy",
        name: "Rafael — Estrategista de Lance",
        role: "Prepara teto e plano de lance usando autorizacao, risco, ROI e custos.",
        promptName: "bid_strategy_builder",
        promptVersion: "v0.1",
        status: "planned",
        tone: "red",
        trigger: "Contrato assinado",
        inputs: ["Contrato", "Teto autorizado", "Custos", "ROI alvo"],
        outputs: ["bid_strategies", "audit_logs"],
        guardrails: ["Nunca passar do teto", "Humano aprova", "Registrar racional"],
      },
      {
        key: "post-auction",
        name: "Fernanda — Gestora Pos-Arremate",
        role: "Acompanha pagamento, documentacao, registro, posse, chaves e pendencias.",
        promptName: "post_auction_case_manager",
        promptVersion: "v0.1",
        status: "planned",
        tone: "yellow",
        trigger: "Arremate concluido",
        inputs: ["Resultado do leilao", "Contrato", "Comprovantes", "Checklist"],
        outputs: ["post_auction_cases", "admin_alerts"],
        guardrails: ["SLA por etapa", "Escalar pendencias", "Registrar evidencias"],
      },
    ],
  },
  {
    key: "conteudo",
    name: "Grupo Conteudo e Publicacao",
    eyebrow: "blog / noticias / publicacao",
    purpose:
      "Transformar inteligencia do pipeline em conteudo: artigos, noticias, publicacao no site e alertas administrativos.",
    status: "Planejado",
    tone: "purple",
    trigger: "Novos relatorios publicados na Central de Inteligencia ou eventos criticos do sistema.",
    humanGate: "Revisao antes de publicar. Admin-alert nao precisa de gate.",
    sla: "30 min para alertas, 4h para conteudo",
    apiDependencies: ["Central de Inteligencia", "Blog CMS", "Site Publisher", "Admin Notifications"],
    agents: [
      {
        key: "blog-writer",
        name: "Julia — Redatora de Blog",
        role: "Cria artigos de blog a partir de relatorios da Central de Inteligencia.",
        promptName: "blog_content_writer",
        promptVersion: "v0.1",
        status: "planned",
        tone: "purple",
        trigger: "Novos relatorios publicados",
        inputs: ["Relatorio de inteligencia", "Tipo de conteudo", "Calendario editorial"],
        outputs: ["content_posts", "audit_logs"],
        guardrails: ["Sem promessa de lucro", "Sem endereco completo", "Revisar antes de publicar"],
      },
      {
        key: "news-writer",
        name: "Andre — Reporter de Noticias",
        role: "Gera noticias e atualizacoes do feed a partir de relatorios.",
        promptName: "news_content_writer",
        promptVersion: "v0.1",
        status: "planned",
        tone: "cyan",
        trigger: "Novos relatorios publicados",
        inputs: ["Relatorio de inteligencia", "Contexto de mercado", "Formato de noticia"],
        outputs: ["content_posts", "audit_logs"],
        guardrails: ["Sem dados sensiveis", "Fatos verificaveis", "Linguagem neutra"],
      },
      {
        key: "site-publisher",
        name: "Danilo — Publicador do Portal",
        role: "Registra oportunidades aprovadas no portal publico para assinantes.",
        promptName: "site_opportunity_publisher",
        promptVersion: "v0.1",
        status: "planned",
        tone: "green",
        trigger: "Oportunidade aprovada por humano",
        inputs: ["Oportunidade aprovada", "Nivel de acesso", "Dados do plano"],
        outputs: ["subscriber_opportunity_access", "content_posts", "audit_logs"],
        guardrails: ["Respeitar nivel de acesso", "Teaser para explorer", "Completo para investor+"],
      },
      {
        key: "admin-alert",
        name: "Vinicius — Sentinela de Alertas",
        role: "Notifica admins sobre eventos importantes: erros, alertas de severidade alta, pipeline travado.",
        promptName: "admin_alert_dispatcher",
        promptVersion: "v0.1",
        status: "planned",
        tone: "red",
        trigger: "Erros, alertas de severidade alta, pipeline travado",
        inputs: ["Evento do sistema", "Severidade", "Contexto"],
        outputs: ["admin_alerts", "audit_logs"],
        guardrails: ["Nao enviar spam", "Agrupar alertas similares", "Escalar por severidade"],
      },
    ],
  },
];

export const agentWorkflowEdges: AgentWorkflowEdge[] = [
  {
    key: "source-scout-to-notice-curator",
    fromAgentKey: "source-scout",
    fromAgent: "Renata — Buscadora de Imoveis",
    toAgentKey: "notice-curator",
    toAgent: "Helena — Curadora de Edital",
    condition: "Oportunidade nova passou nos filtros minimos.",
    trigger: "Criar checklist de edital e estruturar dados do imovel.",
    output: "Run de curadoria com edital, fonte, endereco e dados financeiros.",
    requiresHumanApproval: false,
    tone: "cyan",
  },
  {
    key: "source-watchdog-to-notice-curator",
    fromAgentKey: "source-watchdog",
    fromAgent: "Marcos — Monitor de Edital",
    toAgentKey: "notice-curator",
    toAgent: "Helena — Curadora de Edital",
    condition: "Edital, data, lance ou documento mudou.",
    trigger: "Reprocessar curadoria com diff da fonte.",
    output: "Run de recuradoria com versao anterior e atual.",
    requiresHumanApproval: false,
    tone: "yellow",
  },
  {
    key: "notice-curator-to-hidden-risk",
    fromAgentKey: "notice-curator",
    fromAgent: "Helena — Curadora de Edital",
    toAgentKey: "hidden-risk",
    toAgent: "Igor — Analista de Risco Oculto",
    condition: "Curadoria preliminar encontrou campos relevantes ou dados ausentes.",
    trigger: "Cruzar edital com APIs externas e buscar surpresa fora do edital.",
    output: "Flags de risco, divergencias e pendencias para revisao.",
    requiresHumanApproval: false,
    tone: "purple",
  },
  {
    key: "hidden-risk-to-human-handoff",
    fromAgentKey: "hidden-risk",
    fromAgent: "Igor — Analista de Risco Oculto",
    toAgentKey: "human-handoff",
    toAgent: "Patricia — Coordenadora de Revisao",
    condition: "Risco, divergencia ou baixa confianca exige responsavel humano.",
    trigger: "Avisar advogado ou operador interno com evidencias.",
    output: "Resumo de pendencias, evidencias e SLA de aprovacao.",
    requiresHumanApproval: false,
    tone: "red",
  },
  {
    key: "human-handoff-to-compliance-guard",
    fromAgentKey: "human-handoff",
    fromAgent: "Patricia — Coordenadora de Revisao",
    toAgentKey: "compliance-guard",
    toAgent: "Dr. Otavio — Guardrail Compliance",
    condition: "Humano aprovou, aprovou com ressalva ou bloqueou uma oportunidade.",
    trigger: "Validar linguagem, gate juridico e permissao de comunicacao.",
    output: "Decisao de liberacao, ressalva ou bloqueio para canais externos.",
    requiresHumanApproval: true,
    tone: "yellow",
  },
  {
    key: "compliance-guard-to-paid-lead-alert",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "paid-lead-alert",
    toAgent: "Camila — Atendimento Premium",
    condition: "Oportunidade aprovada e cliente tem plano/acesso compativel.",
    trigger: "Enviar oportunidade completa aos clientes elegiveis.",
    output: "Runs de comunicacao completa com logs por canal.",
    requiresHumanApproval: true,
    tone: "green",
  },
  {
    key: "compliance-guard-to-cold-lead-teaser",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "cold-lead-teaser",
    toAgent: "Tiago — Captacao de Leads",
    condition: "Oportunidade publicavel, mas lead nao possui acesso completo.",
    trigger: "Enviar teaser seguro e CTA de plano.",
    output: "Mensagem parcial sem endereco completo ou tese sensivel.",
    requiresHumanApproval: true,
    tone: "cyan",
  },
  {
    key: "compliance-guard-to-community-broadcaster",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "community-broadcaster",
    toAgent: "Beatriz — Gestora de Comunidade",
    condition: "Oportunidade pode virar conteudo educacional ou chamada publica segura.",
    trigger: "Criar publicacao de comunidade sem dados sensiveis.",
    output: "Post resumido com contexto de mercado e CTA seguro.",
    requiresHumanApproval: true,
    tone: "purple",
  },
  {
    key: "compliance-guard-to-multichannel-dispatch",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "multichannel-dispatch",
    toAgent: "Willian - Distribuidor WhatsApp e Email",
    condition: "Usuario possui opt-in de WhatsApp, email ou outro canal permitido.",
    trigger: "Preparar envios por preferencia de canal e frequencia.",
    output: "Fila de WhatsApp e email com logs de entrega por usuario.",
    requiresHumanApproval: true,
    tone: "yellow",
  },
  {
    key: "paid-lead-alert-to-bid-strategy",
    fromAgentKey: "paid-lead-alert",
    fromAgent: "Camila — Atendimento Premium",
    toAgentKey: "bid-strategy",
    toAgent: "Rafael — Estrategista de Lance",
    condition: "Cliente pediu acompanhamento e contrato/autorizacao foi liberado.",
    trigger: "Preparar teto de lance, custos, risco e roteiro de arremate.",
    output: "Run de estrategia respeitando contrato e teto autorizado.",
    requiresHumanApproval: true,
    tone: "red",
  },
  {
    key: "bid-strategy-to-post-auction",
    fromAgentKey: "bid-strategy",
    fromAgent: "Rafael — Estrategista de Lance",
    toAgentKey: "post-auction",
    toAgent: "Fernanda — Gestora Pos-Arremate",
    condition: "Arremate concluido ou caso precisa acompanhamento posterior.",
    trigger: "Abrir checklist de pagamento, registro, posse e chaves.",
    output: "Caso pos-arremate com prazos, documentos e pendencias.",
    requiresHumanApproval: true,
    tone: "yellow",
  },
  {
    key: "intelligence-to-blog-writer",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "blog-writer",
    toAgent: "Julia — Redatora de Blog",
    condition: "Relatorio publicado na Central de Inteligencia com tipo adequado para blog.",
    trigger: "Gerar artigo de blog a partir do relatorio.",
    output: "Rascunho de artigo para revisao editorial.",
    requiresHumanApproval: true,
    tone: "purple",
  },
  {
    key: "intelligence-to-news-writer",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "news-writer",
    toAgent: "Andre — Reporter de Noticias",
    condition: "Relatorio publicado com dados de mercado ou evento relevante.",
    trigger: "Gerar noticia ou atualizacao do feed.",
    output: "Noticia formatada para publicacao.",
    requiresHumanApproval: true,
    tone: "cyan",
  },
  {
    key: "compliance-guard-to-site-publisher",
    fromAgentKey: "compliance-guard",
    fromAgent: "Dr. Otavio — Guardrail Compliance",
    toAgentKey: "site-publisher",
    toAgent: "Danilo — Publicador do Portal",
    condition: "Oportunidade aprovada e pronta para publicacao no portal.",
    trigger: "Cadastrar oportunidade no site com niveis de acesso.",
    output: "Oportunidade visivel no portal para assinantes elegiveis.",
    requiresHumanApproval: true,
    tone: "green",
  },
  {
    key: "any-error-to-admin-alert",
    fromAgentKey: "compliance-guard",
    fromAgent: "Qualquer agente",
    toAgentKey: "admin-alert",
    toAgent: "Vinicius — Sentinela de Alertas",
    condition: "Erro critico, alerta de severidade alta ou pipeline travado.",
    trigger: "Notificar admins com contexto do evento.",
    output: "Notificacao enviada para admins com detalhes do problema.",
    requiresHumanApproval: false,
    tone: "red",
  },
];

export const agentRunSamples: AgentRunSample[] = [
  {
    id: "RUN-1042",
    agentKey: "notice-curator",
    agent: "Helena — Curadora de Edital",
    opportunity: "BC-204",
    status: "Aguardando juridico",
    handoff: "Dra. Helena",
    nextAction: "Conferir matricula e ocupacao",
    tone: "yellow",
  },
  {
    id: "RUN-1041",
    agentKey: "source-scout",
    agent: "Renata — Buscadora de Imoveis",
    opportunity: "SP-118",
    status: "Concluido",
    handoff: "Curadoria",
    nextAction: "Dossie e matching",
    tone: "green",
  },
  {
    id: "RUN-1039",
    agentKey: "compliance-guard",
    agent: "Dr. Otavio — Guardrail Compliance",
    opportunity: "ITJ-088",
    status: "Bloqueado",
    handoff: "Compliance",
    nextAction: "Validar ocupacao",
    tone: "red",
  },
  {
    id: "RUN-1038",
    agentKey: "cold-lead-teaser",
    agent: "Tiago — Captacao de Leads",
    opportunity: "SP-118",
    status: "Planejado",
    handoff: "Growth",
    nextAction: "Aguardando logs de comunicacao",
    tone: "purple",
  },
];

export const agentRuntimeEvents: AgentRuntimeEvent[] = [
  {
    id: "EVT-1042-START",
    runCode: "RUN-1042",
    agentKey: "notice-curator",
    eventType: "runtime_started",
    status: "running",
    provider: "mock",
    model: "betel-deterministic-v0",
    attempt: 1,
    message: "Worker assumiu a curadoria do edital e bloqueou publicacao ate revisao.",
    createdAt: "Hoje 09:18",
    tone: "cyan",
  },
  {
    id: "EVT-1041-DONE",
    runCode: "RUN-1041",
    agentKey: "hidden-risk",
    eventType: "runtime_completed",
    status: "waiting_human",
    provider: "mock",
    model: "betel-deterministic-v0",
    attempt: 1,
    durationMs: 842,
    costEstimate: 0.068,
    message: "Risco oculto encontrou pendencias e escalou o gate humano.",
    createdAt: "Hoje 08:47",
    tone: "yellow",
  },
  {
    id: "EVT-1039-BLOCK",
    runCode: "RUN-1039",
    agentKey: "compliance-guard",
    eventType: "runtime_blocked",
    status: "blocked",
    provider: "mock",
    model: "betel-deterministic-v0",
    attempt: 2,
    durationMs: 219,
    costEstimate: 0.019,
    message: "Comunicacao externa bloqueada por falta de evidencia juridica.",
    createdAt: "Ontem 18:12",
    tone: "red",
  },
];

export const communicationSegments: CommunicationSegment[] = [
  {
    label: "Clientes pagantes",
    agent: "Camila — Atendimento Premium",
    audience: "Leads com plano ativo e perfil compativel",
    rule: "Pode receber detalhes completos apos aprovacao humana.",
    status: "Planejado",
    tone: "green",
  },
  {
    label: "Leads frios",
    agent: "Tiago — Captacao de Leads",
    audience: "Base fria, inbound antigo e remarketing",
    rule: "Recebe teaser sem endereco completo, sem tese completa e com CTA para plano.",
    status: "Planejado",
    tone: "cyan",
  },
  {
    label: "Comunidade",
    agent: "Beatriz — Gestora de Comunidade",
    audience: "Grupos e canais de comunidade",
    rule: "Publica oportunidade resumida e educacional, sem orientacao individual.",
    status: "Futuro",
    tone: "purple",
  },
  {
    label: "WhatsApp e email",
    agent: "Willian - Distribuidor WhatsApp e Email",
    audience: "Usuarios opt-in por preferencia de canal",
    rule: "Respeita opt-in, plano, frequencia e logs de entrega.",
    status: "Futuro",
    tone: "yellow",
  },
];

export const communicationOutbox: CommunicationOutboxItem[] = [
  {
    id: "OUT-1042-PAID-WA",
    messageCode: "OUT-1042-PAID-WA",
    runCode: "RUN-1042",
    agentKey: "paid-lead-alert",
    agent: "Camila — Atendimento Premium",
    audience: "Clientes pagantes",
    channel: "WhatsApp",
    detailLevel: "completo",
    status: "Rascunho",
    opportunity: "BC-204",
    recipientLabel: "Plano Pro",
    preview: "Oportunidade aprovada com dossie completo, score e proximos passos supervisionados.",
    guardrail: "Enviar completo apenas para plano ativo e contrato quando houver orientacao de lance.",
    createdAt: "Hoje 10:14",
    tone: "green",
  },
  {
    id: "OUT-1042-COLD-EMAIL",
    messageCode: "OUT-1042-COLD-EMAIL",
    runCode: "RUN-1042",
    agentKey: "cold-lead-teaser",
    agent: "Tiago — Captacao de Leads",
    audience: "Leads frios",
    channel: "Email",
    detailLevel: "teaser",
    status: "Aguardando aprovacao",
    opportunity: "BC-204",
    recipientLabel: "Base fria",
    preview: "Nova oportunidade com desconto relevante em cidade prioritaria, sem revelar endereco completo.",
    guardrail: "Nao revelar tese completa, endereco ou promessa de retorno.",
    createdAt: "Hoje 10:12",
    tone: "yellow",
  },
  {
    id: "OUT-1038-COMMUNITY",
    messageCode: "OUT-1038-COMMUNITY",
    runCode: "RUN-1038",
    agentKey: "community-broadcaster",
    agent: "Beatriz — Gestora de Comunidade",
    audience: "Comunidade",
    channel: "Grupo",
    detailLevel: "educacional",
    status: "Planejado",
    opportunity: "SP-118",
    recipientLabel: "Comunidade Betel",
    preview: "Conteudo educativo sobre como avaliar desconto, risco e edital em leiloes imobiliarios.",
    guardrail: "Sem orientacao individual ou recomendacao conclusiva.",
    createdAt: "Ontem 17:40",
    tone: "purple",
  },
];

export const agentOfficeRooms: AgentOfficeRoom[] = [
  {
    key: "diretoria-operacional",
    name: "Diretoria Operacional IA",
    sector: "Comando",
    purpose:
      "Enxerga a empresa virtual inteira, mede SLA, gargalos, custo, risco e decide quando escalar para humanos.",
    lead: "Admin Betel",
    operatingMode: "Copilot supervisionado",
    status: "Ativo",
    tone: "purple",
    agents: ["Patricia — Coordenadora de Revisao", "Dr. Otavio — Guardrail Compliance"],
    systems: ["admin_alerts", "agent_runs", "audit_logs"],
    rituals: ["Revisao diaria de fila", "Aprovacao de excecoes", "Auditoria de custo"],
    maintenanceFocus: "Garantir que nenhum agente opere fora do gate humano definido.",
  },
  {
    key: "sala-captacao",
    name: "Sala de Captacao",
    sector: "Operacao",
    purpose:
      "Busca imoveis de leilao em fontes, bancos, tribunais e APIs, sempre dentro do padrao de oportunidade definido.",
    lead: "Coordenador de Fontes",
    operatingMode: "Automacao em lote",
    status: "Supervisionado",
    tone: "cyan",
    agents: ["Renata — Buscadora de Imoveis", "Marcos — Monitor de Edital"],
    systems: ["auction_sources", "auction_opportunities", "source_snapshots"],
    rituals: ["Homologar fonte", "Rodar coleta", "Marcar mudancas de edital"],
    maintenanceFocus: "Monitorar permissao da fonte, duplicidade e qualidade de dados.",
  },
  {
    key: "sala-curadoria",
    name: "Sala de Curadoria",
    sector: "Inteligencia",
    purpose:
      "Confere edital, cruza informacoes externas, identifica dados ausentes e monta o primeiro score de oportunidade e risco.",
    lead: "Produto IA",
    operatingMode: "Analise estruturada",
    status: "Prioritario",
    tone: "purple",
    agents: ["Helena — Curadora de Edital", "Igor — Analista de Risco Oculto"],
    systems: ["ai_analysis_runs", "risk_flags", "dossiers"],
    rituals: ["Checklist de edital", "Comparar fontes", "Criar evidencias"],
    maintenanceFocus: "Reduzir falso positivo e separar fato, inferencia e pendencia.",
  },
  {
    key: "sala-juridica",
    name: "Sala Juridica e Compliance",
    sector: "Risco",
    purpose:
      "Organiza a passagem para advogado/revisor, bloqueia comunicacao insegura e preserva a trilha de auditoria.",
    lead: "Responsavel juridico",
    operatingMode: "Humano obrigatorio",
    status: "Critico",
    tone: "yellow",
    agents: ["Patricia — Coordenadora de Revisao", "Dr. Otavio — Guardrail Compliance"],
    systems: ["legal_reviews", "audit_logs", "admin_alerts"],
    rituals: ["Validar parecer", "Registrar ressalvas", "Liberar publicacao"],
    maintenanceFocus: "Manter linguagem segura e impedir decisao critica sem responsavel humano.",
  },
  {
    key: "sala-growth",
    name: "Sala de Comunicacao e Growth",
    sector: "Comercial",
    purpose:
      "Avisa clientes pagantes, leads frios e comunidade com nivel de detalhe definido por plano, contrato e aprovacao.",
    lead: "Growth Betel",
    operatingMode: "Envio segmentado",
    status: "Planejado",
    tone: "green",
    agents: ["Camila — Atendimento Premium", "Tiago — Captacao de Leads", "Beatriz — Gestora de Comunidade", "Willian - Distribuidor WhatsApp e Email"],
    systems: ["communication_logs", "crm_events", "plans"],
    rituals: ["Segmentar audiencia", "Aplicar guardrail", "Registrar entrega"],
    maintenanceFocus: "Evitar vazamento de oportunidade completa para lead sem plano.",
  },
  {
    key: "sala-arremate",
    name: "Sala de Arremate e Pos-Arremate",
    sector: "Execucao",
    purpose:
      "Depois do contrato, apoia teto de lance, sessao de arremate e acompanhamento documental ate o pos-arremate.",
    lead: "Mesa de Operacao",
    operatingMode: "Decisao humana assistida",
    status: "Dependente do contrato",
    tone: "red",
    agents: ["Rafael — Estrategista de Lance", "Fernanda — Gestora Pos-Arremate"],
    systems: ["advisory_contracts", "bid_strategies", "auction_sessions", "post_auction_cases"],
    rituals: ["Checar contrato", "Revisar teto", "Acompanhar pendencias"],
    maintenanceFocus: "Bloquear lance acima do teto e registrar racional de decisao.",
  },
  {
    key: "sala-manutencao",
    name: "Sala de Manutencao dos Agentes",
    sector: "Infra IA",
    purpose:
      "Cuida de versoes de prompt, chaves de API, custos, logs, falhas, retentativas e qualidade das respostas.",
    lead: "Engenharia/Produto",
    operatingMode: "Controle operacional",
    status: "Em implantacao",
    tone: "muted",
    agents: ["Clara — QA de Prompt", "Eduardo — Auditor de Logs", "Marina — Controle de Custo"],
    systems: ["agent_prompt_registry", "agent_maintenance_tasks", "api_usage_logs"],
    rituals: ["Versionar prompt", "Revisar erro recorrente", "Medir custo por run"],
    maintenanceFocus: "Criar governanca para trocar prompt/modelo sem quebrar a operacao.",
  },
];

const departmentByGroupKey: Record<string, string> = {
  captacao: "Sala de Captacao",
  curadoria: "Sala de Curadoria",
  revisao: "Sala Juridica e Compliance",
  comunicacao: "Sala de Comunicacao e Growth",
  execucao: "Sala de Arremate e Pos-Arremate",
  conteudo: "Sala de Conteudo e Publicacao",
};

const reportsToByGroupKey: Record<string, string> = {
  captacao: "Coordenador de Fontes",
  curadoria: "Produto IA",
  revisao: "Responsavel juridico",
  comunicacao: "Growth Betel",
  execucao: "Mesa de Operacao",
  conteudo: "Produto Conteudo",
};

const shiftByStatus: Record<AgentStatus, string> = {
  active: "Plantao ativo",
  supervised: "Copilot supervisionado",
  paused: "Pausado para ajuste",
  planned: "Contratacao planejada",
};

export const agentDirectory: AgentDirectoryEntry[] = agentGroups.flatMap((group) =>
  group.agents.map((agent) => ({
    key: agent.key,
    name: agent.name,
    department: departmentByGroupKey[group.key] || group.name,
    group: group.name,
    jobTitle: agent.role.split(".")[0],
    functionSummary: agent.role,
    promptName: agent.promptName,
    promptVersion: agent.promptVersion,
    status: agent.status,
    tone: agent.tone,
    reportsTo: reportsToByGroupKey[group.key] || "Admin Betel",
    currentDesk: group.eyebrow,
    currentShift: shiftByStatus[agent.status],
    avatarIcon: "",
  }))
);

export const agentPromptRegistry: AgentPromptRegistryItem[] = agentDirectory.map((agent) => ({
  key: `${agent.promptName}-${agent.promptVersion}`,
  promptName: agent.promptName,
  promptVersion: agent.promptVersion,
  agent: agent.name,
  department: agent.department,
  objective: agent.functionSummary,
  updatePolicy:
    agent.status === "active"
      ? "Mudanca exige QA, log e aprovacao de compliance."
      : "Pode evoluir em ambiente supervisionado antes de publicar.",
  owner: agent.reportsTo,
  status: agent.status,
  tone: agent.tone,
}));

export const agentMaintenanceQueue: AgentMaintenanceItem[] = [
  {
    code: "PROMPT-001",
    area: "Registro de prompts",
    owner: "Produto IA",
    severity: "Alta",
    status: "Mapear versoes",
    check: "Todo agente precisa ter prompt versionado, dono e regra de troca.",
    nextAction: "Persistir prompt registry e historico de alteracao.",
    tone: "purple",
  },
  {
    code: "API-002",
    area: "Dependencias externas",
    owner: "Engenharia",
    severity: "Media",
    status: "Aguardando chaves",
    check: "Big Data API, portais, email, push e WhatsApp devem ter adapter auditavel.",
    nextAction: "Conectar adapters reais sem remover fallback mock.",
    tone: "cyan",
  },
  {
    code: "GATE-003",
    area: "Aprovacao humana",
    owner: "Juridico",
    severity: "Critica",
    status: "Obrigatorio",
    check: "Curadoria, comunicacao completa e lance continuam bloqueados sem humano.",
    nextAction: "Exigir assinatura/status antes de acionar comunicacao e execucao.",
    tone: "red",
  },
  {
    code: "LOG-004",
    area: "Auditoria",
    owner: "Compliance",
    severity: "Alta",
    status: "Padronizar",
    check: "Entrada, saida, prompt, modelo, custo e handoff precisam gerar log.",
    nextAction: "Unificar eventos de agent_runs com logs do admin.",
    tone: "yellow",
  },
  {
    code: "CUSTO-005",
    area: "Custo de IA/APIs",
    owner: "Financeiro/Produto",
    severity: "Media",
    status: "Medir por run",
    check: "Cada run deve ter custo estimado para proteger margem dos planos.",
    nextAction: "Adicionar limites por agente, setor e organizacao.",
    tone: "green",
  },
];

export const agentWorkforceMetrics = [
  { label: "Setores", value: String(agentOfficeRooms.length), detail: "empresa virtual", tone: "cyan" as ResourceTone },
  {
    label: "Agentes",
    value: String(agentDirectory.length),
    detail: "prompts especializados",
    tone: "purple" as ResourceTone,
  },
  { label: "Prompts", value: String(agentPromptRegistry.length), detail: "registro inicial", tone: "yellow" as ResourceTone },
  { label: "Manutencao", value: String(agentMaintenanceQueue.length), detail: "checks criticos", tone: "green" as ResourceTone },
];
