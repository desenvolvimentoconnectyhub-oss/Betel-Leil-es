import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

function tone(score: number) {
  if (score >= 70) return "text-[var(--admin-red)] border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)]";
  if (score >= 45) return "text-[var(--admin-yellow)] border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)]";
  return "text-[var(--admin-green)] border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)]";
}

export function RiskBadge({ score, className }: { score: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-12 items-center justify-center gap-1 rounded-md border px-2 font-mono text-xs font-bold",
        tone(score),
        className
      )}
    >
      {score >= 70 && <AlertTriangle size={12} />}
      {score}
    </span>
  );
}
