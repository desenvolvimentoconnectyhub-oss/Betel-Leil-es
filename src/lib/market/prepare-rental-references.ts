import "server-only";
import type { PropertyMarketAnalysis } from "../admin/market-analysis";
import { rentalReferenceCandidates } from "../domain/rental-references";
import { canonicalReferenceUrl } from "../domain/market-quality";
import { verifyMarketReference } from "./reference-access";

// Uses already collected evidence. No provider runs, billing or human approval here.
export async function prepareRentalReferences(analysis: PropertyMarketAnalysis) {
  const checks: Array<{url:string;ok:boolean;checkedAt:string;error?:string}> = [];
  const references: Array<{label:string;url:string}> = [];
  const candidates = rentalReferenceCandidates(analysis);
  for (let offset=0; offset<candidates.length && references.length<3; offset+=3) {
    const batch = await Promise.all(candidates.slice(offset,offset+3).map(async c => {
      const url = canonicalReferenceUrl(c.sourceUrl);
      return {url,...await verifyMarketReference(url)};
    }));
    checks.push(...batch);
    for (const check of batch) if (check.ok && references.length<3) references.push({label:`Aluguel ${references.length+1}`,url:check.url});
  }
  return {references,checks};
}
