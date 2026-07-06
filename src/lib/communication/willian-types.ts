export type WillianConnectionInfo = {
  status?: string;
  finalStatus?: string;
  pairingCode?: string;
  qrCode?: string;
  qrCodeDataUrl?: string;
  lastDisconnectReason?: string;
};

export type WhatsAppAgentInstanceSummary = {
  agentKey: string;
  agentName: string;
  companyName?: string;
  sector?: string;
  instanceName: string;
  providerInstanceId?: string;
  phoneNumber?: string;
  displayName?: string;
  profileImageUrl?: string;
  profileImageSyncedAt?: string;
  status: string;
  connected: boolean;
  connectedAt?: string;
  updatedAt?: string;
};

export type WillianInstanceState = {
  agentKey: string;
  agentName: string;
  baseUrl: string;
  baseUrlSource: "env" | "app_config" | "default" | "missing";
  adminTokenConfigured: boolean;
  adminTokenSource: "env" | "app_config" | "default" | "missing";
  adminTokenPreview: string;
  adminTokenLooksValid: boolean;
  instanceName: string;
  instanceTokenConfigured: boolean;
  instanceTokenPreview: string;
  phoneNumber?: string;
  displayName?: string;
  profileImageUrl?: string;
  profileImageSyncedAt?: string;
  webhookUrl: string;
  webhookConfiguredUrl: string;
  webhookSecretConfigured: boolean;
  whatsappProviderReleased: boolean;
  whatsappReady: boolean;
  emailProvider: string;
  emailTokenConfigured: boolean;
  emailFromConfigured: boolean;
  emailReady: boolean;
  status?: {
    connected: boolean;
    loggedIn: boolean;
    jid: unknown;
    state: string;
  };
  connection?: WillianConnectionInfo;
  finalStatus?: string;
  lastDisconnectReason?: string;
  webhookCount?: number;
  agentInstances?: WhatsAppAgentInstanceSummary[];
  missing: string[];
  lastError?: string;
};

export type WillianAgentConfigTab =
  | "connection"
  | "prompt"
  | "qualification"
  | "behavior"
  | "multichannel"
  | "files"
  | "memory";

