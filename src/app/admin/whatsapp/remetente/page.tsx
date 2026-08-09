import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function paramValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" ? value : "";
}

export default async function SystemWhatsAppSenderPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams({ tab: "remetente" });
  const status = paramValue(params, "status");
  const message = paramValue(params, "message");

  if (status) query.set("status", status);
  if (message) query.set("message", message);

  redirect(`/admin/mensagens?${query.toString()}`);
}
