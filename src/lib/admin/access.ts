import type { AdminSessionUser } from "@/lib/auth/types";
import type { AdminNavGroup, AdminNavItem } from "./modules";

function normalizedAdminRole(admin: AdminSessionUser | undefined) {
  return String(admin?.role || "").trim().toLowerCase();
}

export function adminIsSuperAdmin(admin: AdminSessionUser | undefined) {
  return ["owner", "superadmin", "super_admin"].includes(normalizedAdminRole(admin));
}

export function adminHasFullPanelAccess(admin: AdminSessionUser | undefined) {
  const role = normalizedAdminRole(admin);
  return Boolean(admin && (role === "owner" || role === "admin"));
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

function isComingSoonNavItem(item: Pick<AdminNavItem, "badge">) {
  return item.badge?.trim().toLowerCase() === "em breve";
}

export function filterAdminNavGroupsForUser(groups: AdminNavGroup[], admin: AdminSessionUser | undefined): AdminNavGroup[] {
  const canSeeComingSoon = adminIsSuperAdmin(admin);

  return groups
    .map((group) => ({
      ...group,
      items: group.items
        .flatMap((item): AdminNavItem[] => {
          if (!canSeeComingSoon && isComingSoonNavItem(item)) return [];

          const canAccessItem = adminCanAccessHref(admin, item.href);
          const children = item.children?.filter(
            (child) => adminCanAccessHref(admin, child.href) && (canSeeComingSoon || !isComingSoonNavItem(child))
          );

          if (!canAccessItem && !children?.length) return [];

          return [{
            ...item,
            href: canAccessItem ? item.href : children?.[0]?.href || item.href,
            children,
          }];
        }),
    }))
    .filter((group) => group.items.length);
}
