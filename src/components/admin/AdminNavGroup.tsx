import type { AdminNavGroup as AdminNavGroupType } from "@/lib/admin/modules";
import { cn } from "@/lib/utils";
import { AdminNavItem } from "./AdminNavItem";

export function AdminNavGroup({
  group,
  activeHref,
  collapsed = false,
}: {
  group: AdminNavGroupType;
  activeHref: string;
  collapsed?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]",
          collapsed ? "mx-auto my-2 h-px w-8 bg-[var(--admin-border)] p-0" : "px-2.5 pb-1.5 pt-3"
        )}
        title={collapsed ? group.label : undefined}
      >
        <span className={collapsed ? "sr-only" : undefined}>{group.label}</span>
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
              collapsed={collapsed}
            />
          );
        })}
      </div>
    </div>
  );
}
