import type { AdminSessionUser } from "@/lib/auth/types";

export function adminHasFullPanelAccess(admin: AdminSessionUser | undefined) {
  return Boolean(admin && (admin.role === "owner" || admin.role === "admin"));
}

export function scopedAdminSectorKeys(admin: AdminSessionUser | undefined) {
  const sectors = admin?.sectors || [];
  const scoped = sectors.some((sector) => sector.isPrimary) ? sectors.filter((sector) => sector.isPrimary) : sectors;
  return new Set(scoped.map((sector) => sector.key));
}

export function adminCanUploadMarketAnalysisBatches(admin: AdminSessionUser | undefined) {
  if (adminHasFullPanelAccess(admin)) return true;
  return scopedAdminSectorKeys(admin).has("operations");
}

export function adminCanAccessHref(admin: AdminSessionUser | undefined, href: string) {
  if (!admin) return true;
  if (adminHasFullPanelAccess(admin)) return true;

  const sectorKeys = scopedAdminSectorKeys(admin);
  if (href === "/admin") return true;
  if (!sectorKeys.size) return false;
  if (sectorKeys.has("operations")) return true;
  if (href.startsWith("/admin/scraper")) return adminCanUploadMarketAnalysisBatches(admin);

  if (sectorKeys.has("market_analysis")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/fontes");
  }

  if (sectorKeys.has("legal") || sectorKeys.has("validation")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/fontes");
  }

  if (sectorKeys.has("creative")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/meta-whatsapp");
  }

  if (sectorKeys.has("communication")) {
    return href.startsWith("/admin/oportunidades") || href.startsWith("/admin/whatsapp") || href.startsWith("/admin/meta-whatsapp");
  }

  return false;
}
