import "server-only";
import { CONNECTYHUB_VOICE_ORIGIN, getConnectyHubVoiceConfig } from "./config";

export class ConnectyHubVoiceError extends Error {
  constructor(message: string, public code: string, public status: number, public generationId?: string) { super(message); }
}

export async function fetchConnectyHubVoice(path: string, options: { body?: string | FormData; operationId?: string; timeoutMs?: number; config?: Awaited<ReturnType<typeof getConnectyHubVoiceConfig>> } = {}) {
  if (!/^\/(voices(?:\/[a-zA-Z0-9_-]{1,100}\/preview)?|models|generations(?:\/[a-zA-Z0-9_-]{1,128}(?:\/audio)?)?)$/.test(path)) throw new Error("Recurso de Voz invalido.");
  if (options.body && ((!['/generations', '/voices'].includes(path) && !/^\/voices\/[a-zA-Z0-9_-]{1,100}\/preview$/.test(path)) || !options.operationId)) throw new Error("Geracao exige um identificador de operacao.");
  const config = options.config || await getConnectyHubVoiceConfig();
  if (!/^ch_voice_[a-f0-9]{64}$/.test(config.apiKey.value)) throw new ConnectyHubVoiceError("Configure a chave dedicada ConnectyHub Voz da Betel.", "voice_key_missing", 503);
  if (!config.projectId.value || !config.billingOrganizationId.value) throw new ConnectyHubVoiceError("Confirme o projeto e a conta pagadora da Betel na manutencao.", "voice_identity_missing", 503);
  let response: Response;
  try {
    response = await fetch(`${CONNECTYHUB_VOICE_ORIGIN}/api/v1/voice${path}`, {
      method: options.body ? "POST" : "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${config.apiKey.value}`, ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}), ...(options.body ? { "Idempotency-Key": options.operationId! } : {}) },
      body: options.body, signal: AbortSignal.timeout(Math.max(1000, Math.min(options.timeoutMs || 15_000, 110_000))),
    });
  } catch {
    throw new ConnectyHubVoiceError(`Conexao de Voz sem confirmacao${options.operationId ? `; consulte a mesma operacao ${options.operationId}` : ". Tente consultar novamente"}.`, "connection_uncertain", 503);
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const code = typeof data.error?.code === "string" ? data.error.code : "voice_api_error";
    const generationId = typeof data.error?.request_id === "string" ? data.error.request_id : undefined;
    throw new ConnectyHubVoiceError(`ConnectyHub Voz HTTP ${response.status}: ${code}${generationId ? `; solicitacao ${generationId}` : ""}.`, code, response.status, generationId);
  }
  return response;
}
