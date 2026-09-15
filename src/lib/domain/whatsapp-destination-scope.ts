export type WhatsAppDestinationScope = { agentKey: string; instanceId: string; phone: string };

export function destinationScopeKey(scope?: WhatsAppDestinationScope) {
  return scope ? JSON.stringify([scope.agentKey, scope.instanceId, scope.phone.replace(/\D/g, "")]) : "";
}

export function destinationsInScope<T extends { agentKey: string; instanceId: string; jid: string }>(
  items: T[], scope: WhatsAppDestinationScope, currentJids?: string[],
): T[] {
  if (!scope.agentKey || !scope.instanceId) return [];
  const membership = currentJids ? new Set(currentJids) : null;
  return items.filter(item => item.agentKey === scope.agentKey && item.instanceId === scope.instanceId && (!membership || membership.has(item.jid)));
}

// An authoritative empty array is a result. Missing/malformed/error envelopes are not.
export function groupListEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (record.ok === false || record.success === false || record.error) throw new Error("Não foi possível consultar os grupos atuais do WhatsApp.");
    for (const key of ["groups", "data", "items", "result", "results"]) {
      if (Array.isArray(record[key])) return record[key];
      if (record[key] && typeof record[key] === "object") return groupListEntries(record[key]);
    }
  }
  throw new Error("A consulta de grupos retornou uma resposta inválida.");
}
