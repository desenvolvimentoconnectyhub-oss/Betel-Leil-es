/** Server-configured canonical origin; never infer permanent links from request Host or preview deployments. */
export function getBetelPublicOrigin() {
  const configured = process.env.BETEL_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://betel-leil-es.vercel.app";
  const url = new URL(configured);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("Origem publica da Betel invalida.");
  return url.origin;
}