export type WillianBehaviorConfig = {
  active: boolean;
  cloneStyle: boolean;
  splitReplies: boolean;
  presenceMode: "reply_only" | "natural" | "always_online";
  conversationMode: "always_text" | "always_audio" | "mirror" | "prompt";
  rapport: "disabled" | "suave" | "forte";
  availability: "business_hours" | "always";
  voiceProvider: string;
  voiceCloneEnabled: boolean;
  voiceCloneConsent: boolean;
  voiceCloneStatus: "inactive" | "testing" | "active";
  selectedVoiceId: string;
  selectedVoiceLabel: string;
  voiceSearch: string;
  audioVoiceSource: string;
  audioVoicePublicOwnerId: string;
  audioModelId: string;
  audioPreviewEnabled: boolean;
  humanizedLanguage: boolean;
  emojiFeature: boolean;
  typingVariation: boolean;
  composingPause: boolean;
  statusLookup: boolean;
  viewDelay: boolean;
  spontaneousAudio: boolean;
  intentionalTypos: boolean;
  circadianRhythm: boolean;
  vocalFillers: boolean;
  stickers: boolean;
  proactiveMedia: boolean;
  continuousLearning: boolean;
  companyMemory: boolean;
  cloneConsistency: boolean;
  temporalAwareness: boolean;
  rhythmWpmEnabled: boolean;
  midMessageContext: boolean;
  conversationArc: boolean;
  emotionSensing: boolean;
  confidenceHumility: boolean;
  smallTalk: boolean;
  reactionChancePct: number;
  minReadSeconds: number;
  maxReadSeconds: number;
  audioChancePct: number;
  stickerChancePct: number;
  rhythmWpm: number;
  correctionChancePct: number;
  responseDelaySeconds: number;
  typingDelaySeconds: number;
  maxMessagesPerConversation: number;
  humanIntervention: boolean;
  alertHuman: boolean;
  antiLoop: boolean;
  cooldownEnabled: boolean;
  cooldownMinutes: number;
  responsibleNumbers: string;
  interInstanceTest: boolean;
  realCloneTest: boolean;
  turingBenchmark: boolean;
  serveGroups: boolean;
  aiWindowActive: boolean;
  groupsEnabled: boolean;
  groupReplyMode: "all" | "mentions" | "admins";
  groupMentionAll: boolean;
  monitorAllGroups: boolean;
  interactiveMessages: boolean;
  statusWhatsAppEnabled: boolean;
  channelsEnabled: boolean;
  campaignEnabled: boolean;
  maxStatuses: number;
  campaignBatchSize: number;
  minDelaySeconds: number;
  maxDelaySeconds: number;
  specialTriggerMode: "disabled" | "smart" | "always";
  humanRequestTrigger: boolean;
  aiHumanRequestTrigger: boolean;
  rescheduleTrigger: boolean;
  captureTrigger: boolean;
  locationTrigger: boolean;
  optOutEnabled: boolean;
  webLinksTrigger: boolean;
  quotedReplyContext: boolean;
  quoteReplyMode: "off" | "smart" | "always";
  saveMediaTrigger: boolean;
  negotiationTracking: boolean;
  mediaWithoutBatchProtection: boolean;
  mediaWithoutCaptionProtection: boolean;
  hardAudioProtection: boolean;
  editedDeletedMessageProtection: boolean;
  contactPollReactionProtection: boolean;
  topicChangeProtection: boolean;
  promptInjectionProtection: boolean;
  identityGuard: boolean;
  buttonsEnabled: boolean;
  trackedLinksEnabled: boolean;
  followUpEnabled: boolean;
  followUpDelayMinutes: number;
  maxFollowUps: number;
  followUpWindowStart: string;
  followUpWindowEnd: string;
  transcribeAudio: boolean;
  analyzeImages: boolean;
  analyzeVideos: boolean;
  analyzeDocuments: boolean;
  imageAnalysisLimit: number;
  videoAnalysisLimit: number;
  documentAnalysisLimit: number;
  saveLeadFiles: boolean;
  leadMemory: boolean;
  cloneMemory: boolean;
  smartTiming: boolean;
  onlyTextDelaySeconds: number;
  textFollowupDelaySeconds: number;
  photoCaptionDelaySeconds: number;
  photoTextDelaySeconds: number;
  photoOnlyDelaySeconds: number;
  audioDelaySeconds: number;
  audioTextDelaySeconds: number;
  videoCaptionDelaySeconds: number;
  videoOnlyDelaySeconds: number;
  documentTextDelaySeconds: number;
  documentOnlyDelaySeconds: number;
  beforeButtonDelaySeconds: number;
  batchMediaDelaySeconds: number;
  emptyEventDelaySeconds: number;
  hardAudioDelaySeconds: number;
  reactivateAgentDelayMinutes: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  timezone: string;
};

export type WillianQualificationConfig = {
  enabled: boolean;
  product: string;
  commercialGoal: string;
  qualifiedScore: number;
  vipScore: number;
  questionsLimit: number;
  oneQuestionAtATime: boolean;
  mandatoryQuestions: string[];
  lowQualificationSignals: string[];
  nextStepRules: string[];
};

export type WillianPromptConfig = {
  agentPrompt: string;
  dnaManual: string;
  cloneMemory: string;
  humanizationMetric: string;
  productLink: string;
  productNotes: string;
  sendButton: boolean;
  buttonLabel: string;
  buttonUrl: string;
  tags: string[];
};

export type WillianMultichannelConfig = {
  groupStatus: "paused" | "enabled" | "blocked";
  statusStatus: "paused" | "enabled" | "blocked";
  channelsStatus: "paused" | "enabled" | "blocked";
  campaignsStatus: "paused" | "enabled" | "blocked";
  scheduleAt: string;
  whatsappStatusText: string;
  campaignName: string;
  campaignRecipients: string;
  campaignMessage: string;
  newsletterChannel: string;
  newsletterMessage: string;
};

export type WillianFilesConfig = {
  companyFiles: string[];
  uploadEnabled: boolean;
  knowledgeNotes: string;
};

export type WillianMemoryConfig = {
  crmEnabled: boolean;
  saveConversationHistory: boolean;
  saveLeadTags: boolean;
  autoSummaries: boolean;
  leadTags: string[];
  importantEvents: string[];
  stopWords: string[];
  handoffRules: string[];
  memoryNotes: string;
};

export type WillianAgentConfig = {
  agentKey: string;
  agentName: string;
  roleTitle: string;
  companyName: string;
  status: "draft" | "saved" | "needs_review";
  updatedAt: string;
  behavior: WillianBehaviorConfig;
  qualification: WillianQualificationConfig;
  prompt: WillianPromptConfig;
  multichannel: WillianMultichannelConfig;
  files: WillianFilesConfig;
  memory: WillianMemoryConfig;
};

