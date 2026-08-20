import type { ResourceTone } from "@/lib/admin/resources";

export type WhatsAppHealthStatus = "ready" | "attention" | "blocked";
export type WhatsAppHealthCheckStatus = "ok" | "warning" | "blocked";

export type WhatsAppHealthCheck = {
  id: string;
  label: string;
  status: WhatsAppHealthCheckStatus;
  summary: string;
  action: string;
};

export type WhatsAppHealthTopItem = {
  label: string;
  count: number;
};

export type WhatsAppOperationalHealth = {
  ok: boolean;
  generatedAt: string;
  agentKey: string;
  agentName: string;
  source: "supabase" | "fallback";
  readiness: {
    status: WhatsAppHealthStatus;
    score: number;
    tone: ResourceTone;
    label: string;
    blockers: string[];
    warnings: string[];
    nextActions: string[];
    canAutoServePrivateChats: boolean;
    canConvertWithFollowUp: boolean;
  };
  integrations: {
    supabaseConfigured: boolean;
    aiProvider: string;
    geminiConfigured: boolean;
    geminiModel: string;
    connectyHubAdminConfigured: boolean;
    connectyHubAdminLooksValid: boolean;
    connectyHubWebhookConfigured: boolean;
    connectyHubWebhookSecretConfigured: boolean;
    whatsappProviderReleased: boolean;
    whatsappReady: boolean;
    elevenLabsConfigured: boolean;
    voiceReady: boolean;
  };
  agent: {
    active: boolean;
    aiWindowActive: boolean;
    qualificationEnabled: boolean;
    followUpEnabled: boolean;
    turingBenchmarkEnabled: boolean;
    humanInterventionEnabled: boolean;
    antiLoopEnabled: boolean;
    cooldownEnabled: boolean;
    crmMemoryEnabled: boolean;
    leadMemoryEnabled: boolean;
    cloneMemoryEnabled: boolean;
    groupsEnabled: boolean;
    serveGroups: boolean;
    channelsEnabled: boolean;
    campaignEnabled: boolean;
    maxMessagesPerConversation: number;
    maxFollowUps: number;
    followUpDelayMinutes: number;
  };
  runtime: {
    primaryConnected: boolean;
    remoteChecked: boolean;
    lastError: string;
    instances: {
      total: number;
      connected: number;
      activeRuntime: number;
      pausedRuntime: number;
      withProfile: number;
      latestUpdatedAt: string;
      summaries: Array<{
        agentKey: string;
        agentName: string;
        instanceName: string;
        status: string;
        runtimeStatus: string;
        connected: boolean;
        hasPhone: boolean;
        hasProfile: boolean;
        connectedAt: string;
        updatedAt: string;
      }>;
    };
  };
  crm: {
    leads: {
      total: number;
      optOut: number;
      handoff: number;
      averageScore: number;
      hot: number;
      vip: number;
      converted: number;
      statusCounts: Record<string, number>;
      stageCounts: Record<string, number>;
    };
    conversations: {
      total: number;
      open: number;
      handoff: number;
      staleOpen: number;
      needsReply: number;
      waitingFollowUp: number;
    };
    messages: {
      sampled: number;
      inbound: number;
      outbound: number;
      lastMessageAt: string;
    };
  };
  followUps: {
    total: number;
    queued: number;
    scheduled: number;
    running: number;
    sent: number;
    skipped: number;
    failed: number;
    cancelled: number;
    retryExhausted: number;
    failureRate: number;
    nextScheduledFor: string;
    topErrors: WhatsAppHealthTopItem[];
  };
  quality: {
    totalReviews: number;
    recentReviews: number;
    averageScore: number;
    lowScore: number;
    criticalScore: number;
    handoffVerdicts: number;
    blockedVerdicts: number;
    verdictCounts: Record<string, number>;
    scoreBuckets: Record<string, number>;
    topFlags: WhatsAppHealthTopItem[];
    lastReviewAt: string;
    benchmarkReady: boolean;
  };
  groups: {
    destinationsTotal: number;
    destinationsActive: number;
    destinationsPaused: number;
    replyEnabled: number;
    approvalRequired: number;
    campaignsTotal: number;
    campaignsScheduled: number;
    campaignsRunning: number;
    campaignsCompleted: number;
    campaignsFailed: number;
  };
  metaOfficial: {
    sendersTotal: number;
    sendersActive: number;
    templatesTotal: number;
    templatesApproved: number;
    campaignsTotal: number;
    campaignsScheduled: number;
    campaignsRunning: number;
  };
  checks: WhatsAppHealthCheck[];
  dataWarnings: string[];
};
