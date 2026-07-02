export default function OpportunityDetailLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-4 lg:px-5">
      <section className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-card)] px-4 py-5">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="h-9 w-36 rounded-lg bg-[rgba(255,255,255,0.06)]" />
          <div className="flex gap-2">
            <div className="h-6 w-20 rounded-md bg-[rgba(255,255,255,0.06)]" />
            <div className="h-6 w-24 rounded-md bg-[rgba(255,255,255,0.06)]" />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-3">
            <div className="h-8 w-64 rounded-lg bg-[rgba(0,243,255,0.08)]" />
            <div className="h-8 w-3/4 rounded-lg bg-[rgba(255,255,255,0.06)]" />
            <div className="h-4 w-2/3 rounded bg-[rgba(255,255,255,0.05)]" />
            <div className="h-20 w-full rounded-lg bg-[rgba(255,255,255,0.04)]" />
          </div>

          <div className="grid gap-2 rounded-lg border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)] p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="h-20 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]" />
              <div className="h-20 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]" />
            </div>
            <div className="h-20 rounded-md border border-[var(--admin-border)] bg-[rgba(255,255,255,0.03)]" />
          </div>
        </div>
      </section>
    </div>
  );
}
