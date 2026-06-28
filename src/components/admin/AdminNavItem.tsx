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
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-h-9 items-center gap-2 rounded-md px-2.5 py-2 text-[13px] transition",
        active
          ? "bg-[rgba(255,255,255,0.08)] text-white"
          : "text-[var(--admin-soft)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
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
        <ChevronRight size={13} className="text-[var(--admin-muted)] opacity-0 transition group-hover:opacity-100" />
      )}
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-[var(--admin-cyan)]" />}
    </Link>
  );
}
