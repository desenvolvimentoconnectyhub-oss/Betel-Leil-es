import { DashboardCard } from "./DashboardCard";

export type ChartPoint = {
  label: string;
  value: number;
};

export function ChartCard({
  title,
  eyebrow,
  value,
  trend,
  data,
}: {
  title: string;
  eyebrow: string;
  value: string;
  trend: string;
  data: ChartPoint[];
}) {
  const max = Math.max(...data.map((item) => item.value), 1);

  return (
    <DashboardCard
      title={title}
      eyebrow={eyebrow}
      action={
        <div className="hidden items-center gap-2 sm:flex">
          {["4s", "13s", "12m"].map((label, index) => (
            <span
              key={label}
              className="rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] px-2 py-1 font-mono text-[10px] text-[var(--admin-muted)]"
            >
              {label} {index === 2 ? "-3.4%" : "+7.9%"}
            </span>
          ))}
        </div>
      }
      className="min-h-[360px]"
    >
      <div className="mb-4">
        <p className="font-mono text-4xl font-bold tracking-tight text-white">{value}</p>
        <p className="mt-1 text-sm text-[var(--admin-green)]">{trend}</p>
      </div>
      <div className="relative h-56">
        <div className="absolute left-0 right-0 top-10 border-t border-dashed border-[rgba(255,255,255,0.24)]" />
        <div className="flex h-full items-end gap-3 pt-6">
          {data.map((item) => (
            <div key={item.label} className="flex h-full flex-1 flex-col items-center justify-end gap-3">
              <div className="flex h-[170px] w-full items-end justify-center">
                <div
                  className="w-full max-w-12 rounded-t-sm border border-white/10 bg-[linear-gradient(180deg,rgba(245,245,245,0.72),rgba(245,245,245,0.06))]"
                  style={{ height: `${Math.max(10, (item.value / max) * 100)}%` }}
                />
              </div>
              <span className="font-mono text-[10px] uppercase text-[var(--admin-muted)]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardCard>
  );
}
