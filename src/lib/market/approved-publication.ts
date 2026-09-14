import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ApprovedMarketPublication } from "@/lib/domain/market-publication";

export async function getApprovedMarketPublication(code: string): Promise<ApprovedMarketPublication | null> {
  const db=getSupabaseAdminClient();if(!db)return null;
  const {data,error}=await db.from("property_market_analyses").select("status,raw_payload,auction_opportunities!inner(code)").eq("auction_opportunities.code",code).in("status",["approved","approved_with_notes"]).maybeSingle();
  if(error||!data)return null;
  const id=(data.raw_payload as Record<string,unknown>)?.approvedPublicationId;
  if(typeof id!=="string")return null;
  const result=await db.from("property_market_publication_versions").select("snapshot").eq("id",id).eq("opportunity_code",code).maybeSingle();
  const snapshot=result.data?.snapshot as ApprovedMarketPublication | undefined;
  return !result.error && snapshot?.version===1 && snapshot.references?.length===3 ? snapshot : null;
}

export async function listApprovedMarketPublications(limit: number): Promise<ApprovedMarketPublication[]> {
  const db = getSupabaseAdminClient();
  if (!db) return [];
  try {
    const { data, error } = await db.from("property_market_analyses").select("raw_payload")
      .in("status", ["approved", "approved_with_notes"]).order("updated_at", { ascending: false }).limit(limit);
    if (error || !data) return [];
    const ids = data.map(row => (row.raw_payload as Record<string, unknown>)?.approvedPublicationId).filter((id): id is string => typeof id === "string");
    if (!ids.length) return [];
    const versions = await db.from("property_market_publication_versions").select("id,snapshot").in("id", ids);
    if (versions.error) return [];
    return ids.flatMap(id => {
      const snapshot = versions.data?.find(row => row.id === id)?.snapshot as ApprovedMarketPublication | undefined;
      return snapshot?.version === 1 && snapshot.references?.length === 3 ? [snapshot] : [];
    });
  } catch { return []; }
}
