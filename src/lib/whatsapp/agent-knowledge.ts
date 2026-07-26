import "server-only";

import type { WillianAgentConfig } from "@/lib/communication/willian-types";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function compactList(values: string[], limit = 20) {
  return values.map((value) => cleanString(value)).filter(Boolean).slice(0, limit);
}

function formatList(label: string, values: string[], limit?: number) {
  const items = compactList(values, limit);
  return items.length ? `${label}:\n${items.map((item) => `- ${item}`).join("\n")}` : "";
}

export function buildWhatsAppAgentKnowledgeContext(config: WillianAgentConfig) {
  const knowledge = [
    cleanString(config.files.knowledgeNotes),
    formatList("Arquivos cadastrados", config.files.companyFiles, 30),
    config.prompt.productNotes ? `Notas do produto:\n${cleanString(config.prompt.productNotes)}` : "",
    config.prompt.productLink ? `Link do produto/oferta: ${cleanString(config.prompt.productLink)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n") || "Sem base de conhecimento cadastrada para este agente.";

  const memory = [
    cleanString(config.memory.memoryNotes),
    formatList("Tags possiveis do lead", config.memory.leadTags),
    formatList("Eventos importantes", config.memory.importantEvents),
    formatList("Regras de handoff", config.memory.handoffRules),
    formatList("Stop words e bloqueios", config.memory.stopWords),
  ]
    .filter(Boolean)
    .join("\n\n") || "Sem memoria operacional cadastrada para este agente.";

  return { knowledge, memory };
}
