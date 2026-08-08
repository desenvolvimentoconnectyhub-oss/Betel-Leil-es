function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-[rgba(81,60,36,0.08)] ${className}`} />;
}

export default function OpportunityDetailLoading() {
  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 px-3 py-3 lg:px-5">
      <section className="sticky top-16 z-10 overflow-hidden rounded-xl border border-[var(--admin-border)] bg-[rgba(255,255,255,0.96)] p-3 shadow-sm backdrop-blur">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-2">
              <Skeleton className="h-9 w-36" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-7 w-24" />
            </div>
            <Skeleton className="h-7 w-3/4 max-w-3xl" />
            <Skeleton className="mt-3 h-4 w-2/3 max-w-2xl" />
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-hidden border-t border-[var(--admin-border)] pt-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 shrink-0" />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.9fr)]">
        <Skeleton className="aspect-[16/9] min-h-72" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-72" />
        </div>
        <div className="grid content-start gap-4">
          <Skeleton className="h-52" />
          <Skeleton className="h-44" />
          <Skeleton className="h-56" />
        </div>
      </section>
    </div>
  );
}
