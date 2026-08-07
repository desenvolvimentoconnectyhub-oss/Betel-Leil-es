import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminIcon } from "./AdminIcons";

export function AdminNavItem({
  href,
  label,
  icon,
  active,
  badge,
  navChildren,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
  navChildren?: Array<{ href: string; label: string; icon: string; active: boolean; badge?: string }>;
}) {
  return (
    <div className="grid gap-1">
      <Link
        href={href}
        className={cn(
          "group relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition",
          active
            ? "bg-[rgba(200,90,31,0.12)] text-[var(--admin-foreground)] ring-1 ring-[rgba(200,90,31,0.18)]"
            : "text-[var(--admin-soft)] hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]"
        )}
      >
        <AdminIcon
          icon={icon}
          size={16}
          className={cn("shrink-0", active ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]")}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {badge ? (
          <span className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-1.5 font-mono text-[10px] text-[var(--admin-muted)]">
            {badge}
          </span>
        ) : (
          <ChevronRight
            size={13}
            className={cn(
              "text-[var(--admin-muted)] transition",
              navChildren?.length ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
          />
        )}
        {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--admin-cyan)]" />}
      </Link>

      {navChildren?.length ? (
        <div className="ml-4 grid gap-1 border-l border-[var(--admin-border)] pl-2">
          {navChildren.map((child) => (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "group relative flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition",
                child.active
                  ? "bg-[rgba(200,90,31,0.1)] text-[var(--admin-foreground)]"
                  : "text-[var(--admin-muted)] hover:bg-[rgba(184,122,22,0.08)] hover:text-[var(--admin-foreground)]"
              )}
            >
              <AdminIcon
                icon={child.icon}
                size={14}
                className={cn("shrink-0", child.active ? "text-[var(--admin-cyan)]" : "text-[var(--admin-muted)]")}
              />
              <span className="min-w-0 flex-1 truncate">{child.label}</span>
              {child.badge && (
                <span className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.04)] px-1.5 font-mono text-[9px] text-[var(--admin-muted)]">
                  {child.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
