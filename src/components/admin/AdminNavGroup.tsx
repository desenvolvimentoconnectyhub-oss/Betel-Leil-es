import type { AdminNavGroup as AdminNavGroupType } from "@/lib/admin/modules";
import { AdminNavItem } from "./AdminNavItem";

export function AdminNavGroup({
  group,
  activeHref,
}: {
  group: AdminNavGroupType;
  activeHref: string;
}) {
  return (
    <div>
      <div className="px-2.5 pb-1.5 pt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
        {group.label}
      </div>
      <div className="grid gap-1">
        {group.items.map((item) => {
          const children = item.children?.map((child) => ({
            ...child,
            active: activeHref === child.href,
          }));
          const childActive = children?.some((child) => child.active);

          return (
            <AdminNavItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              active={activeHref === item.href || Boolean(childActive)}
              badge={item.badge}
              navChildren={children}
            />
          );
        })}
      </div>
    </div>
  );
}
