import type { MetricTone } from "@/lib/admin/mock-data";
import { cn } from "@/lib/utils";

const dotTone: Record<MetricTone, string> = {
  cyan: "bg-[var(--admin-cyan)]",
  green: "bg-[var(--admin-green)]",
  yellow: "bg-[var(--admin-yellow)]",
  red: "bg-[var(--admin-red)]",
  purple: "bg-[var(--admin-purple)]",
  muted: "bg-[var(--admin-muted)]",
};

export function ActivityLog({
  items,
}: {
  items: Array<{ time: string; actor: string; action: string; tone: MetricTone }>;
}) {
  return (
    <div className="grid gap-1">
      {items.map((item) => (
        <div
          key={`${item.time}-${item.action}`}
          className="grid gap-2 rounded-md px-2 py-2 text-xs hover:bg-white/[0.03] sm:grid-cols-[3.5rem_7.5rem_minmax(0,1fr)]"
        >
          <span className="font-mono text-[10px] text-[var(--admin-muted)]">{item.time}</span>
          <span className="flex min-w-0 items-center gap-2 font-semibold text-white">
            <span className={cn("size-1.5 rounded-full", dotTone[item.tone])} />
            <span className="truncate">{item.actor}</span>
          </span>
          <span className="min-w-0 text-[var(--admin-soft)]">{item.action}</span>
        </div>
      ))}
    </div>
  );
}