export const DEFAULT_WILLIAN_AGENT_CONFIG: WillianAgentConfig = {
  agentKey: "multichannel-dispatch",
  agentName: "Willian",
  roleTitle: "Agente de WhatsApp",
  companyName: "Betel Leiloes",
  status: "draft",
  updatedAt: "",
  behavior: {
    active: false,
    cloneStyle: true,
    splitReplies: true,
    presenceMode: "natural",
    conversationMode: "mirror",
    rapport: "suave",
    availability: "business_hours",
    voiceProvider: "ElevenLabs",
    voiceCloneEnabled: false,
    voiceCloneConsent: false,
    voiceCloneStatus: "inactive",
    selectedVoiceId: "clone-willian",
    selectedVoiceLabel: "Clone do agente",
    voiceSearch: "",
    audioVoiceSource: "",
    audioVoicePublicOwnerId: "",
    audioModelId: "",
    audioPreviewEnabled: true,
    humanizedLanguage: true,
    emojiFeature: true,
    typingVariation: true,
    composingPause: true,
    statusLookup: false,
    viewDelay: true,
    spontaneousAudio: false,
    intentionalTypos: false,
    circadianRhythm: true,
    vocalFillers: true,
    stickers: false,
    proactiveMedia: true,
    continuousLearning: true,
    companyMemory: true,
    cloneConsistency: true,
    temporalAwareness: true,
    rhythmWpmEnabled: true,
    midMessageContext: true,
    conversationArc: true,
    emotionSensing: true,
    confidenceHumility: true,
    smallTalk: false,
    reactionChancePct: 40,
    minReadSeconds: 3,
    maxReadSeconds: 12,
    audioChancePct: 15,
    stickerChancePct: 2,
    rhythmWpm: 45,
    correctionChancePct: 15,
    responseDelaySeconds: 12,
    typingDelaySeconds: 6,
    maxMessagesPerConversation: 12,
    humanIntervention: true,
    alertHuman: true,
    antiLoop: true,
    cooldownEnabled: true,
    cooldownMinutes: 15,
    responsibleNumbers: "5547988577996",
    interInstanceTest: false,
    realCloneTest: false,
    turingBenchmark: false,
    serveGroups: false,
    aiWindowActive: true,
    groupsEnabled: false,
    groupReplyMode: "mentions",
    groupMentionAll: false,
    monitorAllGroups: false,
    interactiveMessages: true,
    statusWhatsAppEnabled: false,
    channelsEnabled: false,
    campaignEnabled: false,
    maxStatuses: 80,
    campaignBatchSize: 50,
    minDelaySeconds: 20,
    maxDelaySeconds: 60,
    specialTriggerMode: "smart",
    humanRequestTrigger: true,
    aiHumanRequestTrigger: true,
    rescheduleTrigger: false,
    captureTrigger: true,
    locationTrigger: true,
    optOutEnabled: true,
    webLinksTrigger: true,
    quotedReplyContext: true,
    quoteReplyMode: "smart",
    saveMediaTrigger: true,
    negotiationTracking: true,
    mediaWithoutBatchProtection: true,
    mediaWithoutCaptionProtection: true,
    hardAudioProtection: true,
    editedDeletedMessageProtection: true,
    contactPollReactionProtection: true,
    topicChangeProtection: true,
    promptInjectionProtection: true,
    identityGuard: true,
    buttonsEnabled: true,
    trackedLinksEnabled: true,
    followUpEnabled: false,
    followUpDelayMinutes: 120,
    maxFollowUps: 2,
    followUpWindowStart: "09:00",
    followUpWindowEnd: "20:00",
    transcribeAudio: true,
    analyzeImages: true,
    analyzeVideos: false,
    analyzeDocuments: true,
    imageAnalysisLimit: 8,
    videoAnalysisLimit: 2,
    documentAnalysisLimit: 3,
    saveLeadFiles: true,
    leadMemory: true,
    cloneMemory: true,
    smartTiming: true,
    onlyTextDelaySeconds: 6,
    textFollowupDelaySeconds: 9,
    photoCaptionDelaySeconds: 10,
    photoTextDelaySeconds: 14,
    photoOnlyDelaySeconds: 16,
    audioDelaySeconds: 18,
    audioTextDelaySeconds: 14,
    videoCaptionDelaySeconds: 14,
    videoOnlyDelaySeconds: 18,
    documentTextDelaySeconds: 14,
    documentOnlyDelaySeconds: 18,
    beforeButtonDelaySeconds: 2,
    batchMediaDelaySeconds: 18,
    emptyEventDelaySeconds: 5,
    hardAudioDelaySeconds: 18,
    reactivateAgentDelayMinutes: 60,
    quietHoursStart: "08:00",
    quietHoursEnd: "20:00",
    timezone: "America/Sao_Paulo",
  },
  qualification: {
    enabled: true,
    product: "Oportunidades de leilao imobiliario da Betel",
    commercialGoal:
      "Entender perfil, capital disponivel, prazo de compra, regiao de interesse e tipo de imovel para encaminhar a melhor oportunidade.",
    qualifiedScore: 70,
    vipScore: 85,
    questionsLimit: 6,
    oneQuestionAtATime: true,
    mandatoryQuestions: [
      "Qual tipo de imovel voce procura ou aceita avaliar?",
      "Qual faixa de investimento voce tem disponivel?",
      "Em quais cidades ou estados voce prefere comprar?",
      "Voce ja participou de leilao ou precisa de orientacao?",
      "O imovel e para investimento, moradia, uso comercial ou revenda?",
      "Qual prazo ideal para tomar decisao?",
    ],
    lowQualificationSignals: [
      "Lead sem capital definido ou sem prazo.",
      "Lead quer apenas curiosidade sem interesse em proximo passo.",
      "Lead nao aceita receber contato comercial ou materiais da Betel.",
    ],
    nextStepRules: [
      "Score acima de 70: enviar oportunidade aderente e pedir confirmacao de interesse.",
      "Score acima de 85: sinalizar como VIP e avisar humano.",
      "Leilao com prazo curto: priorizar resposta humana antes de enviar proposta.",
    ],
  },
  prompt: {
    agentPrompt:
      "Voce e um agente de WhatsApp da Betel AI. Atua no atendimento por WhatsApp com clareza, rapidez e tom consultivo. Seu trabalho e distribuir oportunidades de leilao, qualificar investidores e registrar cada interacao no CRM.",
    dnaManual:
      "Use linguagem simples, objetiva e comercial. Nunca invente dados de edital, valor, matricula, ocupacao ou risco. Quando faltar uma informacao, diga que a equipe esta validando.",
    cloneMemory:
      "Aprenda preferencias do lead: regiao, capital, tipo de imovel, risco aceito, pressa e historico de respostas.",
    humanizationMetric:
      "Mensagens curtas, uma pergunta por vez, sem blocos longos, com follow-up educado e sem insistencia.",
    productLink: "",
    productNotes: "Enviar apenas oportunidades validadas pela curadoria ou liberadas pelo humano.",
    sendButton: true,
    buttonLabel: "Ver oportunidade",
    buttonUrl: "",
    tags: ["lead_name", "opportunity_title", "auction_date", "city_state", "max_bid"],
  },
  multichannel: {
    groupStatus: "paused",
    statusStatus: "paused",
    channelsStatus: "blocked",
    campaignsStatus: "blocked",
    scheduleAt: "",
    whatsappStatusText: "",
    campaignName: "",
    campaignRecipients: "",
    campaignMessage: "",
    newsletterChannel: "",
    newsletterMessage: "",
  },
  files: {
    companyFiles: [],
    uploadEnabled: false,
    knowledgeNotes: "Base de conhecimento inicial: criterios Betel, operacao de leiloes, regras de risco e FAQs comerciais.",
  },
  memory: {
    crmEnabled: true,
    saveConversationHistory: true,
    saveLeadTags: true,
    autoSummaries: true,
    leadTags: ["novo", "qualificado", "vip", "humano"],
    importantEvents: [
      "lead pediu humano",
      "lead informou capital",
      "lead informou regiao",
      "lead pediu edital ou matricula",
      "lead solicitou parar contato",
    ],
    stopWords: ["parar", "sair", "remover", "cancelar", "nao quero receber"],
    handoffRules: [
      "Quando houver duvida juridica, ocupacao, matricula, lance ou risco, pausar e acionar humano.",
      "Quando o lead pedir pessoa, corretor, consultor ou atendimento humano, pausar IA.",
      "Quando o lead for VIP ou demonstrar urgencia real, registrar evento importante.",
    ],
    memoryNotes:
      "Registrar preferencias do lead, regioes de interesse, capital disponivel, experiencia em leilao, objeções e proximos passos combinados.",
  },
};
