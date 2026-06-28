import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardCardProps = {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function DashboardCard({
  title,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
}: DashboardCardProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] text-[var(--admin-foreground)] shadow-[0_1px_0_rgba(255,255,255,0.03)]",
        className
      )}
    >
      {(title || eyebrow || action) && (
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-[var(--admin-border)] px-4">
          <div className="min-w-0">
            {eyebrow && (
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--admin-muted)]">
                {eyebrow}
              </p>
            )}
            {title && <h2 className="truncate text-sm font-semibold text-white">{title}</h2>}
          </div>
          {action}
        </div>
      )}
      <div className={cn("p-4", contentClassName)}>{children}</div>
    </section>
  );
}
