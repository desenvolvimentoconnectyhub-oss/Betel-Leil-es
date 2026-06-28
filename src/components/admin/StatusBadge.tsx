import { Circle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatusTone = "cyan" | "green" | "yellow" | "red" | "purple" | "muted";

const toneClass: Record<StatusTone, string> = {
  cyan: "border-[rgba(255,90,31,0.32)] bg-[rgba(255,90,31,0.09)] text-[var(--admin-cyan)]",
  green: "border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] text-[var(--admin-green)]",
  yellow: "border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] text-[var(--admin-yellow)]",
  red: "border-[rgba(239,68,68,0.32)] bg-[rgba(239,68,68,0.08)] text-[var(--admin-red)]",
  purple: "border-[rgba(196,122,44,0.3)] bg-[rgba(196,122,44,0.09)] text-[var(--admin-purple)]",
  muted: "border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] text-[var(--admin-muted)]",
};

export function StatusBadge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        toneClass[tone],
        className
      )}
    >
      <Circle size={7} className="fill-current" />
      {children}
    </span>
  );
}

export function getStatusTone(value: string): StatusTone {
  const text = value.toLowerCase();
  if (text.includes("aprov") || text.includes("final") || text.includes("ativo")) return "green";
  if (text.includes("risco") || text.includes("crit") || text.includes("bloq")) return "red";
  if (text.includes("aguard") || text.includes("pend") || text.includes("ressalva")) return "yellow";
  if (text.includes("ia") || text.includes("anal")) return "purple";
  return "muted";
}
