import { redirectBetelTrackedLink } from "@/lib/communication/branded-links";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return redirectBetelTrackedLink(request, (await context.params).id);
}
export async function HEAD(request: Request, context: Context) {
  return redirectBetelTrackedLink(request, (await context.params).id);
}
