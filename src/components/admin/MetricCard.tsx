import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { MetricTone } from "@/lib/admin/mock-data";
import { cn } from "@/lib/utils";

const toneClass: Record<MetricTone, string> = {
  cyan: "text-[var(--admin-cyan)]",
  green: "text-[var(--admin-green)]",
  yellow: "text-[var(--admin-yellow)]",
  red: "text-[var(--admin-red)]",
  purple: "text-[var(--admin-purple)]",
  muted: "text-[var(--admin-muted)]",
};

function TrendIcon({ trend }: { trend: string }) {
  if (trend.includes("+")) return <ArrowUpRight size={13} />;
  if (trend.includes("-")) return <ArrowDownRight size={13} />;
  return <Minus size={13} />;
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "muted",
}: {
  label: string;
  value: string;
  detail: string;
  trend: string;
  tone?: MetricTone;
}) {
  return (
    <article className="min-h-[132px] rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-[var(--admin-muted)]">{label}</p>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1 rounded-md border border-current/20 bg-current/5 px-2 font-mono text-[10px] font-semibold",
            toneClass[tone]
          )}
        >
          <TrendIcon trend={trend} />
          {trend}
        </span>
      </div>
      <div className="mt-5 font-mono text-3xl font-bold tracking-tight text-white">{value}</div>
      <p className="mt-2 text-xs leading-5 text-[var(--admin-muted)]">{detail}</p>
    </article>
  );
}
