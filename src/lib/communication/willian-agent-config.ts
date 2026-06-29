import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_WILLIAN_AGENT_CONFIG,
  type WillianAgentConfig,
} from "./willian-types";

const WILLIAN_AGENT_CONFIG_KEY = "BETEL_WILLIAN_AGENT_CONFIG";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(Math.trunc(numeric), max));
}

function stringField(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function boolField(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function enumField<T extends string>(value: unknown, fallback: T, allowed: readonly T[]) {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

export function normalizeWillianAgentConfig(input: unknown): WillianAgentConfig {
  const source = asRecord(input);
  const behavior = asRecord(source.behavior);
  const qualification = asRecord(source.qualification);
  const prompt = asRecord(source.prompt);
  const multichannel = asRecord(source.multichannel);
  const files = asRecord(source.files);
  const memory = asRecord(source.memory);
  const defaults = DEFAULT_WILLIAN_AGENT_CONFIG;
  const quoteReplyMode = enumField(behavior.quoteReplyMode, defaults.behavior.quoteReplyMode, ["off", "smart", "always"]);

  return {
    agentKey: "multichannel-dispatch",
    agentName: "Willian",
    companyName: stringField(source.companyName, defaults.companyName),
    status: enumField(source.status, "saved", ["draft", "saved", "needs_review"]),
    updatedAt: stringField(source.updatedAt, new Date().toISOString()),
    behavior: {
      active: boolField(behavior.active, defaults.behavior.active),
      cloneStyle: boolField(behavior.cloneStyle, defaults.behavior.cloneStyle),
      splitReplies: boolField(behavior.splitReplies, defaults.behavior.splitReplies),
      presenceMode: enumField(behavior.presenceMode, defaults.behavior.presenceMode, [
        "reply_only",
        "natural",
        "always_online",
      ]),
      conversationMode: enumField(behavior.conversationMode, defaults.behavior.conversationMode, [
        "always_text",
        "always_audio",
        "mirror",
        "prompt",
      ]),
      rapport: enumField(behavior.rapport, defaults.behavior.rapport, ["disabled", "suave", "forte"]),
      availability: enumField(behavior.availability, defaults.behavior.availability, ["business_hours", "always"]),
      voiceProvider: stringField(behavior.voiceProvider, defaults.behavior.voiceProvider),
      voiceCloneEnabled: boolField(behavior.voiceCloneEnabled, defaults.behavior.voiceCloneEnabled),
      voiceCloneConsent: boolField(behavior.voiceCloneConsent, defaults.behavior.voiceCloneConsent),
      voiceCloneStatus: enumField(behavior.voiceCloneStatus, defaults.behavior.voiceCloneStatus, [
        "inactive",
        "testing",
        "active",
      ]),
      selectedVoiceId: stringField(behavior.selectedVoiceId, defaults.behavior.selectedVoiceId),
      selectedVoiceLabel: stringField(behavior.selectedVoiceLabel, defaults.behavior.selectedVoiceLabel),
      voiceSearch: stringField(behavior.voiceSearch, defaults.behavior.voiceSearch),
      audioVoiceSource: stringField(behavior.audioVoiceSource, defaults.behavior.audioVoiceSource),
      audioVoicePublicOwnerId: stringField(
        behavior.audioVoicePublicOwnerId,
        defaults.behavior.audioVoicePublicOwnerId
      ),
      audioModelId: stringField(behavior.audioModelId, defaults.behavior.audioModelId),
      audioPreviewEnabled: boolField(behavior.audioPreviewEnabled, defaults.behavior.audioPreviewEnabled),
      humanizedLanguage: boolField(behavior.humanizedLanguage, defaults.behavior.humanizedLanguage),
      emojiFeature: boolField(behavior.emojiFeature, defaults.behavior.emojiFeature),
      typingVariation: boolField(behavior.typingVariation, defaults.behavior.typingVariation),
      composingPause: boolField(behavior.composingPause, defaults.behavior.composingPause),
      statusLookup: boolField(behavior.statusLookup, defaults.behavior.statusLookup),
      viewDelay: boolField(behavior.viewDelay, defaults.behavior.viewDelay),
      spontaneousAudio: boolField(behavior.spontaneousAudio, defaults.behavior.spontaneousAudio),
      intentionalTypos: boolField(behavior.intentionalTypos, defaults.behavior.intentionalTypos),
      circadianRhythm: boolField(behavior.circadianRhythm, defaults.behavior.circadianRhythm),
      vocalFillers: boolField(behavior.vocalFillers, defaults.behavior.vocalFillers),
      stickers: boolField(behavior.stickers, defaults.behavior.stickers),
      proactiveMedia: boolField(behavior.proactiveMedia, defaults.behavior.proactiveMedia),
      continuousLearning: boolField(behavior.continuousLearning, defaults.behavior.continuousLearning),
      companyMemory: boolField(behavior.companyMemory, defaults.behavior.companyMemory),
      cloneConsistency: boolField(behavior.cloneConsistency, defaults.behavior.cloneConsistency),
      temporalAwareness: boolField(behavior.temporalAwareness, defaults.behavior.temporalAwareness),
      rhythmWpmEnabled: boolField(behavior.rhythmWpmEnabled, defaults.behavior.rhythmWpmEnabled),
      midMessageContext: boolField(behavior.midMessageContext, defaults.behavior.midMessageContext),
      conversationArc: boolField(behavior.conversationArc, defaults.behavior.conversationArc),
      emotionSensing: boolField(behavior.emotionSensing, defaults.behavior.emotionSensing),
      confidenceHumility: boolField(behavior.confidenceHumility, defaults.behavior.confidenceHumility),
      smallTalk: boolField(behavior.smallTalk, defaults.behavior.smallTalk),
      reactionChancePct: clampNumber(behavior.reactionChancePct, defaults.behavior.reactionChancePct, 0, 100),
      minReadSeconds: clampNumber(behavior.minReadSeconds, defaults.behavior.minReadSeconds, 0, 120),
      maxReadSeconds: clampNumber(behavior.maxReadSeconds, defaults.behavior.maxReadSeconds, 0, 240),
      audioChancePct: clampNumber(behavior.audioChancePct, defaults.behavior.audioChancePct, 0, 100),
      stickerChancePct: clampNumber(behavior.stickerChancePct, defaults.behavior.stickerChancePct, 0, 100),
      rhythmWpm: clampNumber(behavior.rhythmWpm, defaults.behavior.rhythmWpm, 10, 180),
      correctionChancePct: clampNumber(behavior.correctionChancePct, defaults.behavior.correctionChancePct, 0, 100),
      responseDelaySeconds: clampNumber(behavior.responseDelaySeconds, defaults.behavior.responseDelaySeconds, 0, 300),
      typingDelaySeconds: clampNumber(behavior.typingDelaySeconds, defaults.behavior.typingDelaySeconds, 0, 120),
      maxMessagesPerConversation: clampNumber(
        behavior.maxMessagesPerConversation,
        defaults.behavior.maxMessagesPerConversation,
        1,
        80
      ),
      humanIntervention: boolField(behavior.humanIntervention, defaults.behavior.humanIntervention),
      alertHuman: boolField(behavior.alertHuman, defaults.behavior.alertHuman),
      antiLoop: boolField(behavior.antiLoop, defaults.behavior.antiLoop),
      cooldownEnabled: boolField(behavior.cooldownEnabled, defaults.behavior.cooldownEnabled),
      cooldownMinutes: clampNumber(behavior.cooldownMinutes, defaults.behavior.cooldownMinutes, 0, 1440),
      responsibleNumbers: stringField(behavior.responsibleNumbers, defaults.behavior.responsibleNumbers),
      interInstanceTest: boolField(behavior.interInstanceTest, defaults.behavior.interInstanceTest),
      realCloneTest: boolField(behavior.realCloneTest, defaults.behavior.realCloneTest),
      turingBenchmark: boolField(behavior.turingBenchmark, defaults.behavior.turingBenchmark),
      serveGroups: boolField(behavior.serveGroups, defaults.behavior.serveGroups),
      aiWindowActive: boolField(behavior.aiWindowActive, defaults.behavior.aiWindowActive),
      groupsEnabled: boolField(behavior.groupsEnabled, defaults.behavior.groupsEnabled),
      groupReplyMode: enumField(behavior.groupReplyMode, defaults.behavior.groupReplyMode, ["all", "mentions", "admins"]),
      groupMentionAll: boolField(behavior.groupMentionAll, defaults.behavior.groupMentionAll),
      monitorAllGroups: boolField(behavior.monitorAllGroups, defaults.behavior.monitorAllGroups),
      interactiveMessages: boolField(behavior.interactiveMessages, defaults.behavior.interactiveMessages),
      statusWhatsAppEnabled: boolField(behavior.statusWhatsAppEnabled, defaults.behavior.statusWhatsAppEnabled),
      channelsEnabled: boolField(behavior.channelsEnabled, defaults.behavior.channelsEnabled),
      campaignEnabled: boolField(behavior.campaignEnabled, defaults.behavior.campaignEnabled),
      maxStatuses: clampNumber(behavior.maxStatuses, defaults.behavior.maxStatuses, 0, 1000),
      campaignBatchSize: clampNumber(behavior.campaignBatchSize, defaults.behavior.campaignBatchSize, 1, 1000),
      minDelaySeconds: clampNumber(behavior.minDelaySeconds, defaults.behavior.minDelaySeconds, 0, 3600),
      maxDelaySeconds: clampNumber(behavior.maxDelaySeconds, defaults.behavior.maxDelaySeconds, 0, 7200),
      specialTriggerMode: enumField(behavior.specialTriggerMode, defaults.behavior.specialTriggerMode, [
        "disabled",
        "smart",
        "always",
      ]),
      humanRequestTrigger: boolField(behavior.humanRequestTrigger, defaults.behavior.humanRequestTrigger),
      aiHumanRequestTrigger: boolField(behavior.aiHumanRequestTrigger, defaults.behavior.aiHumanRequestTrigger),
      rescheduleTrigger: boolField(behavior.rescheduleTrigger, defaults.behavior.rescheduleTrigger),
      captureTrigger: boolField(behavior.captureTrigger, defaults.behavior.captureTrigger),
      locationTrigger: boolField(behavior.locationTrigger, defaults.behavior.locationTrigger),
      optOutEnabled: boolField(behavior.optOutEnabled, defaults.behavior.optOutEnabled),
      webLinksTrigger: boolField(behavior.webLinksTrigger, defaults.behavior.webLinksTrigger),
      quotedReplyContext: quoteReplyMode !== "off",
      quoteReplyMode,
      saveMediaTrigger: boolField(behavior.saveMediaTrigger, defaults.behavior.saveMediaTrigger),
      negotiationTracking: boolField(behavior.negotiationTracking, defaults.behavior.negotiationTracking),
      mediaWithoutBatchProtection: boolField(
        behavior.mediaWithoutBatchProtection,
        defaults.behavior.mediaWithoutBatchProtection
      ),
      mediaWithoutCaptionProtection: boolField(
        behavior.mediaWithoutCaptionProtection,
        defaults.behavior.mediaWithoutCaptionProtection
      ),
      hardAudioProtection: boolField(behavior.hardAudioProtection, defaults.behavior.hardAudioProtection),
      editedDeletedMessageProtection: boolField(
        behavior.editedDeletedMessageProtection,
        defaults.behavior.editedDeletedMessageProtection
      ),
      contactPollReactionProtection: boolField(
        behavior.contactPollReactionProtection,
        defaults.behavior.contactPollReactionProtection
      ),
      topicChangeProtection: boolField(behavior.topicChangeProtection, defaults.behavior.topicChangeProtection),
      promptInjectionProtection: boolField(behavior.promptInjectionProtection, defaults.behavior.promptInjectionProtection),
      identityGuard: boolField(behavior.identityGuard, defaults.behavior.identityGuard),
      buttonsEnabled: boolField(behavior.buttonsEnabled, defaults.behavior.buttonsEnabled),
      trackedLinksEnabled: boolField(behavior.trackedLinksEnabled, defaults.behavior.trackedLinksEnabled),
      followUpEnabled: boolField(behavior.followUpEnabled, defaults.behavior.followUpEnabled),
      followUpDelayMinutes: clampNumber(behavior.followUpDelayMinutes, defaults.behavior.followUpDelayMinutes, 5, 10080),
      maxFollowUps: clampNumber(behavior.maxFollowUps, defaults.behavior.maxFollowUps, 0, 8),
      followUpWindowStart: stringField(behavior.followUpWindowStart, defaults.behavior.followUpWindowStart),
      followUpWindowEnd: stringField(behavior.followUpWindowEnd, defaults.behavior.followUpWindowEnd),
      transcribeAudio: boolField(behavior.transcribeAudio, defaults.behavior.transcribeAudio),
      analyzeImages: boolField(behavior.analyzeImages, defaults.behavior.analyzeImages),
      analyzeVideos: boolField(behavior.analyzeVideos, defaults.behavior.analyzeVideos),
      analyzeDocuments: boolField(behavior.analyzeDocuments, defaults.behavior.analyzeDocuments),
      imageAnalysisLimit: clampNumber(behavior.imageAnalysisLimit, defaults.behavior.imageAnalysisLimit, 0, 100),
      videoAnalysisLimit: clampNumber(behavior.videoAnalysisLimit, defaults.behavior.videoAnalysisLimit, 0, 100),
      documentAnalysisLimit: clampNumber(
        behavior.documentAnalysisLimit,
        defaults.behavior.documentAnalysisLimit,
        0,
        100
      ),
      saveLeadFiles: boolField(behavior.saveLeadFiles, defaults.behavior.saveLeadFiles),
      leadMemory: boolField(behavior.leadMemory, defaults.behavior.leadMemory),
      cloneMemory: boolField(behavior.cloneMemory, defaults.behavior.cloneMemory),
      smartTiming: boolField(behavior.smartTiming, defaults.behavior.smartTiming),
      onlyTextDelaySeconds: clampNumber(behavior.onlyTextDelaySeconds, defaults.behavior.onlyTextDelaySeconds, 0, 300),
      textFollowupDelaySeconds: clampNumber(
        behavior.textFollowupDelaySeconds,
        defaults.behavior.textFollowupDelaySeconds,
        0,
        300
      ),
      photoCaptionDelaySeconds: clampNumber(
        behavior.photoCaptionDelaySeconds,
        defaults.behavior.photoCaptionDelaySeconds,
        0,
        300
      ),
      photoTextDelaySeconds: clampNumber(behavior.photoTextDelaySeconds, defaults.behavior.photoTextDelaySeconds, 0, 300),
      photoOnlyDelaySeconds: clampNumber(behavior.photoOnlyDelaySeconds, defaults.behavior.photoOnlyDelaySeconds, 0, 300),
      audioDelaySeconds: clampNumber(behavior.audioDelaySeconds, defaults.behavior.audioDelaySeconds, 0, 300),
      audioTextDelaySeconds: clampNumber(behavior.audioTextDelaySeconds, defaults.behavior.audioTextDelaySeconds, 0, 300),
      videoCaptionDelaySeconds: clampNumber(
        behavior.videoCaptionDelaySeconds,
        defaults.behavior.videoCaptionDelaySeconds,
        0,
        300
      ),
      videoOnlyDelaySeconds: clampNumber(behavior.videoOnlyDelaySeconds, defaults.behavior.videoOnlyDelaySeconds, 0, 300),
      documentTextDelaySeconds: clampNumber(
        behavior.documentTextDelaySeconds,
        defaults.behavior.documentTextDelaySeconds,
        0,
        300
      ),
      documentOnlyDelaySeconds: clampNumber(
        behavior.documentOnlyDelaySeconds,
        defaults.behavior.documentOnlyDelaySeconds,
        0,
        300
      ),
      beforeButtonDelaySeconds: clampNumber(
        behavior.beforeButtonDelaySeconds,
        defaults.behavior.beforeButtonDelaySeconds,
        0,
        300
      ),
      batchMediaDelaySeconds: clampNumber(behavior.batchMediaDelaySeconds, defaults.behavior.batchMediaDelaySeconds, 0, 300),
      emptyEventDelaySeconds: clampNumber(behavior.emptyEventDelaySeconds, defaults.behavior.emptyEventDelaySeconds, 0, 300),
      hardAudioDelaySeconds: clampNumber(behavior.hardAudioDelaySeconds, defaults.behavior.hardAudioDelaySeconds, 0, 300),
      reactivateAgentDelayMinutes: clampNumber(
        behavior.reactivateAgentDelayMinutes,
        defaults.behavior.reactivateAgentDelayMinutes,
        0,
        10080
      ),
      quietHoursStart: stringField(behavior.quietHoursStart, defaults.behavior.quietHoursStart),
      quietHoursEnd: stringField(behavior.quietHoursEnd, defaults.behavior.quietHoursEnd),
      timezone: stringField(behavior.timezone, defaults.behavior.timezone),
    },
    qualification: {
      enabled: boolField(qualification.enabled, defaults.qualification.enabled),
      product: stringField(qualification.product, defaults.qualification.product),
      commercialGoal: stringField(qualification.commercialGoal, defaults.qualification.commercialGoal),
      qualifiedScore: clampNumber(qualification.qualifiedScore, defaults.qualification.qualifiedScore, 0, 100),
      vipScore: clampNumber(qualification.vipScore, defaults.qualification.vipScore, 0, 100),
      questionsLimit: clampNumber(qualification.questionsLimit, defaults.qualification.questionsLimit, 1, 20),
      oneQuestionAtATime: boolField(qualification.oneQuestionAtATime, defaults.qualification.oneQuestionAtATime),
      mandatoryQuestions: asStringArray(qualification.mandatoryQuestions, defaults.qualification.mandatoryQuestions),
      lowQualificationSignals: asStringArray(qualification.lowQualificationSignals, defaults.qualification.lowQualificationSignals),
      nextStepRules: asStringArray(qualification.nextStepRules, defaults.qualification.nextStepRules),
    },
    prompt: {
      agentPrompt: stringField(prompt.agentPrompt, defaults.prompt.agentPrompt),
      dnaManual: stringField(prompt.dnaManual, defaults.prompt.dnaManual),
      cloneMemory: stringField(prompt.cloneMemory, defaults.prompt.cloneMemory),
      humanizationMetric: stringField(prompt.humanizationMetric, defaults.prompt.humanizationMetric),
      productLink: stringField(prompt.productLink, defaults.prompt.productLink),
      productNotes: stringField(prompt.productNotes, defaults.prompt.productNotes),
      sendButton: boolField(prompt.sendButton, defaults.prompt.sendButton),
      buttonLabel: stringField(prompt.buttonLabel, defaults.prompt.buttonLabel),
      buttonUrl: stringField(prompt.buttonUrl, defaults.prompt.buttonUrl),
      tags: asStringArray(prompt.tags, defaults.prompt.tags),
    },
    multichannel: {
      groupStatus: enumField(multichannel.groupStatus, defaults.multichannel.groupStatus, ["paused", "enabled", "blocked"]),
      statusStatus: enumField(multichannel.statusStatus, defaults.multichannel.statusStatus, ["paused", "enabled", "blocked"]),
      channelsStatus: enumField(multichannel.channelsStatus, defaults.multichannel.channelsStatus, ["paused", "enabled", "blocked"]),
      campaignsStatus: enumField(multichannel.campaignsStatus, defaults.multichannel.campaignsStatus, [
        "paused",
        "enabled",
        "blocked",
      ]),
      scheduleAt: stringField(multichannel.scheduleAt, defaults.multichannel.scheduleAt),
      whatsappStatusText: stringField(multichannel.whatsappStatusText, defaults.multichannel.whatsappStatusText),
      campaignName: stringField(multichannel.campaignName, defaults.multichannel.campaignName),
      campaignRecipients: stringField(multichannel.campaignRecipients, defaults.multichannel.campaignRecipients),
      campaignMessage: stringField(multichannel.campaignMessage, defaults.multichannel.campaignMessage),
      newsletterChannel: stringField(multichannel.newsletterChannel, defaults.multichannel.newsletterChannel),
      newsletterMessage: stringField(multichannel.newsletterMessage, defaults.multichannel.newsletterMessage),
    },
    files: {
      companyFiles: asStringArray(files.companyFiles, defaults.files.companyFiles),
      uploadEnabled: boolField(files.uploadEnabled, defaults.files.uploadEnabled),
      knowledgeNotes: stringField(files.knowledgeNotes, defaults.files.knowledgeNotes),
    },
    memory: {
      crmEnabled: boolField(memory.crmEnabled, defaults.memory.crmEnabled),
      saveConversationHistory: boolField(memory.saveConversationHistory, defaults.memory.saveConversationHistory),
      saveLeadTags: boolField(memory.saveLeadTags, defaults.memory.saveLeadTags),
      autoSummaries: boolField(memory.autoSummaries, defaults.memory.autoSummaries),
      leadTags: asStringArray(memory.leadTags, defaults.memory.leadTags),
      importantEvents: asStringArray(memory.importantEvents, defaults.memory.importantEvents),
      stopWords: asStringArray(memory.stopWords, defaults.memory.stopWords),
      handoffRules: asStringArray(memory.handoffRules, defaults.memory.handoffRules),
      memoryNotes: stringField(memory.memoryNotes, defaults.memory.memoryNotes),
    },
  };
}

export async function getWillianAgentConfig(): Promise<WillianAgentConfig> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return DEFAULT_WILLIAN_AGENT_CONFIG;

  const { data } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", WILLIAN_AGENT_CONFIG_KEY)
    .maybeSingle();

  if (!data?.value || typeof data.value !== "string") return DEFAULT_WILLIAN_AGENT_CONFIG;

  try {
    return normalizeWillianAgentConfig(JSON.parse(data.value));
  } catch {
    return DEFAULT_WILLIAN_AGENT_CONFIG;
  }
}

export async function saveWillianAgentConfig(input: unknown) {
  const supabase = getSupabaseAdminClient();
  if (!supabase) {
    return {
      ok: false,
      error: "Supabase admin nao configurado. Salvamento real exige service role.",
      config: normalizeWillianAgentConfig(input),
    };
  }

  const config = normalizeWillianAgentConfig({
    ...asRecord(input),
    status: "saved",
    updatedAt: new Date().toISOString(),
  });

  const { error } = await supabase.from("app_config").upsert(
    {
      key: WILLIAN_AGENT_CONFIG_KEY,
      value: JSON.stringify(config),
      description: "Configuracao operacional do agente Willian para WhatsApp e email.",
      is_secret: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" }
  );

  if (error) return { ok: false, error: error.message, config };

  await supabase
    .from("ai_agents")
    .update({
      metadata: { whatsapp_agent_config: config },
      whatsapp_behavior_config: config.behavior,
      lead_qualification_config: config.qualification,
    })
    .eq("agent_key", "multichannel-dispatch");

  return { ok: true, config };
}
