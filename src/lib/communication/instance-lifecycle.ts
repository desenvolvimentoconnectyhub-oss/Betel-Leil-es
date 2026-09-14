import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type InstanceObservation = "connected" | "disconnected" | "unknown" | "missing";
export const INSTANCE_CLEANUP_CONFIG_KEY = "BETEL_WHATSAPP_INSTANCE_CLEANUP_POLICY";

export function validProviderInstanceId(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export class ConnectyHubRequestError extends Error {
  constructor(message: string, public status: number, public code: string) { super(message); }
}

// Only the instance endpoint's structured absence contract is authoritative.
// A generic proxy 404, billing rejection or provider authentication failure is not.
export function isMissingInstanceError(error: unknown) {
  return error instanceof ConnectyHubRequestError && [404, 410].includes(error.status)
    && ["instance_not_found", "provider_instance_not_found", "instance_gone", "instance_archived"].includes(error.code);
}

export async function locallyArchivedInstance(providerInstanceId: string) {
  if (!providerInstanceId) return false;
  const db = getSupabaseAdminClient();
  if (!db) throw new Error("Supabase admin nao configurado.");
  const { data, error } = await db.from("whatsapp_instances").select("id")
    .eq("provider", "connectyhub").eq("provider_instance_id", providerInstanceId)
    .in("status", ["archived", "deleted"]).limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data?.length);
}

export async function observeInstance(input: {
  providerInstanceId: string;
  observation: InstanceObservation;
  observedAt: string;
  dailyCleanup?: boolean;
}) {
  const db = getSupabaseAdminClient();
  if (!db) throw new Error("Supabase admin nao configurado para verificar a instancia.");
  const { data, error } = await db.rpc("observe_betel_whatsapp_instance", {
    p_provider_instance_id: input.providerInstanceId,
    p_observation: input.observation,
    p_observed_at: input.observedAt,
    p_daily_cleanup: Boolean(input.dailyCleanup),
  });
  if (error) throw new Error("Falha ao sincronizar ciclo de vida WhatsApp: " + error.message);
  return data as { archived: boolean; observed: number };
}
